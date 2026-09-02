import { aggregateCostShareRows } from "../../costSharing.js";
import {
  budgetListStatement,
  goalListStatements,
  mapBudgetListRows,
  mapGoalListRows,
  mapRecurringRows,
  recurringListStatement,
} from "../../planning/index.js";
import { envelopeCapabilities } from "../../planning/shared.js";
import { transferRoutesForAccounts } from "../../transactionPolicy.js";
import {
  categoryExpenseTotalsStatement,
  envelopeItemsStatement,
  mapCategoryExpenseRows,
  mapEnvelopeItemRows,
  mapVisibleAccountRows,
  visibleAccountsStatement,
} from "../../readModels.js";
import {
  monthBounds,
  periodKey,
  publicRow,
  readableAccountSql,
  readableLedgerSql,
  operableScopeSql,
  todayJakarta,
} from "../../core.js";
import { dateBefore } from "../shared.js";
import { reconciliationAlertStatement } from "./alerts.js";

// Read plans deliberately batch related queries. Keep mapping pure so moving these
// helpers cannot create a second source of financial business rules.
const NATURE_LABELS = Object.freeze({
  fixed: "Kebutuhan tetap",
  variable: "Kebutuhan variabel",
  unexpected: "Tidak terduga",
  discretionary: "Hiburan/pribadi",
  emergency: "Darurat",
  savings: "Tabungan/masa depan",
  other: "Lainnya",
});

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

