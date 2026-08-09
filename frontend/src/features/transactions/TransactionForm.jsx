import { useEffect, useMemo, useRef, useState } from "react";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { FiAlertTriangle, FiCheck, FiChevronDown } from "react-icons/fi";
import Modal from "../../components/common/Modal.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import Button from "../../components/common/Button.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { createIdempotencyKey } from "../../domain/security.js";
import { formatDateLongIndonesia, todayInJakarta } from "../../domain/dates.js";
import { formatRupiah, parseRupiah } from "../../domain/money.js";
import { validateTransactionInput } from "../../domain/validation.js";
import { filterByOwnership, hasSameOwnership } from "../../domain/ownership.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { createTransaction, updateTransaction } from "./transactions.api.js";

const emptyForm = () => ({ transaction_type: TRANSACTION_TYPES.EXPENSE, transaction_date: todayInJakarta(), amount: "", source_account_id: "", destination_account_id: "", category_id: "", envelope_period_id: "", payment_method: "", merchant: "", description: "", overspend_reason: "" });
const QUICK_EXPENSE_AMOUNTS = [2_000, 5_000, 10_000, 20_000, 50_000];
const OPTIONAL_FIELDS = ["payment_method", "merchant", "description", "overspend_reason"];
const TRANSACTION_TYPE_OPTIONS = [[TRANSACTION_TYPES.EXPENSE, "Pengeluaran"], [TRANSACTION_TYPES.INCOME, "Pemasukan"], [TRANSACTION_TYPES.TRANSFER, "Transfer"], [TRANSACTION_TYPES.REFUND, "Refund"]];

const editableTransactionForm = (transaction) => {
  const editable = { ...transaction }; delete editable.scope; delete editable.owner_user_id;
  return { ...emptyForm(), ...editable, amount: String(transaction.amount || ""), overspend_reason: transaction.overspend_reason || "" };
};

const useTransactionReset = ({ open, transaction, initialType, initialSourceAccountId, setForm, setDetailsOpen, setErrors, setConfirmation, setSubmitState, idempotencyKeyRef }) => {
  useEffect(() => {
    if (!open) return;
    setForm(transaction ? editableTransactionForm(transaction) : { ...emptyForm(), transaction_type: initialType, source_account_id: initialSourceAccountId });
    setDetailsOpen(transaction ? OPTIONAL_FIELDS.some((field) => Boolean(transaction[field])) : false);
    setErrors({}); setConfirmation(null); setSubmitState({ status: "idle", error: null }); idempotencyKeyRef.current = createIdempotencyKey();
  }, [initialSourceAccountId, initialType, open, transaction, setForm, setDetailsOpen, setErrors, setConfirmation, setSubmitState, idempotencyKeyRef]);
};

const useTransactionData = (bootstrap, overview, form) => {
  const accounts = useMemo(() => bootstrap?.accounts?.filter((item) => item.status === "active" && item.can_transact !== false) || [], [bootstrap?.accounts]);
  const accountBalances = useMemo(() => overview?.accountBalances || [], [overview?.accountBalances]);
  const categories = useMemo(() => bootstrap?.categories?.filter((item) => item.status === "active") || [], [bootstrap?.categories]);
  const envelopes = useMemo(() => overview?.envelopes?.filter((item) => item.status === "active") || [], [overview?.envelopes]);
  const visibleCategories = useMemo(() => categories.filter((item) => item.transaction_type === form.transaction_type || (form.transaction_type === "refund" && item.transaction_type === "expense")), [categories, form.transaction_type]);
  return { accounts, accountBalances, envelopes, visibleCategories };
};

const transactionMode = (form) => ({ isIncome: form.transaction_type === TRANSACTION_TYPES.INCOME || form.transaction_type === TRANSACTION_TYPES.REFUND, isTransfer: form.transaction_type === TRANSACTION_TYPES.TRANSFER });
const destinationAccounts = (accounts, sourceAccount, isTransfer) => isTransfer && sourceAccount ? filterByOwnership(accounts, sourceAccount).filter((account) => account.account_id !== sourceAccount.account_id) : accounts;

