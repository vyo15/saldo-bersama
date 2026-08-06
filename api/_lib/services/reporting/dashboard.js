import { listBudgets, listEnvelopes, listGoals, listRecurring } from "../planning/index.js";
import { accountBalanceAsOf, categoryExpenseTotals, visibleAccounts, visibleTransactions } from "../readModels.js";
import {
  appError,
  boundedInteger,
  monthBounds,
  nowIso,
  periodKey,
  publicRow,
  readableAccountSql,
  readableLedgerSql,
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
    categories: categories.map((row) => publicRow(row)),
    config: {
      schemaVersion: Number(config.schema_version || 0),
      timezone: config.timezone || "Asia/Jakarta",
      currency: config.currency || "IDR",
      maintenanceMode: config.maintenance_mode === "true",
    },
  };
};

const allocationSummary = async (db, actor, accounts, period) => {
  const items = (await listEnvelopes(db, {
    actor,
    payload: { period },
  })).items.filter((item) => item.status === "active");
  const allocatedRemaining = items.reduce((sum, item) => sum + Math.max(0, Number(item.remaining_amount || 0)), 0);
  const totalAvailable = accounts.reduce((sum, item) => sum + Math.max(0, Number(item.balance || 0)), 0);
  return {
    items,
    allocatedRemaining,
    unallocatedAmount: Math.max(0, totalAvailable - allocatedRemaining),
  };
};

const reportBreakdowns = async (db, actor, startDate, endDate) => {
  const access = readableLedgerSql(actor, "t");
  const commonWhere = `t.status='active' AND t.transaction_type='expense' AND t.transaction_date BETWEEN ? AND ? AND ${access.sql}`;
  const args = [startDate, endDate, ...access.args];
  const [accounts, creators, natures] = await Promise.all([
    db.all(`SELECT a.account_id,a.name,a.owner_scope,a.owner_user_id,COALESCE(NULLIF(TRIM(u.name),''),'Pengguna') AS owner_name,SUM(t.amount) AS amount,COUNT(*) AS transaction_count
      FROM transactions t JOIN accounts a ON a.account_id=t.source_account_id
      LEFT JOIN users u ON u.user_id=a.owner_user_id
      WHERE ${commonWhere}
      GROUP BY a.account_id,a.name,a.owner_scope,a.owner_user_id,u.name ORDER BY amount DESC`, args),
    db.all(`SELECT u.user_id,u.name,SUM(t.amount) AS amount,COUNT(*) AS transaction_count
      FROM transactions t JOIN users u ON u.user_id=t.created_by
      WHERE ${commonWhere}
      GROUP BY u.user_id,u.name ORDER BY amount DESC`, args),
    db.all(`SELECT COALESCE(c.nature,'other') AS nature,SUM(t.amount) AS amount,COUNT(*) AS transaction_count
      FROM transactions t LEFT JOIN categories c ON c.category_id=t.category_id
      WHERE ${commonWhere}
      GROUP BY COALESCE(c.nature,'other') ORDER BY amount DESC`, args),
  ]);
  return {
    accountExpenses: accounts.map((row) => ({
      ...publicRow(row),
      label: row.owner_scope === "personal" ? `${row.name} · Pribadi · ${row.owner_name}` : `${row.name} · Bersama`,
    })),
    creatorExpenses: creators.map((row) => ({ ...publicRow(row), label: row.name })),
    natureExpenses: natures.map((row) => ({ ...publicRow(row), label: NATURE_LABELS[row.nature] || NATURE_LABELS.other })),
  };
};

const monthlyTrend = async (db, actor, endPeriod, count) => {
  const periods = Array.from({ length: count }, (_, index) => addPeriodMonths(endPeriod, index - count + 1));
  const firstBounds = monthBounds(periods[0]);
  const lastBounds = monthBounds(periods.at(-1));
  const currentPeriod = todayJakarta().slice(0, 7);
  const trendEnd = periods.at(-1) === currentPeriod ? todayJakarta() : lastBounds.end;
  const access = readableLedgerSql(actor, "t");
  const rows = await db.all(`SELECT substr(t.transaction_date,1,7) AS period_key,
      COALESCE(SUM(CASE WHEN t.transaction_type='income' THEN t.amount ELSE 0 END),0) AS income,
      COALESCE(SUM(CASE WHEN t.transaction_type='expense' THEN t.amount ELSE 0 END),0) AS expense,
      COALESCE(SUM(CASE WHEN t.transaction_type='refund' THEN t.amount ELSE 0 END),0) AS refund
    FROM transactions t
    WHERE t.status='active' AND t.transaction_date BETWEEN ? AND ? AND ${access.sql}
    GROUP BY substr(t.transaction_date,1,7)`, [firstBounds.start, trendEnd, ...access.args]);
  const lookup = new Map(rows.map((row) => [row.period_key, row]));
  const items = [];
  for (const period of periods) {
    const bounds = monthBounds(period);
    const cutoffDate = period === currentPeriod ? todayJakarta() : bounds.end;
    const accounts = await visibleAccounts(db, actor, { includeArchived: true, cutoffDate });
    const row = lookup.get(period) || {};
    const income = Number(row.income || 0);
    const expense = Number(row.expense || 0);
    const refund = Number(row.refund || 0);
    items.push({
      periodKey: period,
      label: periodLabel(period),
      income,
      expense,
      refund,
      net: income + refund - expense,
      totalBalance: accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0),
    });
  }
  return items;
};

