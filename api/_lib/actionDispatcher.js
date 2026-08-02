import crypto from "node:crypto";
import { getDatabase } from "./db/httpClient.js";
import { assertDatabaseReady } from "./db/schema.js";
import { listAudit } from "./services/audit.js";
import { appError, canonicalJson, nowIso, todayJakarta } from "./services/core.js";
import { createTransaction, updateTransaction, cancelTransaction, listTransactions } from "./services/finance.js";
import { integrationEnqueuers, integrationStatus, enqueueIntegration } from "./services/integrations.js";
import { archiveAccount, archiveCategory, createAccount, createCategory, listAccounts, listCategories, updateAccount, updateCategory } from "./services/masterData.js";
import { applyImport, applyRestore, createTechnicalBackup, integrityWithMaintenanceRecovery, previewImport, previewRestore } from "./services/maintenance.js";
import { registerPush, unregisterPush } from "./services/notifications.js";
import {
  archiveBudget, closeEnvelope, createEnvelope, createGoal,
  createRecurringRule, listBudgets, listEnvelopes, listGoals, listRecurring, moveEnvelope, moveGoal,
  payOccurrence, reverseGoalMovement, reverseOccurrencePayment, updateGoal, updateRecurringRule, upsertBudget,
} from "./services/planning.js";
import {
  appInitialState, bootstrapData, closePeriod, createReconciliation, dashboardOverview, listPeriods,
  listReconciliations, monthlyReport, reopenPeriod, runIntegrity,
} from "./services/reports.js";
import { deactivateUser, listUsers, resolveActor, upsertUser } from "./services/users.js";
import { parseAllowedUsers, requiresIdempotencyKey } from "./security.js";

const READ_ACTIONS = new Set([
  "system.health", "app.initialState", "bootstrap.get", "users.list", "audit.list", "dashboard.overview",
  "accounts.list", "categories.list", "transactions.list", "envelopes.list", "recurring.list", "budgets.list",
  "goals.list", "reports.monthly", "reconciliations.list", "periods.list", "integrations.status",
]);
const EXTERNAL_ACTIONS = new Set(["backup.create", "restore.preview", "restore.apply", "import.apply"]);
const MAINTENANCE_ALLOWED = new Set(["system.health", "audit.list", "integrity.run", "backup.create", "restore.preview", "restore.apply", "integrations.status"]);
const fingerprint = (context) => crypto.createHash("sha256").update(canonicalJson([context.action, context.payload || {}, context.rowVersion ?? null])).digest("hex");
const expiresAt = () => new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();

const handlerFor = (action) => ({
  "app.initialState": appInitialState,
  "bootstrap.get": bootstrapData,
  "users.list": listUsers,
  "users.upsert": upsertUser,
  "users.deactivate": deactivateUser,
  "audit.list": listAudit,
  "dashboard.overview": dashboardOverview,
  "accounts.list": listAccounts,
  "accounts.create": createAccount,
  "accounts.update": updateAccount,
  "accounts.archive": archiveAccount,
  "categories.list": listCategories,
  "categories.create": createCategory,
  "categories.update": updateCategory,
  "categories.archive": archiveCategory,
  "transactions.list": listTransactions,
  "transactions.create": createTransaction,
  "transactions.update": updateTransaction,
  "transactions.cancel": cancelTransaction,
  "envelopes.list": listEnvelopes,
  "envelopes.create": createEnvelope,
  "envelopes.move": moveEnvelope,
  "envelopes.close": closeEnvelope,
  "recurring.list": listRecurring,
  "recurring.createRule": createRecurringRule,
  "recurring.updateRule": updateRecurringRule,
  "recurring.payOccurrence": payOccurrence,
  "recurring.reversePayment": reverseOccurrencePayment,
  "budgets.list": listBudgets,
  "budgets.upsert": upsertBudget,
  "budgets.archive": archiveBudget,
  "goals.list": listGoals,
  "goals.create": createGoal,
  "goals.update": updateGoal,
  "goals.move": moveGoal,
  "goals.reverseMovement": reverseGoalMovement,
  "reports.monthly": monthlyReport,
  "reconciliations.list": listReconciliations,
  "reconciliations.create": createReconciliation,
  "periods.list": listPeriods,
  "periods.close": closePeriod,
  "periods.reopen": reopenPeriod,
  "notifications.register": registerPush,
  "notifications.unregister": unregisterPush,
  "import.preview": previewImport,
  "import.apply": applyImport,
  "restore.preview": previewRestore,
  "restore.apply": applyRestore,
  "integrity.run": integrityWithMaintenanceRecovery,
}[action] || null);

