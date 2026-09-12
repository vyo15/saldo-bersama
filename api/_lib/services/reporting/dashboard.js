import { readBatchRows, readBatchRowsChunked } from "../../db/readBatchRows.js";
import { presentSyncRevisionRows, syncRevisionStatement } from "../../syncRevisions.js";
import { appError, boundedInteger, monthBounds, nowIso, periodKey, sanitizeText, todayJakarta } from "../core.js";
import { transactionCapabilities } from "../transactionPolicy.js";
import { aggregateCostShareRows } from "../costSharing.js";
import { budgetReportStatement, mapBudgetReportRows } from "../planning/budgets.js";
import { buildFinancialAlerts } from "./dashboard/alerts.js";
import {
  bootstrapReadStatements,
  dailyTrendPlan,
  dashboardPeriodContext,
  dashboardReadPlan,
  mapBootstrapRows,
  mapDailyTrendRows,
  mapDashboardReadRows,
  mapMonthlyTrendRows,
  monthlyTrendPlan,
} from "./dashboard/readModel.js";
import {
  mapReportAllocations,
  mapReportBreakdowns,
  mapReportTransactions,
  reportAllocationStatement,
  reportBreakdownStatements,
  reportTransactionsStatement,
} from "./reportReadModel.js";

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

const allocatedBudgetIds = (budgets) => new Set(
  budgets.filter((budget) => budget.envelope_rule_id).map((budget) => budget.budget_id),
);

const dashboardBalanceMetrics = (accounts, openingAccounts, recurring, budgets) => {
  const protectedTypes = new Set(["emergency_fund", "savings", "sinking_fund"]);
  const isInvestment = (account) => account.account_type === "investment";
  const nonInvestmentAccounts = accounts.filter((account) => !isInvestment(account));
  const openingNonInvestmentAccounts = openingAccounts.filter((account) => !isInvestment(account));
  const operableAccounts = nonInvestmentAccounts.filter((account) => account.can_transact !== false);
  const operatingLiquidAccounts = operableAccounts.filter((account) => !protectedTypes.has(account.account_type));
  const operatingAccountIds = new Set(operatingLiquidAccounts.map((account) => account.account_id));
  const openingBalance = openingAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const nonInvestmentOpeningBalance = openingNonInvestmentAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const totalBalance = accounts.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const nonInvestmentBalance = nonInvestmentAccounts.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const emergencyBalance = nonInvestmentAccounts.filter((row) => row.account_type === "emergency_fund").reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const protectedBalance = nonInvestmentAccounts.filter((row) => protectedTypes.has(row.account_type)).reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const liquidBalance = nonInvestmentAccounts.filter((row) => !protectedTypes.has(row.account_type)).reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const operableLiquidAvailable = operatingLiquidAccounts.reduce((sum, row) => sum + Math.max(0, Number(row.available_balance ?? row.balance ?? 0)), 0);
  const fundedBudgetIds = allocatedBudgetIds(budgets);
  const reservedBills = recurring.filter((row) => row.kind === "expense"
    && operatingAccountIds.has(row.default_account_id)
    && !fundedBudgetIds.has(row.budget_id)
    && !["paid", "cancelled"].includes(row.status))
    .reduce((sum, row) => sum + Math.max(0, Number(row.expected_amount) - Number(row.actual_amount)), 0);
  return {
    operableAccounts,
    openingBalance,
    nonInvestmentOpeningBalance,
    totalBalance,
    nonInvestmentBalance,
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
  const { accounts, openingAccounts, cashFlowRow, recentTransactionRows, transactionPeriodLocked, categoryExpenses, recurring, goals, budgets, dashboardEnvelopes, reconciliationRows, investmentReconciliationRows } = readState;
  const balance = dashboardBalanceMetrics(accounts, openingAccounts, recurring, budgets);
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
    investmentReconciliationRows,
  });
  return {
    periodKey: period,
    cutoffDate,
    isHistoricalPeriod: historical,
    accountBalances: accounts,
    totalBalance: balance.totalBalance,
    nonInvestmentBalance: balance.nonInvestmentBalance,
    openingBalance: balance.openingBalance,
    nonInvestmentOpeningBalance: balance.nonInvestmentOpeningBalance,
    balanceChange: balance.totalBalance - balance.openingBalance,
    nonInvestmentBalanceChange: balance.nonInvestmentBalance - balance.nonInvestmentOpeningBalance,
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
  const rows = await readBatchRowsChunked(db, plan.statements);
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
  const syncStatement = syncRevisionStatement();
  // Keep one snapshot transaction, but avoid one oversized Turso pipeline. Production
  // datasets can make a large multi-statement HTTP pipeline exceed the per-request
  // transport deadline even though each individual read is healthy.
  const bootstrapRows = await readBatchRows(db, bootstrapStatements);
  const bootstrap = mapBootstrapRows(bootstrapRows, context);
  const dashboardRows = await readBatchRowsChunked(db, dashboardPlan.statements);
  const readState = mapDashboardReadRows(dashboardRows, dashboardPlan, context, periodContext, bootstrap.accounts);
  const overview = dashboardResult(context, periodContext, readState);
  const [syncRows = []] = await readBatchRows(db, [syncStatement]);
  const sync = presentSyncRevisionRows(syncRows);
  return { bootstrap, overview, sync };
};

const reportRequest = (context) => {
  const period = periodKey(context.payload?.period);
  const trendMonths = boundedInteger(context.payload?.trend_months, 6, 1, 12, "Rentang tren");
  if (![1, 3, 6, 12].includes(trendMonths)) throw appError("INVALID_TREND_RANGE", "Rentang tren harus 1, 3, 6, atau 12 bulan.", 400);
  return {
    period,
    trendMonths,
    accountId: sanitizeText(context.payload?.account_id, 100),
    allocationRuleId: sanitizeText(context.payload?.allocation_rule_id, 100),
  };
};

