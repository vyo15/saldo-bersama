import { TRANSACTION_TYPES } from "../../domain/constants.js";

// An ordinary expense/refund is confirmed through the standard success toast.
// Income and transfer retain next-step actions (allocation / investment).
export const requiresPostSaveDecision = (transactionType) =>
  transactionType === TRANSACTION_TYPES.INCOME || transactionType === TRANSACTION_TYPES.TRANSFER;
