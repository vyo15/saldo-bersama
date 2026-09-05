import { useEffect, useMemo } from "react";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { createIdempotencyKey } from "../../domain/security.js";
import { todayInJakarta } from "../../domain/dates.js";
import { parseRupiah } from "../../domain/money.js";
import { validateTransactionInput } from "../../domain/validation.js";
import { canRepresentAccountTransfer } from "../../domain/ownership.js";
import { createTransaction, updateTransaction } from "./transactions.api.js";
import { requestTransferApproval } from "./transferRequests.api.js";
import { clearTransactionFieldErrors } from "./transactionFormFieldErrors.js";

export const createTransactionIntentKey = () => createIdempotencyKey();

export const emptyForm = () => ({ transaction_type: TRANSACTION_TYPES.EXPENSE, transaction_date: todayInJakarta(), amount: "", source_account_id: "", destination_account_id: "", category_id: "", envelope_period_id: "", payment_method: "", merchant: "", description: "", overspend_reason: "", cost_share_mode: "unspecified", cost_share_percentages: [] });
const TRANSACTION_ERROR_SELECTORS = Object.freeze([
  ["amount", "#transaction-amount"],
  ["transaction_date", "#transaction-date"],
  ["source_account_id", "#source-account"],
  ["destination_account_id", "#destination-account"],
  ["category_id", "#category"],
  ["description", "#description"],
]);

const focusFirstTransactionError = (formElement, errors) => {
  const selector = TRANSACTION_ERROR_SELECTORS.find(([field]) => errors?.[field])?.[1] || '[aria-invalid="true"]';
  window.requestAnimationFrame(() => {
    const target = formElement?.querySelector?.(selector) || formElement?.querySelector?.('[aria-invalid="true"]');
    if (!target) return;
    target.scrollIntoView?.({ block: "center", behavior: "smooth" });
    target.focus?.({ preventScroll: true });
  });
};

const editableTransactionForm = (transaction) => {
  const editable = { ...transaction }; delete editable.scope; delete editable.owner_user_id; delete editable.cost_share_json;
  const percentages = Array.isArray(transaction.cost_share)
    ? transaction.cost_share.map((item) => ({ user_id: item.user_id, percentage: Number(item.basis_points || 0) / 100 }))
    : [];
  return { ...emptyForm(), ...editable, amount: String(transaction.amount || ""), overspend_reason: transaction.overspend_reason || "", cost_share_mode: transaction.cost_share_mode || "unspecified", cost_share_percentages: percentages };
};

const initialTransactionForm = ({ initialType, initialSourceAccountId, initialDraft }) => {
  const base = { ...emptyForm(), source_account_id: initialSourceAccountId || "" };
  const source = initialDraft && typeof initialDraft === "object" ? initialDraft : {};
  const transactionType = [TRANSACTION_TYPES.EXPENSE, TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.TRANSFER].includes(source.transaction_type)
    ? source.transaction_type
    : initialType;
  return {
    ...base,
    transaction_type: transactionType,
    transaction_date: String(source.transaction_date || base.transaction_date),
    amount: source.amount ? String(source.amount) : "",
    source_account_id: source.source_account_id ? String(source.source_account_id) : base.source_account_id,
    destination_account_id: String(source.destination_account_id || ""),
    category_id: String(source.category_id || ""),
    envelope_period_id: String(source.envelope_period_id || ""),
    payment_method: String(source.payment_method || ""),
    merchant: String(source.merchant || ""),
    description: String(source.description || ""),
  };
};

export const useTransactionReset = ({ open, transaction, initialType, initialSourceAccountId, initialDraft, setForm, setErrors, setConfirmation, setSubmitState, setPostSave, setForceOverspendNote, setAllocationMode, setUnallocatedConfirmed, idempotencyKeyRef }) => {
  useEffect(() => {
    if (!open) return;
    setForm(transaction ? editableTransactionForm(transaction) : initialTransactionForm({ initialType, initialSourceAccountId, initialDraft }));
    setErrors({}); setConfirmation(null); setSubmitState({ status: "idle", error: null }); setPostSave(null); setForceOverspendNote(false); setAllocationMode(transaction || initialDraft?.envelope_period_id ? "manual" : "auto"); setUnallocatedConfirmed(false); idempotencyKeyRef.current = createTransactionIntentKey();
  }, [initialDraft, initialSourceAccountId, initialType, open, transaction, setForm, setErrors, setConfirmation, setSubmitState, setPostSave, setForceOverspendNote, setAllocationMode, setUnallocatedConfirmed, idempotencyKeyRef]);
};

