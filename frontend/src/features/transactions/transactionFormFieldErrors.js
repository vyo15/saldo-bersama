const FIELD_ERROR_DEPENDENCIES = Object.freeze({
  transaction_type: ["transaction_type", "source_account_id", "destination_account_id", "category_id", "envelope_period_id", "cost_share_mode", "cost_share_percentages", "description"],
  amount: ["amount", "description"],
  source_account_id: ["source_account_id", "destination_account_id", "envelope_period_id", "cost_share_mode", "cost_share_percentages", "description"],
  destination_account_id: ["destination_account_id"],
  category_id: ["category_id", "envelope_period_id"],
  envelope_period_id: ["envelope_period_id", "description"],
  transaction_date: ["transaction_date", "envelope_period_id"],
  description: ["description"],
  cost_share_mode: ["cost_share_mode", "cost_share_percentages"],
  cost_share_percentages: ["cost_share_mode", "cost_share_percentages"],
});

export const transactionErrorKeysForEdit = (field) => FIELD_ERROR_DEPENDENCIES[field] || [field];

export const clearTransactionFieldErrors = (errors, fields) => {
  const keys = new Set((Array.isArray(fields) ? fields : [fields]).flatMap(transactionErrorKeysForEdit));
  if (!keys.size || !errors || typeof errors !== "object") return errors || {};
  let changed = false;
  const next = { ...errors };
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    delete next[key];
    changed = true;
  }
  return changed ? next : errors;
};
