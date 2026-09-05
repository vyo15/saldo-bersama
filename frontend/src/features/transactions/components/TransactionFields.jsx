import { useMemo } from "react";
import { FiAlertTriangle, FiCalendar, FiCreditCard, FiGrid, FiLayers, FiTag } from "react-icons/fi";
import VisualChoiceGroup from "../../../components/common/VisualChoiceGroup.jsx";
import MoneyInput from "../../../components/common/MoneyInput.jsx";
import { SelectionControl } from "../../../components/common/SelectionField.jsx";
import { TRANSACTION_TYPES } from "../../../domain/constants.js";
import { formatRupiah } from "../../../domain/money.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import { userRoleLabel } from "../../../shared/presentation/user.js";
import CostShareField from "../CostShareField.jsx";
import { allocationSelectionHint, frequentCategories, orderedEnvelopeOptions, sourceAccountPicker } from "../transactionFormSmartDefaults.js";
import { PAYMENT_METHOD_OPTIONS, QUICK_EXPENSE_AMOUNTS, TRANSACTION_TYPE_OPTIONS, quickAmountLabel } from "../transactionFormPresentation.js";
import styles from "../TransactionForm.module.css";
import TransactionImpactPreview from "./TransactionImpactPreview.jsx";


const TypeSelector = ({ form, update }) => <VisualChoiceGroup className={`form-grid__full ${styles.typeSelector}`} legend="Jenis transaksi" name="transaction_type" value={form.transaction_type} onChange={(value) => update("transaction_type", value)} options={TRANSACTION_TYPE_OPTIONS} columns={4} mobileColumns={4} plainIcons />;

const FieldControl = ({ icon: Icon, children }) => <span className={styles.fieldControl}><Icon aria-hidden="true" /><span className={styles.fieldControlInput}>{children}</span></span>;

const AmountDateFields = ({ form, update, errors, amountRef }) => <><div className={`money-entry ${styles.amountEntry}`}><div className={styles.amountVisual}><MoneyInput ref={amountRef} id="transaction-amount" value={form.amount} onChange={(value) => update("amount", value)} error={errors.amount} required /><span className={styles.currencyBadge} aria-hidden="true">Rp</span><FiGrid className={styles.amountIcon} aria-hidden="true" /></div>{form.transaction_type === TRANSACTION_TYPES.EXPENSE ? <div className={`quick-amounts ${styles.quickAmounts}`} aria-label="Nominal pengeluaran cepat">{QUICK_EXPENSE_AMOUNTS.map((amount) => <button key={amount} type="button" aria-pressed={Number(form.amount || 0) === amount} onClick={() => update("amount", String(amount))}>{quickAmountLabel(amount)}</button>)}</div> : null}</div><label className={`field ${styles.visualField}`} htmlFor="transaction-date"><span>Tanggal *</span><FieldControl icon={FiCalendar}><input id="transaction-date" type="date" value={form.transaction_date} onChange={(event) => update("transaction_date", event.target.value)} aria-invalid={Boolean(errors.transaction_date)} aria-describedby={errors.transaction_date ? "transaction-date-error" : undefined} /></FieldControl>{errors.transaction_date ? <small id="transaction-date-error" className="field__error">{errors.transaction_date}</small> : null}</label></>;

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
    <FieldControl icon={FiCreditCard}><SelectionControl id="source-account" embedded value={form.source_account_id} onChange={onSourceAccountChange} placeholder="Pilih rekening" searchable={picker.length > 8} ariaLabel="Rekening sumber" options={picker.map((item) => ({ value: item.account_id, label: accountDisplayLabel(item), meta: sourceAccountOptionLabel(item, form.transaction_type).split(" · ").slice(1).join(" · ") }))} /></FieldControl>
    {selected ? <small>Saldo {formatRupiah(selected.balance || 0)} · dialokasikan {formatRupiah(selected.allocated_remaining || 0)} · tersedia {formatRupiah(selected.available_balance ?? selected.balance ?? 0)}</small> : null}
    {!selected && picker.length === 0 ? <small>Belum ada rekening sumber dengan dana yang dapat digunakan.</small> : null}
    {errors.source_account_id ? <small id="source-account-error" className="field__error">{errors.source_account_id}</small> : null}
  </div>;
};

const DestinationAccountField = ({ form, accounts, update, errors }) => <label className={`field ${styles.visualField}`}><span>Rekening tujuan *</span><FieldControl icon={FiCreditCard}><SelectionControl id="destination-account" embedded value={form.destination_account_id} onChange={(value) => update("destination_account_id", value)} placeholder="Pilih rekening" searchable={accounts.length > 8} ariaLabel="Rekening tujuan" options={accounts.map((item) => ({ value: item.account_id, label: accountDisplayLabel(item), meta: `Saldo ${formatRupiah(item.balance || 0)}` }))} /></FieldControl>{errors.destination_account_id ? <small id="destination-account-error" className="field__error">{errors.destination_account_id}</small> : null}</label>;

