import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { FiAlertTriangle, FiCalendar, FiCheck, FiChevronLeft, FiCreditCard, FiGrid, FiLayers, FiTag } from "react-icons/fi";
import Modal from "../../components/common/Modal.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { MoneyInIcon, MoneyOutIcon, RefundIcon, TransferIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import Button from "../../components/common/Button.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { isOutcomeUnknownError } from "../../services/api/errors.js";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { createIdempotencyKey } from "../../domain/security.js";
import { todayInJakarta } from "../../domain/dates.js";
import { formatRupiah, parseRupiah } from "../../domain/money.js";
import { validateTransactionInput } from "../../domain/validation.js";
import { filterByAssigneeAccess, filterByOwnership, hasSameOwnership } from "../../domain/ownership.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { userRoleLabel } from "../../shared/presentation/user.js";
import { useAuth } from "../auth/AuthContext.jsx";
import transactionWallet from "../../assets/transactions/transaction-wallet.svg";
import styles from "./TransactionForm.module.css";
import MobileTransferFields from "./MobileTransferFields.jsx";
import CostShareField from "./CostShareField.jsx";
import { createTransaction, updateTransaction } from "./transactions.api.js";

const emptyForm = () => ({ transaction_type: TRANSACTION_TYPES.EXPENSE, transaction_date: todayInJakarta(), amount: "", source_account_id: "", destination_account_id: "", category_id: "", envelope_period_id: "", payment_method: "", merchant: "", description: "", overspend_reason: "", cost_share_mode: "unspecified", cost_share_percentages: [] });
const QUICK_EXPENSE_AMOUNTS = [20_000, 50_000, 100_000, 200_000, 500_000];
const MOBILE_TRANSACTION_QUERY = "(max-width: 820px)";
const quickAmountLabel = (amount) => `${Math.round(amount / 1_000)} rb`;
const TRANSACTION_TYPE_OPTIONS = Object.freeze([
  { value: TRANSACTION_TYPES.EXPENSE, label: "Pengeluaran", icon: MoneyOutIcon, tone: "expense" },
  { value: TRANSACTION_TYPES.INCOME, label: "Pemasukan", icon: MoneyInIcon, tone: "income" },
  { value: TRANSACTION_TYPES.TRANSFER, label: "Transfer", icon: TransferIcon },
  { value: TRANSACTION_TYPES.REFUND, label: "Refund", icon: RefundIcon },
]);
const PAYMENT_METHOD_OPTIONS = Object.freeze([
  { value: "", label: "Belum dipilih" },
  { value: "transfer", label: "Transfer" },
  { value: "cash", label: "Tunai" },
  { value: "debit", label: "Kartu debit" },
  { value: "ewallet", label: "E-wallet" },
  { value: "autodebit", label: "Auto-debit" },
]);

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
    amount: source.amount ? String(source.amount) : "",
    source_account_id: source.source_account_id ? String(source.source_account_id) : base.source_account_id,
    destination_account_id: String(source.destination_account_id || ""),
    category_id: String(source.category_id || ""),
    payment_method: String(source.payment_method || ""),
    merchant: String(source.merchant || ""),
    description: String(source.description || ""),
  };
};

const useTransactionReset = ({ open, transaction, initialType, initialSourceAccountId, initialDraft, setForm, setErrors, setConfirmation, setSubmitState, setPostSave, idempotencyKeyRef }) => {
  useEffect(() => {
    if (!open) return;
    setForm(transaction ? editableTransactionForm(transaction) : initialTransactionForm({ initialType, initialSourceAccountId, initialDraft }));
    setErrors({}); setConfirmation(null); setSubmitState({ status: "idle", error: null }); setPostSave(null); idempotencyKeyRef.current = createIdempotencyKey();
  }, [initialDraft, initialSourceAccountId, initialType, open, transaction, setForm, setErrors, setConfirmation, setSubmitState, setPostSave, idempotencyKeyRef]);
};

