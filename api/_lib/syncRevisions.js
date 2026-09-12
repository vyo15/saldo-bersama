import { nowIso } from "./services/core.js";

export const SYNC_GLOBAL_RESOURCE = "__global__";

const unique = (...groups) => [...new Set(groups.flat().filter(Boolean))];

const CORE_OVERVIEW = Object.freeze(["app.initialState", "dashboard.overview", "notifications.center"]);
const CORE_BOOTSTRAP = Object.freeze(["app.initialState", "bootstrap.get"]);
const AUDIT = Object.freeze(["audit.list"]);
const SYSTEM = Object.freeze(["system.health"]);

const ACCOUNT_DEPENDENCIES = Object.freeze(unique(
  CORE_OVERVIEW,
  CORE_BOOTSTRAP,
  AUDIT,
  ["accounts.list", "accounts.previewLifecycle", "transactions.list", "envelopes.list", "envelopes.previewRuleLifecycle", "recurring.list", "budgets.list", "goals.list", "reports.monthly", "reconciliations.list", "periods.previewClose", "archive.list"],
));

const CATEGORY_DEPENDENCIES = Object.freeze(unique(
  CORE_OVERVIEW,
  CORE_BOOTSTRAP,
  AUDIT,
  ["categories.list", "categories.previewArchive", "transactions.list", "recurring.list", "budgets.list", "reports.monthly", "archive.list"],
));

const TRANSACTION_DEPENDENCIES = Object.freeze(unique(
  CORE_OVERVIEW,
  AUDIT,
  ["accounts.list", "accounts.previewLifecycle", "transactions.list", "envelopes.list", "envelopes.previewRuleLifecycle", "recurring.list", "budgets.list", "goals.list", "reports.monthly", "reconciliations.list", "periods.previewClose", "investments.overview"],
));

const ENVELOPE_DEPENDENCIES = Object.freeze(unique(
  CORE_OVERVIEW,
  AUDIT,
  ["accounts.list", "accounts.previewLifecycle", "envelopes.list", "envelopes.previewRuleLifecycle", "budgets.list", "recurring.list", "reports.monthly", "reminders.get", "periods.previewClose", "archive.list"],
));

const RECURRING_DEPENDENCIES = Object.freeze(unique(
  CORE_OVERVIEW,
  AUDIT,
  ["accounts.list", "transactions.list", "envelopes.list", "recurring.list", "recurring.previewRuleLifecycle", "budgets.list", "reports.monthly", "reminders.get", "periods.previewClose", "archive.list"],
));

const BUDGET_DEPENDENCIES = Object.freeze(unique(
  CORE_OVERVIEW,
  AUDIT,
  ["accounts.list", "accounts.previewLifecycle", "budgets.list", "budgets.previewLifecycle", "envelopes.list", "recurring.list", "reports.monthly", "archive.list"],
));

const GOAL_DEPENDENCIES = Object.freeze(unique(
  CORE_OVERVIEW,
  AUDIT,
  ["accounts.list", "transactions.list", "goals.list", "goals.previewLifecycle", "reports.monthly", "reminders.get", "periods.previewClose", "archive.list"],
));

const INVESTMENT_DEPENDENCIES = Object.freeze(unique(
  CORE_OVERVIEW,
  AUDIT,
  ["investments.overview", "accounts.list", "reports.monthly"],
));

const ALL_BUSINESS_READS = Object.freeze(unique(
  CORE_OVERVIEW,
  CORE_BOOTSTRAP,
  AUDIT,
  SYSTEM,
  [
    "users.list", "sessions.listOwn", "archive.list", "investments.overview", "investments.instruments.list",
    "accounts.list", "accounts.previewLifecycle", "categories.list", "categories.previewArchive", "masterDataRequests.list",
    "transferRequests.list", "transactions.list", "envelopes.list", "envelopes.previewRuleLifecycle", "recurring.list",
    "recurring.previewRuleLifecycle", "budgets.list", "budgets.previewLifecycle", "goals.list", "goals.previewLifecycle",
    "reports.monthly", "reconciliations.list", "periods.list", "periods.previewClose", "notifications.status",
    "notifications.preferences", "reminders.get", "integrations.status", "reset.preview", "reset.status", "fullReset.preview", "fullReset.status",
  ],
));

