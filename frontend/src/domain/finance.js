import { ACTIVE_STATUS, TRANSACTION_TYPES } from "./constants.js";

const activeTransactions = (transactions, cutoffDate) => transactions.filter((item) => item.status === ACTIVE_STATUS)
  .filter((item) => !cutoffDate || !item.transaction_date || item.transaction_date <= cutoffDate);

export const calculateAccountBalance = (account, transactions, cutoffDate) => {
  const initial = Number(account.initial_balance || 0);
  return activeTransactions(transactions, cutoffDate)
    .filter((transaction) => !account.initial_balance_date || !transaction.transaction_date || transaction.transaction_date >= account.initial_balance_date)
    .reduce((balance, transaction) => {
    const amount = Number(transaction.amount || 0);
    switch (transaction.transaction_type) {
      case TRANSACTION_TYPES.INCOME:
      case TRANSACTION_TYPES.REFUND:
        return transaction.destination_account_id === account.account_id ? balance + amount : balance;
      case TRANSACTION_TYPES.EXPENSE:
        return transaction.source_account_id === account.account_id ? balance - amount : balance;
      case TRANSACTION_TYPES.TRANSFER:
        if (transaction.source_account_id === account.account_id) return balance - amount;
        if (transaction.destination_account_id === account.account_id) return balance + amount;
        return balance;
      case TRANSACTION_TYPES.ADJUSTMENT:
        return transaction.source_account_id === account.account_id ? balance + amount : balance;
      default:
        return balance;
    }
  }, initial);
};

export const calculateCashFlow = (transactions, cutoffDate) => activeTransactions(transactions, cutoffDate).reduce((summary, transaction) => {
  const amount = Number(transaction.amount || 0);
  if (transaction.transaction_type === TRANSACTION_TYPES.INCOME) summary.income += amount;
  if (transaction.transaction_type === TRANSACTION_TYPES.EXPENSE) summary.expense += amount;
  if (transaction.transaction_type === TRANSACTION_TYPES.REFUND) summary.refund += amount;
  return summary;
}, { income: 0, expense: 0, refund: 0 });

export const calculateEnvelopeUsage = (envelopePeriod, transactions, cutoffDate) => {
  const used = activeTransactions(transactions, cutoffDate)
    .filter((transaction) => transaction.envelope_period_id === envelopePeriod.envelope_period_id)
    .filter((transaction) => transaction.transaction_type === TRANSACTION_TYPES.EXPENSE)
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const allocated = Number(envelopePeriod.allocated_amount || 0);
  const reserved = Number(envelopePeriod.reserved_amount || 0);
  return {
    ...envelopePeriod,
    used_amount: used,
    remaining_amount: allocated - reserved - used,
  };
};

export const calculateSafeToSpend = ({ accountBalances, reservedBills = 0, protectedGoals = 0, emergencyFund = 0 }) => {
  const liquid = accountBalances.reduce((total, item) => total + Number(item.balance || 0), 0);
  return Math.max(0, liquid - Number(reservedBills) - Number(protectedGoals) - Number(emergencyFund));
};