const transactionImpact = ({ accountBalances, envelopes, form }) => {
  let amount; try { amount = parseRupiah(form.amount); } catch { return null; }
  const source = accountBalances.find((item) => item.account_id === form.source_account_id); const destination = accountBalances.find((item) => item.account_id === form.destination_account_id); const envelope = envelopes.find((item) => item.envelope_period_id === form.envelope_period_id);
  return { amount, source, destination, envelope, sourceAfter: source ? Number(source.balance || 0) - amount : null, destinationAfter: destination ? Number(destination.balance || 0) + amount : null, envelopeAfter: envelope ? Number(envelope.remaining_amount || 0) - amount : null };
};

const transactionPreparedInput = ({ form, transaction, isIncome, confirmation }) => ({ ...form, transaction_id: transaction?.transaction_id, row_version: transaction?.row_version, source_account_id: isIncome ? "" : form.source_account_id, destination_account_id: form.destination_account_id, confirm_duplicate: confirmation?.code === "POSSIBLE_DUPLICATE" });

const handleTransactionError = (error, setters) => {
  if (error.code === "POSSIBLE_DUPLICATE") { setters.setConfirmation({ code: error.code, message: error.message, details: error.details }); setters.setSubmitState({ status: "idle", error: null }); return; }
  if (error.code === "OVER_BUDGET_CONFIRMATION_REQUIRED") setters.setErrors((current) => ({ ...current, overspend_reason: "Isi alasan penggunaan di atas sisa jatah." }));
  setters.setSubmitState({ status: "error", error });
  if (error.details && !Array.isArray(error.details)) setters.setErrors((current) => ({ ...current, ...error.details }));
};

const useTransactionSubmit = ({ form, transaction, confirmation, isIncome, refreshOverview, invalidate, onSaved, notify, notifyOnSuccess, onClose, setters, idempotencyKeyRef }) => async (event) => {
  event.preventDefault(); const validation = validateTransactionInput(transactionPreparedInput({ form, transaction, isIncome, confirmation }));
  if (!validation.ok) { setters.setErrors(validation.errors); return; }
  setters.setErrors({}); setters.setSubmitState({ status: "submitting", error: null });
  try {
    const saveTransaction = transaction ? updateTransaction : createTransaction;
    const saved = await saveTransaction(validation.value, { idempotencyKey: idempotencyKeyRef.current, rowVersion: transaction?.row_version });
    invalidate(["transactions.list", "accounts.list", "envelopes.list", "budgets.list", "reports.monthly", "dashboard.overview", "app.initialState"]);
    await Promise.allSettled([refreshOverview(), Promise.resolve().then(() => onSaved?.(saved))]);
    setters.setSubmitState({ status: "success", error: null });
    if (notifyOnSuccess) notify({ message: transaction ? "Perubahan transaksi berhasil disimpan." : "Transaksi berhasil disimpan." });
    onClose();
  } catch (error) { handleTransactionError(error, setters); }
};

const TypeSelector = ({ form, update }) => <fieldset className="segmented-control form-grid__full"><legend>Jenis transaksi</legend>{TRANSACTION_TYPE_OPTIONS.map(([value, label]) => <label key={value}><input type="radio" name="transaction_type" checked={form.transaction_type === value} onChange={() => update("transaction_type", value)} /><span>{label}</span></label>)}</fieldset>;

