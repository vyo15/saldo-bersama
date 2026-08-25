import { useMemo } from "react";
import { FiAlertTriangle, FiCalendar, FiCreditCard, FiGrid, FiLayers, FiTag } from "react-icons/fi";
import VisualChoiceGroup from "../../../components/common/VisualChoiceGroup.jsx";
import { MoneyInIcon, MoneyOutIcon, RefundIcon, TransferIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import MoneyInput from "../../../components/common/MoneyInput.jsx";
import { TRANSACTION_TYPES } from "../../../domain/constants.js";
import { formatRupiah } from "../../../domain/money.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import { userRoleLabel } from "../../../shared/presentation/user.js";
import CostShareField from "../CostShareField.jsx";
import { allocationSelectionHint, frequentCategories, orderedEnvelopeOptions, sourceAccountPicker } from "../transactionFormSmartDefaults.js";
import styles from "../TransactionForm.module.css";
import TransactionImpactPreview from "./TransactionImpactPreview.jsx";

const QUICK_EXPENSE_AMOUNTS = [20_000, 50_000, 100_000, 200_000, 500_000];
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
]);

const TypeSelector = ({ form, update }) => <VisualChoiceGroup className={`form-grid__full ${styles.typeSelector}`} legend="Jenis transaksi" name="transaction_type" value={form.transaction_type} onChange={(value) => update("transaction_type", value)} options={TRANSACTION_TYPE_OPTIONS} columns={4} mobileColumns={4} plainIcons />;

const FieldControl = ({ icon: Icon, children }) => <span className={styles.fieldControl}><Icon aria-hidden="true" /><span className={styles.fieldControlInput}>{children}</span></span>;

const AmountDateFields = ({ form, update, errors, amountRef }) => <><div className={`money-entry ${styles.amountEntry}`}><div className={styles.amountVisual}><MoneyInput ref={amountRef} id="transaction-amount" value={form.amount} onChange={(value) => update("amount", value)} error={errors.amount} required /><span className={styles.currencyBadge} aria-hidden="true">Rp</span><FiGrid className={styles.amountIcon} aria-hidden="true" /></div>{form.transaction_type === TRANSACTION_TYPES.EXPENSE ? <div className={`quick-amounts ${styles.quickAmounts}`} aria-label="Nominal pengeluaran cepat">{QUICK_EXPENSE_AMOUNTS.map((amount) => <button key={amount} type="button" aria-pressed={Number(form.amount || 0) === amount} onClick={() => update("amount", String(amount))}>{quickAmountLabel(amount)}</button>)}</div> : null}</div><label className={`field ${styles.visualField}`} htmlFor="transaction-date"><span>Tanggal *</span><FieldControl icon={FiCalendar}><input id="transaction-date" type="date" value={form.transaction_date} onChange={(event) => update("transaction_date", event.target.value)} aria-invalid={Boolean(errors.transaction_date)} /></FieldControl>{errors.transaction_date ? <small className="field__error">{errors.transaction_date}</small> : null}</label></>;

const sourceAccountOptionLabel = (item, transactionType) => {
  const amount = transactionType === TRANSACTION_TYPES.TRANSFER
    ? item.available_balance ?? item.balance ?? 0
    : item.balance ?? 0;
  const suffix = transactionType === TRANSACTION_TYPES.TRANSFER ? "tersedia" : "saldo";
  return `${accountDisplayLabel(item)} · ${suffix} ${formatRupiah(amount)}`;
};

