import { readBatchRows } from "../../db/readBatchRows.js";
import { appError, canonicalJson, parseJson, sanitizeText } from "../core.js";
import { digest, quoted } from "./shared.js";

// Reset model code describes what would be removed and fingerprints that exact state.
// It performs no destructive mutation; apply remains fail-closed in reset.js.
export const TRIAL_RESET_CONFIRMATION = "BERSIHKAN DATA TESTING";
export const TRIAL_RESET_SCOPE_ACTIVITY = "activity";
export const TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES = "activity_and_balances";

export const TRIAL_RESET_SCOPES = new Set([TRIAL_RESET_SCOPE_ACTIVITY, TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES]);

export const RESET_BUSINESS_TABLES = Object.freeze([
  { table: "investment_reconciliations", key: "reconciliation_id" },
  { table: "investment_valuations", key: "valuation_id" },
  { table: "investment_corrections", key: "correction_id" },
  { table: "investment_trades", key: "trade_id" },
  { table: "goal_movements", key: "goal_movement_id" },
  { table: "budgets", key: "budget_id" },
  { table: "envelope_movements", key: "movement_id" },
  { table: "transactions", key: "transaction_id" },
  { table: "recurring_occurrences", key: "occurrence_id" },
  { table: "recurring_rules", key: "recurring_rule_id" },
  { table: "envelope_periods", key: "envelope_period_id" },
  { table: "envelope_rules", key: "envelope_rule_id" },
  { table: "savings_goals", key: "goal_id" },
  { table: "reconciliations", key: "reconciliation_id" },
  { table: "period_closures", key: "closure_id" },
]);

export const RESET_OPERATIONAL_TABLES = Object.freeze([
  { table: "transfer_requests", key: "request_id" },
  { table: "master_data_requests", key: "request_id" },
  { table: "notification_deliveries", key: "delivery_id" },
  { table: "manual_reminders", key: "reminder_id" },
  { table: "notification_queue", key: "notification_id" },
  { table: "integration_links", key: "link_id" },
  { table: "integration_outbox", key: "outbox_id" },
  { table: "import_previews", key: "preview_id" },
]);

export const RESET_STATE_TABLES = Object.freeze([...RESET_BUSINESS_TABLES, ...RESET_OPERATIONAL_TABLES]);
export const RESET_OPERATIONAL_DELETE_ORDER = Object.freeze(RESET_OPERATIONAL_TABLES.map(({ table }) => table));
export const RESET_BUSINESS_DELETE_ORDER = Object.freeze(RESET_BUSINESS_TABLES.map(({ table }) => table));

export const RESET_STATE_STATEMENTS = Object.freeze(RESET_STATE_TABLES.map(({ table, key }) => ({
  sql: `SELECT * FROM ${quoted(table)} ORDER BY ${quoted(key)}`,
  args: [],
})));

export const RESET_GENERATED_OUTBOX_PREDICATE = `(
  entity_type='system'
  AND event_type='rebuild'
  AND ((provider='sheets' AND entity_id='mirror') OR (provider='calendar' AND entity_id='calendar'))
  AND json_extract(CASE WHEN json_valid(payload_json)=1 THEN payload_json ELSE '{}' END,'$.reason')='trial-reset'
)`;

export const RESET_COUNT_STATEMENTS = Object.freeze(RESET_STATE_TABLES.map(({ table }) => ({
  sql: table === "integration_outbox"
    ? `SELECT COUNT(*) AS count FROM integration_outbox WHERE NOT ${RESET_GENERATED_OUTBOX_PREDICATE}`
    : `SELECT COUNT(*) AS count FROM ${quoted(table)}`,
  args: [],
})));

