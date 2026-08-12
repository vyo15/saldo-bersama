import { getDatabase } from "./db/httpClient.js";
import { assertDatabaseReady } from "./db/schema.js";
import { getActionDefinition, isExternalAction, isMaintenanceAllowedAction, isReadAction } from "./actions/registry.js";
import { isSnapshotReadAction } from "./actions/policy.js";
import { logEvent } from "./observability.js";
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

const MAINTENANCE_QUERY = "SELECT value FROM system_config WHERE key='maintenance_mode'";

const executeAction = async (db, context) => {
  const definition = getActionDefinition(context.action);
  if (!definition) throw appError("UNKNOWN_ACTION", `Action tidak dikenali: ${context.action}`, 404);
  return definition.handler(db, context);
};

const maintenanceBlocksAction = (action, allowReads) => (
  allowReads
    ? !isReadAction(action) && !isMaintenanceAllowedAction(action)
    : !isMaintenanceAllowedAction(action)
);

const assertMaintenanceAllows = async (db, action, { allowReads = false } = {}) => {
  const maintenance = await db.one(MAINTENANCE_QUERY);
  if (maintenance?.value !== "true" || !maintenanceBlocksAction(action, allowReads)) return;
  const message = allowReads
    ? "Aplikasi sedang dalam mode pemulihan. Data tetap dapat dibaca, tetapi perubahan biasa dinonaktifkan."
    : "Aplikasi sedang dalam mode pemulihan. Perubahan biasa dinonaktifkan.";
  throw appError("MAINTENANCE_MODE", message, 503);
};

const newReadMetrics = () => ({ queryCount: 0, pipelineCount: 0, rowsRead: 0, queryDurationMs: 0, startedAt: Date.now() });

const recordResultMetrics = (metrics, result) => {
  metrics.queryCount += 1;
  metrics.rowsRead += Number(result?.rowsRead ?? result?.rows?.length ?? 0);
  metrics.queryDurationMs += Number(result?.queryDurationMs || 0);
  return result;
};

const instrumentReadDatabase = (db, metrics) => {
  const measured = Object.create(db);
  measured.execute = async (sql, args = []) => {
    if (typeof db.execute === "function") return recordResultMetrics(metrics, await db.execute.call(db, sql, args));
    const rows = typeof db.all === "function" ? await db.all.call(db, sql, args) : [];
    return recordResultMetrics(metrics, { rows, rowsAffected: 0 });
  };
  measured.all = async (sql, args = []) => {
    const before = metrics.queryCount;
    const rows = typeof db.all === "function"
      ? await db.all.call(measured, sql, args)
      : (await measured.execute(sql, args)).rows;
    if (metrics.queryCount === before) {
      metrics.queryCount += 1;
      metrics.rowsRead += rows.length;
    }
    return rows;
  };
  measured.one = async (sql, args = []) => {
    const before = metrics.queryCount;
    const row = typeof db.one === "function"
      ? await db.one.call(measured, sql, args)
      : (await measured.execute(sql, args)).rows[0] || null;
    if (metrics.queryCount === before) {
      metrics.queryCount += 1;
      metrics.rowsRead += row ? 1 : 0;
    }
    return row;
  };
  if (typeof db.batch === "function") measured.batch = async (statements = []) => {
    const results = await db.batch.call(db, statements);
    return results.map((result) => recordResultMetrics(metrics, result));
  };
  if (typeof db.readTransaction === "function") measured.readTransaction = (callback) => db.readTransaction.call(db, (tx) => callback(instrumentReadDatabase(tx, metrics)));
  return measured;
};

const executeRead = async (db, context, metrics = newReadMetrics()) => {
  const measuredDb = instrumentReadDatabase(db, metrics);
  try {
    return isSnapshotReadAction(context.action) && typeof measuredDb.readTransaction === "function"
      ? await measuredDb.readTransaction((tx) => executeAction(tx, context))
      : await executeAction(measuredDb, context);
  } finally {
    logEvent("info", "database.read.metrics", {
      requestId: context.requestId,
      action: context.action,
      snapshot: isSnapshotReadAction(context.action),
      dbQueryCount: metrics.queryCount,
      dbPipelineCount: metrics.pipelineCount,
      dbRowsRead: metrics.rowsRead,
      dbQueryDurationMs: metrics.queryDurationMs,
      dbReadDurationMs: Date.now() - metrics.startedAt,
    });
  }
};

const executeExternal = async (db, context, definition, needsIdempotency, fingerprint) => {
  if (!needsIdempotency) return executeAction(db, context);
  const reservation = await reserveExternalIdempotency(db, context, fingerprint, {
    allowUnknownRetry: Boolean(definition?.retryUnknownSafe),
  });
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
};

const executeTransactional = (db, context, needsIdempotency, fingerprint) => db.transaction(async (tx) => {
  await assertMaintenanceAllows(tx, context.action);
  if (needsIdempotency) {
    const existing = await readIdempotency(tx, context, fingerprint);
    if (existing !== null) return existing;
  }
  const result = await executeAction(tx, context);
  if (needsIdempotency) await persistIdempotency(tx, context, fingerprint, result);
  return result;
});

const createActionContext = (actor, signedActor, action, payload, requestId, idempotencyKey, rowVersion) => ({
  actor,
  signedActor,
  action,
  payload,
  requestId,
  idempotencyKey,
  rowVersion,
  today: todayJakarta(),
  allowedUsers: parseAllowedUsers(),
});

export const dispatchAction = async ({ signedActor, action, payload = {}, requestId, idempotencyKey = null, rowVersion = null, database = null }) => {
  const db = database || getDatabase();
  const readAction = isReadAction(action);
  const readMetrics = readAction ? newReadMetrics() : null;
  const dispatch = async () => {
    await assertDatabaseReady(db);
    const actor = await resolveActor(db, signedActor);
    const context = createActionContext(actor, signedActor, action, payload, requestId, idempotencyKey, rowVersion);
    Object.assign(context, integrationEnqueuers(context));
    if (!readAction) await assertMaintenanceAllows(db, action, { allowReads: true });

    const definition = getActionDefinition(action);
    const needsIdempotency = requiresIdempotencyKey(action);
    if (needsIdempotency && !idempotencyKey) {
      throw appError("IDEMPOTENCY_REQUIRED", "Idempotency key wajib untuk operasi perubahan data.", 400);
    }
    const fingerprint = needsIdempotency ? requestFingerprint(context) : null;

    if (readAction) return executeRead(db, context, readMetrics);
    if (isExternalAction(action)) return executeExternal(db, context, definition, needsIdempotency, fingerprint);
    return executeTransactional(db, context, needsIdempotency, fingerprint);
  };
  return readMetrics && typeof db.withPipelineMetrics === "function"
    ? db.withPipelineMetrics(readMetrics, dispatch)
    : dispatch();
};

