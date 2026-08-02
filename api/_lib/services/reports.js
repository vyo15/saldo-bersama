import crypto from "node:crypto";
import { appendAudit } from "./audit.js";
import { listBudgets, listEnvelopes, listGoals, listRecurring } from "./planning.js";
import { accountBalanceAsOf, categoryExpenseTotals, firstNegativeBalance, visibleAccounts, visibleTransactions } from "./readModels.js";
import {
  appError, assertOwner, assertVersion, canonicalJson, monthBounds, nonNegativeInteger, nowIso,
  periodKey, publicRow, sanitizeText, todayJakarta, uuid, visibleAccountSql, visibleScopeSql,
} from "./core.js";

const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const dateBefore = (date) => {
  const parsed = new Date(`${date}T00:00:00+07:00`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(parsed);
};

export const bootstrapData = async (db, context) => {
  const [accounts, categories, configRows] = await Promise.all([
    visibleAccounts(db, context.actor),
    db.all("SELECT * FROM categories WHERE status='active' ORDER BY transaction_type,name COLLATE NOCASE"),
    db.all("SELECT key,value FROM system_config WHERE key IN ('schema_version','timezone','currency','maintenance_mode')"),
  ]);
  const config = Object.fromEntries(configRows.map((row) => [row.key, row.value]));
  return {
    user: publicRow(context.actor),
    accounts,
    categories: categories.map(publicRow),
    config: {
      schemaVersion: Number(config.schema_version || 0),
      timezone: config.timezone || "Asia/Jakarta",
      currency: config.currency || "IDR",
      maintenanceMode: config.maintenance_mode === "true",
    },
  };
};

const allocationSummary = async (db, actor, accounts, period) => {
  const items = (await listEnvelopes(db, { actor, payload: { period } })).items.filter((item) => item.status === "active");
  const allocatedRemaining = items.reduce((sum, item) => sum + Math.max(0, Number(item.remaining_amount || 0)), 0);
  const totalAvailable = accounts.reduce((sum, item) => sum + Math.max(0, Number(item.balance || 0)), 0);
  return { items, allocatedRemaining, unallocatedAmount: Math.max(0, totalAvailable - allocatedRemaining) };
};

export const dashboardOverview = async (db, context) => {
  const period = periodKey(context.payload?.period);
  const bounds = monthBounds(period);
  const currentPeriod = todayJakarta().slice(0, 7);
  const historical = period < currentPeriod;
  const cutoffDate = historical ? bounds.end : todayJakarta();
  const [accounts, transactions, categoryExpenses, recurringResult, goalsResult] = await Promise.all([
    visibleAccounts(db, context.actor, { includeArchived: historical, cutoffDate }),
    visibleTransactions(db, context.actor, { startDate: bounds.start, endDate: cutoffDate, includeCancelled: false }),
    categoryExpenseTotals(db, context.actor, bounds.start, cutoffDate),
    listRecurring(db, { ...context, payload: { period } }),
    listGoals(db, context),
  ]);
  const allocation = await allocationSummary(db, context.actor, accounts, period);
  let income = 0; let expense = 0; let refund = 0; let unallocatedCount = 0;
  for (const row of transactions) {
    if (row.transaction_type === "income") income += Number(row.amount);
    else if (row.transaction_type === "expense") { expense += Number(row.amount); if (!row.envelope_period_id) unallocatedCount += 1; }
    else if (row.transaction_type === "refund") refund += Number(row.amount);
  }
  const openingDate = dateBefore(bounds.start);
  let openingBalance = 0;
  for (const account of accounts) openingBalance += await accountBalanceAsOf(db, account, openingDate);
  const totalBalance = accounts.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const protectedTypes = new Set(["emergency_fund", "savings", "sinking_fund"]);
  const emergencyBalance = accounts.filter((row) => row.account_type === "emergency_fund").reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const protectedBalance = accounts.filter((row) => protectedTypes.has(row.account_type)).reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const liquidBalance = accounts.filter((row) => !protectedTypes.has(row.account_type)).reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const recurring = recurringResult.items;
  const reservedBills = recurring.filter((row) => row.kind === "expense" && !["paid", "cancelled"].includes(row.status)).reduce((sum, row) => sum + Math.max(0, Number(row.expected_amount) - Number(row.actual_amount)), 0);
  const safeToSpend = Math.max(0, liquidBalance - reservedBills);
  const lastDay = Number(bounds.end.slice(-2));
  const currentDay = period === currentPeriod ? Number(todayJakarta().slice(-2)) : 1;
  const daysRemaining = historical ? 0 : Math.max(1, lastDay - currentDay + 1);
  const recentTransactions = transactions.slice(0, 12).map((row) => ({ ...row, can_update: row.status === "active" && (context.actor.role === "owner" || row.created_by === context.actor.user_id), can_cancel: row.status === "active" && (context.actor.role === "owner" || row.created_by === context.actor.user_id) }));
  return {
    periodKey: period,
    cutoffDate,
    isHistoricalPeriod: historical,
    accountBalances: accounts,
    totalBalance,
    openingBalance,
    balanceChange: totalBalance - openingBalance,
    liquidBalance,
    safeToSpend,
    dailySafeToSpend: daysRemaining ? Math.floor(safeToSpend / daysRemaining) : 0,
    daysRemaining,
    emergencyBalance,
    protectedBalance,
    cashFlow: { income, expense, refund, net: income + refund - expense },
    envelopes: allocation.items,
    recurring,
    goals: goalsResult.items,
    recentTransactions,
    categoryExpenses,
    unallocatedCount,
    unallocatedFunds: allocation.unallocatedAmount,
    allocatedRemaining: allocation.allocatedRemaining,
    reservedBills,
    lastSyncedAt: nowIso(),
  };
};

export const appInitialState = async (db, context) => {
  const [bootstrap, overview] = await Promise.all([bootstrapData(db, context), dashboardOverview(db, context)]);
  return { bootstrap, overview };
};

export const monthlyReport = async (db, context) => {
  const period = periodKey(context.payload?.period);
  const scoped = { ...context, payload: { period } };
  const [overview, budgetResult] = await Promise.all([dashboardOverview(db, scoped), listBudgets(db, scoped)]);
  return { overview, budgets: budgetResult.items, categoryExpenses: overview.categoryExpenses };
};

export const listReconciliations = async (db, context) => {
  const access = visibleAccountSql(context.actor, "a");
  const limit = Math.max(1, Math.min(100, Number(context.payload?.limit || 30)));
  const rows = await db.all(`SELECT r.*,a.name AS account_name FROM reconciliations r JOIN accounts a ON a.account_id=r.account_id WHERE ${access.sql} ORDER BY r.reconciled_at DESC LIMIT ?`, [...access.args, limit]);
  return { items: rows.map(publicRow) };
};

export const createReconciliation = async (db, context) => {
  const p = context.payload || {};
  const access = visibleAccountSql(context.actor, "a");
  const account = await db.one(`SELECT a.* FROM accounts a WHERE a.account_id=? AND a.status='active' AND ${access.sql}`, [p.account_id, ...access.args]);
  if (!account) throw appError("INVALID_ACCOUNT", "Rekening tidak ditemukan atau tidak dapat diakses.", 404);
  const actual = nonNegativeInteger(p.actual_balance, "Saldo aktual");
  const system = await accountBalanceAsOf(db, account, todayJakarta());
  const timestamp = nowIso();
  const record = { reconciliation_id: uuid(), account_id: account.account_id, reconciled_at: timestamp, system_balance: system, actual_balance: actual, difference: actual - system, notes: sanitizeText(p.notes, 250), status: actual === system ? "matched" : "difference", created_by: context.actor.user_id, created_at: timestamp };
  await db.execute("INSERT INTO reconciliations(reconciliation_id,account_id,reconciled_at,system_balance,actual_balance,difference,notes,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", Object.values(record));
  await appendAudit(db, context, { entityType: "reconciliation", entityId: record.reconciliation_id, next: publicRow(record) });
  return publicRow(record);
};

export const integrityIssues = async (db) => {
  const issues = [];
  const fk = await db.all("PRAGMA foreign_key_check");
  for (const row of fk) issues.push({ code: "FOREIGN_KEY", table: row.table, rowid: row.rowid, parent: row.parent });
  const duplicates = await db.all("SELECT idempotency_key,created_by,COUNT(*) AS count FROM transactions GROUP BY idempotency_key,created_by HAVING COUNT(*)>1");
  if (duplicates.length) issues.push({ code: "DUPLICATE_TRANSACTION_IDEMPOTENCY", count: duplicates.length });
  const invalidTransfer = await db.all("SELECT transaction_id FROM transactions WHERE transaction_type='transfer' AND (source_account_id IS NULL OR destination_account_id IS NULL OR source_account_id=destination_account_id)");
  if (invalidTransfer.length) issues.push({ code: "INVALID_TRANSFER", count: invalidTransfer.length });
  const brokenOwnership = await db.all("SELECT account_id FROM accounts WHERE (owner_scope='shared' AND owner_user_id IS NOT NULL) OR (owner_scope='personal' AND owner_user_id IS NULL)");
  if (brokenOwnership.length) issues.push({ code: "BROKEN_ACCOUNT_OWNERSHIP", count: brokenOwnership.length });
  const linkedCancelled = await db.all("SELECT occurrence_id FROM recurring_occurrences WHERE actual_amount<>(SELECT COALESCE(SUM(amount),0) FROM transactions WHERE status='active' AND recurring_occurrence_id=recurring_occurrences.occurrence_id)");
  if (linkedCancelled.length) issues.push({ code: "RECURRING_ACTUAL_MISMATCH", count: linkedCancelled.length });
  const protectedAccounts = await db.all("SELECT * FROM accounts WHERE allow_negative=0");
  for (const account of protectedAccounts) {
    const negative = await firstNegativeBalance(db, account, { fromDate: account.initial_balance_date });
    if (negative) issues.push({ code: "NEGATIVE_BALANCE", accountId: account.account_id, date: negative.date, balance: negative.balance });
  }
  return issues;
};

export const runIntegrity = async (db, context, { audit = true } = {}) => {
  const issues = await integrityIssues(db);
  const timestamp = nowIso();
  const record = { integrity_run_id: uuid(), status: issues.length ? "failed" : "passed", issues_json: canonicalJson(issues), created_by: context.actor.user_id, created_at: timestamp };
  await db.execute("INSERT INTO integrity_runs(integrity_run_id,status,issues_json,created_by,created_at) VALUES(?,?,?,?,?)", Object.values(record));
  if (audit) await appendAudit(db, context, { entityType: "system", entityId: "integrity", next: { ok: !issues.length, issueCount: issues.length } });
  return { ok: !issues.length, checkedAt: timestamp, issues };
};

const compactSnapshot = async (db, context, period) => {
  const report = await monthlyReport(db, { ...context, payload: { period } });
  const overview = report.overview;
  const snapshot = {
    schemaVersion: 3,
    periodKey: period,
    generatedAt: nowIso(),
    totals: { totalBalance: overview.totalBalance, liquidBalance: overview.liquidBalance, safeToSpend: overview.safeToSpend, protectedBalance: overview.protectedBalance, emergencyBalance: overview.emergencyBalance, reservedBills: overview.reservedBills, unallocatedFunds: overview.unallocatedFunds, allocatedRemaining: overview.allocatedRemaining, ...overview.cashFlow },
    accountBalances: overview.accountBalances.map(({ account_id, name, balance, status }) => ({ account_id, name, balance, status })),
    categoryExpenses: overview.categoryExpenses,
    budgets: report.budgets.map(({ budget_id, category_id, name, amount, used_amount, status }) => ({ budget_id, category_id, name, amount, used_amount, status })),
    envelopes: overview.envelopes.map(({ envelope_period_id, envelope_rule_id, name, allocated_amount, reserved_amount, used_amount, status }) => ({ envelope_period_id, envelope_rule_id, name, allocated_amount, reserved_amount, used_amount, status })),
    recurring: overview.recurring.map(({ occurrence_id, recurring_rule_id, name, due_date, expected_amount, actual_amount, status }) => ({ occurrence_id, recurring_rule_id, name, due_date, expected_amount, actual_amount, status })),
    goals: overview.goals.map(({ goal_id, current_amount }) => ({ goal_id, current_amount })),
  };
  snapshot.financialFingerprint = hash(canonicalJson(snapshot));
  return snapshot;
};

export const listPeriods = async (db) => {
  const rows = await db.all("SELECT * FROM period_closures ORDER BY period_key DESC,closed_at DESC");
  return { items: rows.map((row) => { const item = publicRow(row); const raw = item.snapshot_json || ""; delete item.snapshot_json; return { ...item, snapshot_length: raw.length, snapshot_checksum: item.snapshot_hash }; }) };
};

export const closePeriod = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const period = periodKey(p.period_key);
  const current = todayJakarta().slice(0, 7);
  const bounds = monthBounds(period);
  if (period > current) throw appError("FUTURE_PERIOD", "Periode masa depan belum dapat ditutup.", 400);
  if (period === current && todayJakarta() < bounds.end) throw appError("PERIOD_NOT_ENDED", "Periode berjalan baru dapat ditutup pada hari terakhir bulan.", 409, { earliestCloseDate: bounds.end });
  const existing = await db.one("SELECT * FROM period_closures WHERE period_key=? AND scope='shared'", [period]);
  if (existing?.status === "closed") throw appError("PERIOD_ALREADY_CLOSED", "Periode sudah ditutup.", 409);
  const integrity = await integrityIssues(db);
  const unallocated = await db.one("SELECT COUNT(*) AS count FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id IS NULL AND substr(transaction_date,1,7)=?", [period]);
  if (Number(unallocated?.count || 0)) integrity.push({ code: "UNALLOCATED_EXPENSE", count: Number(unallocated.count), periodKey: period });
  if (integrity.length) throw appError("PERIOD_INTEGRITY_FAILED", "Periode belum dapat ditutup karena integrity check gagal.", 409, integrity);
  const snapshot = await compactSnapshot(db, context, period);
  const snapshotJson = canonicalJson(snapshot);
  if (snapshotJson.length > 100_000) throw appError("SNAPSHOT_TOO_LARGE", "Snapshot tutup buku terlalu besar.", 409);
  const reason = sanitizeText(p.reason, 200);
  const timestamp = nowIso();
  let next;
  if (existing) {
    next = { ...existing, status: "closed", snapshot_json: snapshotJson, snapshot_hash: hash(snapshotJson), reason, row_version: Number(existing.row_version) + 1, closed_by: context.actor.user_id, closed_at: timestamp };
    const result = await db.execute("UPDATE period_closures SET status='closed',snapshot_json=?,snapshot_hash=?,reason=?,row_version=?,closed_by=?,closed_at=? WHERE closure_id=? AND row_version=?", [next.snapshot_json, next.snapshot_hash, next.reason, next.row_version, next.closed_by, next.closed_at, existing.closure_id, existing.row_version]);
    if (result.rowsAffected !== 1) throw appError("CONFLICT", "Status periode berubah di perangkat lain.", 409);
  } else {
    next = { closure_id: uuid(), period_key: period, scope: "shared", status: "closed", snapshot_json: snapshotJson, snapshot_hash: hash(snapshotJson), reason, row_version: 1, closed_by: context.actor.user_id, closed_at: timestamp, reopened_by: null, reopened_at: null };
    await db.execute("INSERT INTO period_closures(closure_id,period_key,scope,status,snapshot_json,snapshot_hash,reason,row_version,closed_by,closed_at,reopened_by,reopened_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", Object.values(next));
  }
  await appendAudit(db, context, { entityType: "period_closure", entityId: next.closure_id, previous: existing ? { status: existing.status, row_version: existing.row_version } : null, next: { status: next.status, row_version: next.row_version, snapshot_checksum: next.snapshot_hash, snapshot_length: snapshotJson.length } });
  const output = publicRow(next); delete output.snapshot_json; return { ...output, snapshot_length: snapshotJson.length, snapshot_checksum: next.snapshot_hash };
};

