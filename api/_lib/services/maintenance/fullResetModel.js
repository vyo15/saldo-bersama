import { readBatchRows } from "../../db/readBatchRows.js";
import { canonicalJson } from "../core.js";
import { digest, quoted } from "./shared.js";

// Full-reset model only describes/fingerprints removable state. Mutation ordering and
// fail-closed recovery remain in fullReset.js.
export const FULL_RESET_CONFIRMATION = "RESET SEMUA DATA SALDO BERSAMA";

export const FULL_RESET_DOMAIN_TABLES = Object.freeze([
  { table: "investment_reconciliations", orderBy: "reconciliation_id", key: "investmentReconciliations" },
  { table: "investment_valuations", orderBy: "valuation_id", key: "investmentValuations" },
  { table: "investment_corrections", orderBy: "correction_id", key: "investmentCorrections" },
  { table: "investment_trades", orderBy: "trade_id", key: "investmentTrades" },
  { table: "goal_movements", orderBy: "goal_movement_id", key: "goalMovements" },
  { table: "budgets", orderBy: "budget_id", key: "budgets" },
  { table: "envelope_movements", orderBy: "movement_id", key: "allocationMovements" },
  { table: "transactions", orderBy: "transaction_id", key: "transactions" },
  { table: "recurring_occurrences", orderBy: "occurrence_id", key: "recurringOccurrences" },
  { table: "recurring_rules", orderBy: "recurring_rule_id", key: "recurringRules" },
  { table: "envelope_periods", orderBy: "envelope_period_id", key: "allocationPeriods" },
  { table: "envelope_rules", orderBy: "envelope_rule_id", key: "allocationRules" },
  { table: "savings_goals", orderBy: "goal_id", key: "goals" },
  { table: "reconciliations", orderBy: "reconciliation_id", key: "reconciliations" },
  { table: "period_closures", orderBy: "closure_id", key: "periodClosures" },
]);

export const FULL_RESET_MASTER_TABLES = Object.freeze([
  { table: "investment_portfolios", orderBy: "portfolio_id", key: "investmentPortfolios" },
  { table: "investment_instruments", orderBy: "instrument_id", key: "investmentInstruments" },
  { table: "categories", orderBy: "category_id", key: "categories" },
  { table: "accounts", orderBy: "account_id", key: "accounts" },
]);

export const FULL_RESET_OPERATIONAL_TABLES = Object.freeze([
  { table: "transfer_requests", orderBy: "request_id", key: "transferRequests" },
  { table: "master_data_requests", orderBy: "request_id", key: "masterDataRequests" },
  { table: "notification_deliveries", orderBy: "delivery_id", key: "notificationDeliveries" },
  { table: "manual_reminders", orderBy: "reminder_id", key: "manualReminders" },
  { table: "notification_queue", orderBy: "notification_id", key: "notificationQueue" },
  { table: "integration_links", orderBy: "link_id", key: "integrationLinks" },
  { table: "integration_outbox", orderBy: "outbox_id", key: "integrationOutbox" },
  { table: "notification_preferences", orderBy: "user_id,notification_type", key: "notificationPreferences" },
  { table: "push_subscriptions", orderBy: "subscription_id", key: "pushSubscriptions" },
  { table: "import_previews", orderBy: "preview_id", key: "importPreviews" },
  { table: "restore_previews", orderBy: "preview_id", key: "restorePreviews" },
]);

export const FULL_RESET_TABLES = Object.freeze([
  ...FULL_RESET_DOMAIN_TABLES,
  ...FULL_RESET_MASTER_TABLES,
  ...FULL_RESET_OPERATIONAL_TABLES,
]);

export const FULL_RESET_GENERATED_OUTBOX_PREDICATE = `(
  entity_type='system'
  AND event_type='rebuild'
  AND ((provider='sheets' AND entity_id='mirror') OR (provider='calendar' AND entity_id='calendar'))
  AND json_extract(CASE WHEN json_valid(payload_json)=1 THEN payload_json ELSE '{}' END,'$.reason')='full-reset'
)`;

export const FULL_RESET_DELETE_ORDER = Object.freeze([
  "transfer_requests",
  "master_data_requests",
  "notification_deliveries",
  "manual_reminders",
  "notification_queue",
  "integration_links",
  "integration_outbox",
  "investment_reconciliations",
  "investment_valuations",
  "investment_corrections",
  "investment_trades",
  "goal_movements",
  "budgets",
  "envelope_movements",
  "transactions",
  "recurring_occurrences",
  "recurring_rules",
  "envelope_periods",
  "envelope_rules",
  "savings_goals",
  "reconciliations",
  "period_closures",
  "notification_preferences",
  "push_subscriptions",
  "import_previews",
  "restore_previews",
  "investment_portfolios",
  "investment_instruments",
  "categories",
  "accounts",
]);

