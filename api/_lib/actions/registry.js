import { listAudit } from "../services/audit.js";
import { ACTION_POLICIES, actionNames, getActionPolicy, isExternalAction, isMaintenanceAllowedAction, isReadAction } from "./policy.js";
import { nowIso, todayJakarta } from "../services/core.js";
import { createTransaction, updateTransaction, cancelTransaction, restoreTransaction, listTransactions } from "../services/finance.js";
import { integrationStatus, enqueueIntegration } from "../services/integrations.js";
import {
  archiveAccount, archiveCategory, createAccount, createCategory, deleteUnusedAccount, listAccounts, listArchivedData,
  listCategories, previewAccountLifecycle, previewCategoryArchive, restoreAccount, restoreCategory, updateAccount,
  updateCategory,
} from "../services/masterData.js";
import {
  applyImport, applyRestore, createTechnicalBackup, integrityWithMaintenanceRecovery, previewImport,
  previewRestore,
} from "../services/maintenance/index.js";
import { notificationPreferences, notificationStatus, registerPush, testPush, unregisterPush, updateNotificationPreference } from "../services/notifications.js";
import {
  archiveBudget, archiveEnvelopeRule, archiveGoal, archiveRecurringRule, cancelOccurrence, closeEnvelope, createEnvelope, createGoal, createRecurringRule, listBudgets,
  listEnvelopes, listGoals, listRecurring, moveEnvelope, moveGoal, payOccurrence, restoreBudget, restoreEnvelopeRule, restoreGoal, restoreOccurrence, restoreRecurringRule,
  reverseEnvelopeMovement, reverseGoalMovement, reverseOccurrencePayment, updateGoal, updateRecurringRule, upsertBudget,
} from "../services/planning/index.js";
import {
  appInitialState, bootstrapData, closePeriod, createReconciliation, dashboardOverview, listPeriods,
  listReconciliations, monthlyReport, previewClosePeriod, reopenPeriod,
} from "../services/reporting/index.js";
import { deactivateUser, listUsers, reactivateUser, upsertUser } from "../services/users.js";

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
  const id = await enqueueIntegration(db, "calendar", "rebuild_period", "period", period, {
    period,
    requestedBy: context.actor.user_id,
  });
  return { queued: true, outboxId: id, period };
};

const mirrorSync = async (db, context, rebuild) => {
  const id = await enqueueIntegration(db, "sheets", rebuild ? "rebuild" : "sync", "system", "mirror", {
    requestedBy: context.actor.user_id,
  });
  return { queued: true, outboxId: id, rebuild };
};

const ACTION_HANDLERS = Object.freeze({
  "system.health": systemHealth,
  "app.initialState": appInitialState,
  "bootstrap.get": bootstrapData,
  "users.list": listUsers,
  "users.upsert": upsertUser,
  "users.deactivate": deactivateUser,
  "users.reactivate": reactivateUser,
  "audit.list": listAudit,
  "archive.list": listArchivedData,
  "dashboard.overview": dashboardOverview,
  "accounts.list": listAccounts,
  "accounts.create": createAccount,
  "accounts.update": updateAccount,
  "accounts.previewLifecycle": previewAccountLifecycle,
  "accounts.archive": archiveAccount,
  "accounts.restore": restoreAccount,
  "accounts.deleteUnused": deleteUnusedAccount,
  "categories.list": listCategories,
  "categories.create": createCategory,
  "categories.update": updateCategory,
  "categories.previewArchive": previewCategoryArchive,
  "categories.archive": archiveCategory,
  "categories.restore": restoreCategory,
  "transactions.list": listTransactions,
  "transactions.create": createTransaction,
  "transactions.update": updateTransaction,
  "transactions.cancel": cancelTransaction,
  "transactions.restore": restoreTransaction,
  "envelopes.list": listEnvelopes,
  "envelopes.create": createEnvelope,
  "envelopes.move": moveEnvelope,
  "envelopes.close": closeEnvelope,
  "envelopes.archiveRule": archiveEnvelopeRule,
  "envelopes.restoreRule": restoreEnvelopeRule,
  "envelopes.reverseMovement": reverseEnvelopeMovement,
  "recurring.list": listRecurring,
  "recurring.createRule": createRecurringRule,
  "recurring.updateRule": updateRecurringRule,
  "recurring.archiveRule": archiveRecurringRule,
  "recurring.cancelOccurrence": cancelOccurrence,
  "recurring.restoreOccurrence": restoreOccurrence,
  "recurring.payOccurrence": payOccurrence,
  "recurring.reversePayment": reverseOccurrencePayment,
  "recurring.restoreRule": restoreRecurringRule,
  "budgets.list": listBudgets,
  "budgets.upsert": upsertBudget,
  "budgets.archive": archiveBudget,
  "budgets.restore": restoreBudget,
  "goals.list": listGoals,
  "goals.create": createGoal,
  "goals.update": updateGoal,
  "goals.archive": archiveGoal,
  "goals.move": moveGoal,
  "goals.reverseMovement": reverseGoalMovement,
  "goals.restore": restoreGoal,
  "reports.monthly": monthlyReport,
  "reconciliations.list": listReconciliations,
  "reconciliations.create": createReconciliation,
  "periods.list": listPeriods,
  "periods.previewClose": previewClosePeriod,
  "periods.close": closePeriod,
  "periods.reopen": reopenPeriod,
  "notifications.status": notificationStatus,
  "notifications.preferences": notificationPreferences,
  "notifications.updatePreference": updateNotificationPreference,
  "notifications.register": registerPush,
  "notifications.unregister": unregisterPush,
  "notifications.test": testPush,
  "calendar.sync": calendarSync,
  "mirror.sync": (db, context) => mirrorSync(db, context, false),
  "mirror.rebuild": (db, context) => mirrorSync(db, context, true),
  "integrations.status": integrationStatus,
  "backup.create": (db, context) => createTechnicalBackup(db, context, { type: context.payload?.type || "manual" }),
  "import.preview": previewImport,
  "import.apply": applyImport,
  "restore.preview": previewRestore,
  "restore.apply": applyRestore,
  "integrity.run": integrityWithMaintenanceRecovery,
});

const policyNames = actionNames();
const handlerNames = Object.keys(ACTION_HANDLERS);
if (policyNames.length !== handlerNames.length || policyNames.some((action) => !ACTION_HANDLERS[action])) {
  throw new Error("Action registry tidak sinkron dengan action policy.");
}

export const ACTION_REGISTRY = Object.freeze(Object.fromEntries(policyNames.map((action) => [
  action,
  Object.freeze({ handler: ACTION_HANDLERS[action], ...ACTION_POLICIES[action] }),
])));

export const getActionDefinition = (action) => ACTION_REGISTRY[action] || null;
export { actionNames, getActionPolicy, isExternalAction, isMaintenanceAllowedAction, isReadAction };
