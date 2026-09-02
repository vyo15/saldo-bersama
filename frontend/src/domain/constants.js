export const TRANSACTION_TYPES = Object.freeze({
  INCOME: "income",
  EXPENSE: "expense",
  TRANSFER: "transfer",
  REFUND: "refund",
  ADJUSTMENT: "adjustment",
});

export const ACCOUNT_TYPES = Object.freeze({
  BANK: "bank",
  CASH: "cash",
  EWALLET: "ewallet",
  SAVINGS: "savings",
  EMERGENCY_FUND: "emergency_fund",
  SINKING_FUND: "sinking_fund",
  INVESTMENT: "investment",
  OTHER: "other",
});

export const BANK_TEMPLATES = Object.freeze({
  GENERIC: "generic",
  BCA: "bca",
  BNI: "bni",
  BTN: "btn",
  MANDIRI: "mandiri",
  PERMATA: "permata",
});

export const EWALLET_TEMPLATES = Object.freeze({
  GENERIC: "generic",
  SHOPEEPAY: "shopeepay",
  DANA: "dana",
  GOPAY: "gopay",
  OVO: "ovo",
  LINKAJA: "linkaja",
});

export const CATEGORY_TYPES = Object.freeze({
  EXPENSE: "expense",
  INCOME: "income",
  REFUND: "refund",
});

export const CATEGORY_NATURES = Object.freeze({
  FIXED: "fixed",
  VARIABLE: "variable",
  UNEXPECTED: "unexpected",
  DISCRETIONARY: "discretionary",
  EMERGENCY: "emergency",
  SAVINGS: "savings",
  OTHER: "other",
});

export const CATEGORY_ICON_KEYS = Object.freeze([
  "wedding_ring", "savings", "target", "emergency", "money", "account", "salary", "business", "refund",
  "shopping", "food", "transport", "home", "renovation", "bill", "electricity", "internet", "education",
  "health", "travel", "entertainment", "music", "gift", "family", "partner", "cat", "other",
]);

export const DEFAULT_CATEGORY_ICON_BY_TYPE = Object.freeze({
  [CATEGORY_TYPES.EXPENSE]: "shopping",
  [CATEGORY_TYPES.INCOME]: "salary",
  [CATEGORY_TYPES.REFUND]: "refund",
});

export const NOTIFICATION_TYPES = Object.freeze({
  RECURRING_DUE: "recurring_due",
  RECURRING_FUNDING_SHORTAGE: "recurring_funding_shortage",
  RECURRING_COMPLETED: "recurring_completed",
  BUDGET_THRESHOLD: "budget_threshold",
  ENVELOPE_THRESHOLD: "envelope_threshold",
  GOAL_BEHIND: "goal_behind",
  UNALLOCATED_EXPENSE: "unallocated_expense",
});

export const ACTIVE_STATUS = "active";
