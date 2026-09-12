// Stable transaction-service facade. Internal modules are split by responsibility.
export { isTransactionDateLocked, assertTransactionDateUnlocked, assertAffectedBalances, normalizeTransaction } from "./finance/transactionValidation.js";
export { createTransactionInternal, createTransaction, updateTransaction, cancelTransactionInternal, cancelTransaction, restoreTransaction } from "./finance/transactionMutations.js";
export { listTransactions } from "./finance/transactionQueries.js";