const AmountDateFields = ({ form, update, errors, amountRef }) => <><div className="money-entry"><MoneyInput ref={amountRef} id="transaction-amount" value={form.amount} onChange={(value) => update("amount", value)} error={errors.amount} required />{form.transaction_type === TRANSACTION_TYPES.EXPENSE ? <div className="quick-amounts" aria-label="Nominal pengeluaran cepat">{QUICK_EXPENSE_AMOUNTS.map((amount) => <button key={amount} type="button" onClick={() => update("amount", String(amount))}>{formatRupiah(amount)}</button>)}</div> : null}</div><label className="field" htmlFor="transaction-date"><span>Tanggal *</span><input id="transaction-date" type="date" value={form.transaction_date} onChange={(event) => update("transaction_date", event.target.value)} aria-invalid={Boolean(errors.transaction_date)} />{formatDateLongIndonesia(form.transaction_date) ? <small>{formatDateLongIndonesia(form.transaction_date)}</small> : null}{errors.transaction_date ? <small className="field__error">{errors.transaction_date}</small> : null}</label></>;

const SourceAccountField = ({ form, accounts, envelopes, isTransfer, setForm, setConfirmation, setSubmitState, errors }) => { const change = (event) => { const nextId = event.target.value; const nextAccount = accounts.find((item) => item.account_id === nextId) || null; setConfirmation(null); setSubmitState({ status: "idle", error: null }); setForm((current) => { const destination = accounts.find((item) => item.account_id === current.destination_account_id) || null; const envelope = envelopes.find((item) => item.envelope_period_id === current.envelope_period_id) || null; return { ...current, source_account_id: nextId, destination_account_id: isTransfer && destination && !hasSameOwnership(destination, nextAccount) ? "" : current.destination_account_id, envelope_period_id: envelope && !hasSameOwnership(envelope, nextAccount) ? "" : current.envelope_period_id }; }); }; return <label className="field" htmlFor="source-account"><span>Rekening sumber *</span><select id="source-account" value={form.source_account_id} onChange={change} aria-invalid={Boolean(errors.source_account_id)}><option value="">Pilih rekening</option>{accounts.map((item) => <option key={item.account_id} value={item.account_id}>{accountDisplayLabel(item, { includeOwner: false })}</option>)}</select>{errors.source_account_id ? <small className="field__error">{errors.source_account_id}</small> : null}</label>; };

const DestinationAccountField = ({ form, accounts, update, errors }) => <label className="field" htmlFor="destination-account"><span>Rekening tujuan *</span><select id="destination-account" value={form.destination_account_id} onChange={(event) => update("destination_account_id", event.target.value)} aria-invalid={Boolean(errors.destination_account_id)}><option value="">Pilih rekening</option>{accounts.map((item) => <option key={item.account_id} value={item.account_id}>{accountDisplayLabel(item, { includeOwner: false })}</option>)}</select>{errors.destination_account_id ? <small className="field__error">{errors.destination_account_id}</small> : null}</label>;