export const ACTION_SYNC_DEPENDENCIES = Object.freeze({
  "users.upsert": unique(CORE_BOOTSTRAP, AUDIT, ["users.list", "sessions.listOwn"]),
  "users.deactivate": unique(CORE_BOOTSTRAP, CORE_OVERVIEW, AUDIT, ["users.list", "sessions.listOwn", "notifications.center", "notifications.status"]),
  "users.reactivate": unique(CORE_BOOTSTRAP, AUDIT, ["users.list"]),
  "sessions.revokeOwn": unique(AUDIT, ["sessions.listOwn"]),
  "sessions.revokeAllOwn": unique(AUDIT, ["sessions.listOwn"]),

  "investments.assets.create": unique(INVESTMENT_DEPENDENCIES, ["investments.instruments.list"]),
  "investments.portfolios.create": INVESTMENT_DEPENDENCIES,
  "investments.instruments.upsert": unique(INVESTMENT_DEPENDENCIES, ["investments.instruments.list"]),
  "investments.trades.buy": INVESTMENT_DEPENDENCIES,
  "investments.trades.sell": INVESTMENT_DEPENDENCIES,
  "investments.valuations.update": INVESTMENT_DEPENDENCIES,
  "investments.reconciliations.create": INVESTMENT_DEPENDENCIES,
  "investments.corrections.create": INVESTMENT_DEPENDENCIES,
  "investments.openingPositions.create": INVESTMENT_DEPENDENCIES,

  "accounts.requestCreate": unique(AUDIT, ["masterDataRequests.list", "notifications.center"]),
  "accounts.create": ACCOUNT_DEPENDENCIES,
  "accounts.update": ACCOUNT_DEPENDENCIES,
  "accounts.archive": ACCOUNT_DEPENDENCIES,
  "accounts.restore": ACCOUNT_DEPENDENCIES,
  "accounts.deleteUnused": ACCOUNT_DEPENDENCIES,

  "categories.requestCreate": unique(AUDIT, ["masterDataRequests.list", "notifications.center"]),
  "categories.create": CATEGORY_DEPENDENCIES,
  "categories.update": CATEGORY_DEPENDENCIES,
  "categories.archive": CATEGORY_DEPENDENCIES,
  "categories.restore": CATEGORY_DEPENDENCIES,
  "categories.deleteUnused": CATEGORY_DEPENDENCIES,
  "masterDataRequests.review": unique(ACCOUNT_DEPENDENCIES, CATEGORY_DEPENDENCIES, ["masterDataRequests.list"]),

  "transferRequests.request": unique(AUDIT, ["transferRequests.list", "notifications.center"]),
  "transferRequests.review": unique(TRANSACTION_DEPENDENCIES, ["transferRequests.list"]),

  "transactions.create": TRANSACTION_DEPENDENCIES,
  "transactions.update": TRANSACTION_DEPENDENCIES,
  "transactions.cancel": TRANSACTION_DEPENDENCIES,
  "transactions.restore": TRANSACTION_DEPENDENCIES,

  "envelopes.create": ENVELOPE_DEPENDENCIES,
  "envelopes.adjustAllocation": ENVELOPE_DEPENDENCIES,
  "envelopes.move": ENVELOPE_DEPENDENCIES,
  "envelopes.close": ENVELOPE_DEPENDENCIES,
  "envelopes.archiveRule": ENVELOPE_DEPENDENCIES,
  "envelopes.deleteUnusedRule": ENVELOPE_DEPENDENCIES,
  "envelopes.restoreRule": ENVELOPE_DEPENDENCIES,
  "envelopes.reverseMovement": ENVELOPE_DEPENDENCIES,

  "recurring.createRule": RECURRING_DEPENDENCIES,
  "recurring.updateRule": RECURRING_DEPENDENCIES,
  "recurring.archiveRule": RECURRING_DEPENDENCIES,
  "recurring.deleteUnusedRule": RECURRING_DEPENDENCIES,
  "recurring.cancelOccurrence": RECURRING_DEPENDENCIES,
  "recurring.restoreOccurrence": RECURRING_DEPENDENCIES,
  "recurring.payOccurrence": RECURRING_DEPENDENCIES,
  "recurring.reversePayment": RECURRING_DEPENDENCIES,
  "recurring.restoreRule": RECURRING_DEPENDENCIES,

  "budgets.batchCreate": unique(BUDGET_DEPENDENCIES, RECURRING_DEPENDENCIES),
  "budgets.upsert": BUDGET_DEPENDENCIES,
  "budgets.remove": unique(BUDGET_DEPENDENCIES, RECURRING_DEPENDENCIES),
  "budgets.archive": BUDGET_DEPENDENCIES,
  "budgets.deleteUnused": BUDGET_DEPENDENCIES,
  "budgets.restore": BUDGET_DEPENDENCIES,

  "goals.create": GOAL_DEPENDENCIES,
  "goals.update": GOAL_DEPENDENCIES,
  "goals.archive": GOAL_DEPENDENCIES,
  "goals.deleteUnused": GOAL_DEPENDENCIES,
  "goals.move": GOAL_DEPENDENCIES,
  "goals.reverseMovement": GOAL_DEPENDENCIES,
  "goals.restore": GOAL_DEPENDENCIES,

  "reconciliations.create": unique(CORE_OVERVIEW, AUDIT, ["accounts.list", "reconciliations.list", "reports.monthly"]),
  "periods.close": unique(CORE_OVERVIEW, AUDIT, ["periods.list", "periods.previewClose", "transactions.list", "reports.monthly"]),
  "periods.reopen": unique(CORE_OVERVIEW, AUDIT, ["periods.list", "periods.previewClose", "transactions.list", "reports.monthly"]),

  "notifications.updatePreference": unique(AUDIT, ["notifications.preferences", "notifications.status", "notifications.center"]),
  "notifications.register": unique(["notifications.status"]),
  "notifications.unregister": unique(["notifications.status"]),
  "notifications.test": unique(["notifications.status", "notifications.center"]),
  "reminders.upsert": unique(AUDIT, ["reminders.get", "notifications.center"]),
  "reminders.cancel": unique(AUDIT, ["reminders.get", "notifications.center"]),

  "calendar.sync": unique(AUDIT, SYSTEM, ["integrations.status"]),
  "mirror.sync": unique(AUDIT, SYSTEM, ["integrations.status"]),
  "mirror.rebuild": unique(AUDIT, SYSTEM, ["integrations.status"]),
  "backup.create": unique(AUDIT, SYSTEM, ["integrations.status"]),
  "import.preview": unique(AUDIT),
  "import.apply": ALL_BUSINESS_READS,
  "restore.preview": unique(AUDIT, SYSTEM, ["fullReset.status", "reset.status"]),
  "restore.apply": ALL_BUSINESS_READS,
  "reset.apply": ALL_BUSINESS_READS,
  "fullReset.apply": ALL_BUSINESS_READS,
  "integrity.run": unique(AUDIT, SYSTEM, ["integrations.status", "reset.status", "fullReset.status"]),
});