export const useTransactionData = (bootstrap, overview, form) => {
  const accountBalances = useMemo(() => overview?.accountBalances || [], [overview?.accountBalances]);
  const readableAccounts = useMemo(() => {
    const balanceLookup = new Map(accountBalances.map((item) => [item.account_id, item]));
    return bootstrap?.accounts?.filter((item) => item.status === "active")
      .map((item) => ({ ...item, ...(balanceLookup.get(item.account_id) || {}) })) || [];
  }, [accountBalances, bootstrap?.accounts]);
  const accounts = useMemo(() => readableAccounts.filter((item) => item.can_transact !== false), [readableAccounts]);
  const categories = useMemo(() => bootstrap?.categories?.filter((item) => item.status === "active") || [], [bootstrap?.categories]);
  const envelopes = useMemo(() => overview?.envelopes?.filter((item) => item.status === "active") || [], [overview?.envelopes]);
  const budgets = useMemo(() => overview?.budgets?.filter((item) => item.status === "active") || [], [overview?.budgets]);
  const recentTransactions = useMemo(() => overview?.recentTransactions || [], [overview?.recentTransactions]);
  const visibleCategories = useMemo(() => categories.filter((item) => item.transaction_type === form.transaction_type || (form.transaction_type === "refund" && item.transaction_type === "expense")), [categories, form.transaction_type]);
  const members = bootstrap?.members?.filter((item) => item.status === "active") || [];
  const transferRoutes = bootstrap?.transferRoutes || [];
  return { accounts, readableAccounts, accountBalances, envelopes, budgets, recentTransactions, visibleCategories, members, transferRoutes };
};

export const transactionMode = (form) => ({ isIncome: form.transaction_type === TRANSACTION_TYPES.INCOME || form.transaction_type === TRANSACTION_TYPES.REFUND, isTransfer: form.transaction_type === TRANSACTION_TYPES.TRANSFER });
const destinationAccounts = (accounts, sourceAccount, isTransfer) => isTransfer && sourceAccount
  ? accounts.filter((account) => account.account_id !== sourceAccount.account_id && canRepresentAccountTransfer(sourceAccount, account))
  : accounts;

const transactionImpactDeltas = ({ transactionType, amount, envelopeRemaining, hasEnvelope }) => {
  if (transactionType === TRANSACTION_TYPES.ADJUSTMENT) return { sourceDelta: amount, availableDelta: amount };
  if (transactionType === TRANSACTION_TYPES.TRANSFER) return { sourceDelta: -amount, availableDelta: -amount };
  if (transactionType === TRANSACTION_TYPES.EXPENSE) {
    const freeDebit = hasEnvelope ? Math.max(0, amount - envelopeRemaining) : amount;
    return { sourceDelta: -amount, availableDelta: -freeDebit };
  }
  return { sourceDelta: 0, availableDelta: 0 };
};

export const parseTransactionAmount = (value) => { try { return parseRupiah(value); } catch { return null; } };
const balanceAfter = (item, balance, delta) => item ? balance + delta : null;

export const transactionImpact = ({ accountBalances, envelopes, form }) => {
  const amount = parseTransactionAmount(form.amount);
  if (amount === null) return null;
  const source = accountBalances.find((item) => item.account_id === form.source_account_id);
  const destination = accountBalances.find((item) => item.account_id === form.destination_account_id);
  const envelope = envelopes.find((item) => item.envelope_period_id === form.envelope_period_id);
  const sourceBalance = Number(source?.balance || 0);
  const sourceAvailable = Number(source?.available_balance ?? source?.balance ?? 0);
  const destinationBalance = Number(destination?.balance || 0);
  const destinationAvailable = Number(destination?.available_balance ?? destination?.balance ?? 0);
  const envelopeRemaining = Math.max(0, Number(envelope?.remaining_amount || 0));
  const { sourceDelta, availableDelta } = transactionImpactDeltas({ transactionType: form.transaction_type, amount, envelopeRemaining, hasEnvelope: Boolean(envelope) });
  return {
    amount,
    source,
    destination,
    envelope,
    sourceAfter: balanceAfter(source, sourceBalance, sourceDelta),
    sourceAvailable,
    sourceAvailableAfter: balanceAfter(source, sourceAvailable, availableDelta),
    destinationAfter: balanceAfter(destination, destinationBalance, amount),
    destinationAvailable,
    destinationAvailableAfter: balanceAfter(destination, destinationAvailable, amount),
    envelopeAfter: balanceAfter(envelope, envelopeRemaining, -amount),
  };
};