const useTransactionData = (bootstrap, overview, form) => {
  const accountBalances = useMemo(() => overview?.accountBalances || [], [overview?.accountBalances]);
  const accounts = useMemo(() => {
    const balanceLookup = new Map(accountBalances.map((item) => [item.account_id, item]));
    return bootstrap?.accounts?.filter((item) => item.status === "active" && item.can_transact !== false)
      .map((item) => ({ ...item, ...(balanceLookup.get(item.account_id) || {}) })) || [];
  }, [accountBalances, bootstrap?.accounts]);
  const categories = useMemo(() => bootstrap?.categories?.filter((item) => item.status === "active") || [], [bootstrap?.categories]);
  const envelopes = useMemo(() => overview?.envelopes?.filter((item) => item.status === "active") || [], [overview?.envelopes]);
  const visibleCategories = useMemo(() => categories.filter((item) => item.transaction_type === form.transaction_type || (form.transaction_type === "refund" && item.transaction_type === "expense")), [categories, form.transaction_type]);
  const members = bootstrap?.members?.filter((item) => item.status === "active") || [];
  return { accounts, accountBalances, envelopes, visibleCategories, members };
};

const transactionMode = (form) => ({ isIncome: form.transaction_type === TRANSACTION_TYPES.INCOME || form.transaction_type === TRANSACTION_TYPES.REFUND, isTransfer: form.transaction_type === TRANSACTION_TYPES.TRANSFER });
const destinationAccounts = (accounts, sourceAccount, isTransfer) => isTransfer && sourceAccount ? filterByOwnership(accounts, sourceAccount).filter((account) => account.account_id !== sourceAccount.account_id) : accounts;

const transactionImpactDeltas = ({ transactionType, amount, envelopeRemaining, hasEnvelope }) => {
  if (transactionType === TRANSACTION_TYPES.ADJUSTMENT) return { sourceDelta: amount, availableDelta: amount };
  if (transactionType === TRANSACTION_TYPES.TRANSFER) return { sourceDelta: -amount, availableDelta: -amount };
  if (transactionType === TRANSACTION_TYPES.EXPENSE) {
    const freeDebit = hasEnvelope ? Math.max(0, amount - envelopeRemaining) : amount;
    return { sourceDelta: -amount, availableDelta: -freeDebit };
  }
  return { sourceDelta: 0, availableDelta: 0 };
};

const parseTransactionAmount = (value) => { try { return parseRupiah(value); } catch { return null; } };
const balanceAfter = (item, balance, delta) => item ? balance + delta : null;

