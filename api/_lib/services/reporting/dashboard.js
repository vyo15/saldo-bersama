import { readBatchRows } from "../../db/readBatchRows.js";
import {
  budgetListStatement,
  goalListStatements,
  mapBudgetListRows,
  mapGoalListRows,
  mapRecurringRows,
  recurringListStatement,
} from "../planning/index.js";
import {
  categoryExpenseTotalsStatement,
  envelopeItemsStatement,
  mapCategoryExpenseRows,
  mapEnvelopeItemRows,
  mapVisibleAccountRows,
  visibleAccountsStatement,
} from "../readModels.js";
import {
  appError,
  boundedInteger,
  monthBounds,
  nowIso,
  periodKey,
  publicRow,
  readableAccountSql,
  readableLedgerSql,
  operableScopeSql,
  sanitizeText,
  todayJakarta,
} from "../core.js";
import { dateBefore } from "./shared.js";

const NATURE_LABELS = Object.freeze({
  fixed: "Kebutuhan tetap",
  variable: "Kebutuhan variabel",
  unexpected: "Tidak terduga",
  discretionary: "Hiburan/pribadi",
  emergency: "Darurat",
  savings: "Tabungan/masa depan",
  other: "Lainnya",
});

const ALERT_PRIORITY = Object.freeze({ danger: 3, warning: 2, info: 1 });

