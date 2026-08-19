export const RESERVED_TRANSACTION_FIELDS = Object.freeze([
  "recurring_occurrence_id",
  "goal_id",
  "scope",
  "owner_user_id",
  "cost_share_json",
  "idempotency_key",
  "created_by",
  "created_at",
  "updated_by",
  "updated_at",
  "cancelled_by",
  "cancelled_at",
  "cancellation_reason",
  "status",
]);

const reservedTransactionFields = new Set(RESERVED_TRANSACTION_FIELDS);

export const isReservedTransactionField = (field) => reservedTransactionFields.has(field);