const requiresOverspendNote = ({ form, envelopes, forced = false }) => {
  if (form.transaction_type !== TRANSACTION_TYPES.EXPENSE || !form.envelope_period_id) return false;
  if (forced) return true;
  const envelope = envelopes.find((item) => item.envelope_period_id === form.envelope_period_id);
  const amount = parseTransactionAmount(form.amount);
  if (!envelope || envelope.overspend_policy !== "confirm" || amount === null) return false;
  return amount > Math.max(0, Number(envelope.remaining_amount || 0));
};

const transactionPreparedInput = ({ form, transaction, isIncome, confirmation, overspendNoteRequired }) => ({
  ...form,
  transaction_id: transaction?.transaction_id,
  row_version: transaction?.row_version,
  source_account_id: isIncome ? "" : form.source_account_id,
  destination_account_id: form.destination_account_id,
  overspend_reason: overspendNoteRequired ? String(form.description || form.overspend_reason || "").trim() : form.overspend_reason,
  confirm_duplicate: confirmation?.code === "POSSIBLE_DUPLICATE",
});

const handleTransactionError = (error, setters) => {
  if (error.code === "POSSIBLE_DUPLICATE") { setters.setConfirmation({ code: error.code, message: error.message, details: error.details }); setters.setSubmitState({ status: "idle", error: null }); return; }
  if (["OVERSPEND_REASON_REQUIRED", "OVER_BUDGET_CONFIRMATION_REQUIRED"].includes(error.code)) {
    setters.setForceOverspendNote(true);
    setters.setErrors((current) => ({ ...current, description: "Isi Catatan untuk menjelaskan penggunaan di atas dana tersisa pada Alokasi Dana." }));
  }
  setters.setSubmitState({ status: isOutcomeUnknownError(error) ? "unknown" : "error", error });
  if (error.details && !Array.isArray(error.details)) setters.setErrors((current) => ({ ...current, ...error.details }));
};

const prepareTransactionSubmission = ({ form, transaction, isIncome, confirmation, envelopes, forceOverspendNote }) => {
  const overspendNoteRequired = requiresOverspendNote({ form, envelopes, forced: forceOverspendNote });
  const preparedInput = transactionPreparedInput({ form, transaction, isIncome, confirmation, overspendNoteRequired });
  return {
    overspendNoteRequired,
    preparedInput,
    validation: preparedInput.overspend_reason || !overspendNoteRequired ? validateTransactionInput(preparedInput) : null,
  };
};

const finalizeTransactionSave = async ({ saved, transaction, form, continuation, refreshOverview, invalidate, onSaved, notify, notifyOnSuccess, setPostSave, setters }) => {
  invalidate(["transactions.list", "accounts.list", "envelopes.list", "budgets.list", "reports.monthly", "dashboard.overview", "investments.overview", "app.initialState"]);
  await Promise.allSettled([refreshOverview(), Promise.resolve().then(() => onSaved?.(saved))]);
  setters.setSubmitState({ status: "success", error: null });
  const created = !transaction;
  const amount = Number(saved?.amount || parseTransactionAmount(form.amount) || 0);
  const supportsPostSaveFlow = [TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.EXPENSE, TRANSACTION_TYPES.TRANSFER, TRANSACTION_TYPES.REFUND].includes(form.transaction_type);
  if (created && notifyOnSuccess && supportsPostSaveFlow) {
    const type = form.transaction_type === TRANSACTION_TYPES.INCOME ? "income" : "created";
    setPostSave({
      type,
      transactionType: form.transaction_type,
      amount,
      sourceAccountId: String(saved?.source_account_id || form.source_account_id || ""),
      destinationAccountId: String(saved?.destination_account_id || form.destination_account_id || ""),
      continuation: continuation && typeof continuation === "object" ? continuation : null,
    });
    return true;
  }
  if (notifyOnSuccess) notify({ message: transaction ? "Perubahan transaksi berhasil disimpan." : "Transaksi berhasil disimpan." });
  return false;
};