const reconciliationAlerts = async (db, actor, accounts) => {
  const access = readableAccountSql(actor, "a");
  const rows = await db.all(`SELECT a.account_id,a.name,r.reconciled_at,r.difference
    FROM accounts a
    LEFT JOIN reconciliations r ON r.reconciliation_id=(
      SELECT rr.reconciliation_id FROM reconciliations rr
      WHERE rr.account_id=a.account_id ORDER BY rr.reconciled_at DESC,rr.created_at DESC LIMIT 1
    )
    WHERE a.status='active' AND ${access.sql}
    ORDER BY a.name COLLATE NOCASE`, access.args);
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
        title: `Selisih saldo ${accountLabel}`,
        message: "Saldo aktual terakhir masih berbeda dari saldo aplikasi.",
        targetPath: "/rekening",
      });
      continue;
    }
    const age = row.reconciled_at ? dayDifference(String(row.reconciled_at).slice(0, 10), today) : Number.POSITIVE_INFINITY;
    if (balanceLookup.get(row.account_id) !== 0 && age > 30) {
      alerts.push({
        id: `reconciliation-stale:${row.account_id}`,
        type: "reconciliation_stale",
        severity: "info",
        title: `Rekonsiliasi ${accountLabel}`,
        message: row.reconciled_at ? "Sudah lebih dari 30 hari sejak rekonsiliasi terakhir." : "Rekening belum pernah direkonsiliasi.",
        targetPath: "/rekening",
      });
    }
  }
  return alerts;
};

const buildFinancialAlerts = async (db, context, {
  period,
  historical,
  accounts,
  envelopes,
  recurring,
  goals,
  budgets,
  unallocatedCount,
}) => {
  if (historical) return [];
  const alerts = [];
  if (unallocatedCount > 0) {
    alerts.push({
      id: `unallocated:${period}`,
      type: "unallocated_expense",
      severity: "warning",
      title: `${unallocatedCount} transaksi belum dialokasikan`,
      message: "Lengkapi kantong sebelum menutup periode agar sisa dana dapat dipercaya.",
      targetPath: "/transaksi",
    });
  }

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

  const today = todayJakarta();
  for (const item of recurring) {
    if (["paid", "received", "cancelled"].includes(item.status)) continue;
    const dueInDays = dayDifference(today, item.due_date);
    if (item.status === "overdue" || dueInDays < 0) {
      alerts.push({
        id: `recurring-overdue:${item.occurrence_id}`,
        type: "recurring_overdue",
        severity: "danger",
        title: `${item.name} terlambat`,
        message: `Jatuh tempo ${item.due_date} dan belum diselesaikan.`,
        targetPath: "/tagihan",
      });
    } else if (dueInDays <= 7) {
      alerts.push({
        id: `recurring-due:${item.occurrence_id}`,
        type: "recurring_due",
        severity: "warning",
        title: `${item.name} segera jatuh tempo`,
        message: `Jatuh tempo ${item.due_date}.`,
        targetPath: "/tagihan",
      });
    }
  }

  for (const item of goals) {
    if (item.pace_status !== "behind") continue;
    alerts.push({
      id: `goal-behind:${item.goal_id}`,
      type: "goal_behind",
      severity: "warning",
      title: `${item.name} tertinggal dari rencana`,
      message: `Perkiraan kebutuhan setoran bulanan ${Number(item.required_monthly_amount || 0)} Rupiah.`,
      targetPath: "/target",
    });
  }

  alerts.push(...await reconciliationAlerts(db, context.actor, accounts));
  return alerts.sort((left, right) => (ALERT_PRIORITY[right.severity] || 0) - (ALERT_PRIORITY[left.severity] || 0) || left.title.localeCompare(right.title, "id"));
};

