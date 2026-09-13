import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { parseRupiah } from "../../domain/money.js";

const SAFE_EXCLUDED_ACCOUNT_TYPES = new Set(["investment", "emergency_fund", "savings", "sinking_fund"]);
const asMoney = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const countsTowardSafeToSpend = (account) => Boolean(account) && account.can_transact !== false && !SAFE_EXCLUDED_ACCOUNT_TYPES.has(account.account_type);

const impactState = ({ accountBalances = [], envelopes = [], budgets = [] }) => ({
  accounts: new Map(accountBalances.map((item) => [item.account_id, {
    balance: asMoney(item.balance),
    available: asMoney(item.available_balance ?? item.balance),
  }])),
  envelopes: new Map(envelopes.map((item) => [item.envelope_period_id, asMoney(item.remaining_amount)])),
  budgets: new Map(budgets.map((item) => [item.budget_id, asMoney(item.used_amount)])),
});

const accountById = (accountBalances, accountId) => accountBalances.find((item) => item.account_id === accountId) || null;

const mutateAccount = (state, accountId, { balance = 0, available = 0 } = {}) => {
  if (!accountId || !state.accounts.has(accountId)) return;
  const current = state.accounts.get(accountId);
  state.accounts.set(accountId, { balance: current.balance + balance, available: current.available + available });
};

const transactionSafeDelta = ({ transaction, accountBalances, envelopeRemaining, reverse = false }) => {
  const type = transaction?.transaction_type;
  const amount = Math.max(0, asMoney(transaction?.amount));
  if (!amount) return 0;
  const source = accountById(accountBalances, transaction.source_account_id);
  const destination = accountById(accountBalances, transaction.destination_account_id);
  if (type === TRANSACTION_TYPES.EXPENSE) {
    const covered = transaction.envelope_period_id ? Math.min(amount, Math.max(0, envelopeRemaining)) : 0;
    const delta = countsTowardSafeToSpend(source) ? -(amount - covered) : 0;
    return reverse ? -delta : delta;
  }
  if (type === TRANSACTION_TYPES.TRANSFER) {
    const delta = (countsTowardSafeToSpend(destination) ? amount : 0) - (countsTowardSafeToSpend(source) ? amount : 0);
    return reverse ? -delta : delta;
  }
  if ([TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.REFUND].includes(type)) {
    const delta = countsTowardSafeToSpend(destination) ? amount : 0;
    return reverse ? -delta : delta;
  }
  if (type === TRANSACTION_TYPES.ADJUSTMENT) {
    const delta = countsTowardSafeToSpend(source) ? amount : 0;
    return reverse ? -delta : delta;
  }
  return 0;
};

const reverseTransactionImpact = ({ state, transaction, accountBalances }) => {
  if (!transaction) return 0;
  const type = transaction.transaction_type;
  const amount = Math.max(0, asMoney(transaction.amount));
  if (!amount) return 0;
  const envelopeId = transaction.envelope_period_id || "";
  const currentEnvelopeRemaining = envelopeId && state.envelopes.has(envelopeId) ? state.envelopes.get(envelopeId) : 0;
  const beforeOldEnvelopeRemaining = envelopeId ? currentEnvelopeRemaining + amount : 0;
  const oldSafeDelta = transactionSafeDelta({ transaction, accountBalances, envelopeRemaining: beforeOldEnvelopeRemaining });

  if (type === TRANSACTION_TYPES.EXPENSE) {
    const covered = envelopeId ? Math.min(amount, Math.max(0, beforeOldEnvelopeRemaining)) : 0;
    mutateAccount(state, transaction.source_account_id, { balance: amount, available: amount - covered });
    if (envelopeId && state.envelopes.has(envelopeId)) state.envelopes.set(envelopeId, currentEnvelopeRemaining + amount);
    if (transaction.budget_id && state.budgets.has(transaction.budget_id)) state.budgets.set(transaction.budget_id, Math.max(0, state.budgets.get(transaction.budget_id) - amount));
  } else if (type === TRANSACTION_TYPES.TRANSFER) {
    mutateAccount(state, transaction.source_account_id, { balance: amount, available: amount });
    mutateAccount(state, transaction.destination_account_id, { balance: -amount, available: -amount });
  } else if ([TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.REFUND].includes(type)) {
    mutateAccount(state, transaction.destination_account_id, { balance: -amount, available: -amount });
  } else if (type === TRANSACTION_TYPES.ADJUSTMENT) {
    mutateAccount(state, transaction.source_account_id, { balance: -amount, available: -amount });
  }
  return -oldSafeDelta;
};