export const PRESERVED_COUNT_STATEMENTS = Object.freeze([
  { sql: "SELECT COUNT(*) AS count FROM accounts", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM categories", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM investment_portfolios", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM investment_instruments", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM users", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM audit_log", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM backup_runs", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM push_subscriptions", args: [] },
  { sql: "SELECT COUNT(*) AS count FROM notification_preferences", args: [] },
]);

export const accountBalanceResetStatement = (cutoffDate) => ({
  sql: `SELECT a.account_id,a.name,a.initial_balance,a.initial_balance_date,a.row_version,a.status,
    CASE WHEN a.initial_balance_date>? THEN 0 ELSE a.initial_balance + COALESCE(SUM(CASE
      WHEN t.transaction_type IN ('income','refund') AND t.destination_account_id=a.account_id THEN t.amount
      WHEN t.transaction_type='expense' AND t.source_account_id=a.account_id THEN -t.amount
      WHEN t.transaction_type='transfer' AND t.source_account_id=a.account_id THEN -t.amount
      WHEN t.transaction_type='transfer' AND t.destination_account_id=a.account_id THEN t.amount
      WHEN t.transaction_type='adjustment' AND t.source_account_id=a.account_id THEN t.amount
      ELSE 0 END),0) + COALESCE((SELECT SUM(e.cash_effect) FROM investment_account_events e
        WHERE e.account_id=a.account_id AND e.event_date BETWEEN a.initial_balance_date AND ?),0) END AS current_balance
    FROM accounts a
    LEFT JOIN transactions t ON t.status='active'
      AND t.transaction_date BETWEEN a.initial_balance_date AND ?
      AND (t.source_account_id=a.account_id OR t.destination_account_id=a.account_id)
    GROUP BY a.account_id
    ORDER BY a.account_id`,
  args: [cutoffDate, cutoffDate, cutoffDate],
});

export const normalizedResetScope = (value) => {
  const scope = sanitizeText(value || TRIAL_RESET_SCOPE_ACTIVITY, 40);
  if (!TRIAL_RESET_SCOPES.has(scope)) {
    throw appError("RESET_SCOPE_INVALID", "Pilihan reset data testing tidak valid.", 400);
  }
  return scope;
};

const isResetGeneratedOutbox = (row) => {
  if (row?.entity_type !== "system" || row?.event_type !== "rebuild") return false;
  const canonicalTarget = (row.provider === "sheets" && row.entity_id === "mirror")
    || (row.provider === "calendar" && row.entity_id === "calendar");
  if (!canonicalTarget) return false;
  return parseJson(row.payload_json, {})?.reason === "trial-reset";
};

const resettableRows = (table, rows) => table === "integration_outbox"
  ? rows.filter((row) => !isResetGeneratedOutbox(row))
  : rows;

const rowsByResetTable = (resultRows) => Object.fromEntries(RESET_STATE_TABLES.map(({ table }, index) => [
  table,
  resettableRows(table, resultRows[index] || []),
]));

const accountStateForFingerprint = (accounts = []) => accounts.map((row) => ({
  account_id: row.account_id,
  initial_balance: Number(row.initial_balance || 0),
  initial_balance_date: row.initial_balance_date,
  row_version: Number(row.row_version || 1),
}));

export const mapResetStateRows = (resultRows, scope, accountRows = []) => {
  const rowsByTable = rowsByResetTable(resultRows);
  const counts = Object.fromEntries(RESET_STATE_TABLES.map(({ table }) => [table, rowsByTable[table].length]));
  const fingerprintPayload = scope === TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES
    ? { rowsByTable, accounts: accountStateForFingerprint(accountRows), scope }
    : { rowsByTable, scope };
  return {
    counts,
    fingerprint: digest(canonicalJson(fingerprintPayload)),
  };
};

export const mapResetCountRows = (resultRows) => Object.fromEntries(RESET_STATE_TABLES.map(({ table }, index) => [
  table,
  Number(resultRows[index]?.[0]?.count || 0),
]));

export const mapPreservedCountRows = (resultRows) => {
  const [accounts, categories, investmentPortfolios, investmentInstruments, users, audit, backups, pushSubscriptions, notificationPreferences] = resultRows.map((rows) => rows?.[0] || null);
  return {
    accounts: Number(accounts?.count || 0),
    categories: Number(categories?.count || 0),
    investmentPortfolios: Number(investmentPortfolios?.count || 0),
    investmentInstruments: Number(investmentInstruments?.count || 0),
    users: Number(users?.count || 0),
    audit: Number(audit?.count || 0),
    backups: Number(backups?.count || 0),
    pushSubscriptions: Number(pushSubscriptions?.count || 0),
    notificationPreferences: Number(notificationPreferences?.count || 0),
  };
};

export const balanceResetPreview = (accountRows = []) => {
  const accounts = accountRows
    .filter((row) => Number(row.current_balance || 0) !== 0 || Number(row.initial_balance || 0) !== 0)
    .map((row) => ({
      accountId: row.account_id,
      name: row.name,
      currentBalance: Number(row.current_balance || 0),
      initialBalance: Number(row.initial_balance || 0),
      nextBalance: 0,
      rowVersion: Number(row.row_version || 1),
    }));
  return {
    accountsAffected: accounts.length,
    totalCurrentBalance: accounts.reduce((sum, row) => sum + row.currentBalance, 0),
    totalInitialBalance: accounts.reduce((sum, row) => sum + row.initialBalance, 0),
    accounts,
  };
};

export const readResetState = async (db, scope, cutoffDate) => {
  const withBalances = scope === TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES;
  const statements = withBalances ? [...RESET_STATE_STATEMENTS, accountBalanceResetStatement(cutoffDate)] : RESET_STATE_STATEMENTS;
  const resultRows = await readBatchRows(db, statements);
  const accountRows = withBalances ? resultRows.at(-1) || [] : [];
  return {
    ...mapResetStateRows(resultRows.slice(0, RESET_STATE_STATEMENTS.length), scope, accountRows),
    balanceReset: withBalances ? balanceResetPreview(accountRows) : null,
  };
};

const countFor = (counts, key) => Number(counts[key] || 0);
const sumCounts = (counts, tables) => tables.reduce((sum, { table }) => sum + countFor(counts, table), 0);

export const resetSummary = (counts) => {
  const businessRows = sumCounts(counts, RESET_BUSINESS_TABLES);
  const operationalRows = sumCounts(counts, RESET_OPERATIONAL_TABLES);
  return {
    transactions: countFor(counts, "transactions"),
    reconciliations: countFor(counts, "reconciliations"),
    investmentTrades: countFor(counts, "investment_trades"),
    investmentCorrections: countFor(counts, "investment_corrections"),
    investmentValuations: countFor(counts, "investment_valuations"),
    investmentReconciliations: countFor(counts, "investment_reconciliations"),
    goals: countFor(counts, "savings_goals"),
    goalMovements: countFor(counts, "goal_movements"),
    budgets: countFor(counts, "budgets"),
    allocationRules: countFor(counts, "envelope_rules"),
    allocationPeriods: countFor(counts, "envelope_periods"),
    allocationMovements: countFor(counts, "envelope_movements"),
    recurringRules: countFor(counts, "recurring_rules"),
    recurringOccurrences: countFor(counts, "recurring_occurrences"),
    periodClosures: countFor(counts, "period_closures"),
    notificationDeliveries: countFor(counts, "notification_deliveries"),
    manualReminders: countFor(counts, "manual_reminders"),
    notificationQueue: countFor(counts, "notification_queue"),
    integrationLinks: countFor(counts, "integration_links"),
    integrationOutbox: countFor(counts, "integration_outbox"),
    importPreviews: countFor(counts, "import_previews"),
    masterDataRequests: countFor(counts, "master_data_requests"),
    transferRequests: countFor(counts, "transfer_requests"),
    businessRows,
    operationalRows,
    totalRows: businessRows + operationalRows,
  };
};