const dailyDatesForPeriod = (period, endDate) => {
  const bounds = monthBounds(period);
  const [startYear, startMonth, startDay] = bounds.start.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const current = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  const dates = [];
  while (current <= end) {
    dates.push(`${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-${String(current.getUTCDate()).padStart(2, "0")}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};

const dayLabel = (date) => {
  const [year, month, day] = String(date).split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

export const bootstrapReadStatements = (context) => [
  visibleAccountsStatement(context.actor),
  { sql: "SELECT * FROM categories WHERE status='active' ORDER BY transaction_type,name COLLATE NOCASE", args: [] },
  { sql: "SELECT key,value FROM system_config WHERE key IN ('schema_version','timezone','currency','maintenance_mode')", args: [] },
  { sql: "SELECT user_id,name,role,status FROM users WHERE status='active' ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END,name COLLATE NOCASE", args: [] },
];

export const mapBootstrapRows = ([accountRows = [], categories = [], configRows = [], memberRows = []], context) => {
  const accounts = mapVisibleAccountRows(accountRows, context.actor);
  const config = Object.fromEntries(configRows.map((row) => [row.key, row.value]));
  return {
    user: publicRow(context.actor),
    accounts,
    transferRoutes: transferRoutesForAccounts(context.actor, accounts),
    categories: categories.map((row) => publicRow(row)),
    members: memberRows.map((row) => ({ ...publicRow(row), is_current: row.user_id === context.actor.user_id })),
    config: {
      schemaVersion: Number(config.schema_version || 0),
      timezone: config.timezone || "Asia/Jakarta",
      currency: config.currency || "IDR",
      maintenanceMode: config.maintenance_mode === "true",
    },
  };
};

export const reportBreakdownStatements = (actor, startDate, endDate) => {
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
    { sql: `SELECT t.cost_share_json
      FROM transactions t
      WHERE ${commonWhere} AND t.scope='shared' AND t.cost_share_mode<>'unspecified'`, args },
    { sql: "SELECT user_id,name,role FROM users ORDER BY name COLLATE NOCASE,user_id", args: [] },
  ];
};

export const mapReportBreakdowns = ([accounts = [], creators = [], natures = [], costShareRows = [], users = []]) => ({
  accountExpenses: accounts.map((row) => ({
    ...publicRow(row),
    label: row.owner_scope === "personal" ? `${row.name} · Pribadi · ${row.owner_name}` : `${row.name} · Bersama`,
  })),
  creatorExpenses: creators.map((row) => ({ ...publicRow(row), label: row.name })),
  natureExpenses: natures.map((row) => ({ ...publicRow(row), label: NATURE_LABELS[row.nature] || NATURE_LABELS.other })),
  costShareExpenses: aggregateCostShareRows(costShareRows, users),
});

export const monthlyTrendPlan = (actor, endPeriod, count, { accountId = "" } = {}) => {
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

export const dailyTrendPlan = (actor, period, { accountId = "" } = {}) => {
  const bounds = monthBounds(period);
  const currentPeriod = todayJakarta().slice(0, 7);
  const trendEnd = period === currentPeriod ? todayJakarta() : bounds.end;
  const dates = dailyDatesForPeriod(period, trendEnd);
  const ledgerAccess = readableLedgerSql(actor, "t");
  const accountAccess = readableAccountSql(actor, "a");
  const cutoffValues = dates.map(() => "(?,?)").join(",");
  const cutoffArgs = dates.flatMap((date) => [date, date]);
  const statements = [
    {
      sql: `SELECT t.transaction_date AS date_key,
        COALESCE(SUM(CASE WHEN t.transaction_type='income' THEN t.amount ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN t.transaction_type='expense' THEN t.amount ELSE 0 END),0) AS expense,
        COALESCE(SUM(CASE WHEN t.transaction_type='refund' THEN t.amount ELSE 0 END),0) AS refund
      FROM transactions t
      WHERE t.status='active' AND t.transaction_date BETWEEN ? AND ? AND ${ledgerAccess.sql}
      GROUP BY t.transaction_date`,
      args: [bounds.start, trendEnd, ...ledgerAccess.args],
    },
    {
      sql: `WITH cutoffs(date_key,cutoff_date) AS (VALUES ${cutoffValues}),
        account_balances AS (
          SELECT c.date_key,a.account_id,
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
          GROUP BY c.date_key,a.account_id,a.initial_balance,a.initial_balance_date
        )
        SELECT date_key,COALESCE(SUM(balance),0) AS total_balance FROM account_balances GROUP BY date_key`,
      args: [...cutoffArgs, ...accountAccess.args],
    },
  ];
  if (accountId) {
    statements.push({
      sql: `SELECT t.transaction_date AS date_key,COALESCE(SUM(t.amount),0) AS amount
        FROM transactions t
        WHERE t.status='active' AND t.transaction_type='expense' AND t.source_account_id=?
          AND t.transaction_date BETWEEN ? AND ? AND ${ledgerAccess.sql}
        GROUP BY t.transaction_date`,
      args: [accountId, bounds.start, trendEnd, ...ledgerAccess.args],
    });
  }
  return { dates, statements, accountId };
};

export const mapDailyTrendRows = (plan, [cashRows = [], balanceRows = [], accountExpenseRows = []]) => {
  const cashLookup = new Map(cashRows.map((row) => [row.date_key, row]));
  const balanceLookup = new Map(balanceRows.map((row) => [row.date_key, Number(row.total_balance || 0)]));
  const accountExpenseLookup = new Map(accountExpenseRows.map((row) => [row.date_key, Number(row.amount || 0)]));
  return {
    items: plan.dates.map((date) => {
      const row = cashLookup.get(date) || {};
      const income = Number(row.income || 0);
      const expense = Number(row.expense || 0);
      const refund = Number(row.refund || 0);
      return {
        periodKey: date,
        label: dayLabel(date),
        income,
        expense,
        refund,
        net: income + refund - expense,
        totalBalance: balanceLookup.get(date) || 0,
      };
    }),
    accountExpenseItems: plan.accountId
      ? plan.dates.map((date) => ({ period: date, value: accountExpenseLookup.get(date) || 0 }))
      : [],
  };
};

export const mapMonthlyTrendRows = (plan, [cashRows = [], balanceRows = [], accountExpenseRows = []]) => {
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

const dashboardCashFlowStatement = (actor, startDate, endDate) => {
  const readable = readableLedgerSql(actor, "t");
  const operable = operableScopeSql(actor, "t");
  return {
    sql: `WITH scoped AS (
      SELECT t.*,CASE WHEN ${operable.sql} THEN 1 ELSE 0 END AS can_operate
      FROM transactions t
      WHERE t.status='active' AND t.transaction_date BETWEEN ? AND ? AND ${readable.sql}
    )
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type='income' THEN amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN transaction_type='expense' THEN amount ELSE 0 END),0) AS expense,
      COALESCE(SUM(CASE WHEN transaction_type='refund' THEN amount ELSE 0 END),0) AS refund,
      COALESCE(SUM(CASE WHEN transaction_type='expense' AND envelope_period_id IS NULL AND can_operate=1 THEN 1 ELSE 0 END),0) AS unallocated_count,
      COALESCE(SUM(CASE WHEN transaction_type='expense' AND envelope_period_id IS NULL AND can_operate=1 THEN amount ELSE 0 END),0) AS unallocated_amount
    FROM scoped`,
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
  ...envelopeCapabilities(actor, item),
}));

export const dashboardPeriodContext = (context, preloadedAccounts) => {
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

export const dashboardReadPlan = (context, periodContext) => {
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
  add("transactionPeriodClosure", { sql: "SELECT closure_id,period_key FROM period_closures WHERE status='closed' AND period_key>=? ORDER BY period_key LIMIT 1", args: [period] });
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

export const mapDashboardReadRows = (rows, plan, context, periodContext, preloadedAccounts) => {
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
    transactionPeriodLocked: Boolean((rows[indexes.transactionPeriodClosure] || [])[0]),
    categoryExpenses: mapCategoryExpenseRows(rows[indexes.categoryExpenses] || []),
    recurring: mapRecurringRows(rows[indexes.recurring] || [], scopedContext).items,
    goals: mapGoalListRows(goalIndexes.map((index) => rows[index] || []), context).items,
    budgets: mapBudgetListRows(rows[indexes.budgets] || [], scopedContext).items,
    dashboardEnvelopes: dashboardEnvelopeCapabilities(mapEnvelopeItemRows(rows[indexes.envelopes] || []), context.actor),
    reconciliationRows: historical ? [] : rows[indexes.reconciliation] || [],
  };
};
