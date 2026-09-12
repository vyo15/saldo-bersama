const arrayOrEmpty = (value) => Array.isArray(value) ? value : [];
const objectOrEmpty = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export const normalizeDashboardOverview = (overview) => {
  if (!overview || typeof overview !== "object") return overview;
  const cashFlow = objectOrEmpty(overview.cashFlow);
  return {
    ...overview,
    accountBalances: arrayOrEmpty(overview.accountBalances),
    envelopes: arrayOrEmpty(overview.envelopes),
    recurring: arrayOrEmpty(overview.recurring),
    goals: arrayOrEmpty(overview.goals),
    budgets: arrayOrEmpty(overview.budgets),
    recentTransactions: arrayOrEmpty(overview.recentTransactions),
    categoryExpenses: arrayOrEmpty(overview.categoryExpenses),
    alerts: arrayOrEmpty(overview.alerts),
    cashFlow: {
      income: cashFlow.income ?? 0,
      expense: cashFlow.expense ?? 0,
      refund: cashFlow.refund ?? 0,
      net: cashFlow.net ?? (Number(cashFlow.income || 0) + Number(cashFlow.refund || 0) - Number(cashFlow.expense || 0)),
    },
  };
};

export const normalizeDashboardBootstrap = (bootstrap) => {
  if (!bootstrap || typeof bootstrap !== "object") return bootstrap;
  return {
    ...bootstrap,
    accounts: arrayOrEmpty(bootstrap.accounts),
    categories: arrayOrEmpty(bootstrap.categories),
    members: arrayOrEmpty(bootstrap.members),
  };
};