export const useTransactionSubmit = ({ form, transaction, confirmation, isIncome, approvalRequired, envelopes, forceOverspendNote, unallocatedConfirmed, setUnallocatedConfirmed, continuation, refreshOverview, invalidate, onSaved, notify, notifyOnSuccess, onClose, setPostSave, setters, idempotencyKeyRef }) => async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const submission = prepareTransactionSubmission({ form, transaction, isIncome, confirmation, envelopes, forceOverspendNote });
  if (submission.overspendNoteRequired && !submission.preparedInput.overspend_reason) {
    const nextErrors = { description: "Isi Catatan untuk menjelaskan penggunaan di atas dana tersisa pada Alokasi Dana." };
    setters.setErrors((current) => ({ ...current, ...nextErrors }));
    focusFirstTransactionError(formElement, nextErrors);
    return;
  }
  const validation = submission.validation;
  if (!validation.ok) { setters.setErrors(validation.errors); focusFirstTransactionError(formElement, validation.errors); return; }
  if (form.transaction_type === TRANSACTION_TYPES.EXPENSE && !form.envelope_period_id && !unallocatedConfirmed) {
    setUnallocatedConfirmed(true);
    setters.setConfirmation({
      code: "UNALLOCATED_EXPENSE",
      message: "Belum memilih Alokasi Dana. Transaksi tetap dapat dicatat, tetapi akan masuk ke Pengeluaran Belum Dialokasikan.",
    });
    return;
  }
  setters.setErrors({}); setters.setSubmitState({ status: "submitting", error: null });
  try {
    if (!transaction && approvalRequired) {
      await requestTransferApproval(validation.value, { idempotencyKey: idempotencyKeyRef.current });
      setters.setSubmitState({ status: "idle", error: null });
      notify({ message: "Pengajuan transfer dikirim. Saldo belum berubah sampai Administrator menyetujuinya." });
      onClose();
      return;
    }
    const saveTransaction = transaction ? updateTransaction : createTransaction;
    const saved = await saveTransaction(validation.value, { idempotencyKey: idempotencyKeyRef.current, rowVersion: transaction?.row_version });
    const keepOpen = await finalizeTransactionSave({ saved, transaction, form, continuation, refreshOverview, invalidate, onSaved, notify, notifyOnSuccess, setPostSave, setters });
    if (!keepOpen) onClose();
  } catch (error) { handleTransactionError(error, setters); }
};

export const applySourceAccountChange = ({ nextId, accounts, envelopes, isTransfer, setForm, setErrors, setConfirmation, setSubmitState }) => {
  const nextAccount = accounts.find((item) => item.account_id === nextId) || null;
  setConfirmation(null);
  setSubmitState({ status: "idle", error: null });
  setErrors((current) => clearTransactionFieldErrors(current, "source_account_id"));
  setForm((current) => {
    const destination = accounts.find((item) => item.account_id === current.destination_account_id) || null;
    const envelope = envelopes.find((item) => item.envelope_period_id === current.envelope_period_id) || null;
    const sharedExpense = current.transaction_type === TRANSACTION_TYPES.EXPENSE && nextAccount?.owner_scope === "shared";
    const invalidDestination = isTransfer && destination && (
      destination.account_id === nextId || !canRepresentAccountTransfer(nextAccount, destination)
    );
    return {
      ...current,
      source_account_id: nextId,
      destination_account_id: invalidDestination ? "" : current.destination_account_id,
      envelope_period_id: envelope && envelope.source_account_id !== nextId ? "" : current.envelope_period_id,
      cost_share_mode: sharedExpense ? current.cost_share_mode : "unspecified",
      cost_share_percentages: sharedExpense ? current.cost_share_percentages : [],
    };
  });
};

export const isMobileTransferPresentation = ({ presentation, isTransfer, transaction, mobileLayout }) => !transaction && isTransfer && (presentation === "mobile-transfer" || mobileLayout);