const SourceAccountField = ({ form, accounts, recentTransactions, onSourceAccountChange, errors }) => {
  const picker = useMemo(() => sourceAccountPicker({
    accounts,
    transactionType: form.transaction_type,
    selectedAccountId: form.source_account_id,
    recentTransactions,
  }), [accounts, form.source_account_id, form.transaction_type, recentTransactions]);
  const selected = accounts.find((item) => item.account_id === form.source_account_id) || null;
  return <div className={`field ${styles.visualField}`}>
    <label htmlFor="source-account">Rekening sumber *</label>
    <FieldControl icon={FiCreditCard}><select id="source-account" value={form.source_account_id} onChange={(event) => onSourceAccountChange(event.target.value)} aria-invalid={Boolean(errors.source_account_id)}><option value="">Pilih rekening</option>{picker.visible.map((item) => <option key={item.account_id} value={item.account_id}>{sourceAccountOptionLabel(item, form.transaction_type)}</option>)}</select></FieldControl>
    {selected ? <small>Saldo {formatRupiah(selected.balance || 0)} · dialokasikan {formatRupiah(selected.allocated_remaining || 0)} · tersedia {formatRupiah(selected.available_balance ?? selected.balance ?? 0)}</small> : null}
    {!selected && picker.visible.length === 0 ? <small>Belum ada rekening sumber dengan dana yang dapat digunakan.</small> : null}
    {errors.source_account_id ? <small className="field__error">{errors.source_account_id}</small> : null}
  </div>;
};

const DestinationAccountField = ({ form, accounts, update, errors }) => <label className={`field ${styles.visualField}`} htmlFor="destination-account"><span>Rekening tujuan *</span><FieldControl icon={FiCreditCard}><select id="destination-account" value={form.destination_account_id} onChange={(event) => update("destination_account_id", event.target.value)} aria-invalid={Boolean(errors.destination_account_id)}><option value="">Pilih rekening</option>{accounts.map((item) => <option key={item.account_id} value={item.account_id}>{accountDisplayLabel(item)}</option>)}</select></FieldControl>{errors.destination_account_id ? <small className="field__error">{errors.destination_account_id}</small> : null}</label>;

