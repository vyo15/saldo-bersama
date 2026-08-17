export const ACCOUNT_TYPE_VALUES = Object.freeze([
  "cash", "bank", "ewallet", "savings", "emergency_fund", "sinking_fund", "investment", "other",
]);

export const TRANSACTION_TYPE_VALUES = Object.freeze([
  "income", "expense", "transfer", "refund", "adjustment",
]);

export const BANK_TEMPLATE_VALUES = Object.freeze([
  "generic", "bca", "bni", "btn", "mandiri", "permata",
]);

export const EWALLET_TEMPLATE_VALUES = Object.freeze([
  "generic", "shopeepay", "dana", "gopay", "ovo", "linkaja",
]);

export const CATEGORY_TYPE_VALUES = Object.freeze(["income", "expense", "refund"]);

export const CATEGORY_NATURE_VALUES = Object.freeze([
  "fixed", "variable", "unexpected", "discretionary", "emergency", "savings", "other",
]);

export const CURRENT_EXPENSE_CATEGORY_NATURE_VALUES = Object.freeze([
  "fixed", "variable", "unexpected", "discretionary", "emergency", "other",
]);

export const CATEGORY_ICON_VALUES = Object.freeze([
  "wedding_ring", "savings", "target", "emergency", "money", "account", "salary", "business", "refund",
  "shopping", "food", "transport", "home", "renovation", "bill", "electricity", "internet", "education",
  "health", "travel", "entertainment", "music", "gift", "family", "partner", "other",
]);

export const DEFAULT_CATEGORY_ICON_BY_TYPE = Object.freeze({
  expense: "shopping",
  income: "salary",
  refund: "refund",
});

export const NOTIFICATION_TYPE_VALUES = Object.freeze([
  "recurring_due",
  "recurring_funding_shortage",
  "recurring_completed",
  "budget_threshold",
  "envelope_threshold",
  "goal_behind",
  "unallocated_expense",
]);
