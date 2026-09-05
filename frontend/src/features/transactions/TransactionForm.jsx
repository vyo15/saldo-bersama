import { APP_MEDIA } from "../../config/layout.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FiCheck, FiChevronLeft } from "react-icons/fi";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import Modal from "../../components/common/Modal.jsx";
import Button from "../../components/common/Button.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { todayInJakarta } from "../../domain/dates.js";
import styles from "./TransactionForm.module.css";
import MobileTransactionFields from "./MobileTransactionFields.jsx";
import MobileTransactionSelectionView from "./MobileTransactionSelectionView.jsx";
import MobileTransferFields from "./MobileTransferFields.jsx";
import TransactionFields from "./components/TransactionFields.jsx";
import TransactionPostSaveModal from "./components/TransactionPostSaveModal.jsx";
import { earlyFundsWarning, smartAllocationCandidates } from "./transactionFormSmartDefaults.js";
import { clearTransactionFieldErrors } from "./transactionFormFieldErrors.js";
import {
  applySourceAccountChange,
  createTransactionIntentKey,
  emptyForm,
  isMobileTransferPresentation,
  parseTransactionAmount,
  requiresTransferApproval,
  resetForAnotherTransaction,
  transactionDerivedData,
  transactionImpact,
  transactionMode,
  useMobileTransferDestination,
  useSmartAllocationSelection,
  useTransactionData,
  useTransactionReset,
  useTransactionSubmit,
} from "./transactionFormController.js";

const mobileSelectionTitle = (selection) => ({
  category: "Pilih kategori",
  "source-account": "Pilih rekening sumber",
  "destination-account": "Pilih rekening tujuan",
  envelope: "Pilih Alokasi Dana",
})[selection] || "Pilih data transaksi";

const resolveTransactionPresentation = ({
  mobileSelection,
  mobileTransferMode,
  transaction,
  title,
  description,
  submitLabel,
  submittingLabel,
  submitting,
  outcomeUnknown,
  confirmation,
  onClose,
  amountRef,
  mobileLayout,
}) => {
  if (mobileSelection) {
    return {
      modalTitle: mobileSelectionTitle(mobileSelection),
      modalDescription: undefined,
      modalFooter: null,
      modalClassName: mobileTransferMode
        ? `${styles.modal} ${styles.mobileTransferModal} ${styles.mobileSelectionModal}`
        : `${styles.modal} ${styles.mobileSelectionModal}`,
      initialFocusRef: undefined,
      closeIcon: FiChevronLeft,
      closeLabel: "Kembali ke transaksi",
      formClassName: styles.mobileSelectionForm,
      mobileSwipeToClose: true,
    };
  }

  if (mobileTransferMode) {
    return {
      modalTitle: "Transfer",
      modalDescription: "",
      modalFooter: null,
      modalClassName: `${styles.modal} ${styles.mobileTransferModal}`,
      initialFocusRef: undefined,
      closeIcon: FiChevronLeft,
      closeLabel: "Kembali",
      formClassName: styles.mobileTransferForm,
      mobileSwipeToClose: true,
    };
  }

  const resolvedTitle = title || (transaction ? "Edit transaksi" : "Tambah transaksi");
  const idleSubmitLabel = confirmation ? "Simpan tetap" : transaction ? "Simpan perubahan" : submitLabel || "Simpan transaksi";
  const progressLabel = submitting ? submittingLabel || "Menyimpan..." : outcomeUnknown ? "Coba lagi data yang sama" : idleSubmitLabel;
  const modalTitle = (
    <span className={styles.modalTitle}>
      <span className={styles.walletBubble} aria-hidden="true">
        <img src="/login/assets/mobile/wallet.webp" width="797" height="900" alt="" draggable="false" decoding="async" />
      </span>
      <span className={styles.modalTitleCopy}>
        <span className={styles.modalTitleText}>{resolvedTitle}</span>
        {description ? <small>{description}</small> : null}
      </span>
    </span>
  );
  const modalFooter = (
    <>
      <Button type="button" onClick={onClose} disabled={submitting || outcomeUnknown}>Batal</Button>
      <Button type="submit" form="transaction-form" variant="primary" icon={FiCheck} loading={submitting}>{progressLabel}</Button>
    </>
  );
  return {
    modalTitle,
    modalDescription: undefined,
    modalFooter,
    modalClassName: styles.modal,
    initialFocusRef: mobileLayout ? undefined : amountRef,
    closeIcon: undefined,
    closeLabel: "Tutup dialog",
    formClassName: mobileLayout ? styles.mobileComposerForm : `form-grid ${styles.form}`,
    mobileSwipeToClose: true,
  };
};

