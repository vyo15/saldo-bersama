import { listBudgets, listEnvelopes, listGoals, listRecurring } from "../planning/index.js";
import { accountBalanceAsOf, categoryExpenseTotals, visibleAccounts, visibleTransactions } from "../readModels.js";
import { monthBounds, periodKey, publicRow, todayJakarta } from "../core.js";
import { dateBefore } from "./shared.js";
export const bootstrapData = async (db, context) => {
  const [accounts, categories, configRows] = await Promise.all([visibleAccounts(db, context.actor), db.all("SELECT * FROM categories WHERE status='active' ORDER BY transaction_type,name COLLATE NOCASE"), db.all("SELECT key,value FROM system_config WHERE key IN ('schema_version','timezone','currency','maintenance_mode')")]);
  const config = Object.fromEntries(configRows.map(row => [row.key, row.value]));
  return {
    user: publicRow(context.actor),
    accounts,
    categories: categories.map(publicRow),
    config: {
      schemaVersion: Number(config.schema_version || 0),
      timezone: config.timezone || "Asia/Jakarta",
      currency: config.currency || "IDR",
      maintenanceMode: config.maintenance_mode === "true"
    }
  };
};
const allocationSummary = async (db, actor, accounts, period) => {
  const items = (await listEnvelopes(db, {
    actor,
    payload: {
      period
    }
  })).items.filter(item => item.status === "active");
  const allocatedRemaining = items.reduce((sum, item) => sum + Math.max(0, Number(item.remaining_amount || 0)), 0);
  const totalAvailable = accounts.reduce((sum, item) => sum + Math.max(0, Number(item.balance || 0)), 0);
  return {
    items,
    allocatedRemaining,
    unallocatedAmount: Math.max(0, totalAvailable - allocatedRemaining)
  };
};
export const dashboardOverview = async (db, context) => {
  const period = periodKey(context.payload?.period);
  const bounds = monthBounds(period);
  const currentPeriod = todayJakarta().slice(0, 7);
  const historical = period < currentPeriod;
  const cutoffDate = historical ? bounds.end : todayJakarta();
  const [accounts, transactions, categoryExpenses, recurringResult, goalsResult] = await Promise.all([visibleAccounts(db, context.actor, {
    includeArchived: historical,
    cutoffDate
  }), visibleTransactions(db, context.actor, {
    startDate: bounds.start,
    endDate: cutoffDate,
    includeCancelled: false
  }), categoryExpenseTotals(db, context.actor, bounds.start, cutoffDate), listRecurring(db, {
    ...context,
    payload: {
      period
    }
  }), listGoals(db, context)]);
  const allocation = await allocationSummary(db, context.actor, accounts, period);
  let income = 0;
  let expense = 0;
  let refund = 0;
  let unallocatedCount = 0;
  for (const row of transactions) {
    if (row.transaction_type === "income") income += Number(row.amount);else if (row.transaction_type === "expense") {
      expense += Number(row.amount);
      if (!row.envelope_period_id) unallocatedCount += 1;
    } else if (row.transaction_type === "refund") refund += Number(row.amount);
  }
  const openingDate = dateBefore(bounds.start);
  let openingBalance = 0;
  for (const account of accounts) openingBalance += await accountBalanceAsOf(db, account, openingDate);
  const totalBalance = accounts.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const protectedTypes = new Set(["emergency_fund", "savings", "sinking_fund"]);
  const emergencyBalance = accounts.filter(row => row.account_type === "emergency_fund").reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const protectedBalance = accounts.filter(row => protectedTypes.has(row.account_type)).reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const liquidBalance = accounts.filter(row => !protectedTypes.has(row.account_type)).reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const recurring = recurringResult.items;
  const reservedBills = recurring.filter(row => row.kind === "expense" && !["paid", "cancelled"].includes(row.status)).reduce((sum, row) => sum + Math.max(0, Number(row.expected_amount) - Number(row.actual_amount)), 0);
  const safeToSpend = Math.max(0, liquidBalance - reservedBills);
  const lastDay = Number(bounds.end.slice(-2));
  const currentDay = period === currentPeriod ? Number(todayJakarta().slice(-2)) : 1;
  const daysRemaining = historical ? 0 : Math.max(1, lastDay - currentDay + 1);
  const recentTransactions = transactions.slice(0, 12).map(row => ({
    ...row,
    can_update: row.status === "active" && (context.actor.role === "owner" || row.created_by === context.actor.user_id),
    can_cancel: row.status === "active" && (context.actor.role === "owner" || row.created_by === context.actor.user_id)
  }));
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
    cashFlow: {
      income,
      expense,
      refund,
      net: income + refund - expense
    },
    envelopes: allocation.items,
    recurring,
    goals: goalsResult.items,
    recentTransactions,
    categoryExpenses,
    unallocatedCount,
    unallocatedFunds: allocation.unallocatedAmount,
    allocatedRemaining: allocation.allocatedRemaining,
    reservedBills,
    lastSyncedAt: nowIso()
  };
};
export const appInitialState = async (db, context) => {
  const [bootstrap, overview] = await Promise.all([bootstrapData(db, context), dashboardOverview(db, context)]);
  return {
    bootstrap,
    overview
  };
};
export const monthlyReport = async (db, context) => {
  const period = periodKey(context.payload?.period);
  const scoped = {
    ...context,
    payload: {
      period
    }
  };
  const [overview, budgetResult] = await Promise.all([dashboardOverview(db, scoped), listBudgets(db, scoped)]);
  return {
    overview,
    budgets: budgetResult.items,
    categoryExpenses: overview.categoryExpenses
  };
};
