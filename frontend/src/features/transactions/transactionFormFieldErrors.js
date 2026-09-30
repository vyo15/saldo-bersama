const FIELD_ERROR_DEPENDENCIES = Object.freeze({
  transaction_type: ["transaction_type", "source_account_id", "destination_account_id", "category_id", "envelope_period_id", "budget_id", "cost_share_mode", "cost_share_percentages", "description"],
  amount: ["amount", "description"],
  source_account_id: ["source_account_id", "destination_account_id", "envelope_period_id", "budget_id", "cost_share_mode", "cost_share_percentages", "description"],
  destination_account_id: ["destination_account_id"],
  category_id: ["category_id", "envelope_period_id", "budget_id"],
  envelope_period_id: ["envelope_period_id", "budget_id", "description"],
  transaction_date: ["transaction_date", "envelope_period_id", "budget_id"],
  budget_id: ["budget_id", "envelope_period_id", "description"],
  description: ["description"],
  cost_share_mode: ["cost_share_mode", "cost_share_percentages"],
  cost_share_percentages: ["cost_share_mode", "cost_share_percentages"],
});

// Only keys owned by the transaction form may enter field-validation state.
// API error details also carry diagnostic/domain metadata (request ids, action names,
// balances, row versions, etc.) and must never be rendered as missing-field copy.
const TRANSACTION_FIELD_ERROR_KEYS = new Set(Object.keys(FIELD_ERROR_DEPENDENCIES));

const normalizedFieldMessage = (value) => typeof value === "string" ? value.trim() : "";

export const sanitizeTransactionFieldErrors = (errors) => {
  if (!errors || Array.isArray(errors) || typeof errors !== "object") return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(errors)) {
    if (!TRANSACTION_FIELD_ERROR_KEYS.has(key)) continue;
    const message = normalizedFieldMessage(value);
    if (message) sanitized[key] = message;
  }
  return sanitized;
};

export const transactionValidationMessages = (errors) => Object.values(sanitizeTransactionFieldErrors(errors));

export const transactionErrorKeysForEdit = (field) => FIELD_ERROR_DEPENDENCIES[field] || [field];

export const clearTransactionFieldErrors = (errors, fields) => {
  const keys = new Set((Array.isArray(fields) ? fields : [fields]).flatMap(transactionErrorKeysForEdit));
  if (!errors || typeof errors !== "object") return {};
  const safeErrors = sanitizeTransactionFieldErrors(errors);
  if (!keys.size) return safeErrors;
  let changed = false;
  const next = { ...safeErrors };
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    delete next[key];
    changed = true;
  }
  if (Object.keys(safeErrors).length !== Object.keys(errors).length) changed = true;
  return changed ? next : errors;
};