export const syncDependenciesForAction = (action) => ACTION_SYNC_DEPENDENCIES[action] || [];

export const syncRevisionStatement = () => ({
  sql: "SELECT resource,revision,updated_at FROM sync_revisions ORDER BY resource",
  args: [],
});

export const presentSyncRevisionRows = (rows = []) => {
  const resources = {};
  let globalRevision = 0;
  let updatedAt = null;
  for (const row of rows || []) {
    const resource = String(row.resource || "");
    const revision = Number(row.revision || 0);
    if (resource === SYNC_GLOBAL_RESOURCE) globalRevision = revision;
    else if (resource) resources[resource] = revision;
    if (!updatedAt || String(row.updated_at || "") > updatedAt) updatedAt = String(row.updated_at || "") || updatedAt;
  }
  return { globalRevision, resources, updatedAt };
};

export const readSyncState = async (db) => presentSyncRevisionRows(await db.all(
  "SELECT resource,revision,updated_at FROM sync_revisions ORDER BY resource",
));

export const bumpSyncRevisions = async (db, resources = [], timestamp = nowIso()) => {
  const targets = unique([SYNC_GLOBAL_RESOURCE], resources);
  if (!targets.length) return { resources: [], updatedAt: timestamp };
  const statements = targets.map((resource) => ({
    sql: `INSERT INTO sync_revisions(resource,revision,updated_at) VALUES(?,1,?)
      ON CONFLICT(resource) DO UPDATE SET revision=sync_revisions.revision+1,updated_at=excluded.updated_at`,
    args: [resource, timestamp],
  }));
  if (typeof db.batch === "function") await db.batch(statements);
  else for (const statement of statements) await db.execute(statement.sql, statement.args);
  return { resources: targets, updatedAt: timestamp };
};

export const bumpActionSyncRevisions = (db, action, timestamp = nowIso()) => bumpSyncRevisions(db, syncDependenciesForAction(action), timestamp);

