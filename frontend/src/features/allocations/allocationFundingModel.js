const safeAmount = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

export const allocationAvailableBalance = (account) => safeAmount(account?.available_balance ?? account?.balance ?? 0);

export const fundingAccountsForItems = (accounts = [], items = [], { requestedAccountId = "", locked = false } = {}) => accounts.filter((account) => {
  const matchesTarget = items.some((item) => item.source_account_id === account.account_id);
  const isRequested = Boolean(requestedAccountId) && account.account_id === requestedAccountId;
  if (locked) return isRequested && matchesTarget;
  return allocationAvailableBalance(account) > 0 && (matchesTarget || isRequested);
});

export const allocationTargetsForAccount = (items = [], sourceAccountId = "") => items.filter((item) => item.source_account_id === sourceAccountId);

export const initialAllocationFundingForm = ({ accounts = [], items = [], requestedAccountId = "", requestedEnvelopePeriodId = "", suggestedAmount = 0 } = {}) => {
  const requested = accounts.find((item) => item.account_id === requestedAccountId)?.account_id || "";
  const sourceAccountId = requested || (accounts.length === 1 ? accounts[0].account_id : "");
  const envelopes = allocationTargetsForAccount(items, sourceAccountId);
  const requestedEnvelope = envelopes.find((item) => item.envelope_period_id === requestedEnvelopePeriodId)?.envelope_period_id || "";
  return {
    sourceAccountId,
    envelopePeriodId: requestedEnvelope || (envelopes.length === 1 ? envelopes[0].envelope_period_id : ""),
    amount: suggestedAmount > 0 ? String(suggestedAmount) : "",
    reason: suggestedAmount > 0 ? "Menyesuaikan dana dengan total Kebutuhan" : "",
  };
};

export const allocationFundingImpact = ({ account, target, amount } = {}) => {
  const amountNumber = safeAmount(amount);
  const beforeAvailable = allocationAvailableBalance(account);
  const beforeAllocation = Number(target?.remaining_amount || 0);
  return {
    amount: amountNumber,
    beforeAvailable,
    afterAvailable: Math.max(0, beforeAvailable - amountNumber),
    beforeAllocation,
    afterAllocation: beforeAllocation + amountNumber,
    valid: Boolean(account && target && amountNumber > 0 && amountNumber <= beforeAvailable),
  };
};