const reportRowSlices = (rows, { dashboardCount, breakdownCount }) => {
  const reportBudgetIndex = dashboardCount;
  const allocationIndex = reportBudgetIndex + 1;
  const breakdownStart = allocationIndex + 1;
  const breakdownEnd = breakdownStart + breakdownCount;
  const transactionIndex = breakdownEnd;
  return {
    dashboardRows: rows.slice(0, dashboardCount),
    budgetRows: rows[reportBudgetIndex] || [],
    allocationRows: rows[allocationIndex] || [],
    breakdownRows: rows.slice(breakdownStart, breakdownEnd),
    transactionRows: rows[transactionIndex] || [],
    trendRows: rows.slice(transactionIndex + 1),
  };
};

const reportSummaryFor = (overview, selectedAllocation) => {
  if (selectedAllocation) return {
    mode: "allocation",
    label: selectedAllocation.name,
    allocated: selectedAllocation.allocated_amount,
    used: selectedAllocation.used_amount,
    remaining: selectedAllocation.remaining_amount,
    usagePercent: selectedAllocation.usage_percent,
  };
  return {
    mode: "all",
    label: "Semua Alokasi",
    openingBalance: Number(overview.nonInvestmentOpeningBalance ?? overview.openingBalance ?? 0),
    credit: Number(overview.cashFlow?.income || 0) + Number(overview.cashFlow?.refund || 0),
    debit: Number(overview.cashFlow?.expense || 0),
    closingBalance: Number(overview.nonInvestmentBalance ?? overview.totalBalance ?? 0),
  };
};

const reportTrendFor = (trendMonths, trendPlan, rows) => trendMonths === 1
  ? mapDailyTrendRows(trendPlan, rows)
  : mapMonthlyTrendRows(trendPlan, rows);

const reportTrendPlanFor = (actor, { period, trendMonths, accountId, allocationRuleId }) => trendMonths === 1
  ? dailyTrendPlan(actor, period, { accountId, allocationRuleId })
  : monthlyTrendPlan(actor, period, trendMonths, { accountId, allocationRuleId });

export const monthlyReport = async (db, context) => {
  const request = reportRequest(context);
  const { period, trendMonths, accountId, allocationRuleId } = request;
  const scoped = { ...context, payload: { period } };
  const periodContext = dashboardPeriodContext(scoped, null);
  const dashboardPlan = dashboardReadPlan(scoped, periodContext);
  const bounds = monthBounds(period);
  const currentPeriod = todayJakarta().slice(0, 7);
  const cutoffDate = period === currentPeriod ? todayJakarta() : bounds.end;
  const allocationStatement = reportAllocationStatement(context.actor, period, { usageEndDate: cutoffDate });
  const breakdownStatements = reportBreakdownStatements(context.actor, bounds.start, cutoffDate, { allocationRuleId });
  const transactionStatement = reportTransactionsStatement(context.actor, bounds.start, cutoffDate, { allocationRuleId });
  const trendPlan = reportTrendPlanFor(context.actor, request);
  const rows = await readBatchRowsChunked(db, [
    ...dashboardPlan.statements,
    budgetReportStatement(scoped),
    allocationStatement,
    ...breakdownStatements,
    transactionStatement,
    ...trendPlan.statements,
  ]);
  const slices = reportRowSlices(rows, { dashboardCount: dashboardPlan.statements.length, breakdownCount: breakdownStatements.length });
  const readState = mapDashboardReadRows(slices.dashboardRows, dashboardPlan, scoped, periodContext, null);
  const overview = dashboardResult(scoped, periodContext, readState);
  const allocations = mapReportAllocations(slices.allocationRows);
  const selectedAllocation = allocationRuleId ? allocations.find((item) => item.envelope_rule_id === allocationRuleId) : null;
  const allBudgets = mapBudgetReportRows(slices.budgetRows).items;
  const budgets = selectedAllocation ? allBudgets.filter((item) => item.envelope_rule_id === allocationRuleId) : allBudgets;
  const breakdowns = mapReportBreakdowns(slices.breakdownRows, aggregateCostShareRows);
  const trend = reportTrendFor(trendMonths, trendPlan, slices.trendRows);
  const reportSummary = reportSummaryFor(overview, selectedAllocation);
  const reportTransactions = mapReportTransactions(slices.transactionRows, {
    openingBalance: selectedAllocation ? selectedAllocation.allocated_amount : reportSummary.openingBalance,
    allocationScoped: Boolean(selectedAllocation),
  });
  const result = {
    overview,
    reportSummary,
    reportScope: selectedAllocation
      ? { mode: "allocation", allocationRuleId, label: selectedAllocation.name }
      : { mode: "all", allocationRuleId: "", label: "Semua Alokasi", scopeUnavailable: Boolean(allocationRuleId) },
    allocationOptions: allocations,
    budgets,
    categoryExpenses: breakdowns.categoryExpenses,
    accountExpenses: breakdowns.accountExpenses,
    creatorExpenses: breakdowns.creatorExpenses,
    natureExpenses: breakdowns.natureExpenses,
    costShareExpenses: breakdowns.costShareExpenses,
    reportTransactions,
    trend: { months: trendMonths, granularity: trendMonths === 1 ? "day" : "month", items: trend.items },
  };
  if (accountId) result.accountExpenseTrend = { months: trendMonths, granularity: trendMonths === 1 ? "day" : "month", items: trend.accountExpenseItems };
  return result;
};