const TransactionFormBody = ({ mobileLayout, mobileTransferMode, mobileSelection, closeMobileSelection, fields }) => {
  if (mobileSelection) {
    return <MobileTransactionSelectionView selection={mobileSelection} fields={fields} onBack={closeMobileSelection} />;
  }
  if (mobileTransferMode) return <MobileTransferFields {...fields} />;
  if (mobileLayout) {
    return (
      <fieldset className={styles.intentFieldset} disabled={fields.outcomeUnknown}>
        <MobileTransactionFields {...fields} />
      </fieldset>
    );
  }
  return (
    <fieldset className={styles.intentFieldset} disabled={fields.outcomeUnknown}>
      <TransactionFields {...fields} />
    </fieldset>
  );
};

const useTransactionFormState = ({ open, transaction, initialType, initialSourceAccountId, initialDraft }) => {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [confirmation, setConfirmation] = useState(null);
  const [submitState, setSubmitState] = useState({ status: "idle", error: null });
  const [postSave, setPostSave] = useState(null);
  const [forceOverspendNote, setForceOverspendNote] = useState(false);
  const [allocationMode, setAllocationMode] = useState("auto");
  const [unallocatedConfirmed, setUnallocatedConfirmed] = useState(false);
  const [mobileSelection, setMobileSelection] = useState(null);
  const idempotencyKeyRef = useRef(createTransactionIntentKey());
  const amountRef = useRef(null);

  useTransactionReset({ open, transaction, initialType, initialSourceAccountId, initialDraft, setForm, setErrors, setConfirmation, setSubmitState, setPostSave, setForceOverspendNote, setAllocationMode, setUnallocatedConfirmed, idempotencyKeyRef });
  useEffect(() => {
    if (!open) setMobileSelection(null);
  }, [open]);

  return { form, setForm, errors, setErrors, confirmation, setConfirmation, submitState, setSubmitState, postSave, setPostSave, forceOverspendNote, setForceOverspendNote, allocationMode, setAllocationMode, unallocatedConfirmed, setUnallocatedConfirmed, mobileSelection, setMobileSelection, idempotencyKeyRef, amountRef };
};

const useTransactionDerived = ({ bootstrap, overview, form, transaction, presentation, mobileLayout, submitState }) => {
  const data = useTransactionData(bootstrap, overview, form);
  const { isIncome, isTransfer } = transactionMode(form);
  const mobileTransferMode = isMobileTransferPresentation({ presentation, isTransfer, transaction, mobileLayout });
  const derived = transactionDerivedData({ data, form, isTransfer });
  const approvalRequired = requiresTransferApproval({ transaction, isTransfer, transferRoutes: data.transferRoutes, form });
  const allocationCandidates = useMemo(
    () => smartAllocationCandidates({ budgets: data.budgets, envelopes: derived.compatibleEnvelopes, form }),
    [derived.compatibleEnvelopes, data.budgets, form],
  );
  const impact = useMemo(
    () => transactionImpact({ accountBalances: data.accountBalances, envelopes: data.envelopes, form }),
    [data.accountBalances, data.envelopes, form],
  );
  const selectedSource = data.accountBalances.find((item) => item.account_id === form.source_account_id) || null;
  const selectedEnvelope = data.envelopes.find((item) => item.envelope_period_id === form.envelope_period_id) || null;
  const fundsWarning = form.transaction_date === todayInJakarta()
    ? earlyFundsWarning({ transactionType: form.transaction_type, amount: parseTransactionAmount(form.amount) || 0, source: selectedSource, envelope: selectedEnvelope })
    : null;

  return { data, isIncome, isTransfer, mobileTransferMode, approvalRequired, allocationCandidates, impact, fundsWarning, outcomeUnknown: submitState.status === "unknown", ...derived };
};