export const dashboardOverview = async (db, context) => {
  const period = periodKey(context.payload?.period);
  const bounds = monthBounds(period);
  const currentPeriod = todayJakarta().slice(0, 7);
  const historical = period < currentPeriod;
  const cutoffDate = historical ? bounds.end : todayJakarta();
  const [accounts, transactions, categoryExpenses, recurringResult, goalsResult, budgetResult] = await Promise.all([
    visibleAccounts(db, context.actor, { includeArchived: historical, cutoffDate }),
    visibleTransactions(db, context.actor, { startDate: bounds.start, endDate: cutoffDate, includeCancelled: false }),
    categoryExpenseTotals(db, context.actor, bounds.start, cutoffDate),
    listRecurring(db, { ...context, payload: { period } }),
    listGoals(db, context),
    listBudgets(db, { ...context, payload: { period } }),
  ]);
  const operableAccounts = accounts.filter((account) => account.can_transact !== false);
  const allocation = await allocationSummary(db, context.actor, operableAccounts, period);
  let income = 0;
  let expense = 0;
  let refund = 0;
  let unallocatedCount = 0;
  for (const row of transactions) {
    const actorCanOperate = context.actor.role === "owner" || row.scope === "shared" || (row.scope === "personal" && row.owner_user_id === context.actor.user_id);
    if (row.transaction_type === "income") income += Number(row.amount);
    else if (row.transaction_type === "expense") {
      expense += Number(row.amount);
      if (!row.envelope_period_id && actorCanOperate) unallocatedCount += 1;
    } else if (row.transaction_type === "refund") refund += Number(row.amount);
  }
  const openingDate = dateBefore(bounds.start);
  let openingBalance = 0;
  for (const account of accounts) openingBalance += await accountBalanceAsOf(db, account, openingDate);
  const totalBalance = accounts.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const protectedTypes = new Set(["emergency_fund", "savings", "sinking_fund"]);
  const emergencyBalance = accounts.filter((row) => row.account_type === "emergency_fund").reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const protectedBalance = accounts.filter((row) => protectedTypes.has(row.account_type)).reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const liquidBalance = accounts.filter((row) => !protectedTypes.has(row.account_type)).reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const operableLiquidBalance = operableAccounts.filter((row) => !protectedTypes.has(row.account_type)).reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const recurring = recurringResult.items;
  const goals = goalsResult.items;
  const budgets = budgetResult.items;
  const reservedBills = recurring.filter((row) => row.kind === "expense" && !["paid", "cancelled"].includes(row.status)).reduce((sum, row) => sum + Math.max(0, Number(row.expected_amount) - Number(row.actual_amount)), 0);
  const safeToSpend = Math.max(0, operableLiquidBalance - reservedBills);
  const lastDay = Number(bounds.end.slice(-2));
  const currentDay = period === currentPeriod ? Number(todayJakarta().slice(-2)) : 1;
  const daysRemaining = historical ? 0 : Math.max(1, lastDay - currentDay + 1);
  const recentTransactions = transactions.slice(0, 12).map((row) => {
    const actorCanOperate = context.actor.role === "owner" || row.scope === "shared" || (row.scope === "personal" && row.owner_user_id === context.actor.user_id);
    const actorCanModify = row.status === "active" && (context.actor.role === "owner" || (actorCanOperate && row.created_by === context.actor.user_id));
    return { ...row, can_update: actorCanModify, can_cancel: actorCanModify };
  });
  const alerts = await buildFinancialAlerts(db, context, {
    period,
    historical,
    accounts,
    envelopes: allocation.items,
    recurring,
    goals,
    budgets,
    unallocatedCount,
  });
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
    goals,
    budgets,
    recentTransactions,
    categoryExpenses,
    alerts,
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
  const trendMonths = boundedInteger(context.payload?.trend_months, 6, 3, 12, "Rentang tren");
  if (![3, 6, 12].includes(trendMonths)) throw appError("INVALID_TREND_RANGE", "Rentang tren harus 3, 6, atau 12 bulan.", 400);
  const scoped = { ...context, payload: { period } };
  const overview = await dashboardOverview(db, scoped);
  const bounds = monthBounds(period);
  const currentPeriod = todayJakarta().slice(0, 7);
  const cutoffDate = period === currentPeriod ? todayJakarta() : bounds.end;
  const [breakdowns, trend] = await Promise.all([
    reportBreakdowns(db, context.actor, bounds.start, cutoffDate),
    monthlyTrend(db, context.actor, period, trendMonths),
  ]);
  return {
    overview,
    budgets: overview.budgets,
    categoryExpenses: overview.categoryExpenses,
    ...breakdowns,
    trend: { months: trendMonths, items: trend },
  };
};
