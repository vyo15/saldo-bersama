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

const resolveTransactionPresentation = ({
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

const TransactionFormBody = ({ mobileLayout, mobileTransferMode, fields }) => {
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
  const idempotencyKeyRef = useRef(createTransactionIntentKey());
  const amountRef = useRef(null);

  useTransactionReset({ open, transaction, initialType, initialSourceAccountId, initialDraft, setForm, setErrors, setConfirmation, setSubmitState, setPostSave, setForceOverspendNote, setAllocationMode, setUnallocatedConfirmed, idempotencyKeyRef });

  return { form, setForm, errors, setErrors, confirmation, setConfirmation, submitState, setSubmitState, postSave, setPostSave, forceOverspendNote, setForceOverspendNote, allocationMode, setAllocationMode, unallocatedConfirmed, setUnallocatedConfirmed, idempotencyKeyRef, amountRef };
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

const useTransactionFormActions = ({ state, data, isTransfer, outcomeUnknown, transaction, markDirty }) => {
  const setDirtyForm = (updater) => { markDirty(); state.setForm(updater); };
  const update = (field, value) => {
    if (outcomeUnknown) return;
    state.setConfirmation(null);
    state.setUnallocatedConfirmed(false);
    state.setSubmitState({ status: "idle", error: null });
    state.setErrors((current) => clearTransactionFieldErrors(current, field));
    if (["transaction_type", "amount", "envelope_period_id"].includes(field)) state.setForceOverspendNote(false);
    if (!transaction && ["transaction_type", "category_id", "transaction_date"].includes(field)) state.setAllocationMode("auto");
    setDirtyForm((current) => {
      const next = { ...current, [field]: value };
      if (["transaction_type", "category_id", "envelope_period_id"].includes(field)) next.budget_id = "";
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
    applySourceAccountChange({ nextId, accounts: data.accounts, envelopes: data.envelopes, isTransfer, setForm: setDirtyForm, setErrors: state.setErrors, setConfirmation: state.setConfirmation, setSubmitState: state.setSubmitState });
  };

  const onEnvelopeChange = (nextId) => {
    if (outcomeUnknown) return;
    state.setAllocationMode("manual");
    state.setForceOverspendNote(false);
    state.setUnallocatedConfirmed(false);
    state.setConfirmation(null);
    state.setSubmitState({ status: "idle", error: null });
    state.setErrors((current) => clearTransactionFieldErrors(current, "envelope_period_id"));
    setDirtyForm((current) => ({ ...current, envelope_period_id: nextId, budget_id: "" }));
  };

  return { update, onSourceAccountChange, onEnvelopeChange };
};


const useTransactionDraftLifecycle = ({ open, postSave, onClose, onDirtyChange }) => {
  const [draftDirty, setDraftDirty] = useState(false);

  useEffect(() => {
    if (!open || postSave) {
      setDraftDirty(false);
      onDirtyChange?.(false);
    }
  }, [onDirtyChange, open, postSave]);

  const markDirty = () => {
    setDraftDirty(true);
    onDirtyChange?.(true);
  };
  const requestClose = () => {
    if (draftDirty) {
      setDraftDirty(false);
      onDirtyChange?.(false);
    }
    onClose?.();
    return true;
  };

  return { markDirty, requestClose };
};


const transactionFields = ({ state, derived, actions, lockType, submitting }) => ({
  form: state.form,
  update: actions.update,
  errors: state.errors,
  amountRef: state.amountRef,
  accounts: derived.data.accounts,
  accountBalances: derived.data.accountBalances,
  envelopes: derived.data.envelopes,
  recentTransactions: derived.data.recentTransactions,
  visibleCategories: derived.data.visibleCategories,
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
  submitting,
  outcomeUnknown: derived.outcomeUnknown,
  approvalRequired: derived.approvalRequired,
});

const TransactionEditorModal = ({
  open, modal, draftLifecycle, submitting, outcomeUnknown, handleSubmit, mobileLayout,
  mobileTransferMode, fields, requestModalClose,
}) => (
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
    <form id="transaction-form" className={modal.formClassName} onSubmit={handleSubmit} onChangeCapture={draftLifecycle.markDirty} noValidate>
      <TransactionFormBody
        mobileLayout={mobileLayout}
        mobileTransferMode={mobileTransferMode}
        fields={fields}
      />
    </form>
  </Modal>
);

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
  onDirtyChange,
}) => {
  const { bootstrap, overview, refreshOverview, invalidate } = useFinance();
  const { notify } = useFeedback();
  const navigate = useNavigate();
  const mobileLayout = useMediaQuery(APP_MEDIA.mobile);
  const state = useTransactionFormState({ open, transaction, initialType, initialSourceAccountId, initialDraft });
  const derived = useTransactionDerived({ bootstrap, overview, form: state.form, transaction, presentation, mobileLayout, submitState: state.submitState });
  const draftLifecycle = useTransactionDraftLifecycle({ open, postSave: state.postSave, onClose, onDirtyChange });
  const actions = useTransactionFormActions({ state, data: derived.data, isTransfer: derived.isTransfer, outcomeUnknown: derived.outcomeUnknown, transaction, markDirty: draftLifecycle.markDirty });
  const setters = { setErrors: state.setErrors, setConfirmation: state.setConfirmation, setSubmitState: state.setSubmitState, setForceOverspendNote: state.setForceOverspendNote };
  const handleSubmit = useTransactionSubmit({ form: state.form, transaction, confirmation: state.confirmation, isIncome: derived.isIncome, approvalRequired: derived.approvalRequired, envelopes: derived.data.envelopes, forceOverspendNote: state.forceOverspendNote, unallocatedConfirmed: state.unallocatedConfirmed, setUnallocatedConfirmed: state.setUnallocatedConfirmed, continuation, refreshOverview, invalidate, onSaved, notify, notifyOnSuccess, onClose, setPostSave: state.setPostSave, setters, idempotencyKeyRef: state.idempotencyKeyRef });
  const submitting = state.submitState.status === "submitting";
  const outcomeUnknown = derived.outcomeUnknown;

  useSmartAllocationSelection({ open, transaction, allocationMode: state.allocationMode, candidates: derived.allocationCandidates, form: state.form, setForm: state.setForm, setErrors: state.setErrors });
  useMobileTransferDestination({ open, enabled: derived.mobileTransferMode, destinationAccountId: state.form.destination_account_id, compatibleDestinationAccounts: derived.compatibleDestinationAccounts, setForm: state.setForm, setErrors: state.setErrors });

  const fields = transactionFields({ state, derived, actions, lockType, submitting });
  const requestModalClose = draftLifecycle.requestClose;
  const modal = resolveTransactionPresentation({ mobileTransferMode: derived.mobileTransferMode, transaction, title, description, submitLabel, submittingLabel, submitting, outcomeUnknown: derived.outcomeUnknown, confirmation: state.confirmation, onClose: requestModalClose, amountRef: state.amountRef, mobileLayout });
  const addAnother = () => resetForAnotherTransaction({ postSave: state.postSave, accounts: derived.data.accounts, setForm: state.setForm, setErrors: state.setErrors, setConfirmation: state.setConfirmation, setSubmitState: state.setSubmitState, setForceOverspendNote: state.setForceOverspendNote, setAllocationMode: state.setAllocationMode, setUnallocatedConfirmed: state.setUnallocatedConfirmed, setPostSave: state.setPostSave, idempotencyKeyRef: state.idempotencyKeyRef, amountRef: state.amountRef });

  if (state.postSave) {
    return <TransactionPostSaveModal open={open} postSave={state.postSave} accounts={derived.data.readableAccounts} onClose={onClose} navigate={navigate} onAddAnother={addAnother} />;
  }

  return (
    <TransactionEditorModal
      open={open}
      modal={modal}
      draftLifecycle={draftLifecycle}
      submitting={submitting}
      outcomeUnknown={outcomeUnknown}
      handleSubmit={handleSubmit}
      mobileLayout={mobileLayout}
      mobileTransferMode={derived.mobileTransferMode}
      fields={fields}
      requestModalClose={requestModalClose}
    />
  );
};

export default TransactionForm;
