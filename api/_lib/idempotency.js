import crypto from "node:crypto";
import { appError, canonicalJson, nowIso } from "./services/core.js";

/**
 * Idempotency state model:
 * processing -> reservation exists and concurrent replay must stop
 * completed  -> stored response is safe to replay
 * unknown    -> external side effect may have happened; fail closed unless explicitly
 *               marked safe to resume by the action policy
 */
const PROCESSING_STATE = "processing";
const UNKNOWN_STATE = "unknown";
const STATE_FIELD = "__idempotency_state";
const STATE_UPDATED_AT_FIELD = "__idempotency_state_updated_at";
export const EXTERNAL_PROCESSING_LEASE_MS = 15 * 60_000;
const expiresAt = () => new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
const stateValue = (state) => ({ [STATE_FIELD]: state, [STATE_UPDATED_AT_FIELD]: nowIso() });
const inProgressError = () => appError("IDEMPOTENCY_IN_PROGRESS", "Request yang sama masih diproses. Jangan kirim operasi baru; tunggu status terbaru.", 409);
const outcomeUnknownError = () => appError("IDEMPOTENCY_OUTCOME_UNKNOWN", "Hasil operasi eksternal sebelumnya belum dapat dipastikan. Periksa status sebelum memulai operasi baru.", 503);

// The same key may only replay the same action, payload, and optimistic row version.
export const requestFingerprint = (context) => crypto.createHash("sha256")
  .update(canonicalJson([context.action, context.payload || {}, context.rowVersion ?? null]))
  .digest("hex");
const decodeResponse = (row) => {
  const value = JSON.parse(row.response_json);
  if (value && typeof value === "object" && value[STATE_FIELD]) {
    return { state: value[STATE_FIELD], stateUpdatedAt: value[STATE_UPDATED_AT_FIELD] || row.created_at || null, result: null };
  }
  return { state: "completed", stateUpdatedAt: null, result: value };
};
const processingIsStale = (decoded) => {
  if (decoded.state !== PROCESSING_STATE) return false;
  const updatedAt = Date.parse(String(decoded.stateUpdatedAt || ""));
  return Number.isFinite(updatedAt) && Date.now() - updatedAt >= EXTERNAL_PROCESSING_LEASE_MS;
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
    if (processingIsStale(decoded)) throw outcomeUnknownError();
    throw inProgressError();
  }
  if (decoded.state === UNKNOWN_STATE) throw outcomeUnknownError();
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

const reserveExistingExternal = async (tx, row, context, fingerprint, allowUnknownRetry) => {
  assertSameIntent(row, context, fingerprint);
  const decoded = decodeResponse(row);
  if (decoded.state === "completed") return { replayed: true, resumed: false, result: decoded.result };
  const staleProcessing = processingIsStale(decoded);
  if (decoded.state === PROCESSING_STATE && !staleProcessing) throw inProgressError();
  if ((decoded.state === UNKNOWN_STATE || staleProcessing) && !allowUnknownRetry) {
    if (staleProcessing) {
      const marked = await tx.execute(
        "UPDATE idempotency_keys SET response_json=?,expires_at=? WHERE actor_id=? AND idempotency_key=? AND action=? AND request_fingerprint=? AND response_json=?",
        [canonicalJson(stateValue(UNKNOWN_STATE)), expiresAt(), context.actor.user_id, context.idempotencyKey, context.action, fingerprint, row.response_json],
      );
      if (marked.rowsAffected !== 1) throw inProgressError();
    }
    return { outcomeUnknown: true };
  }
  const resumed = await tx.execute(
    "UPDATE idempotency_keys SET response_json=?,expires_at=? WHERE actor_id=? AND idempotency_key=? AND action=? AND request_fingerprint=? AND response_json=?",
    [canonicalJson(stateValue(PROCESSING_STATE)), expiresAt(), context.actor.user_id, context.idempotencyKey, context.action, fingerprint, row.response_json],
  );
  if (resumed.rowsAffected !== 1) throw inProgressError();
  return { replayed: false, resumed: true, result: null };
};

// Reserve before calling an external integration because its side effect cannot share
// the local database transaction. A processing lease turns abandoned reservations into
// fail-closed unknown outcomes instead of leaving them permanently indistinguishable from live work.
export const reserveExternalIdempotency = async (db, context, fingerprint, { allowUnknownRetry = false } = {}) => {
  const reservation = await db.transaction(async (tx) => {
    const row = await idempotencyRow(tx, context);
    if (row) return reserveExistingExternal(tx, row, context, fingerprint, allowUnknownRetry);
    const timestamp = nowIso();
    await tx.execute(
      "INSERT INTO idempotency_keys(actor_id,idempotency_key,action,request_fingerprint,entity_id,response_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
      [
        context.actor.user_id,
        context.idempotencyKey,
        context.action,
        fingerprint,
        null,
        canonicalJson({ [STATE_FIELD]: PROCESSING_STATE, [STATE_UPDATED_AT_FIELD]: timestamp }),
        timestamp,
        expiresAt(),
      ],
    );
    return { replayed: false, resumed: false, result: null };
  });
  if (reservation?.outcomeUnknown) throw outcomeUnknownError();
  return reservation;
};

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

// Preserve ambiguity after server/network failure. Deleting the reservation here could
// turn an already-executed external operation into a duplicate on retry.
export const markExternalOutcomeUnknown = async (db, context, fingerprint) => {
  await db.execute(
    "UPDATE idempotency_keys SET response_json=?,expires_at=? WHERE actor_id=? AND idempotency_key=? AND action=? AND request_fingerprint=?",
    [
      canonicalJson(stateValue(UNKNOWN_STATE)),
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
