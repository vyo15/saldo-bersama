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
export const INTERNAL_TRANSACTION_LINK_FIELDS = Object.freeze([
  "recurring_occurrence_id",
  "goal_id",
]);

const reservedTransactionFields = new Set(RESERVED_TRANSACTION_FIELDS);
const internalTransactionLinkFields = new Set(INTERNAL_TRANSACTION_LINK_FIELDS);

export const isReservedTransactionField = (field) => reservedTransactionFields.has(field);
export const isInternalTransactionLinkField = (field) => internalTransactionLinkFields.has(field);
export const firstForbiddenTransactionField = (payload, { allowInternalLinks = false } = {}) => Object.keys(payload || {}).find((field) => (
  isReservedTransactionField(field) && !(allowInternalLinks && isInternalTransactionLinkField(field))
)) || null;