const addPeriodMonths = (period, offset) => {
  const [year, month] = periodKey(period).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const periodLabel = (period) => {
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
};

const dayDifference = (from, to) => Math.floor((new Date(`${to}T00:00:00+07:00`) - new Date(`${from}T00:00:00+07:00`)) / 86_400_000);

const usageThreshold = (percentage, custom = 75) => {
  if (percentage >= 100) return { threshold: 100, severity: "danger" };
  if (percentage >= 90) return { threshold: 90, severity: "warning" };
  if (percentage >= custom) return { threshold: custom, severity: "warning" };
  return null;
};

const bootstrapReadStatements = (context) => [
  visibleAccountsStatement(context.actor),
  { sql: "SELECT * FROM categories WHERE status='active' ORDER BY transaction_type,name COLLATE NOCASE", args: [] },
  { sql: "SELECT key,value FROM system_config WHERE key IN ('schema_version','timezone','currency','maintenance_mode')", args: [] },
];

const mapBootstrapRows = ([accountRows = [], categories = [], configRows = []], context) => {
  const accounts = mapVisibleAccountRows(accountRows, context.actor);
  const config = Object.fromEntries(configRows.map((row) => [row.key, row.value]));
  return {
    user: publicRow(context.actor),
    accounts,
    categories: categories.map((row) => publicRow(row)),
    config: {
      schemaVersion: Number(config.schema_version || 0),
      timezone: config.timezone || "Asia/Jakarta",
      currency: config.currency || "IDR",
      maintenanceMode: config.maintenance_mode === "true",
    },
  };
};

export const bootstrapData = async (db, context) => mapBootstrapRows(
  await readBatchRows(db, bootstrapReadStatements(context)),
  context,
);

const allocationSummary = (accounts, items) => {
  const allocatedRemaining = items.reduce((sum, item) => sum + Math.max(0, Number(item.remaining_amount || 0)), 0);
  const totalAvailable = accounts.reduce((sum, item) => sum + Math.max(0, Number(item.balance || 0)), 0);
  return {
    items,
    allocatedRemaining,
    unallocatedAmount: Math.max(0, totalAvailable - allocatedRemaining),
  };
};

const reportBreakdownStatements = (actor, startDate, endDate) => {
  const access = readableLedgerSql(actor, "t");
  const commonWhere = `t.status='active' AND t.transaction_type='expense' AND t.transaction_date BETWEEN ? AND ? AND ${access.sql}`;
  const args = [startDate, endDate, ...access.args];
  return [
    { sql: `SELECT a.account_id,a.name,a.owner_scope,a.owner_user_id,COALESCE(NULLIF(TRIM(u.name),''),'Pengguna') AS owner_name,SUM(t.amount) AS amount,COUNT(*) AS transaction_count
      FROM transactions t JOIN accounts a ON a.account_id=t.source_account_id
      LEFT JOIN users u ON u.user_id=a.owner_user_id
      WHERE ${commonWhere}
      GROUP BY a.account_id,a.name,a.owner_scope,a.owner_user_id,u.name ORDER BY amount DESC`, args },
    { sql: `SELECT u.user_id,u.name,SUM(t.amount) AS amount,COUNT(*) AS transaction_count
      FROM transactions t JOIN users u ON u.user_id=t.created_by
      WHERE ${commonWhere}
      GROUP BY u.user_id,u.name ORDER BY amount DESC`, args },
    { sql: `SELECT COALESCE(c.nature,'other') AS nature,SUM(t.amount) AS amount,COUNT(*) AS transaction_count
      FROM transactions t LEFT JOIN categories c ON c.category_id=t.category_id
      WHERE ${commonWhere}
      GROUP BY COALESCE(c.nature,'other') ORDER BY amount DESC`, args },
  ];
};

const mapReportBreakdowns = ([accounts = [], creators = [], natures = []]) => ({
  accountExpenses: accounts.map((row) => ({
    ...publicRow(row),
    label: row.owner_scope === "personal" ? `${row.name} · Pribadi · ${row.owner_name}` : `${row.name} · Bersama`,
  })),
  creatorExpenses: creators.map((row) => ({ ...publicRow(row), label: row.name })),
  natureExpenses: natures.map((row) => ({ ...publicRow(row), label: NATURE_LABELS[row.nature] || NATURE_LABELS.other })),
});

const monthlyTrendPlan = (actor, endPeriod, count, { accountId = "" } = {}) => {
  const periods = Array.from({ length: count }, (_, index) => addPeriodMonths(endPeriod, index - count + 1));
  const firstBounds = monthBounds(periods[0]);
  const lastBounds = monthBounds(periods.at(-1));
  const currentPeriod = todayJakarta().slice(0, 7);
  const trendEnd = periods.at(-1) === currentPeriod ? todayJakarta() : lastBounds.end;
  const ledgerAccess = readableLedgerSql(actor, "t");
  const accountAccess = readableAccountSql(actor, "a");
  const cutoffs = periods.map((period) => {
    const bounds = monthBounds(period);
    return [period, period === currentPeriod ? todayJakarta() : bounds.end];
  });
  const cutoffValues = cutoffs.map(() => "(?,?)").join(",");
  const cutoffArgs = cutoffs.flat();
  const statements = [
    {
      sql: `SELECT substr(t.transaction_date,1,7) AS period_key,
        COALESCE(SUM(CASE WHEN t.transaction_type='income' THEN t.amount ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN t.transaction_type='expense' THEN t.amount ELSE 0 END),0) AS expense,
        COALESCE(SUM(CASE WHEN t.transaction_type='refund' THEN t.amount ELSE 0 END),0) AS refund
      FROM transactions t
      WHERE t.status='active' AND t.transaction_date BETWEEN ? AND ? AND ${ledgerAccess.sql}
      GROUP BY substr(t.transaction_date,1,7)`,
      args: [firstBounds.start, trendEnd, ...ledgerAccess.args],
    },
    {
      sql: `WITH cutoffs(period_key,cutoff_date) AS (VALUES ${cutoffValues}),
        account_balances AS (
          SELECT c.period_key,a.account_id,
            CASE WHEN a.initial_balance_date<=c.cutoff_date THEN a.initial_balance ELSE 0 END + COALESCE(SUM(CASE
              WHEN t.status='active' AND t.transaction_date BETWEEN a.initial_balance_date AND c.cutoff_date
                AND t.transaction_type IN ('income','refund') AND t.destination_account_id=a.account_id THEN t.amount
              WHEN t.status='active' AND t.transaction_date BETWEEN a.initial_balance_date AND c.cutoff_date
                AND t.transaction_type='expense' AND t.source_account_id=a.account_id THEN -t.amount
              WHEN t.status='active' AND t.transaction_date BETWEEN a.initial_balance_date AND c.cutoff_date
                AND t.transaction_type='transfer' AND t.source_account_id=a.account_id THEN -t.amount
              WHEN t.status='active' AND t.transaction_date BETWEEN a.initial_balance_date AND c.cutoff_date
                AND t.transaction_type='transfer' AND t.destination_account_id=a.account_id THEN t.amount
              WHEN t.status='active' AND t.transaction_date BETWEEN a.initial_balance_date AND c.cutoff_date
                AND t.transaction_type='adjustment' AND t.source_account_id=a.account_id THEN t.amount
              ELSE 0 END),0) AS balance
          FROM cutoffs c CROSS JOIN accounts a
          LEFT JOIN transactions t ON (t.source_account_id=a.account_id OR t.destination_account_id=a.account_id)
            AND t.status='active' AND t.transaction_date<=c.cutoff_date AND t.transaction_date>=a.initial_balance_date
          WHERE ${accountAccess.sql}
          GROUP BY c.period_key,a.account_id,a.initial_balance,a.initial_balance_date
        )
        SELECT period_key,COALESCE(SUM(balance),0) AS total_balance FROM account_balances GROUP BY period_key`,
      args: [...cutoffArgs, ...accountAccess.args],
    },
  ];
  if (accountId) {
    statements.push({
      sql: `SELECT substr(t.transaction_date,1,7) AS period_key,COALESCE(SUM(t.amount),0) AS amount
        FROM transactions t
        WHERE t.status='active' AND t.transaction_type='expense' AND t.source_account_id=?
          AND t.transaction_date BETWEEN ? AND ? AND ${ledgerAccess.sql}
        GROUP BY substr(t.transaction_date,1,7)`,
      args: [accountId, firstBounds.start, trendEnd, ...ledgerAccess.args],
    });
  }
  return { periods, statements, accountId };
};

const mapMonthlyTrendRows = (plan, [cashRows = [], balanceRows = [], accountExpenseRows = []]) => {
  const cashLookup = new Map(cashRows.map((row) => [row.period_key, row]));
  const balanceLookup = new Map(balanceRows.map((row) => [row.period_key, Number(row.total_balance || 0)]));
  const accountExpenseLookup = new Map(accountExpenseRows.map((row) => [row.period_key, Number(row.amount || 0)]));
  return {
    items: plan.periods.map((period) => {
      const row = cashLookup.get(period) || {};
      const income = Number(row.income || 0);
      const expense = Number(row.expense || 0);
      const refund = Number(row.refund || 0);
      return {
        periodKey: period,
        label: periodLabel(period),
        income,
        expense,
        refund,
        net: income + refund - expense,
        totalBalance: balanceLookup.get(period) || 0,
      };
    }),
    accountExpenseItems: plan.accountId
      ? plan.periods.map((period) => ({ period, value: accountExpenseLookup.get(period) || 0 }))
      : [],
  };
};

const reconciliationAlertStatement = (actor) => {
  const access = readableAccountSql(actor, "a");
  return {
    sql: `SELECT a.account_id,a.name,r.reconciled_at,r.difference
      FROM accounts a
      LEFT JOIN (
        SELECT account_id,reconciled_at,difference FROM (
          SELECT account_id,reconciled_at,difference,ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY reconciled_at DESC,created_at DESC) AS rn
          FROM reconciliations
        ) latest WHERE latest.rn=1
      ) r ON r.account_id=a.account_id
      WHERE a.status='active' AND ${access.sql}
      ORDER BY a.name COLLATE NOCASE`,
    args: access.args,
  };
};

const reconciliationAlertsFromRows = (rows, accounts) => {
  const balanceLookup = new Map(accounts.map((item) => [item.account_id, Number(item.balance || 0)]));
  const accountLabelLookup = new Map(accounts.map((item) => [
    item.account_id,
    item.owner_scope === "personal" ? `${item.name} · Pribadi · ${item.owner_name || "Pengguna"}` : `${item.name} · Bersama`,
  ]));
  const today = todayJakarta();
  const alerts = [];
  for (const row of rows) {
    const accountLabel = accountLabelLookup.get(row.account_id) || row.name;
    if (Number(row.difference || 0) !== 0) {
      alerts.push({
        id: `reconciliation-difference:${row.account_id}`,
        type: "reconciliation_difference",
        severity: "danger",
        title: `Saldo ${accountLabel} berbeda`,
        message: "Saldo yang terakhir Anda cek berbeda dari catatan aplikasi.",
        targetPath: "/rekonsiliasi",
      });
      continue;
    }
    const age = row.reconciled_at ? dayDifference(String(row.reconciled_at).slice(0, 10), today) : Number.POSITIVE_INFINITY;
    if (balanceLookup.get(row.account_id) !== 0 && age > 30) {
      alerts.push({
        id: `reconciliation-stale:${row.account_id}`,
        type: "reconciliation_stale",
        severity: "info",
        title: row.reconciled_at ? `Saatnya cek saldo ${accountLabel}` : `Saldo ${accountLabel} belum pernah dicek`,
        message: row.reconciled_at ? "Sudah lebih dari 30 hari sejak saldo terakhir dicocokkan." : "Cocokkan saldo aplikasi dengan saldo sebenarnya agar catatan tetap akurat.",
        targetPath: "/rekonsiliasi",
      });
    }
  }
  return alerts;
};

const unallocatedAlerts = (period, count) => count > 0 ? [{
  id: `unallocated:${period}`,
  type: "unallocated_expense",
  severity: "warning",
  title: `${count} pengeluaran belum masuk alokasi`,
  message: "Pilih kantong agar sisa jatah dan laporan alokasi tetap akurat.",
  targetPath: "/transaksi",
}] : [];

const budgetAlerts = (budgets) => {
  const alerts = [];
  for (const item of budgets) {
    const amount = Number(item.amount || 0);
    if (!amount) continue;
    const percentage = Math.round((Number(item.used_amount || 0) / amount) * 100);
    const crossed = usageThreshold(percentage, Number(item.warning_threshold || 80));
    if (!crossed) continue;
    alerts.push({
      id: `budget:${item.budget_id}:${crossed.threshold}`,
      type: "budget_threshold",
      severity: crossed.severity,
      title: `${item.name} ${percentage}% terpakai`,
      message: percentage >= 100 ? "Anggaran telah terlampaui." : `Pemakaian melewati ambang ${crossed.threshold}%.`,
      targetPath: "/anggaran",
    });
  }
  return alerts;
};

const envelopeAlerts = (envelopes) => {
  const alerts = [];
  for (const item of envelopes) {
    const allocated = Number(item.allocated_amount || 0);
    if (!allocated) continue;
    const used = Number(item.used_amount || 0) + Number(item.reserved_amount || 0);
    const percentage = Math.round((used / allocated) * 100);
    const crossed = usageThreshold(percentage, 75);
    if (!crossed) continue;
    alerts.push({
      id: `envelope:${item.envelope_period_id}:${crossed.threshold}`,
      type: "envelope_threshold",
      severity: crossed.severity,
      title: `${item.name} ${percentage}% terpakai`,
      message: percentage >= 100 ? "Kantong sudah habis atau terlampaui." : `Sisa kantong mendekati batas ${crossed.threshold}%.`,
      targetPath: "/alokasi",
    });
  }
  return alerts;
};

const recurringAlerts = (recurring) => {
  const alerts = [];
  const today = todayJakarta();
  for (const item of recurring) {
    if (["paid", "received", "cancelled"].includes(item.status)) continue;
    const dueInDays = dayDifference(today, item.due_date);
    if (item.status === "overdue" || dueInDays < 0) {
      alerts.push({ id: `recurring-overdue:${item.occurrence_id}`, type: "recurring_overdue", severity: "danger", title: `${item.name} terlambat`, message: `Jatuh tempo ${item.due_date} dan belum diselesaikan.`, targetPath: "/tagihan" });
      continue;
    }
    if (dueInDays <= 7) {
      alerts.push({ id: `recurring-due:${item.occurrence_id}`, type: "recurring_due", severity: "warning", title: `${item.name} segera jatuh tempo`, message: `Jatuh tempo ${item.due_date}.`, targetPath: "/tagihan" });
    }
  }
  return alerts;
};

const goalAlerts = (goals) => goals
  .filter((item) => item.pace_status === "behind")
  .map((item) => ({
    id: `goal-behind:${item.goal_id}`,
    type: "goal_behind",
    severity: "warning",
    title: `${item.name} tertinggal dari rencana`,
    message: `Perkiraan kebutuhan setoran bulanan Rp ${Number(item.required_monthly_amount || 0).toLocaleString("id-ID")}.`,
    targetPath: "/target",
  }));

const sortFinancialAlerts = (alerts) => alerts.sort((left, right) => (
  (ALERT_PRIORITY[right.severity] || 0) - (ALERT_PRIORITY[left.severity] || 0)
  || left.title.localeCompare(right.title, "id")
));

const buildFinancialAlerts = ({
  period,
  historical,
  accounts,
  envelopes,
  recurring,
  goals,
  budgets,
  unallocatedCount,
  reconciliationRows = [],
}) => {
  if (historical) return [];
  return sortFinancialAlerts([
    ...unallocatedAlerts(period, unallocatedCount),
    ...budgetAlerts(budgets),
    ...envelopeAlerts(envelopes),
    ...recurringAlerts(recurring),
    ...goalAlerts(goals),
    ...reconciliationAlertsFromRows(reconciliationRows, accounts),
  ]);
};

const dashboardCashFlowStatement = (actor, startDate, endDate) => {
  const readable = readableLedgerSql(actor, "t");
  const operable = operableScopeSql(actor, "t");
  return {
    sql: `SELECT
      COALESCE(SUM(CASE WHEN t.transaction_type='income' THEN t.amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN t.transaction_type='expense' THEN t.amount ELSE 0 END),0) AS expense,
      COALESCE(SUM(CASE WHEN t.transaction_type='refund' THEN t.amount ELSE 0 END),0) AS refund,
      COALESCE(SUM(CASE WHEN t.transaction_type='expense' AND t.envelope_period_id IS NULL AND ${operable.sql} THEN 1 ELSE 0 END),0) AS unallocated_count
      FROM transactions t
      WHERE t.status='active' AND t.transaction_date BETWEEN ? AND ? AND ${readable.sql}`,
    args: [...operable.args, startDate, endDate, ...readable.args],
  };
};

const dashboardRecentTransactionsStatement = (actor, startDate, endDate) => {
  const access = readableLedgerSql(actor, "t");
  return {
    sql: `SELECT t.* FROM transactions t
      WHERE t.status='active' AND t.transaction_date BETWEEN ? AND ? AND ${access.sql}
      ORDER BY t.transaction_date DESC,t.created_at DESC LIMIT 12`,
    args: [startDate, endDate, ...access.args],
  };
};

const dashboardEnvelopeCapabilities = (items, actor) => items.map((item) => ({
  ...item,
  can_close: actor.role === "owner" && item.status === "active",
  can_archive_rule: actor.role === "owner" && item.status === "active",
}));

const dashboardPeriodContext = (context, preloadedAccounts) => {
  const period = periodKey(context.payload?.period);
  const bounds = monthBounds(period);
  const today = todayJakarta();
  const currentPeriod = today.slice(0, 7);
  const historical = period < currentPeriod;
  const cutoffDate = historical ? bounds.end : today;
  return {
    period,
    bounds,
    today,
    currentPeriod,
    historical,
    cutoffDate,
    openingDate: dateBefore(bounds.start),
    scopedContext: { ...context, payload: { period } },
    canReuseCurrentAccounts: Array.isArray(preloadedAccounts) && !historical && cutoffDate === today,
  };
};

const dashboardReadPlan = (context, periodContext) => {
  const { period, bounds, cutoffDate, openingDate, historical, scopedContext, canReuseCurrentAccounts } = periodContext;
  const statements = [];
  const indexes = {};
  const add = (key, statement) => {
    indexes[key] = statements.length;
    statements.push(statement);
  };
  if (!canReuseCurrentAccounts) add("accounts", visibleAccountsStatement(context.actor, { includeArchived: historical, cutoffDate }));
  add("openingAccounts", visibleAccountsStatement(context.actor, { includeArchived: historical, cutoffDate: openingDate }));
  add("cashFlow", dashboardCashFlowStatement(context.actor, bounds.start, cutoffDate));
  add("recentTransactions", dashboardRecentTransactionsStatement(context.actor, bounds.start, cutoffDate));
  add("categoryExpenses", categoryExpenseTotalsStatement(context.actor, bounds.start, cutoffDate));
  add("recurring", recurringListStatement(scopedContext));
  const goalIndexes = goalListStatements(context).map((statement) => {
    const index = statements.length;
    statements.push(statement);
    return index;
  });
  add("budgets", budgetListStatement(scopedContext));
  add("envelopes", envelopeItemsStatement(context.actor, { period, includeClosed: false }));
  if (!historical) add("reconciliation", reconciliationAlertStatement(context.actor));
  return { statements, indexes, goalIndexes };
};

const mapDashboardReadRows = (rows, plan, context, periodContext, preloadedAccounts) => {
  const { indexes, goalIndexes } = plan;
  const { historical, scopedContext, canReuseCurrentAccounts } = periodContext;
  const accounts = canReuseCurrentAccounts
    ? preloadedAccounts
    : mapVisibleAccountRows(rows[indexes.accounts] || [], context.actor);
  return {
    accounts,
    openingAccounts: mapVisibleAccountRows(rows[indexes.openingAccounts] || [], context.actor),
    cashFlowRow: (rows[indexes.cashFlow] || [])[0] || {},
    recentTransactionRows: (rows[indexes.recentTransactions] || []).map((row) => publicRow(row)),
    categoryExpenses: mapCategoryExpenseRows(rows[indexes.categoryExpenses] || []),
    recurring: mapRecurringRows(rows[indexes.recurring] || [], scopedContext).items,
    goals: mapGoalListRows(goalIndexes.map((index) => rows[index] || []), context).items,
    budgets: mapBudgetListRows(rows[indexes.budgets] || []).items,
    dashboardEnvelopes: dashboardEnvelopeCapabilities(mapEnvelopeItemRows(rows[indexes.envelopes] || []), context.actor),
    reconciliationRows: historical ? [] : rows[indexes.reconciliation] || [],
  };
};

const dashboardBalanceMetrics = (accounts, openingAccounts, recurring) => {
  const protectedTypes = new Set(["emergency_fund", "savings", "sinking_fund"]);
  const operableAccounts = accounts.filter((account) => account.can_transact !== false);
  const openingBalance = openingAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const totalBalance = accounts.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const emergencyBalance = accounts.filter((row) => row.account_type === "emergency_fund").reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const protectedBalance = accounts.filter((row) => protectedTypes.has(row.account_type)).reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const liquidBalance = accounts.filter((row) => !protectedTypes.has(row.account_type)).reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const operableLiquidBalance = operableAccounts.filter((row) => !protectedTypes.has(row.account_type)).reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const reservedBills = recurring.filter((row) => row.kind === "expense" && !["paid", "cancelled"].includes(row.status)).reduce((sum, row) => sum + Math.max(0, Number(row.expected_amount) - Number(row.actual_amount)), 0);
  return {
    operableAccounts,
    openingBalance,
    totalBalance,
    emergencyBalance,
    protectedBalance,
    liquidBalance,
    reservedBills,
    safeToSpend: Math.max(0, operableLiquidBalance - reservedBills),
  };
};

const dashboardRecentTransactions = (rows, actor) => rows.map((row) => {
  const actorCanOperate = actor.role === "owner" || row.scope === "shared" || (row.scope === "personal" && row.owner_user_id === actor.user_id);
  const actorCanModify = row.status === "active" && (actor.role === "owner" || (actorCanOperate && row.created_by === actor.user_id));
  return { ...row, can_update: actorCanModify, can_cancel: actorCanModify };
});

const dashboardDaysRemaining = ({ historical, period, currentPeriod, today, bounds }) => {
  if (historical) return 0;
  const lastDay = Number(bounds.end.slice(-2));
  const currentDay = period === currentPeriod ? Number(today.slice(-2)) : 1;
  return Math.max(1, lastDay - currentDay + 1);
};

const dashboardResult = (context, periodContext, readState) => {
  const { period, bounds, today, currentPeriod, historical, cutoffDate } = periodContext;
  const { accounts, openingAccounts, cashFlowRow, recentTransactionRows, categoryExpenses, recurring, goals, budgets, dashboardEnvelopes, reconciliationRows } = readState;
  const balance = dashboardBalanceMetrics(accounts, openingAccounts, recurring);
  const allocation = allocationSummary(balance.operableAccounts, dashboardEnvelopes);
  const income = Number(cashFlowRow.income || 0);
  const expense = Number(cashFlowRow.expense || 0);
  const refund = Number(cashFlowRow.refund || 0);
  const unallocatedCount = Number(cashFlowRow.unallocated_count || 0);
  const daysRemaining = dashboardDaysRemaining({ historical, period, currentPeriod, today, bounds });
  const recentTransactions = dashboardRecentTransactions(recentTransactionRows, context.actor);
  const alerts = buildFinancialAlerts({
    period,
    historical,
    accounts,
    envelopes: allocation.items,
    recurring,
    goals,
    budgets,
    unallocatedCount,
    reconciliationRows,
  });
  return {
    periodKey: period,
    cutoffDate,
    isHistoricalPeriod: historical,
    accountBalances: accounts,
    totalBalance: balance.totalBalance,
    openingBalance: balance.openingBalance,
    balanceChange: balance.totalBalance - balance.openingBalance,
    liquidBalance: balance.liquidBalance,
    safeToSpend: balance.safeToSpend,
    dailySafeToSpend: daysRemaining ? Math.floor(balance.safeToSpend / daysRemaining) : 0,
    daysRemaining,
    emergencyBalance: balance.emergencyBalance,
    protectedBalance: balance.protectedBalance,
    cashFlow: { income, expense, refund, net: income + refund - expense },
    envelopes: allocation.items,
    recurring,
    goals,
    budgets,
    recentTransactions,
    categoryExpenses,
    alerts,
    unallocatedCount,
    unallocatedFunds: allocation.unallocatedAmount,
    allocatedRemaining: allocation.allocatedRemaining,
    reservedBills: balance.reservedBills,
    lastSyncedAt: nowIso(),
  };
};

export const dashboardOverview = async (db, context, { preloadedAccounts = null } = {}) => {
  const periodContext = dashboardPeriodContext(context, preloadedAccounts);
  const plan = dashboardReadPlan(context, periodContext);
  const rows = await readBatchRows(db, plan.statements);
  const readState = mapDashboardReadRows(rows, plan, context, periodContext, preloadedAccounts);
  return dashboardResult(context, periodContext, readState);
};

export const appInitialState = async (db, context) => {
  const bootstrapStatements = bootstrapReadStatements(context);
  // Empty-array hint only tells the dashboard planner that current account rows will
  // come from the bootstrap slice of the same batch. Historical periods still read
  // their own cutoff account rows because they cannot reuse today's balances.
  const periodContext = dashboardPeriodContext(context, []);
  const dashboardPlan = dashboardReadPlan(context, periodContext);
  const combinedRows = await readBatchRows(db, [...bootstrapStatements, ...dashboardPlan.statements]);
  const bootstrap = mapBootstrapRows(combinedRows.slice(0, bootstrapStatements.length), context);
  const dashboardRows = combinedRows.slice(bootstrapStatements.length);
  const readState = mapDashboardReadRows(dashboardRows, dashboardPlan, context, periodContext, bootstrap.accounts);
  const overview = dashboardResult(context, periodContext, readState);
  return { bootstrap, overview };
};

export const monthlyReport = async (db, context) => {
  const period = periodKey(context.payload?.period);
  const trendMonths = boundedInteger(context.payload?.trend_months, 6, 3, 12, "Rentang tren");
  const accountId = sanitizeText(context.payload?.account_id, 100);
  if (![3, 6, 12].includes(trendMonths)) throw appError("INVALID_TREND_RANGE", "Rentang tren harus 3, 6, atau 12 bulan.", 400);
  const scoped = { ...context, payload: { period } };
  const periodContext = dashboardPeriodContext(scoped, null);
  const dashboardPlan = dashboardReadPlan(scoped, periodContext);
  const bounds = monthBounds(period);
  const currentPeriod = todayJakarta().slice(0, 7);
  const cutoffDate = period === currentPeriod ? todayJakarta() : bounds.end;
  const breakdownStatements = reportBreakdownStatements(context.actor, bounds.start, cutoffDate);
  const trendPlan = monthlyTrendPlan(context.actor, period, trendMonths, { accountId });
  const combinedRows = await readBatchRows(db, [
    ...dashboardPlan.statements,
    ...breakdownStatements,
    ...trendPlan.statements,
  ]);
  const dashboardEnd = dashboardPlan.statements.length;
  const breakdownEnd = dashboardEnd + breakdownStatements.length;
  const dashboardRows = combinedRows.slice(0, dashboardEnd);
  const readState = mapDashboardReadRows(dashboardRows, dashboardPlan, scoped, periodContext, null);
  const overview = dashboardResult(scoped, periodContext, readState);
  const breakdowns = mapReportBreakdowns(combinedRows.slice(dashboardEnd, breakdownEnd));
  const trend = mapMonthlyTrendRows(trendPlan, combinedRows.slice(breakdownEnd));
  return {
    overview,
    budgets: overview.budgets,
    categoryExpenses: overview.categoryExpenses,
    ...breakdowns,
    trend: { months: trendMonths, items: trend.items },
    ...(accountId ? { accountExpenseTrend: { months: trendMonths, items: trend.accountExpenseItems } } : {}),
  };
};