const CategoryField = ({ form, visibleCategories, update, errors }) => <label className="field" htmlFor="category"><span>Kategori{![TRANSACTION_TYPES.TRANSFER, TRANSACTION_TYPES.ADJUSTMENT].includes(form.transaction_type) ? " *" : ""}</span><select id="category" value={form.category_id} onChange={(event) => update("category_id", event.target.value)} aria-invalid={Boolean(errors.category_id)}><option value="">Pilih kategori</option>{visibleCategories.map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select>{errors.category_id ? <small className="field__error">{errors.category_id}</small> : null}</label>;
const EnvelopeField = ({ form, envelopes, update }) => <label className="field" htmlFor="envelope"><span>Kantong/jatah</span><select id="envelope" value={form.envelope_period_id} onChange={(event) => update("envelope_period_id", event.target.value)}><option value="">Belum dialokasikan</option>{envelopes.map((item) => <option key={item.envelope_period_id} value={item.envelope_period_id}>{item.name} — sisa {formatRupiah(item.remaining_amount)}</option>)}</select><small>Pengeluaran tanpa kantong masuk antrean review.</small></label>;

const AccountCategoryFields = (p) => <>{!p.isIncome ? <SourceAccountField {...p} /> : null}{p.isIncome || p.isTransfer ? <DestinationAccountField form={p.form} accounts={p.compatibleDestinationAccounts} update={p.update} errors={p.errors} /> : null}{!p.isTransfer ? <CategoryField form={p.form} visibleCategories={p.visibleCategories} update={p.update} errors={p.errors} /> : null}{p.form.transaction_type === TRANSACTION_TYPES.EXPENSE ? <EnvelopeField form={p.form} envelopes={p.compatibleEnvelopes} update={p.update} /> : null}</>;

const OptionalFields = ({ form, update, errors, detailsOpen, setDetailsOpen }) => <div className="form-grid__full optional-fields"><button className="optional-fields__toggle" type="button" aria-expanded={detailsOpen} aria-controls="transaction-optional-fields" onClick={() => setDetailsOpen((current) => !current)}><span><strong>Detail tambahan</strong><small>Metode pembayaran, merchant, keterangan, dan alasan overspend.</small></span><FiChevronDown aria-hidden="true" /></button><div id="transaction-optional-fields" className={`optional-fields__content${detailsOpen ? " is-open" : ""}`} hidden={!detailsOpen}><label className="field" htmlFor="payment-method"><span>Metode pembayaran</span><select id="payment-method" value={form.payment_method} onChange={(event) => update("payment_method", event.target.value)}><option value="">Belum dipilih</option><option value="transfer">Transfer</option><option value="cash">Tunai</option><option value="debit">Kartu debit</option><option value="ewallet">E-wallet</option><option value="autodebit">Auto-debit</option></select></label><label className="field" htmlFor="merchant"><span>Merchant/penerima</span><input id="merchant" maxLength="120" value={form.merchant} onChange={(event) => update("merchant", event.target.value)} /></label>{form.transaction_type === TRANSACTION_TYPES.EXPENSE ? <label className="field form-grid__full" htmlFor="overspend-reason"><span>Alasan jika melebihi jatah</span><input id="overspend-reason" maxLength="180" value={form.overspend_reason} onChange={(event) => update("overspend_reason", event.target.value)} aria-invalid={Boolean(errors.overspend_reason)} placeholder="Wajib hanya jika sisa jatah tidak cukup" />{errors.overspend_reason ? <small className="field__error">{errors.overspend_reason}</small> : null}</label> : null}<label className="field form-grid__full" htmlFor="description"><span>Keterangan</span><textarea id="description" rows="3" maxLength="250" value={form.description} onChange={(event) => update("description", event.target.value)} /></label></div></div>;

const ImpactPreview = ({ impact, isTransfer }) => impact ? <div className="notice notice--info form-grid__full impact-preview" aria-live="polite"><strong>Preview dampak</strong>{impact.source ? <span>Saldo {impact.source.name}: {formatRupiah(impact.source.balance)} → {formatRupiah(impact.sourceAfter)}</span> : null}{impact.destination ? <span>Saldo {impact.destination.name}: {formatRupiah(impact.destination.balance)} → {formatRupiah(impact.destinationAfter)}</span> : null}{impact.envelope ? <span>Sisa {impact.envelope.name}: {formatRupiah(impact.envelope.remaining_amount)} → {formatRupiah(impact.envelopeAfter)}</span> : null}{isTransfer ? <span>Transfer internal tidak dihitung sebagai pemasukan atau pengeluaran total.</span> : null}</div> : null;

const TransactionFields = (p) => <>{p.lockType ? null : <TypeSelector form={p.form} update={p.update} />}<AmountDateFields form={p.form} update={p.update} errors={p.errors} amountRef={p.amountRef} /><AccountCategoryFields {...p} /><div className="notice notice--info form-grid__full transaction-scope-note"><span>Ruang transaksi ditentukan otomatis dari kepemilikan rekening. Transfer lintas ruang ditolak agar saldo bersama tetap konsisten.</span></div><OptionalFields form={p.form} update={p.update} errors={p.errors} detailsOpen={p.detailsOpen} setDetailsOpen={p.setDetailsOpen} /><ImpactPreview impact={p.impact} isTransfer={p.isTransfer} />{p.confirmation ? <div className="notice notice--warning form-grid__full" role="alert"><FiAlertTriangle /><span>{p.confirmation.message} Periksa data, lalu tekan “Simpan tetap” untuk mengonfirmasi.</span></div> : null}{p.submitState.error ? <div className="notice notice--danger form-grid__full" role="alert">{p.submitState.error.message}</div> : null}</>;

const TransactionForm = ({
  open,
  onClose,
  initialType = TRANSACTION_TYPES.EXPENSE,
  initialSourceAccountId = "",
  lockType = false,
  transaction = null,
  onSaved,
  title,
  description = "Saldo dan sisa jatah baru berubah setelah server mengonfirmasi penyimpanan.",
  submitLabel,
  submittingLabel,
  notifyOnSuccess = true,
}) => {
  const { bootstrap, overview, refreshOverview, invalidate } = useFinance(); const { notify } = useFeedback(); const [form, setForm] = useState(emptyForm); const [errors, setErrors] = useState({}); const [confirmation, setConfirmation] = useState(null); const [detailsOpen, setDetailsOpen] = useState(false); const [submitState, setSubmitState] = useState({ status: "idle", error: null }); const idempotencyKeyRef = useRef(createIdempotencyKey()); const amountRef = useRef(null);
  useTransactionReset({ open, transaction, initialType, initialSourceAccountId, setForm, setDetailsOpen, setErrors, setConfirmation, setSubmitState, idempotencyKeyRef }); useEffect(() => { if (errors.overspend_reason) setDetailsOpen(true); }, [errors.overspend_reason]);
  const data = useTransactionData(bootstrap, overview, form); const { isIncome, isTransfer } = transactionMode(form); const sourceAccount = data.accounts.find((item) => item.account_id === form.source_account_id) || null; const compatibleDestinationAccounts = destinationAccounts(data.accounts, sourceAccount, isTransfer); const compatibleEnvelopes = sourceAccount ? filterByOwnership(data.envelopes, sourceAccount) : data.envelopes; const impact = useMemo(() => transactionImpact({ accountBalances: data.accountBalances, envelopes: data.envelopes, form }), [data.accountBalances, data.envelopes, form]);
  const update = (field, value) => { setConfirmation(null); setSubmitState({ status: "idle", error: null }); setForm((current) => ({ ...current, [field]: value })); }; const setters = { setErrors, setConfirmation, setSubmitState }; const handleSubmit = useTransactionSubmit({ form, transaction, confirmation, isIncome, refreshOverview, invalidate, onSaved, notify, notifyOnSuccess, onClose, setters, idempotencyKeyRef }); const submitting = submitState.status === "submitting";
  const fields = { form, setForm, update, errors, amountRef, accounts: data.accounts, envelopes: data.envelopes, visibleCategories: data.visibleCategories, isIncome, isTransfer, compatibleDestinationAccounts, compatibleEnvelopes, setConfirmation, setSubmitState, detailsOpen, setDetailsOpen, impact, confirmation, submitState, lockType };
  const resolvedTitle = title || (transaction ? "Edit transaksi" : "Tambah transaksi");
  const idleSubmitLabel = confirmation ? "Simpan tetap" : transaction ? "Simpan perubahan" : submitLabel || "Simpan transaksi";
  return <Modal open={open} onClose={submitting ? () => {} : onClose} title={resolvedTitle} description={description} size="lg" initialFocusRef={amountRef} footer={<><Button type="button" onClick={onClose} disabled={submitting}>Batal</Button><Button type="submit" form="transaction-form" variant="primary" icon={FiCheck} loading={submitting}>{submitting ? submittingLabel || "Menyimpan..." : idleSubmitLabel}</Button></>}><form id="transaction-form" className="form-grid transaction-form" onSubmit={handleSubmit} noValidate><TransactionFields {...fields} /></form></Modal>;
};

export default TransactionForm;
