import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { formatRupiah } from "../../domain/money.js";

export const UNALLOCATED_NEED_VALUE = "__unallocated_need__";

export const needSelectionValue = ({ budgetId = "", allocationMode = "auto" } = {}) => (
  budgetId || (allocationMode === "manual" ? UNALLOCATED_NEED_VALUE : "")
);

const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const periodFromDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value).slice(0, 7) : "";
const dateInsideEnvelope = (date, item) => !date || (!item.period_start || date >= item.period_start) && (!item.period_end || date <= item.period_end);

const accountUsageRank = (recentTransactions = []) => {
  const ranks = new Map();
  recentTransactions.forEach((item, index) => {
    const accountId = String(item?.source_account_id || "");
    if (accountId && !ranks.has(accountId)) ranks.set(accountId, index);
  });
  return ranks;
};

const sourceAccountHasFunds = (item, transactionType) => {
  if (item.allow_negative) return true;
  if (transactionType === TRANSACTION_TYPES.TRANSFER) return asNumber(item.available_balance ?? item.balance) > 0;
  if (transactionType === TRANSACTION_TYPES.EXPENSE) return asNumber(item.balance) > 0;
  return true;
};

export const sourceAccountPicker = ({ accounts = [], transactionType, selectedAccountId = "", recentTransactions = [] }) => {
  const ranks = accountUsageRank(recentTransactions);
  const baseOrder = new Map(accounts.map((item, index) => [item.account_id, index]));
  const selectedId = String(selectedAccountId || "");
  return accounts
    .filter((item) => item.account_id === selectedId || sourceAccountHasFunds(item, transactionType))
    .sort((left, right) => {
      if (left.account_id === selectedId) return -1;
      if (right.account_id === selectedId) return 1;
      const leftRank = ranks.has(left.account_id) ? ranks.get(left.account_id) : Number.MAX_SAFE_INTEGER;
      const rightRank = ranks.has(right.account_id) ? ranks.get(right.account_id) : Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return (baseOrder.get(left.account_id) ?? Number.MAX_SAFE_INTEGER) - (baseOrder.get(right.account_id) ?? Number.MAX_SAFE_INTEGER);
    });
};

export const frequentCategories = ({ recentTransactions = [], sourceAccountId = "", visibleCategories = [], limit = 4 }) => {
  if (!sourceAccountId) return [];
  const allowed = new Map(visibleCategories.map((item) => [item.category_id, item]));
  const result = [];
  const seen = new Set();
  for (const item of recentTransactions) {
    if (item.transaction_type !== TRANSACTION_TYPES.EXPENSE || item.source_account_id !== sourceAccountId) continue;
    const category = allowed.get(item.category_id);
    if (!category || seen.has(category.category_id)) continue;
    seen.add(category.category_id);
    result.push(category);
    if (result.length >= limit) break;
  }
  return result;
};

export const smartAllocationCandidates = ({ budgets = [], envelopes = [], form }) => {
  if (form.transaction_type !== TRANSACTION_TYPES.EXPENSE || !form.source_account_id || !form.category_id) return [];
  const period = periodFromDate(form.transaction_date);
  const matchingRules = new Map();
  budgets.forEach((budget) => {
    if (!budget.envelope_rule_id || budget.category_id !== form.category_id) return;
    if (period && budget.period_key && budget.period_key !== period) return;
    const current = matchingRules.get(budget.envelope_rule_id) || [];
    matchingRules.set(budget.envelope_rule_id, [...current, budget]);
  });
  const seen = new Set();
  return envelopes.reduce((items, envelope) => {
    if (envelope.source_account_id !== form.source_account_id || !dateInsideEnvelope(form.transaction_date, envelope)) return items;
    const needs = matchingRules.get(envelope.envelope_rule_id) || [];
    needs.forEach((need) => {
      const key = `${envelope.envelope_period_id}:${need.budget_id}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ envelope, need });
    });
    return items;
  }, []);
};

export const mergeContextualAllocationCandidate = ({ candidates = [], context = null, form }) => {
  const budget = context?.budget;
  const envelope = context?.envelope;
  if (!budget?.budget_id || !envelope?.envelope_period_id || !form?.budget_id) return candidates;
  if (String(form.budget_id) !== String(budget.budget_id)) return candidates;
  if (budget.category_id !== form.category_id || envelope.source_account_id !== form.source_account_id) return candidates;
  if (!dateInsideEnvelope(form.transaction_date, envelope)) return candidates;
  if (candidates.some((item) => item.need.budget_id === budget.budget_id && item.envelope.envelope_period_id === envelope.envelope_period_id)) return candidates;
  return [{ need: budget, envelope }, ...candidates];
};


export const contextualPlanningData = ({ budgets = [], envelopes = [], candidates = [], form = {} } = {}) => {
  const selected = candidates.find((item) => item.need?.budget_id === form.budget_id && item.envelope?.envelope_period_id === form.envelope_period_id) || null;
  if (!selected) return { budgets, envelopes };
  const mergedBudgets = budgets.some((item) => item.budget_id === selected.need.budget_id) ? budgets : [selected.need, ...budgets];
  const mergedEnvelopes = envelopes.some((item) => item.envelope_period_id === selected.envelope.envelope_period_id) ? envelopes : [selected.envelope, ...envelopes];
  return { budgets: mergedBudgets, envelopes: mergedEnvelopes };
};

export const earlyFundsWarning = ({ transactionType, amount, source, envelope }) => {
  const value = asNumber(amount);
  if (value <= 0 || !source || Boolean(source.allow_negative)) return null;
  const available = Math.max(0, asNumber(source.available_balance ?? source.balance));
  if (transactionType === TRANSACTION_TYPES.TRANSFER) {
    if (value <= available) return null;
    return { title: "Dana tersedia tidak cukup", message: `Kurang ${formatRupiah(value - available)}. Kurangi nominal atau pilih rekening sumber lain.`, shortage: value - available };
  }
  if (transactionType !== TRANSACTION_TYPES.EXPENSE) return null;
  if (!envelope) {
    if (value <= available) return null;
    return { title: "Dana rekening tidak cukup", message: `Kurang ${formatRupiah(value - available)}. Kurangi nominal atau pilih rekening sumber lain.`, shortage: value - available };
  }
  const remaining = Math.max(0, asNumber(envelope.remaining_amount));
  const uncovered = Math.max(0, value - remaining);
  if (uncovered <= 0) return null;
  if (envelope.overspend_policy === "block") {
    return { title: "Melebihi batas Alokasi", message: `Nominal melebihi sisa ${envelope.name} sebesar ${formatRupiah(uncovered)}. Pilih Dana Tersedia, Kebutuhan lain, atau kurangi nominal.`, shortage: uncovered };
  }
  if (uncovered > available) {
    return { title: "Dana tambahan tidak cukup", message: `Sisa ${envelope.name} kurang ${formatRupiah(uncovered)}, sementara dana tersedia rekening hanya ${formatRupiah(available)}.`, shortage: uncovered - available };
  }
  return { title: "Melebihi sisa Alokasi Dana", message: `Kelebihan ${formatRupiah(uncovered)} akan memakai dana tersedia rekening dan tetap mengikuti konfirmasi Alokasi Dana.`, shortage: 0 };
};