const useTransactionFormActions = ({ state, data, isTransfer, mobileLayout, outcomeUnknown, transaction }) => {
  const update = (field, value) => {
    if (outcomeUnknown) return;
    if (field === "transaction_type") state.setMobileSelection(null);
    state.setConfirmation(null);
    state.setUnallocatedConfirmed(false);
    state.setSubmitState({ status: "idle", error: null });
    state.setErrors((current) => clearTransactionFieldErrors(current, field));
    if (["transaction_type", "amount", "envelope_period_id"].includes(field)) state.setForceOverspendNote(false);
    if (!transaction && ["transaction_type", "category_id", "transaction_date"].includes(field)) state.setAllocationMode("auto");
    state.setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "transaction_type" && value !== TRANSACTION_TYPES.EXPENSE) {
        next.envelope_period_id = "";
        next.cost_share_mode = "unspecified";
        next.cost_share_percentages = [];
      }
      return next;
    });
  };

  const onSourceAccountChange = (nextId) => {
    if (outcomeUnknown) return;
    state.setForceOverspendNote(false);
    state.setUnallocatedConfirmed(false);
    if (!transaction) state.setAllocationMode("auto");
    applySourceAccountChange({ nextId, accounts: data.accounts, envelopes: data.envelopes, isTransfer, setForm: state.setForm, setErrors: state.setErrors, setConfirmation: state.setConfirmation, setSubmitState: state.setSubmitState });
  };

  const onEnvelopeChange = (nextId) => {
    if (outcomeUnknown) return;
    state.setAllocationMode("manual");
    state.setForceOverspendNote(false);
    state.setUnallocatedConfirmed(false);
    state.setConfirmation(null);
    state.setSubmitState({ status: "idle", error: null });
    state.setErrors((current) => clearTransactionFieldErrors(current, "envelope_period_id"));
    state.setForm((current) => ({ ...current, envelope_period_id: nextId }));
  };

  const openMobileSelection = (selection) => {
    if (!mobileLayout || outcomeUnknown) return;
    state.setMobileSelection(selection);
  };
  const closeMobileSelection = () => {
    const previousSelection = state.mobileSelection;
    state.setMobileSelection(null);
    const focusId = { category: "category", "source-account": "source-account", "destination-account": "destination-account", envelope: "envelope" }[previousSelection];
    if (focusId) window.requestAnimationFrame(() => document.getElementById(focusId)?.focus?.({ preventScroll: true }));
  };
  const onCostShareChange = () => state.setErrors((current) => clearTransactionFieldErrors(current, "cost_share_mode"));
  return { update, onSourceAccountChange, onEnvelopeChange, openMobileSelection, closeMobileSelection, onCostShareChange };
};

const transactionFields = ({ state, derived, actions, lockType, submitting }) => ({
  form: state.form,
  setForm: state.setForm,
  update: actions.update,
  errors: state.errors,
  amountRef: state.amountRef,
  accounts: derived.data.accounts,
  accountBalances: derived.data.accountBalances,
  envelopes: derived.data.envelopes,
  recentTransactions: derived.data.recentTransactions,
  visibleCategories: derived.data.visibleCategories,
  members: derived.data.members,
  isIncome: derived.isIncome,
  isTransfer: derived.isTransfer,
  compatibleDestinationAccounts: derived.compatibleDestinationAccounts,
  compatibleEnvelopes: derived.compatibleEnvelopes,
  allocationCandidates: derived.allocationCandidates,
  onEnvelopeChange: actions.onEnvelopeChange,
  setConfirmation: state.setConfirmation,
  setSubmitState: state.setSubmitState,
  impact: derived.impact,
  fundsWarning: derived.fundsWarning,
  confirmation: state.confirmation,
  submitState: state.submitState,
  lockType,
  onSourceAccountChange: actions.onSourceAccountChange,
  onCostShareChange: actions.onCostShareChange,
  openMobileSelection: actions.openMobileSelection,
  submitting,
  outcomeUnknown: derived.outcomeUnknown,
  approvalRequired: derived.approvalRequired,
});

