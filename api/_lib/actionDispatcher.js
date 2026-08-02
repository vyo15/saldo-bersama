import crypto from "node:crypto";
import { getDatabase } from "./db/httpClient.js";
import { assertDatabaseReady } from "./db/schema.js";
import { getActionDefinition, isExternalAction, isMaintenanceAllowedAction, isReadAction } from "./actions/registry.js";
import { resolveActor } from "./services/users.js";
import { appError, canonicalJson, nowIso, todayJakarta } from "./services/core.js";
import { integrationEnqueuers } from "./services/integrations.js";
import { parseAllowedUsers, requiresIdempotencyKey } from "./security.js";

const fingerprint = (context) => crypto.createHash("sha256").update(canonicalJson([context.action, context.payload || {}, context.rowVersion ?? null])).digest("hex");
const expiresAt = () => new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();

const executeAction = async (db, context) => {
  const definition = getActionDefinition(context.action);
  if (!definition) throw appError("UNKNOWN_ACTION", `Action tidak dikenali: ${context.action}`, 404);
  return definition.handler(db, context);
};

const readExistingIdempotency = async (db, context, requestFingerprint) => {
  const row = await db.one("SELECT * FROM idempotency_keys WHERE actor_id=? AND idempotency_key=? AND expires_at>?", [context.actor.user_id, context.idempotencyKey, nowIso()]);
  if (!row) return null;
  if (row.action !== context.action || row.request_fingerprint !== requestFingerprint) throw appError("IDEMPOTENCY_CONFLICT", "Idempotency key sudah digunakan untuk request berbeda.", 409);
  return JSON.parse(row.response_json);
};

const persistIdempotency = async (db, context, requestFingerprint, result) => {
  await db.execute("INSERT INTO idempotency_keys(actor_id,idempotency_key,action,request_fingerprint,entity_id,response_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)", [context.actor.user_id, context.idempotencyKey, context.action, requestFingerprint, result?.transaction_id || result?.goal_id || result?.backupId || null, canonicalJson(result), nowIso(), expiresAt()]);
};

export const dispatchAction = async ({ signedActor, action, payload = {}, requestId, idempotencyKey = null, rowVersion = null, database = null }) => {
  const db = database || getDatabase();
  await assertDatabaseReady(db);
  const actor = await resolveActor(db, signedActor);
  const context = {
    actor,
    signedActor,
    action,
    payload,
    requestId,
    idempotencyKey,
    rowVersion,
    today: todayJakarta(),
    allowedUsers: parseAllowedUsers(),
  };
  Object.assign(context, integrationEnqueuers(context));
  const maintenance = await db.one("SELECT value FROM system_config WHERE key='maintenance_mode'");
  if (maintenance?.value === "true" && !isReadAction(action) && !isMaintenanceAllowedAction(action)) {
    throw appError("MAINTENANCE_MODE", "Aplikasi sedang dalam mode pemulihan. Data tetap dapat dibaca, tetapi perubahan biasa dinonaktifkan.", 503);
  }
  const needsIdempotency = requiresIdempotencyKey(action);
  if (needsIdempotency && !idempotencyKey) throw appError("IDEMPOTENCY_REQUIRED", "Idempotency key wajib untuk operasi perubahan data.", 400);
  const requestFingerprint = needsIdempotency ? fingerprint(context) : null;
  if (needsIdempotency) {
    const existing = await readExistingIdempotency(db, context, requestFingerprint);
    if (existing !== null) return existing;
  }
  if (isReadAction(action)) {
    return typeof db.readTransaction === "function"
      ? db.readTransaction((tx) => executeAction(tx, context))
      : executeAction(db, context);
  }
  if (isExternalAction(action)) {
    const result = await executeAction(db, context);
    if (needsIdempotency) await persistIdempotency(db, context, requestFingerprint, result);
    return result;
  }
  return db.transaction(async (tx) => {
    const currentMaintenance = await tx.one("SELECT value FROM system_config WHERE key='maintenance_mode'");
    if (currentMaintenance?.value === "true" && !isMaintenanceAllowedAction(action)) {
      throw appError("MAINTENANCE_MODE", "Aplikasi sedang dalam mode pemulihan. Perubahan biasa dinonaktifkan.", 503);
    }
    if (needsIdempotency) {
      const existing = await readExistingIdempotency(tx, context, requestFingerprint);
      if (existing !== null) return existing;
    }
    const result = await executeAction(tx, context);
    if (needsIdempotency) await persistIdempotency(tx, context, requestFingerprint, result);
    return result;
  });
};
