import { readBatchRows } from "../../db/readBatchRows.js";
import { appError, boundedInteger, monthBounds, nowIso, periodKey, sanitizeText, todayJakarta } from "../core.js";
import { transactionCapabilities } from "../transactionPolicy.js";
import { buildFinancialAlerts } from "./dashboard/alerts.js";
import {
  bootstrapReadStatements,
  dashboardPeriodContext,
  dashboardReadPlan,
  mapBootstrapRows,
  mapDashboardReadRows,
  mapMonthlyTrendRows,
  mapReportBreakdowns,
  monthlyTrendPlan,
  reportBreakdownStatements,
} from "./dashboard/readModel.js";

// Dashboard is an orchestration facade over batched read models. Saldo and planning
// mutations remain authoritative in their domain services; this module only presents them.

export const bootstrapData = async (db, context) => mapBootstrapRows(
  await readBatchRows(db, bootstrapReadStatements(context)),
  context,
);

const allocationSummary = (accounts, items) => {
  const unboundRemaining = items.reduce((sum, item) => item.source_account_id ? sum : sum + Math.max(0, Number(item.allocated_amount || 0) - Number(item.used_amount || 0)), 0);
  const allocatedRemaining = accounts.reduce((sum, item) => sum + Math.max(0, Number(item.allocated_remaining || 0)), 0) + unboundRemaining;
  const totalAvailable = accounts.reduce((sum, item) => sum + Math.max(0, Number(item.available_balance ?? item.balance ?? 0)), 0);
  return {
    items,
    allocatedRemaining,
    unboundRemaining,
    unallocatedAmount: Math.max(0, totalAvailable - unboundRemaining),
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
  const operableLiquidAvailable = operableAccounts.filter((row) => !protectedTypes.has(row.account_type)).reduce((sum, row) => sum + Math.max(0, Number(row.available_balance ?? row.balance ?? 0)), 0);
  const reservedBills = recurring.filter((row) => row.kind === "expense" && !["paid", "cancelled"].includes(row.status)).reduce((sum, row) => sum + Math.max(0, Number(row.expected_amount) - Number(row.actual_amount)), 0);
  return {
    operableAccounts,
    openingBalance,
    totalBalance,
    emergencyBalance,
    protectedBalance,
    liquidBalance,
    reservedBills,
    safeToSpend: Math.max(0, operableLiquidAvailable - reservedBills),
  };
};

const dashboardRecentTransactions = (rows, actor, periodOpen) => rows.map((row) => ({
  ...row,
  ...transactionCapabilities(actor, row, { periodOpen }),
}));

const dashboardDaysRemaining = ({ historical, period, currentPeriod, today, bounds }) => {
  if (historical) return 0;
  const lastDay = Number(bounds.end.slice(-2));
  const currentDay = period === currentPeriod ? Number(today.slice(-2)) : 1;
  return Math.max(1, lastDay - currentDay + 1);
};

const dashboardResult = (context, periodContext, readState) => {
  const { period, bounds, today, currentPeriod, historical, cutoffDate } = periodContext;
  const { accounts, openingAccounts, cashFlowRow, recentTransactionRows, transactionPeriodLocked, categoryExpenses, recurring, goals, budgets, dashboardEnvelopes, reconciliationRows } = readState;
  const balance = dashboardBalanceMetrics(accounts, openingAccounts, recurring);
  const allocation = allocationSummary(balance.operableAccounts, dashboardEnvelopes);
  const safeToSpend = Math.max(0, balance.safeToSpend - allocation.unboundRemaining);
  const income = Number(cashFlowRow.income || 0);
  const expense = Number(cashFlowRow.expense || 0);
  const refund = Number(cashFlowRow.refund || 0);
  const unallocatedCount = Number(cashFlowRow.unallocated_count || 0);
  const unallocatedExpenseAmount = Number(cashFlowRow.unallocated_amount || 0);
  const daysRemaining = dashboardDaysRemaining({ historical, period, currentPeriod, today, bounds });
  const recentTransactions = dashboardRecentTransactions(recentTransactionRows, context.actor, !transactionPeriodLocked);
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
    safeToSpend,
    dailySafeToSpend: daysRemaining ? Math.floor(safeToSpend / daysRemaining) : 0,
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
    unallocatedExpenseAmount,
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