const transferRouteFor = (routes, sourceAccountId, destinationAccountId) => (routes || []).find((route) =>
  route.source_account_id === sourceAccountId && route.destination_account_id === destinationAccountId
) || null;

export const requiresTransferApproval = ({ transaction, isTransfer, transferRoutes, form }) => {
  if (transaction || !isTransfer) return false;
  return transferRouteFor(transferRoutes, form.source_account_id, form.destination_account_id)?.mode === "approval_required";
};

export const transactionDerivedData = ({ data, form, isTransfer }) => {
  const sourceAccount = data.accounts.find((item) => item.account_id === form.source_account_id) || null;
  const routeEligibleDestinations = isTransfer && sourceAccount
    ? data.readableAccounts.filter((account) => transferRouteFor(data.transferRoutes, sourceAccount.account_id, account.account_id))
    : data.accounts;
  const compatibleDestinationAccounts = destinationAccounts(routeEligibleDestinations, sourceAccount, isTransfer);
  const compatibleEnvelopes = sourceAccount
    ? data.envelopes.filter((item) => item.source_account_id === sourceAccount.account_id && item.can_record_expense === true)
    : [];
  return { compatibleDestinationAccounts, compatibleEnvelopes };
};

export const useMobileTransferDestination = ({ open, enabled, destinationAccountId, compatibleDestinationAccounts, setForm, setErrors }) => {
  useEffect(() => {
    if (!open || !enabled || destinationAccountId || compatibleDestinationAccounts.length === 0) return;
    const firstDestinationId = compatibleDestinationAccounts[0].account_id;
    setErrors((current) => clearTransactionFieldErrors(current, "destination_account_id"));
    setForm((current) => {
      if (current.destination_account_id) return current;
      return { ...current, destination_account_id: firstDestinationId };
    });
  }, [compatibleDestinationAccounts, destinationAccountId, enabled, open, setErrors, setForm]);
};

export const useSmartAllocationSelection = ({ open, transaction, allocationMode, candidates, form, setForm, setErrors }) => {
  useEffect(() => {
    if (!open || transaction || allocationMode !== "auto" || form.transaction_type !== TRANSACTION_TYPES.EXPENSE) return;
    const nextEnvelopeId = candidates.length === 1 ? candidates[0].envelope.envelope_period_id : "";
    setErrors((current) => clearTransactionFieldErrors(current, "envelope_period_id"));
    setForm((current) => current.envelope_period_id === nextEnvelopeId ? current : { ...current, envelope_period_id: nextEnvelopeId });
  }, [allocationMode, candidates, form.transaction_type, open, setErrors, setForm, transaction]);
};

const canReuseSourceAccount = (account, transactionType) => {
  if (!account) return false;
  if (transactionType === TRANSACTION_TYPES.TRANSFER) return Number(account.available_balance ?? account.balance ?? 0) > 0;
  return Number(account.balance ?? 0) > 0;
};

const anotherTransactionForm = ({ postSave, accounts }) => {
  const next = { ...emptyForm(), transaction_type: postSave.transactionType };
  if (postSave.transactionType === TRANSACTION_TYPES.INCOME) {
    const destination = accounts.find((item) => item.account_id === postSave.destinationAccountId) || null;
    if (destination) next.destination_account_id = destination.account_id;
    return next;
  }
  const source = accounts.find((item) => item.account_id === postSave.sourceAccountId) || null;
  if (canReuseSourceAccount(source, postSave.transactionType)) next.source_account_id = source.account_id;
  return next;
};

export const resetForAnotherTransaction = ({ postSave, accounts, setForm, setErrors, setConfirmation, setSubmitState, setForceOverspendNote, setAllocationMode, setUnallocatedConfirmed, setPostSave, idempotencyKeyRef, amountRef }) => {
  if (!postSave) return;
  setForm(anotherTransactionForm({ postSave, accounts }));
  setErrors({});
  setConfirmation(null);
  setSubmitState({ status: "idle", error: null });
  setForceOverspendNote(false);
  setAllocationMode("auto");
  setUnallocatedConfirmed(false);
  setPostSave(null);
  idempotencyKeyRef.current = createTransactionIntentKey();
  window.requestAnimationFrame(() => amountRef.current?.focus?.());
};

