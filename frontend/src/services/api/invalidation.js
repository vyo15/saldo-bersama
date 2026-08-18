const INVALIDATION_GROUPS = Object.freeze({
  period: Object.freeze([
    "periods.list",
    "transactions.list",
    "dashboard.overview",
    "reports.monthly",
    "audit.list",
    "app.initialState",
  ]),
  users: Object.freeze([
    "users.list",
    "accounts.list",
    "transactions.list",
    "dashboard.overview",
    "bootstrap.get",
    "app.initialState",
  ]),
});

export const invalidationActionsFor = (domain) => [...(INVALIDATION_GROUPS[domain] || [])];