const transactionImpact = ({ accountBalances, envelopes, form }) => {
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

const transactionPreparedInput = ({ form, transaction, isIncome, confirmation }) => ({ ...form, transaction_id: transaction?.transaction_id, row_version: transaction?.row_version, source_account_id: isIncome ? "" : form.source_account_id, destination_account_id: form.destination_account_id, confirm_duplicate: confirmation?.code === "POSSIBLE_DUPLICATE" });

const handleTransactionError = (error, setters) => {
  if (error.code === "POSSIBLE_DUPLICATE") { setters.setConfirmation({ code: error.code, message: error.message, details: error.details }); setters.setSubmitState({ status: "idle", error: null }); return; }
  if (error.code === "OVER_BUDGET_CONFIRMATION_REQUIRED") setters.setErrors((current) => ({ ...current, overspend_reason: "Isi alasan penggunaan di atas dana tersisa pada Alokasi Dana." }));
  setters.setSubmitState({ status: isOutcomeUnknownError(error) ? "unknown" : "error", error });
  if (error.details && !Array.isArray(error.details)) setters.setErrors((current) => ({ ...current, ...error.details }));
};

const useTransactionSubmit = ({ form, transaction, confirmation, isIncome, refreshOverview, invalidate, onSaved, notify, notifyOnSuccess, onClose, setPostSave, setters, idempotencyKeyRef }) => async (event) => {
  event.preventDefault(); const validation = validateTransactionInput(transactionPreparedInput({ form, transaction, isIncome, confirmation }));
  if (!validation.ok) { setters.setErrors(validation.errors); return; }
  setters.setErrors({}); setters.setSubmitState({ status: "submitting", error: null });
  try {
    const saveTransaction = transaction ? updateTransaction : createTransaction;
    const saved = await saveTransaction(validation.value, { idempotencyKey: idempotencyKeyRef.current, rowVersion: transaction?.row_version });
    invalidate(["transactions.list", "accounts.list", "envelopes.list", "budgets.list", "reports.monthly", "dashboard.overview", "app.initialState"]);
    await Promise.allSettled([refreshOverview(), Promise.resolve().then(() => onSaved?.(saved))]);
    setters.setSubmitState({ status: "success", error: null });
    const createdIncome = !transaction && form.transaction_type === TRANSACTION_TYPES.INCOME;
    if (createdIncome) {
      const amount = Number(saved?.amount || parseTransactionAmount(form.amount) || 0);
      setPostSave({ type: "income", amount, sourceAccountId: String(saved?.destination_account_id || form.destination_account_id || "") });
      if (notifyOnSuccess) notify({ message: "Pemasukan berhasil dicatat.", tone: "success", dedupeKey: "transactions:income-created" });
      return;
    }
    if (notifyOnSuccess) notify({ message: transaction ? "Perubahan transaksi berhasil disimpan." : "Transaksi berhasil disimpan." });
    onClose();
  } catch (error) { handleTransactionError(error, setters); }
};

const TypeSelector = ({ form, update }) => <VisualChoiceGroup className="form-grid__full" legend="Jenis transaksi" name="transaction_type" value={form.transaction_type} onChange={(value) => update("transaction_type", value)} options={TRANSACTION_TYPE_OPTIONS} columns={4} />;

const FieldControl = ({ icon: Icon, children }) => <span className={styles.fieldControl}><Icon aria-hidden="true" /><span className={styles.fieldControlInput}>{children}</span></span>;

const AmountDateFields = ({ form, update, errors, amountRef }) => <><div className={`money-entry ${styles.amountEntry}`}><div className={styles.amountVisual}><MoneyInput ref={amountRef} id="transaction-amount" value={form.amount} onChange={(value) => update("amount", value)} error={errors.amount} required /><span className={styles.currencyBadge} aria-hidden="true">Rp</span><FiGrid className={styles.amountIcon} aria-hidden="true" /></div>{form.transaction_type === TRANSACTION_TYPES.EXPENSE ? <div className={`quick-amounts ${styles.quickAmounts}`} aria-label="Nominal pengeluaran cepat">{QUICK_EXPENSE_AMOUNTS.map((amount) => <button key={amount} type="button" aria-pressed={Number(form.amount || 0) === amount} onClick={() => update("amount", String(amount))}>{quickAmountLabel(amount)}</button>)}</div> : null}</div><label className={`field ${styles.visualField}`} htmlFor="transaction-date"><span>Tanggal *</span><FieldControl icon={FiCalendar}><input id="transaction-date" type="date" value={form.transaction_date} onChange={(event) => update("transaction_date", event.target.value)} aria-invalid={Boolean(errors.transaction_date)} /></FieldControl>{errors.transaction_date ? <small className="field__error">{errors.transaction_date}</small> : null}</label></>;

const applySourceAccountChange = ({ nextId, accounts, envelopes, isTransfer, setForm, setConfirmation, setSubmitState }) => { const nextAccount = accounts.find((item) => item.account_id === nextId) || null; setConfirmation(null); setSubmitState({ status: "idle", error: null }); setForm((current) => { const destination = accounts.find((item) => item.account_id === current.destination_account_id) || null; const envelope = envelopes.find((item) => item.envelope_period_id === current.envelope_period_id) || null; const sharedExpense = current.transaction_type === TRANSACTION_TYPES.EXPENSE && nextAccount?.owner_scope === "shared"; return { ...current, source_account_id: nextId, destination_account_id: isTransfer && destination && (destination.account_id === nextId || !hasSameOwnership(destination, nextAccount)) ? "" : current.destination_account_id, envelope_period_id: envelope && envelope.source_account_id !== nextId ? "" : current.envelope_period_id, cost_share_mode: sharedExpense ? current.cost_share_mode : "unspecified", cost_share_percentages: sharedExpense ? current.cost_share_percentages : [] }; }); };

const accountAvailableLabel = (item) => `${accountDisplayLabel(item)} · tersedia ${formatRupiah(item.available_balance ?? item.balance ?? 0)}`;

const SourceAccountField = ({ form, accounts, envelopes, isTransfer, setForm, setConfirmation, setSubmitState, errors }) => {
  const change = (event) => applySourceAccountChange({ nextId: event.target.value, accounts, envelopes, isTransfer, setForm, setConfirmation, setSubmitState });
  const selected = accounts.find((item) => item.account_id === form.source_account_id) || null;
  return <label className={`field ${styles.visualField}`} htmlFor="source-account"><span>Rekening sumber *</span><FieldControl icon={FiCreditCard}><select id="source-account" value={form.source_account_id} onChange={change} aria-invalid={Boolean(errors.source_account_id)}><option value="">Pilih rekening</option>{accounts.map((item) => <option key={item.account_id} value={item.account_id}>{accountAvailableLabel(item)}</option>)}</select></FieldControl>{selected ? <small>Saldo {formatRupiah(selected.balance || 0)} · dialokasikan {formatRupiah(selected.allocated_remaining || 0)} · tersedia {formatRupiah(selected.available_balance ?? selected.balance ?? 0)}</small> : null}{errors.source_account_id ? <small className="field__error">{errors.source_account_id}</small> : null}</label>;
};

const DestinationAccountField = ({ form, accounts, update, errors }) => <label className={`field ${styles.visualField}`} htmlFor="destination-account"><span>Rekening tujuan *</span><FieldControl icon={FiCreditCard}><select id="destination-account" value={form.destination_account_id} onChange={(event) => update("destination_account_id", event.target.value)} aria-invalid={Boolean(errors.destination_account_id)}><option value="">Pilih rekening</option>{accounts.map((item) => <option key={item.account_id} value={item.account_id}>{accountDisplayLabel(item)}</option>)}</select></FieldControl>{errors.destination_account_id ? <small className="field__error">{errors.destination_account_id}</small> : null}</label>;

const CategoryField = ({ form, visibleCategories, update, errors }) => <label className={`field ${styles.visualField}`} htmlFor="category"><span>Kategori{![TRANSACTION_TYPES.TRANSFER, TRANSACTION_TYPES.ADJUSTMENT].includes(form.transaction_type) ? " *" : ""}</span><FieldControl icon={FiTag}><select id="category" value={form.category_id} onChange={(event) => update("category_id", event.target.value)} aria-invalid={Boolean(errors.category_id)}><option value="">Pilih kategori</option>{visibleCategories.map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select></FieldControl>{errors.category_id ? <small className="field__error">{errors.category_id}</small> : null}</label>;
const envelopeOptionLabel = (item) => {
  const assignee = item.assignee_user_id ? `${item.assignee_name || "Pengguna"} · ${userRoleLabel(item.assignee_role)}` : "Bersama";
  return `${item.name} · ${assignee} — sisa ${formatRupiah(item.remaining_amount)}`;
};

const EnvelopeField = ({ form, envelopes, update }) => <label className={`field ${styles.visualField}`} htmlFor="envelope"><span>Alokasi (opsional)</span><FieldControl icon={FiLayers}><select id="envelope" value={form.envelope_period_id} onChange={(event) => update("envelope_period_id", event.target.value)}><option value="">Belum dialokasikan</option>{envelopes.map((item) => <option key={item.envelope_period_id} value={item.envelope_period_id}>{envelopeOptionLabel(item)}</option>)}</select></FieldControl></label>;

const AccountCategoryFields = (p) => { const source = p.accounts.find((item) => item.account_id === p.form.source_account_id) || null; const showCostShare = p.form.transaction_type === TRANSACTION_TYPES.EXPENSE && source?.owner_scope === "shared"; return <>{!p.isIncome ? <SourceAccountField {...p} /> : null}{p.isIncome || p.isTransfer ? <DestinationAccountField form={p.form} accounts={p.compatibleDestinationAccounts} update={p.update} errors={p.errors} /> : null}{!p.isTransfer ? <CategoryField form={p.form} visibleCategories={p.visibleCategories} update={p.update} errors={p.errors} /> : null}{p.form.transaction_type === TRANSACTION_TYPES.EXPENSE ? <EnvelopeField form={p.form} envelopes={p.compatibleEnvelopes} update={p.update} /> : null}<CostShareField visible={showCostShare} form={p.form} members={p.members} setForm={p.setForm} errors={p.errors} /></>; };

const DirectDetailsFields = ({ form, update, errors }) => <><label className={`field ${styles.visualField}`} htmlFor="payment-method"><span>Metode pembayaran</span><FieldControl icon={FiCreditCard}><select id="payment-method" value={form.payment_method} onChange={(event) => update("payment_method", event.target.value)}>{PAYMENT_METHOD_OPTIONS.map((item) => <option key={item.value || "unset"} value={item.value}>{item.label}</option>)}</select></FieldControl></label><label className={`field ${styles.visualField}`} htmlFor="merchant"><span>Merchant / penerima</span><input id="merchant" maxLength="120" value={form.merchant} onChange={(event) => update("merchant", event.target.value)} /></label>{form.transaction_type === TRANSACTION_TYPES.EXPENSE ? <label className="field form-grid__full" htmlFor="overspend-reason"><span>Alasan jika melebihi dana alokasi</span><input id="overspend-reason" maxLength="180" value={form.overspend_reason} onChange={(event) => update("overspend_reason", event.target.value)} aria-invalid={Boolean(errors.overspend_reason)} placeholder="Wajib hanya jika dana tersisa tidak cukup" />{errors.overspend_reason ? <small className="field__error">{errors.overspend_reason}</small> : null}</label> : null}<label className={`field form-grid__full ${styles.notesField}`} htmlFor="description"><span>Catatan</span><textarea id="description" rows="2" maxLength="250" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Opsional" /></label></>;

const ImpactPreview = ({ impact, isTransfer }) => impact ? <div className="notice notice--info form-grid__full impact-preview" aria-live="polite"><strong>Preview dampak</strong>{impact.source ? <span>Saldo {impact.source.name}: {formatRupiah(impact.source.balance)} → {formatRupiah(impact.sourceAfter)}</span> : null}{impact.source ? <span>Dana tersedia {impact.source.name}: {formatRupiah(impact.sourceAvailable)} → {formatRupiah(impact.sourceAvailableAfter)}</span> : null}{impact.destination ? <span>Saldo {impact.destination.name}: {formatRupiah(impact.destination.balance)} → {formatRupiah(impact.destinationAfter)}</span> : null}{impact.destination ? <span>Dana tersedia {impact.destination.name}: {formatRupiah(impact.destinationAvailable)} → {formatRupiah(impact.destinationAvailableAfter)}</span> : null}{impact.envelope ? <span>Sisa {impact.envelope.name}: {formatRupiah(impact.envelope.remaining_amount)} → {formatRupiah(impact.envelopeAfter)}</span> : null}{isTransfer ? <span>Transfer memakai dana yang belum dialokasikan dari rekening sumber.</span> : null}</div> : null;

const TransactionFields = (p) => <>{p.lockType ? null : <TypeSelector form={p.form} update={p.update} />}<AmountDateFields form={p.form} update={p.update} errors={p.errors} amountRef={p.amountRef} /><AccountCategoryFields {...p} /><DirectDetailsFields form={p.form} update={p.update} errors={p.errors} /><ImpactPreview impact={p.impact} isTransfer={p.isTransfer} />{p.confirmation ? <div className="notice notice--warning form-grid__full" role="alert"><FiAlertTriangle /><span>{p.confirmation.message} Periksa data, lalu tekan “Simpan tetap” untuk mengonfirmasi.</span></div> : null}{p.submitState.error ? <div className="notice notice--danger form-grid__full" role="alert">{p.submitState.error.message}</div> : null}</>;

const isMobileTransferPresentation = ({ presentation, isTransfer, transaction, mobileLayout }) => !transaction && isTransfer && (presentation === "mobile-transfer" || mobileLayout);

const transactionDerivedData = ({ data, form, isTransfer, bootstrap, user }) => {
  const sourceAccount = data.accounts.find((item) => item.account_id === form.source_account_id) || null;
  const compatibleDestinationAccounts = destinationAccounts(data.accounts, sourceAccount, isTransfer);
  const accountEnvelopes = sourceAccount
    ? data.envelopes.filter((item) => item.source_account_id === sourceAccount.account_id)
    : [];
  const compatibleEnvelopes = filterByAssigneeAccess(accountEnvelopes, bootstrap?.user || user);
  return { compatibleDestinationAccounts, compatibleEnvelopes };
};

const useMobileTransferDestination = ({ open, enabled, destinationAccountId, compatibleDestinationAccounts, setForm }) => {
  useEffect(() => {
    if (!open || !enabled || destinationAccountId || compatibleDestinationAccounts.length === 0) return;
    const firstDestinationId = compatibleDestinationAccounts[0].account_id;
    setForm((current) => {
      if (current.destination_account_id) return current;
      return { ...current, destination_account_id: firstDestinationId };
    });
  }, [compatibleDestinationAccounts, destinationAccountId, enabled, open, setForm]);
};

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
  const modalTitle = <span className={styles.modalTitle}><span className={styles.walletBubble} aria-hidden="true"><img src={transactionWallet} alt="" /></span><span className={styles.modalTitleCopy}><span className={styles.modalTitleText}>{resolvedTitle}</span>{description ? <small>{description}</small> : null}</span></span>;
  const modalFooter = <><Button type="button" onClick={onClose} disabled={submitting || outcomeUnknown}>Batal</Button><Button type="submit" form="transaction-form" variant="primary" icon={FiCheck} loading={submitting}>{progressLabel}</Button></>;
  return {
    modalTitle,
    modalDescription: undefined,
    modalFooter,
    modalClassName: styles.modal,
    initialFocusRef: amountRef,
    closeIcon: undefined,
    closeLabel: "Tutup dialog",
    formClassName: `form-grid transaction-form ${styles.form}`,
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
  const { user } = useAuth();
  const { notify } = useFeedback();
  const navigate = useNavigate();
  const mobileLayout = useMediaQuery(MOBILE_TRANSACTION_QUERY);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [confirmation, setConfirmation] = useState(null);
  const [submitState, setSubmitState] = useState({ status: "idle", error: null });
  const [postSave, setPostSave] = useState(null);
  const idempotencyKeyRef = useRef(createIdempotencyKey());
  const amountRef = useRef(null);

  useTransactionReset({ open, transaction, initialType, initialSourceAccountId, initialDraft, setForm, setErrors, setConfirmation, setSubmitState, setPostSave, idempotencyKeyRef });

  const data = useTransactionData(bootstrap, overview, form);
  const { isIncome, isTransfer } = transactionMode(form);
  const mobileTransferMode = isMobileTransferPresentation({ presentation, isTransfer, transaction, mobileLayout });
  const { compatibleDestinationAccounts, compatibleEnvelopes } = transactionDerivedData({ data, form, isTransfer, bootstrap, user });
  const impact = useMemo(() => transactionImpact({ accountBalances: data.accountBalances, envelopes: data.envelopes, form }), [data.accountBalances, data.envelopes, form]);
  const outcomeUnknown = submitState.status === "unknown";
  const update = (field, value) => {
    if (outcomeUnknown) return;
    setConfirmation(null);
    setSubmitState({ status: "idle", error: null });
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
  const onSourceAccountChange = (nextId) => { if (outcomeUnknown) return; applySourceAccountChange({ nextId, accounts: data.accounts, envelopes: data.envelopes, isTransfer, setForm, setConfirmation, setSubmitState }); };
  const setters = { setErrors, setConfirmation, setSubmitState };
  const handleSubmit = useTransactionSubmit({ form, transaction, confirmation, isIncome, refreshOverview, invalidate, onSaved, notify, notifyOnSuccess, onClose, setPostSave, setters, idempotencyKeyRef });
  const submitting = submitState.status === "submitting";

  useMobileTransferDestination({ open, enabled: mobileTransferMode, destinationAccountId: form.destination_account_id, compatibleDestinationAccounts, setForm });

  const fields = { form, setForm, update, errors, amountRef, accounts: data.accounts, accountBalances: data.accountBalances, envelopes: data.envelopes, visibleCategories: data.visibleCategories, members: data.members, isIncome, isTransfer, compatibleDestinationAccounts, compatibleEnvelopes, setConfirmation, setSubmitState, impact, confirmation, submitState, lockType, onSourceAccountChange, submitting, outcomeUnknown };
  const modal = resolveTransactionPresentation({ mobileTransferMode, transaction, title, description, submitLabel, submittingLabel, submitting, outcomeUnknown, confirmation, onClose, amountRef });

  if (postSave?.type === "income") {
    const allocate = () => {
      const state = { workflowSource: "transaction-income", workflowAction: "fund", sourceAccountId: postSave.sourceAccountId, suggestedAmount: postSave.amount };
      onClose();
      navigate("/perencanaan/kantong", { state });
    };
    return <Modal open={open} onClose={onClose} title="Pemasukan berhasil" description="Server sudah mengonfirmasi transaksi." size="sm" footer={<><Button type="button" onClick={onClose}>Selesai</Button><Button type="button" variant="primary" onClick={allocate}>Bagi ke Alokasi Dana</Button></>}><div className={styles.postSaveSuccess} role="status" aria-live="polite"><span className={styles.postSaveIcon}><FiCheck aria-hidden="true" /></span><div><strong>{formatRupiah(postSave.amount)} sudah masuk.</strong><p>Anda dapat membagi sebagian atau seluruh dana tersedia ke Alokasi Dana tanpa membuat transaksi baru.</p></div></div></Modal>;
  }

  return <Modal open={open} onClose={onClose} dismissible={!submitting && !outcomeUnknown} title={modal.modalTitle} description={modal.modalDescription} size="lg" initialFocusRef={modal.initialFocusRef} className={modal.modalClassName} footer={modal.modalFooter} closeIcon={modal.closeIcon} closeLabel={modal.closeLabel} mobileSwipeToClose={modal.mobileSwipeToClose}><form id="transaction-form" className={modal.formClassName} onSubmit={handleSubmit} noValidate><TransactionFormBody mobileTransferMode={mobileTransferMode} fields={fields} /></form></Modal>;
};

export default TransactionForm;
