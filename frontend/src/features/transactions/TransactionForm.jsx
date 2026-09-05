import { APP_MEDIA } from "../../config/layout.js";
import { useMemo, useRef, useState } from "react";
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
  const modalTitle = <span className={styles.modalTitle}><span className={styles.walletBubble} aria-hidden="true"><img src="/login/assets/mobile/wallet.webp" width="797" height="900" alt="" draggable="false" decoding="async" /></span><span className={styles.modalTitleCopy}><span className={styles.modalTitleText}>{resolvedTitle}</span>{description ? <small>{description}</small> : null}</span></span>;
  const modalFooter = <><Button type="button" onClick={onClose} disabled={submitting || outcomeUnknown}>Batal</Button><Button type="submit" form="transaction-form" variant="primary" icon={FiCheck} loading={submitting}>{progressLabel}</Button></>;
  return {
    modalTitle,
    modalDescription: undefined,
    modalFooter,
    modalClassName: styles.modal,
    initialFocusRef: mobileLayout ? undefined : amountRef,
    closeIcon: undefined,
    closeLabel: "Tutup dialog",
    formClassName: `form-grid ${styles.form}`,
    mobileSwipeToClose: true,
  };
};

const TransactionFormBody = ({ mobileTransferMode, fields }) => {
  if (mobileTransferMode) return <MobileTransferFields {...fields} />;
  return <fieldset className={styles.intentFieldset} disabled={fields.outcomeUnknown}><TransactionFields {...fields} /></fieldset>;
};

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

  const data = useTransactionData(bootstrap, overview, form);
  const { isIncome, isTransfer } = transactionMode(form);
  const mobileTransferMode = isMobileTransferPresentation({ presentation, isTransfer, transaction, mobileLayout });
  const { compatibleDestinationAccounts, compatibleEnvelopes } = transactionDerivedData({ data, form, isTransfer });
  const approvalRequired = requiresTransferApproval({ transaction, isTransfer, transferRoutes: data.transferRoutes, form });
  const allocationCandidates = useMemo(() => smartAllocationCandidates({ budgets: data.budgets, envelopes: compatibleEnvelopes, form }), [compatibleEnvelopes, data.budgets, form]);
  const impact = useMemo(() => transactionImpact({ accountBalances: data.accountBalances, envelopes: data.envelopes, form }), [data.accountBalances, data.envelopes, form]);
  const selectedSource = data.accountBalances.find((item) => item.account_id === form.source_account_id) || null;
  const selectedEnvelope = data.envelopes.find((item) => item.envelope_period_id === form.envelope_period_id) || null;
  const fundsWarning = form.transaction_date === todayInJakarta()
    ? earlyFundsWarning({ transactionType: form.transaction_type, amount: parseTransactionAmount(form.amount) || 0, source: selectedSource, envelope: selectedEnvelope })
    : null;
  const outcomeUnknown = submitState.status === "unknown";
  const update = (field, value) => {
    if (outcomeUnknown) return;
    setConfirmation(null);
    setUnallocatedConfirmed(false);
    setSubmitState({ status: "idle", error: null });
    setErrors((current) => clearTransactionFieldErrors(current, field));
    if (["transaction_type", "amount", "envelope_period_id"].includes(field)) setForceOverspendNote(false);
    if (!transaction && ["transaction_type", "category_id", "transaction_date"].includes(field)) setAllocationMode("auto");
    setForm((current) => {
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
    setForceOverspendNote(false);
    setUnallocatedConfirmed(false);
    if (!transaction) setAllocationMode("auto");
    applySourceAccountChange({ nextId, accounts: data.accounts, envelopes: data.envelopes, isTransfer, setForm, setErrors, setConfirmation, setSubmitState });
  };
  const onEnvelopeChange = (nextId) => {
    if (outcomeUnknown) return;
    setAllocationMode("manual");
    setForceOverspendNote(false);
    setUnallocatedConfirmed(false);
    setConfirmation(null);
    setSubmitState({ status: "idle", error: null });
    setErrors((current) => clearTransactionFieldErrors(current, "envelope_period_id"));
    setForm((current) => ({ ...current, envelope_period_id: nextId }));
  };
  const setters = { setErrors, setConfirmation, setSubmitState, setForceOverspendNote };
  const handleSubmit = useTransactionSubmit({ form, transaction, confirmation, isIncome, approvalRequired, envelopes: data.envelopes, forceOverspendNote, unallocatedConfirmed, setUnallocatedConfirmed, continuation, refreshOverview, invalidate, onSaved, notify, notifyOnSuccess, onClose, setPostSave, setters, idempotencyKeyRef });
  const submitting = submitState.status === "submitting";

  useSmartAllocationSelection({ open, transaction, allocationMode, candidates: allocationCandidates, form, setForm, setErrors });
  useMobileTransferDestination({ open, enabled: mobileTransferMode, destinationAccountId: form.destination_account_id, compatibleDestinationAccounts, setForm, setErrors });

  const onCostShareChange = () => setErrors((current) => clearTransactionFieldErrors(current, "cost_share_mode"));

  const fields = { form, setForm, update, errors, amountRef, accounts: data.accounts, accountBalances: data.accountBalances, envelopes: data.envelopes, recentTransactions: data.recentTransactions, visibleCategories: data.visibleCategories, members: data.members, isIncome, isTransfer, compatibleDestinationAccounts, compatibleEnvelopes, allocationCandidates, onEnvelopeChange, setConfirmation, setSubmitState, impact, fundsWarning, confirmation, submitState, lockType, onSourceAccountChange, onCostShareChange, submitting, outcomeUnknown, approvalRequired };
  const modal = resolveTransactionPresentation({ mobileTransferMode, transaction, title, description, submitLabel, submittingLabel, submitting, outcomeUnknown, confirmation, onClose, amountRef, mobileLayout });

  const addAnother = () => resetForAnotherTransaction({ postSave, accounts: data.accounts, setForm, setErrors, setConfirmation, setSubmitState, setForceOverspendNote, setAllocationMode, setUnallocatedConfirmed, setPostSave, idempotencyKeyRef, amountRef });

  if (postSave) return <TransactionPostSaveModal open={open} postSave={postSave} accounts={data.readableAccounts} onClose={onClose} navigate={navigate} onAddAnother={addAnother} />;

  return <Modal open={open} onClose={onClose} dismissible={!submitting && !outcomeUnknown} title={modal.modalTitle} description={modal.modalDescription} size="lg" initialFocusRef={modal.initialFocusRef} className={modal.modalClassName} footer={modal.modalFooter} closeIcon={modal.closeIcon} closeLabel={modal.closeLabel} mobileSwipeToClose={modal.mobileSwipeToClose}><form id="transaction-form" className={modal.formClassName} onSubmit={handleSubmit} noValidate><TransactionFormBody mobileTransferMode={mobileTransferMode} fields={fields} /></form></Modal>;
};

export default TransactionForm;