const TransactionForm = ({
  open,
  onClose,
  initialType = TRANSACTION_TYPES.EXPENSE,
  initialSourceAccountId = "",
  initialDraft = null,
  continuation = null,
  lockType = false,
  transaction = null,
  onSaved,
  title,
  description = "",
  submitLabel,
  submittingLabel,
  notifyOnSuccess = true,
  presentation = "default",
}) => {
  const { bootstrap, overview, refreshOverview, invalidate } = useFinance();
  const { notify } = useFeedback();
  const navigate = useNavigate();
  const mobileLayout = useMediaQuery(APP_MEDIA.mobile);
  const state = useTransactionFormState({ open, transaction, initialType, initialSourceAccountId, initialDraft });
  const derived = useTransactionDerived({ bootstrap, overview, form: state.form, transaction, presentation, mobileLayout, submitState: state.submitState });
  const actions = useTransactionFormActions({ state, data: derived.data, isTransfer: derived.isTransfer, mobileLayout, outcomeUnknown: derived.outcomeUnknown, transaction });
  const setters = { setErrors: state.setErrors, setConfirmation: state.setConfirmation, setSubmitState: state.setSubmitState, setForceOverspendNote: state.setForceOverspendNote };
  const handleSubmit = useTransactionSubmit({ form: state.form, transaction, confirmation: state.confirmation, isIncome: derived.isIncome, approvalRequired: derived.approvalRequired, envelopes: derived.data.envelopes, forceOverspendNote: state.forceOverspendNote, unallocatedConfirmed: state.unallocatedConfirmed, setUnallocatedConfirmed: state.setUnallocatedConfirmed, continuation, refreshOverview, invalidate, onSaved, notify, notifyOnSuccess, onClose, setPostSave: state.setPostSave, setters, idempotencyKeyRef: state.idempotencyKeyRef });
  const submitting = state.submitState.status === "submitting";
  const outcomeUnknown = derived.outcomeUnknown;

  useSmartAllocationSelection({ open, transaction, allocationMode: state.allocationMode, candidates: derived.allocationCandidates, form: state.form, setForm: state.setForm, setErrors: state.setErrors });
  useMobileTransferDestination({ open, enabled: derived.mobileTransferMode, destinationAccountId: state.form.destination_account_id, compatibleDestinationAccounts: derived.compatibleDestinationAccounts, setForm: state.setForm, setErrors: state.setErrors });

  const fields = transactionFields({ state, derived, actions, lockType, submitting });
  const mobileSelection = state.mobileSelection;
  const closeMobileSelection = actions.closeMobileSelection;
  const requestModalClose = mobileSelection ? closeMobileSelection : onClose;
  const modal = resolveTransactionPresentation({ mobileSelection, mobileTransferMode: derived.mobileTransferMode, transaction, title, description, submitLabel, submittingLabel, submitting, outcomeUnknown: derived.outcomeUnknown, confirmation: state.confirmation, onClose, amountRef: state.amountRef, mobileLayout });
  const addAnother = () => resetForAnotherTransaction({ postSave: state.postSave, accounts: derived.data.accounts, setForm: state.setForm, setErrors: state.setErrors, setConfirmation: state.setConfirmation, setSubmitState: state.setSubmitState, setForceOverspendNote: state.setForceOverspendNote, setAllocationMode: state.setAllocationMode, setUnallocatedConfirmed: state.setUnallocatedConfirmed, setPostSave: state.setPostSave, idempotencyKeyRef: state.idempotencyKeyRef, amountRef: state.amountRef });

  if (state.postSave) {
    return <TransactionPostSaveModal open={open} postSave={state.postSave} accounts={derived.data.readableAccounts} onClose={onClose} navigate={navigate} onAddAnother={addAnother} />;
  }

  return (
    <Modal
      open={open}
      onClose={requestModalClose}
      dismissible={!submitting && !outcomeUnknown}
      title={modal.modalTitle}
      description={modal.modalDescription}
      size="lg"
      initialFocusRef={modal.initialFocusRef}
      className={modal.modalClassName}
      footer={modal.modalFooter}
      closeIcon={modal.closeIcon}
      closeLabel={modal.closeLabel}
      mobileSwipeToClose={modal.mobileSwipeToClose}
    >
      <form id="transaction-form" className={modal.formClassName} onSubmit={handleSubmit} noValidate>
        <TransactionFormBody
          mobileLayout={mobileLayout}
          mobileTransferMode={derived.mobileTransferMode}
          mobileSelection={mobileSelection}
          closeMobileSelection={closeMobileSelection}
          fields={fields}
        />
      </form>
    </Modal>
  );
};

export default TransactionForm;