export const FULL_RESET_STATE_STATEMENTS = Object.freeze(FULL_RESET_TABLES.map(({ table, orderBy }) => ({
  sql: table === "integration_outbox"
    ? `SELECT * FROM integration_outbox WHERE NOT ${FULL_RESET_GENERATED_OUTBOX_PREDICATE} ORDER BY ${orderBy.split(",").map((column) => quoted(column)).join(",")}`
    : `SELECT * FROM ${quoted(table)} ORDER BY ${orderBy.split(",").map((column) => quoted(column)).join(",")}`,
  args: [],
})));

export const FULL_RESET_COUNT_STATEMENTS = Object.freeze(FULL_RESET_TABLES.map(({ table }) => ({
  sql: table === "integration_outbox"
    ? `SELECT COUNT(*) AS count FROM integration_outbox WHERE NOT ${FULL_RESET_GENERATED_OUTBOX_PREDICATE}`
    : `SELECT COUNT(*) AS count FROM ${quoted(table)}`,
  args: [],
})));

export const FULL_RESET_PRESERVED_STATEMENTS = Object.freeze([
  { sql: "SELECT COUNT(*) AS count FROM users", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM audit_log", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM backup_runs", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM integrity_runs", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM idempotency_keys", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM system_config", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM schema_migrations", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM request_nonces", args: [] },
]);

export const mapState = (rows) => {
  const rowsByTable = Object.fromEntries(FULL_RESET_TABLES.map(({ table }, index) => [table, rows[index] || []]));
  const counts = Object.fromEntries(FULL_RESET_TABLES.map(({ table }) => [table, rowsByTable[table].length]));
  return { counts, fingerprint: digest(canonicalJson(rowsByTable)) };
};

export const mapCounts = (rows) => Object.fromEntries(FULL_RESET_TABLES.map(({ table }, index) => [
  table,
  Number(rows[index]?.[0]?.count || 0),
]));

export const mapPreserved = (rows) => {
  const [users, audit, backups, integrityRuns, idempotencyKeys, systemConfig, schemaMigrations, requestNonces] = rows.map((items) => items?.[0] || null);
  return {
    users: Number(users?.count || 0),
    audit: Number(audit?.count || 0),
    backups: Number(backups?.count || 0),
    integrityRuns: Number(integrityRuns?.count || 0),
    idempotencyKeys: Number(idempotencyKeys?.count || 0),
    systemConfig: Number(systemConfig?.count || 0),
    schemaMigrations: Number(schemaMigrations?.count || 0),
    requestNonces: Number(requestNonces?.count || 0),
  };
};

const tableCount = (counts, table) => Number(counts[table] || 0);
const groupCount = (counts, descriptors) => descriptors.reduce((sum, { table }) => sum + tableCount(counts, table), 0);

export const fullResetSummary = (counts) => {
  const domainRows = groupCount(counts, FULL_RESET_DOMAIN_TABLES);
  const masterRows = groupCount(counts, FULL_RESET_MASTER_TABLES);
  const operationalRows = groupCount(counts, FULL_RESET_OPERATIONAL_TABLES);
  return {
    transactions: tableCount(counts, "transactions"),
    reconciliations: tableCount(counts, "reconciliations"),
    goals: tableCount(counts, "savings_goals"),
    goalMovements: tableCount(counts, "goal_movements"),
    budgets: tableCount(counts, "budgets"),
    allocationRules: tableCount(counts, "envelope_rules"),
    allocationPeriods: tableCount(counts, "envelope_periods"),
    allocationMovements: tableCount(counts, "envelope_movements"),
    recurringRules: tableCount(counts, "recurring_rules"),
    recurringOccurrences: tableCount(counts, "recurring_occurrences"),
    periodClosures: tableCount(counts, "period_closures"),
    accounts: tableCount(counts, "accounts"),
    categories: tableCount(counts, "categories"),
    masterDataRequests: tableCount(counts, "master_data_requests"),
    transferRequests: tableCount(counts, "transfer_requests"),
    notificationDeliveries: tableCount(counts, "notification_deliveries"),
    manualReminders: tableCount(counts, "manual_reminders"),
    notificationQueue: tableCount(counts, "notification_queue"),
    integrationLinks: tableCount(counts, "integration_links"),
    integrationOutbox: tableCount(counts, "integration_outbox"),
    notificationPreferences: tableCount(counts, "notification_preferences"),
    pushSubscriptions: tableCount(counts, "push_subscriptions"),
    importPreviews: tableCount(counts, "import_previews"),
    restorePreviews: tableCount(counts, "restore_previews"),
    domainRows,
    masterRows,
    operationalRows,
    totalRows: domainRows + masterRows + operationalRows,
  };
};

export const readFullResetState = async (db) => mapState(await readBatchRows(db, FULL_RESET_STATE_STATEMENTS));