export const reopenPeriod = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM period_closures WHERE closure_id=? AND status='closed'", [p.closure_id]);
  if (!current) throw appError("NOT_FOUND", "Periode tertutup tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const later = await db.one("SELECT closure_id,period_key FROM period_closures WHERE status='closed' AND period_key>? ORDER BY period_key DESC LIMIT 1", [current.period_key]);
  if (later) throw appError("LATER_PERIOD_CLOSED", "Periode harus dibuka kembali dari bulan tertutup paling akhir.", 409, { latestClosedPeriod: later.period_key, latestClosureId: later.closure_id });
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan membuka periode wajib diisi.", 400);
  const timestamp = nowIso();
  const next = { ...current, status: "reopened", reason, row_version: Number(current.row_version) + 1, reopened_by: context.actor.user_id, reopened_at: timestamp };
  const result = await db.execute("UPDATE period_closures SET status='reopened',reason=?,row_version=?,reopened_by=?,reopened_at=? WHERE closure_id=? AND row_version=?", [reason, next.row_version, next.reopened_by, next.reopened_at, current.closure_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Status periode berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "period_closure", entityId: current.closure_id, previous: { status: current.status, row_version: current.row_version }, next: { status: next.status, row_version: next.row_version, reason } });
  const output = publicRow(next); delete output.snapshot_json; return output;
};
