import crypto from "node:crypto";
import { appError, canonicalJson, nowIso } from "./services/core.js";

const PROCESSING_STATE = "processing";
const UNKNOWN_STATE = "unknown";
const STATE_FIELD = "__idempotency_state";
const expiresAt = () => new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();

export const requestFingerprint = (context) => crypto.createHash("sha256")
  .update(canonicalJson([context.action, context.payload || {}, context.rowVersion ?? null]))
  .digest("hex");

const decodeResponse = (row) => {
  const value = JSON.parse(row.response_json);
  if (value && typeof value === "object" && value[STATE_FIELD]) return { state: value[STATE_FIELD], result: null };
  return { state: "completed", result: value };
};

const idempotencyRow = (db, context) => db.one(
  "SELECT * FROM idempotency_keys WHERE actor_id=? AND idempotency_key=? AND expires_at>?",
  [context.actor.user_id, context.idempotencyKey, nowIso()],
);

const assertSameIntent = (row, context, fingerprint) => {
  if (row.action !== context.action || row.request_fingerprint !== fingerprint) {
    throw appError("IDEMPOTENCY_CONFLICT", "Idempotency key sudah digunakan untuk request berbeda.", 409);
  }
};

export const readIdempotency = async (db, context, fingerprint) => {
  const row = await idempotencyRow(db, context);
  if (!row) return null;
  assertSameIntent(row, context, fingerprint);
  const decoded = decodeResponse(row);
  if (decoded.state === PROCESSING_STATE) {
    throw appError("IDEMPOTENCY_IN_PROGRESS", "Request yang sama masih diproses. Jangan kirim operasi baru; tunggu status terbaru.", 409);
  }
  if (decoded.state === UNKNOWN_STATE) {
    throw appError("IDEMPOTENCY_OUTCOME_UNKNOWN", "Hasil operasi eksternal sebelumnya belum dapat dipastikan. Periksa status sebelum memulai operasi baru.", 503);
  }
  return decoded.result;
};

export const persistIdempotency = async (db, context, fingerprint, result) => {
  await db.execute(
    "INSERT INTO idempotency_keys(actor_id,idempotency_key,action,request_fingerprint,entity_id,response_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
    [
      context.actor.user_id,
      context.idempotencyKey,
      context.action,
      fingerprint,
      result?.transaction_id || result?.goal_id || result?.backupId || null,
      canonicalJson(result),
      nowIso(),
      expiresAt(),
    ],
  );
};

export const reserveExternalIdempotency = async (db, context, fingerprint, { allowUnknownRetry = false } = {}) => db.transaction(async (tx) => {
  const row = await idempotencyRow(tx, context);
  if (row) {
    assertSameIntent(row, context, fingerprint);
    const decoded = decodeResponse(row);
    if (decoded.state === "completed") return { replayed: true, resumed: false, result: decoded.result };
    if (decoded.state === PROCESSING_STATE) {
      throw appError("IDEMPOTENCY_IN_PROGRESS", "Request yang sama masih diproses. Jangan kirim operasi baru; tunggu status terbaru.", 409);
    }
    if (decoded.state === UNKNOWN_STATE && !allowUnknownRetry) {
      throw appError("IDEMPOTENCY_OUTCOME_UNKNOWN", "Hasil operasi eksternal sebelumnya belum dapat dipastikan. Periksa status sebelum memulai operasi baru.", 503);
    }
    const resumed = await tx.execute(
      "UPDATE idempotency_keys SET response_json=?,expires_at=? WHERE actor_id=? AND idempotency_key=? AND action=? AND request_fingerprint=?",
      [canonicalJson({ [STATE_FIELD]: PROCESSING_STATE }), expiresAt(), context.actor.user_id, context.idempotencyKey, context.action, fingerprint],
    );
    if (resumed.rowsAffected !== 1) throw appError("IDEMPOTENCY_IN_PROGRESS", "Request yang sama sedang diproses oleh request lain.", 409);
    return { replayed: false, resumed: true, result: null };
  }
  await tx.execute(
    "INSERT INTO idempotency_keys(actor_id,idempotency_key,action,request_fingerprint,entity_id,response_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
    [
      context.actor.user_id,
      context.idempotencyKey,
      context.action,
      fingerprint,
      null,
      canonicalJson({ [STATE_FIELD]: PROCESSING_STATE }),
      nowIso(),
      expiresAt(),
    ],
  );
  return { replayed: false, resumed: false, result: null };
});

export const completeExternalIdempotency = async (db, context, fingerprint, result) => {
  const update = await db.execute(
    "UPDATE idempotency_keys SET entity_id=?,response_json=?,expires_at=? WHERE actor_id=? AND idempotency_key=? AND action=? AND request_fingerprint=?",
    [
      result?.transaction_id || result?.goal_id || result?.backupId || null,
      canonicalJson(result),
      expiresAt(),
      context.actor.user_id,
      context.idempotencyKey,
      context.action,
      fingerprint,
    ],
  );
  if (update.rowsAffected !== 1) throw appError("IDEMPOTENCY_PERSIST_FAILED", "Hasil operasi eksternal tidak dapat dikunci secara idempotent.", 503);
};

export const markExternalOutcomeUnknown = async (db, context, fingerprint) => {
  await db.execute(
    "UPDATE idempotency_keys SET response_json=?,expires_at=? WHERE actor_id=? AND idempotency_key=? AND action=? AND request_fingerprint=?",
    [
      canonicalJson({ [STATE_FIELD]: UNKNOWN_STATE }),
      expiresAt(),
      context.actor.user_id,
      context.idempotencyKey,
      context.action,
      fingerprint,
    ],
  );
};

export const releaseExternalReservation = async (db, context, fingerprint) => {
  await db.execute(
    "DELETE FROM idempotency_keys WHERE actor_id=? AND idempotency_key=? AND action=? AND request_fingerprint=?",
    [context.actor.user_id, context.idempotencyKey, context.action, fingerprint],
  );
};