const CategoryField = ({ form, visibleCategories, recentTransactions, update, errors }) => {
  const quickCategories = useMemo(() => frequentCategories({ recentTransactions, sourceAccountId: form.source_account_id, visibleCategories }), [form.source_account_id, recentTransactions, visibleCategories]);
  return <div className={`field ${styles.visualField}`}>
    <label htmlFor="category">Kategori{![TRANSACTION_TYPES.TRANSFER, TRANSACTION_TYPES.ADJUSTMENT].includes(form.transaction_type) ? " *" : ""}</label>
    {quickCategories.length ? <div className={styles.categoryQuickChoices} aria-label="Kategori yang sering dipakai"><small>Sering dipakai</small><div>{quickCategories.map((item) => <button key={item.category_id} type="button" aria-pressed={form.category_id === item.category_id} onClick={() => update("category_id", item.category_id)}>{item.name}</button>)}</div></div> : null}
    <FieldControl icon={FiTag}><select id="category" value={form.category_id} onChange={(event) => update("category_id", event.target.value)} aria-invalid={Boolean(errors.category_id)}><option value="">Pilih kategori</option>{visibleCategories.map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select></FieldControl>
    {errors.category_id ? <small className="field__error">{errors.category_id}</small> : null}
  </div>;
};

const envelopeOptionLabel = (item) => {
  const assignee = item.assignee_user_id ? `${item.assignee_name || "Pengguna"} · ${userRoleLabel(item.assignee_role)}` : "Bersama";
  return `${item.name} · ${assignee} — sisa ${formatRupiah(item.remaining_amount)}`;
};

const EnvelopeField = ({ form, envelopes, candidates, onEnvelopeChange }) => {
  const disabled = !form.source_account_id || !form.category_id;
  const options = useMemo(() => orderedEnvelopeOptions(envelopes, candidates), [candidates, envelopes]);
  const placeholder = !form.source_account_id ? "Pilih rekening terlebih dahulu" : !form.category_id ? "Pilih kategori terlebih dahulu" : "Belum dialokasikan";
  const hint = allocationSelectionHint({ form, candidates, selectedEnvelopeId: form.envelope_period_id });
  return <div className={`field ${styles.visualField}`}>
    <label htmlFor="envelope">Alokasi Dana (opsional)</label>
    <FieldControl icon={FiLayers}><select id="envelope" value={form.envelope_period_id} onChange={(event) => onEnvelopeChange(event.target.value)} disabled={disabled}><option value="">{placeholder}</option>{options.map((item) => <option key={item.envelope_period_id} value={item.envelope_period_id}>{envelopeOptionLabel(item)}</option>)}</select></FieldControl>
    {hint ? <small>{hint}</small> : null}
  </div>;
};

const AccountCategoryFields = (p) => {
  const source = p.accounts.find((item) => item.account_id === p.form.source_account_id) || null;
  const showCostShare = p.form.transaction_type === TRANSACTION_TYPES.EXPENSE && source?.owner_scope === "shared";
  return <>
    {!p.isIncome ? <SourceAccountField form={p.form} accounts={p.accounts} recentTransactions={p.recentTransactions} onSourceAccountChange={p.onSourceAccountChange} errors={p.errors} /> : null}
    {p.isIncome || p.isTransfer ? <DestinationAccountField form={p.form} accounts={p.compatibleDestinationAccounts} update={p.update} errors={p.errors} /> : null}
    {!p.isTransfer ? <CategoryField form={p.form} visibleCategories={p.visibleCategories} recentTransactions={p.recentTransactions} update={p.update} errors={p.errors} /> : null}
    {p.form.transaction_type === TRANSACTION_TYPES.EXPENSE ? <EnvelopeField form={p.form} envelopes={p.compatibleEnvelopes} candidates={p.allocationCandidates} onEnvelopeChange={p.onEnvelopeChange} /> : null}
    <CostShareField visible={showCostShare} form={p.form} members={p.members} setForm={p.setForm} onChange={p.onCostShareChange} errors={p.errors} />
  </>;
};

const DirectDetailsFields = ({ form, update, errors }) => <><label className={`field ${styles.visualField}`} htmlFor="payment-method"><span>Metode pembayaran</span><FieldControl icon={FiCreditCard}><select id="payment-method" value={form.payment_method} onChange={(event) => update("payment_method", event.target.value)}>{form.payment_method === "autodebit" ? <option value="autodebit" hidden>Auto-debit (data lama)</option> : null}{PAYMENT_METHOD_OPTIONS.map((item) => <option key={item.value || "unset"} value={item.value}>{item.label}</option>)}</select></FieldControl></label><label className={`field form-grid__full ${styles.notesField}`} htmlFor="description"><span>Catatan</span><textarea id="description" rows="2" maxLength="250" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Opsional" aria-invalid={Boolean(errors.description)} />{errors.description ? <small className="field__error">{errors.description}</small> : null}</label></>;

const FundsWarning = ({ warning }) => warning ? <div className="notice notice--warning form-grid__full" role="status"><FiAlertTriangle aria-hidden="true" /><span><strong>{warning.title}</strong> {warning.message}</span></div> : null;

const TransactionFields = (p) => <>{p.lockType ? null : <TypeSelector form={p.form} update={p.update} />}<AmountDateFields form={p.form} update={p.update} errors={p.errors} amountRef={p.amountRef} /><AccountCategoryFields {...p} /><DirectDetailsFields form={p.form} update={p.update} errors={p.errors} /><FundsWarning warning={p.fundsWarning} /><TransactionImpactPreview impact={p.impact} isTransfer={p.isTransfer} />{p.confirmation ? <div className="notice notice--warning form-grid__full" role="alert"><FiAlertTriangle /><span>{p.confirmation.message} Periksa data, lalu tekan “Simpan tetap” untuk mengonfirmasi.</span></div> : null}{p.submitState.error ? <div className="notice notice--danger form-grid__full" role="alert">{p.submitState.error.message}</div> : null}</>;


export default TransactionFields;