const CategoryField = ({ form, visibleCategories, recentTransactions, update, errors }) => {
  const quickCategories = useMemo(() => frequentCategories({ recentTransactions, sourceAccountId: form.source_account_id, visibleCategories }), [form.source_account_id, recentTransactions, visibleCategories]);
  return <div className={`field ${styles.visualField}`}>
    <label htmlFor="category">Kategori{![TRANSACTION_TYPES.TRANSFER, TRANSACTION_TYPES.ADJUSTMENT].includes(form.transaction_type) ? " *" : ""}</label>
    {quickCategories.length ? <div className={styles.categoryQuickChoices} aria-label="Kategori yang sering dipakai"><small>Sering dipakai</small><div>{quickCategories.map((item) => <button key={item.category_id} type="button" aria-pressed={form.category_id === item.category_id} onClick={() => update("category_id", item.category_id)}>{item.name}</button>)}</div></div> : null}
    <FieldControl icon={FiTag}><SelectionControl id="category" embedded value={form.category_id} onChange={(value) => update("category_id", value)} placeholder="Pilih kategori" searchable={visibleCategories.length > 8} searchPlaceholder="Cari kategori…" ariaLabel="Kategori" options={visibleCategories.map((item) => ({ value: item.category_id, label: item.name }))} /></FieldControl>
    {errors.category_id ? <small id="category-error" className="field__error">{errors.category_id}</small> : null}
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
    <FieldControl icon={FiLayers}><SelectionControl id="envelope" embedded value={form.envelope_period_id} onChange={onEnvelopeChange} disabled={disabled} placeholder={placeholder} searchable={options.length > 8} ariaLabel="Alokasi Dana" options={[...(!disabled ? [{ value: "", label: "Belum dialokasikan" }] : []), ...options.map((item) => ({ value: item.envelope_period_id, label: item.name, meta: envelopeOptionLabel(item).replace(`${item.name} · `, "") }))]} /></FieldControl>
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

const DirectDetailsFields = ({ form, update, errors }) => <><label className={`field ${styles.visualField}`}><span>Metode pembayaran</span><FieldControl icon={FiCreditCard}><SelectionControl id="payment-method" embedded value={form.payment_method} onChange={(value) => update("payment_method", value)} ariaLabel="Metode pembayaran" options={[...(form.payment_method === "autodebit" ? [{ value: "autodebit", label: "Auto-debit (data lama)", disabled: true }] : []), ...PAYMENT_METHOD_OPTIONS.map((item) => ({ value: item.value, label: item.label }))]} /></FieldControl></label><label className={`field form-grid__full ${styles.notesField}`} htmlFor="description"><span>Catatan</span><textarea id="description" rows="2" maxLength="250" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Opsional" aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "description-error" : undefined} />{errors.description ? <small id="description-error" className="field__error">{errors.description}</small> : null}</label></>;

const ValidationSummary = ({ errors }) => {
  const messages = Object.values(errors || {}).filter(Boolean);
  if (!messages.length) return null;
  return <div className="notice notice--danger form-grid__full" role="alert" aria-live="assertive"><FiAlertTriangle aria-hidden="true" /><span><strong>Lengkapi data transaksi yang wajib dipilih.</strong> {messages[0]}</span></div>;
};

const FundsWarning = ({ warning }) => warning ? <div className="notice notice--warning form-grid__full" role="status"><FiAlertTriangle aria-hidden="true" /><span><strong>{warning.title}</strong> {warning.message}</span></div> : null;

const TransactionFields = (p) => <><ValidationSummary errors={p.errors} />{p.lockType ? null : <TypeSelector form={p.form} update={p.update} />}<AmountDateFields form={p.form} update={p.update} errors={p.errors} amountRef={p.amountRef} /><AccountCategoryFields {...p} /><DirectDetailsFields form={p.form} update={p.update} errors={p.errors} /><FundsWarning warning={p.fundsWarning} /><TransactionImpactPreview impact={p.impact} isTransfer={p.isTransfer} />{p.confirmation ? <div className="notice notice--warning form-grid__full" role="alert"><FiAlertTriangle /><span>{p.confirmation.message} Periksa data, lalu tekan “Simpan tetap” untuk mengonfirmasi.</span></div> : null}{p.submitState.error ? <div className="notice notice--danger form-grid__full" role="alert">{p.submitState.error.message}</div> : null}</>;


export default TransactionFields;