const systemHealth = async (db) => {
  const configRows = await db.all("SELECT key,value FROM system_config WHERE key IN ('schema_version','maintenance_mode','timezone','currency')");
  const config = Object.fromEntries(configRows.map((row) => [row.key, row.value]));
  const status = await integrationStatus(db);
  return {
    status: config.maintenance_mode === "true" ? "maintenance" : "ok",
    schemaVersion: Number(config.schema_version || 0),
    maintenanceMode: config.maintenance_mode === "true",
    recoveryRequired: config.maintenance_mode === "true",
    timezone: config.timezone || "Asia/Jakarta",
    currency: config.currency || "IDR",
    integrations: status,
    timestamp: nowIso(),
  };
};

const calendarSync = async (db, context) => {
  const period = String(context.payload?.period || todayJakarta().slice(0, 7));
  const id = await enqueueIntegration(db, "calendar", "rebuild_period", "period", period, { period, requestedBy: context.actor.user_id });
  return { queued: true, outboxId: id, period };
};

const mirrorSync = async (db, context, rebuild = false) => {
  const id = await enqueueIntegration(db, "sheets", rebuild ? "rebuild" : "sync", "system", "mirror", { requestedBy: context.actor.user_id });
  return { queued: true, outboxId: id, rebuild };
};

const executeAction = async (db, context) => {
  if (context.action === "system.health") return systemHealth(db);
  if (context.action === "integrations.status") return integrationStatus(db);
  if (context.action === "calendar.sync") return calendarSync(db, context);
  if (context.action === "mirror.sync") return mirrorSync(db, context, false);
  if (context.action === "mirror.rebuild") return mirrorSync(db, context, true);
  if (context.action === "backup.create") return createTechnicalBackup(db, context, { type: context.payload?.type || "manual" });
  const handler = handlerFor(context.action);
  if (!handler) throw appError("UNKNOWN_ACTION", `Action tidak dikenali: ${context.action}`, 404);
  return handler(db, context);
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
  if (maintenance?.value === "true" && !READ_ACTIONS.has(action) && !MAINTENANCE_ALLOWED.has(action)) {
    throw appError("MAINTENANCE_MODE", "Aplikasi sedang dalam mode pemulihan. Data tetap dapat dibaca, tetapi perubahan biasa dinonaktifkan.", 503);
  }
  const needsIdempotency = requiresIdempotencyKey(action);
  if (needsIdempotency && !idempotencyKey) throw appError("IDEMPOTENCY_REQUIRED", "Idempotency key wajib untuk operasi perubahan data.", 400);
  const requestFingerprint = needsIdempotency ? fingerprint(context) : null;
  if (needsIdempotency) {
    const existing = await readExistingIdempotency(db, context, requestFingerprint);
    if (existing !== null) return existing;
  }
  if (READ_ACTIONS.has(action)) {
    return typeof db.readTransaction === "function"
      ? db.readTransaction((tx) => executeAction(tx, context))
      : executeAction(db, context);
  }
  if (EXTERNAL_ACTIONS.has(action)) {
    const result = await executeAction(db, context);
    if (needsIdempotency) await persistIdempotency(db, context, requestFingerprint, result);
    return result;
  }
  return db.transaction(async (tx) => {
    const currentMaintenance = await tx.one("SELECT value FROM system_config WHERE key='maintenance_mode'");
    if (currentMaintenance?.value === "true" && !MAINTENANCE_ALLOWED.has(action)) {
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
