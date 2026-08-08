import { getDatabase } from "./db/httpClient.js";
import { assertDatabaseReady } from "./db/schema.js";
import { getActionDefinition, isExternalAction, isMaintenanceAllowedAction, isReadAction } from "./actions/registry.js";
import {
  completeExternalIdempotency,
  markExternalOutcomeUnknown,
  persistIdempotency,
  readIdempotency,
  releaseExternalReservation,
  requestFingerprint,
  reserveExternalIdempotency,
} from "./idempotency.js";
import { resolveActor } from "./services/users.js";
import { appError, todayJakarta } from "./services/core.js";
import { integrationEnqueuers } from "./services/integrations.js";
import { parseAllowedUsers, requiresIdempotencyKey } from "./security.js";

const executeAction = async (db, context) => {
  const definition = getActionDefinition(context.action);
  if (!definition) throw appError("UNKNOWN_ACTION", `Action tidak dikenali: ${context.action}`, 404);
  return definition.handler(db, context);
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
  const definition = getActionDefinition(action);
  const needsIdempotency = requiresIdempotencyKey(action);
  if (needsIdempotency && !idempotencyKey) throw appError("IDEMPOTENCY_REQUIRED", "Idempotency key wajib untuk operasi perubahan data.", 400);
  const fingerprint = needsIdempotency ? requestFingerprint(context) : null;

  if (isReadAction(action)) {
    return typeof db.readTransaction === "function"
      ? db.readTransaction((tx) => executeAction(tx, context))
      : executeAction(db, context);
  }

  if (isExternalAction(action)) {
    if (!needsIdempotency) return executeAction(db, context);
    const reservation = await reserveExternalIdempotency(db, context, fingerprint, { allowUnknownRetry: Boolean(definition?.retryUnknownSafe) });
    if (reservation.replayed) return reservation.result;
    try {
      const result = await executeAction(db, context);
      await completeExternalIdempotency(db, context, fingerprint, result);
      return result;
    } catch (error) {
      const status = Number(error?.status || 500);
      if (status < 500) {
        await releaseExternalReservation(db, context, fingerprint);
        throw error;
      }
      await markExternalOutcomeUnknown(db, context, fingerprint);
      throw appError(
        "IDEMPOTENCY_OUTCOME_UNKNOWN",
        "Operasi eksternal mungkin sudah berjalan tetapi hasil akhirnya belum dapat dipastikan. Periksa status sebelum mencoba operasi baru.",
        503,
      );
    }
  }

  return db.transaction(async (tx) => {
    const currentMaintenance = await tx.one("SELECT value FROM system_config WHERE key='maintenance_mode'");
    if (currentMaintenance?.value === "true" && !isMaintenanceAllowedAction(action)) {
      throw appError("MAINTENANCE_MODE", "Aplikasi sedang dalam mode pemulihan. Perubahan biasa dinonaktifkan.", 503);
    }
    if (needsIdempotency) {
      const existing = await readIdempotency(tx, context, fingerprint);
      if (existing !== null) return existing;
    }
    const result = await executeAction(tx, context);
    if (needsIdempotency) await persistIdempotency(tx, context, fingerprint, result);
    return result;
  });
};