const applyTransactionImpact = ({ state, transaction, accountBalances }) => {
  const type = transaction?.transaction_type;
  const amount = Math.max(0, asMoney(transaction?.amount));
  if (!amount) return 0;
  const envelopeId = transaction.envelope_period_id || "";
  const envelopeRemaining = envelopeId && state.envelopes.has(envelopeId) ? state.envelopes.get(envelopeId) : 0;
  const safeDelta = transactionSafeDelta({ transaction, accountBalances, envelopeRemaining });

  if (type === TRANSACTION_TYPES.EXPENSE) {
    const covered = envelopeId ? Math.min(amount, Math.max(0, envelopeRemaining)) : 0;
    mutateAccount(state, transaction.source_account_id, { balance: -amount, available: -(amount - covered) });
    if (envelopeId && state.envelopes.has(envelopeId)) state.envelopes.set(envelopeId, envelopeRemaining - amount);
    if (transaction.budget_id && state.budgets.has(transaction.budget_id)) state.budgets.set(transaction.budget_id, state.budgets.get(transaction.budget_id) + amount);
  } else if (type === TRANSACTION_TYPES.TRANSFER) {
    mutateAccount(state, transaction.source_account_id, { balance: -amount, available: -amount });
    mutateAccount(state, transaction.destination_account_id, { balance: amount, available: amount });
  } else if ([TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.REFUND].includes(type)) {
    mutateAccount(state, transaction.destination_account_id, { balance: amount, available: amount });
  } else if (type === TRANSACTION_TYPES.ADJUSTMENT) {
    mutateAccount(state, transaction.source_account_id, { balance: amount, available: amount });
  }
  return safeDelta;
};

export const parseTransactionAmount = (value) => {
  try {
    return parseRupiah(value);
  } catch {
    return null;
  }
};

const affectedAccountIds = ({ transaction, form }) => new Set([
  transaction?.source_account_id,
  transaction?.destination_account_id,
  form.source_account_id,
  form.destination_account_id,
].filter(Boolean));

const accountImpactChange = ({ accountBalances, currentState, projectedState, accountId }) => {
  const account = accountById(accountBalances, accountId);
  const before = currentState.accounts.get(accountId);
  const after = projectedState.accounts.get(accountId);
  if (!account || !before || !after) return null;
  return {
    account,
    accountId,
    balanceBefore: before.balance,
    balanceAfter: after.balance,
    availableBefore: before.available,
    availableAfter: after.available,
  };
};

const accountImpactChanges = ({ accountBalances, currentState, projectedState, transaction, form }) => (
  [...affectedAccountIds({ transaction, form })]
    .map((accountId) => accountImpactChange({ accountBalances, currentState, projectedState, accountId }))
    .filter(Boolean)
);

const projectedAccountState = (projectedState, accountId) => (
  accountId ? projectedState.accounts.get(accountId) || null : null
);

const accountAvailableBefore = (account) => {
  if (!account) return null;
  return asMoney(account.available_balance ?? account.balance);
};

const stateBalance = (state) => state?.balance ?? null;
const stateAvailable = (state) => state?.available ?? null;

const remainingBudget = (budget, usedAmount) => {
  if (!budget) return null;
  return Math.max(0, asMoney(budget.amount) - asMoney(usedAmount));
};

const impactEntities = ({ accountBalances, envelopes, budgets, form, projectedState }) => {
  const source = accountById(accountBalances, form.source_account_id);
  const destination = accountById(accountBalances, form.destination_account_id);
  const envelope = envelopes.find((item) => item.envelope_period_id === form.envelope_period_id) || null;
  const budget = budgets.find((item) => item.budget_id === form.budget_id) || null;
  return {
    source,
    destination,
    envelope,
    budget,
    sourceState: projectedAccountState(projectedState, form.source_account_id),
    destinationState: projectedAccountState(projectedState, form.destination_account_id),
    envelopeAfter: envelope ? projectedState.envelopes.get(envelope.envelope_period_id) : null,
    budgetUsedAfter: budget ? projectedState.budgets.get(budget.budget_id) : null,
  };
};

export const transactionImpact = ({ accountBalances = [], envelopes = [], budgets = [], safeToSpend = 0, form, transaction = null }) => {
  const amount = parseTransactionAmount(form.amount);
  if (amount === null) return null;
  const currentState = impactState({ accountBalances, envelopes, budgets });
  const projectedState = impactState({ accountBalances, envelopes, budgets });
  const reverseSafeDelta = reverseTransactionImpact({ state: projectedState, transaction, accountBalances });
  const nextSafeDelta = applyTransactionImpact({ state: projectedState, transaction: { ...form, amount }, accountBalances });
  const safeToSpendBefore = Math.max(0, asMoney(safeToSpend));
  const safeToSpendAfter = Math.max(0, safeToSpendBefore + reverseSafeDelta + nextSafeDelta);
  const accountChanges = accountImpactChanges({ accountBalances, currentState, projectedState, transaction, form });
  const entities = impactEntities({ accountBalances, envelopes, budgets, form, projectedState });
  return {
    amount,
    transactionType: form.transaction_type,
    isEdit: Boolean(transaction),
    source: entities.source,
    destination: entities.destination,
    envelope: entities.envelope,
    budget: entities.budget,
    accountChanges,
    sourceAfter: stateBalance(entities.sourceState),
    sourceAvailable: accountAvailableBefore(entities.source),
    sourceAvailableAfter: stateAvailable(entities.sourceState),
    destinationAfter: stateBalance(entities.destinationState),
    destinationAvailable: accountAvailableBefore(entities.destination),
    destinationAvailableAfter: stateAvailable(entities.destinationState),
    envelopeAfter: entities.envelopeAfter,
    budgetRemainingBefore: remainingBudget(entities.budget, entities.budget?.used_amount),
    budgetRemainingAfter: remainingBudget(entities.budget, entities.budgetUsedAfter),
    safeToSpendBefore,
    safeToSpendAfter,
    safeToSpendDelta: safeToSpendAfter - safeToSpendBefore,
  };
};
