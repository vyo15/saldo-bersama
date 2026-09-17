import { useMemo } from "react";
import { FiAlertTriangle, FiCalendar, FiCheckCircle, FiCreditCard, FiGrid, FiLayers, FiTag } from "react-icons/fi";
import VisualChoiceGroup from "../../../components/common/VisualChoiceGroup.jsx";
import { AccountIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import MoneyInput from "../../../components/common/MoneyInput.jsx";
import { SelectionControl } from "../../../components/common/SelectionField.jsx";
import { accountOptionVisual, categoryOptionVisual } from "../../../components/common/selectionOptionVisuals.js";
import { TRANSACTION_TYPES } from "../../../domain/constants.js";
import { formatRupiah } from "../../../domain/money.js";
import { accountDisplayLabel } from "../../../shared/presentation/account.js";
import { UNALLOCATED_NEED_VALUE, frequentCategories, needSelectionValue, sourceAccountPicker } from "../transactionFormSmartDefaults.js";
import { PAYMENT_METHOD_OPTIONS, QUICK_EXPENSE_AMOUNTS, TRANSACTION_TYPE_OPTIONS, quickAmountLabel } from "../transactionFormPresentation.js";
import styles from "../TransactionForm.module.css";
import TransactionImpactPreview from "./TransactionImpactPreview.jsx";


import TemporalInput from "../../../components/common/TemporalInput.jsx";
const TypeSelector = ({ form, update }) => <VisualChoiceGroup className={`form-grid__full ${styles.typeSelector}`} legend="Jenis transaksi" name="transaction_type" value={form.transaction_type} onChange={(value) => update("transaction_type", value)} options={TRANSACTION_TYPE_OPTIONS} columns={4} mobileColumns={4} plainIcons />;

const FieldControl = ({ icon: Icon, children }) => <span className={styles.fieldControl}><Icon aria-hidden="true" /><span className={styles.fieldControlInput}>{children}</span></span>;

const AmountDateFields = ({ form, update, errors, amountRef }) => <><div className={`money-entry ${styles.amountEntry}`}><div className={styles.amountVisual}><MoneyInput ref={amountRef} id="transaction-amount" value={form.amount} onChange={(value) => update("amount", value)} error={errors.amount} required /><span className={styles.currencyBadge} aria-hidden="true">Rp</span><FiGrid className={styles.amountIcon} aria-hidden="true" /></div>{form.transaction_type === TRANSACTION_TYPES.EXPENSE ? <div className={`quick-amounts ${styles.quickAmounts}`} aria-label="Nominal pengeluaran cepat">{QUICK_EXPENSE_AMOUNTS.map((amount) => <button key={amount} type="button" aria-pressed={Number(form.amount || 0) === amount} onClick={() => update("amount", String(amount))}>{quickAmountLabel(amount)}</button>)}</div> : null}</div><label className={`field ${styles.visualField}`} htmlFor="transaction-date"><span>Tanggal *</span><FieldControl icon={FiCalendar}><TemporalInput id="transaction-date" type="date" embedded value={form.transaction_date} onChange={(event) => update("transaction_date", event.target.value)} aria-invalid={Boolean(errors.transaction_date)} aria-describedby={errors.transaction_date ? "transaction-date-error" : undefined} /></FieldControl>{errors.transaction_date ? <small id="transaction-date-error" className="field__error">{errors.transaction_date}</small> : null}</label></>;

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
    <FieldControl icon={AccountIcon}><SelectionControl id="source-account" embedded value={form.source_account_id} onChange={onSourceAccountChange} placeholder="Pilih rekening" searchable={picker.length > 8} ariaLabel="Rekening sumber" options={picker.map((item) => ({ value: item.account_id, label: accountDisplayLabel(item), meta: sourceAccountOptionLabel(item, form.transaction_type).split(" · ").slice(1).join(" · "), ...accountOptionVisual(item) }))} /></FieldControl>
    {selected ? <small>Saldo {formatRupiah(selected.balance || 0)} · dialokasikan {formatRupiah(selected.allocated_remaining || 0)} · tersedia {formatRupiah(selected.available_balance ?? selected.balance ?? 0)}</small> : null}
    {!selected && picker.length === 0 ? <small>Belum ada rekening sumber dengan dana yang dapat digunakan.</small> : null}
    {errors.source_account_id ? <small id="source-account-error" className="field__error">{errors.source_account_id}</small> : null}
  </div>;
};

const DestinationAccountField = ({ form, accounts, update, errors }) => <label className={`field ${styles.visualField}`}><span>Rekening tujuan *</span><FieldControl icon={AccountIcon}><SelectionControl id="destination-account" embedded value={form.destination_account_id} onChange={(value) => update("destination_account_id", value)} placeholder="Pilih rekening" searchable={accounts.length > 8} ariaLabel="Rekening tujuan" options={accounts.map((item) => ({ value: item.account_id, label: accountDisplayLabel(item), meta: `Saldo ${formatRupiah(item.balance || 0)}`, ...accountOptionVisual(item) }))} /></FieldControl>{errors.destination_account_id ? <small id="destination-account-error" className="field__error">{errors.destination_account_id}</small> : null}</label>;

const CategoryField = ({ form, visibleCategories, recentTransactions, update, errors }) => {
  const quickCategories = useMemo(() => frequentCategories({ recentTransactions, sourceAccountId: form.source_account_id, visibleCategories }), [form.source_account_id, recentTransactions, visibleCategories]);
  return <div className={`field ${styles.visualField}`}>
    <label htmlFor="category">Kategori{![TRANSACTION_TYPES.TRANSFER, TRANSACTION_TYPES.ADJUSTMENT].includes(form.transaction_type) ? " *" : ""}</label>
    {quickCategories.length ? <div className={styles.categoryQuickChoices} aria-label="Kategori yang sering dipakai"><small>Sering dipakai</small><div>{quickCategories.map((item) => <button key={item.category_id} type="button" aria-pressed={form.category_id === item.category_id} onClick={() => update("category_id", item.category_id)}>{item.name}</button>)}</div></div> : null}
    <FieldControl icon={FiTag}><SelectionControl id="category" embedded value={form.category_id} onChange={(value) => update("category_id", value)} placeholder="Pilih kategori" searchable={visibleCategories.length > 8} searchPlaceholder="Cari kategori…" ariaLabel="Kategori" options={visibleCategories.map((item) => ({ value: item.category_id, label: item.name, ...categoryOptionVisual(item, form.transaction_type) }))} /></FieldControl>
    {errors.category_id ? <small id="category-error" className="field__error">{errors.category_id}</small> : null}
  </div>;
};

const resolveLockedNeed = ({ form, candidates, budgets, envelopes }) => {
  const contextual = candidates.find((item) => item.need.budget_id === form.budget_id && item.envelope.envelope_period_id === form.envelope_period_id) || null;
  return {
    need: contextual?.need || budgets.find((item) => item.budget_id === form.budget_id) || null,
    envelope: contextual?.envelope || envelopes.find((item) => item.envelope_period_id === form.envelope_period_id) || null,
  };
};

const LockedNeedField = ({ form, candidates, budgets, envelopes }) => {
  const { need, envelope } = resolveLockedNeed({ form, candidates, budgets, envelopes });
  const remaining = Math.max(0, Number(need?.amount || 0) - Number(need?.used_amount || 0));
  const envelopePrefix = envelope?.name ? `${envelope.name} · ` : "";
  return <div className={`field ${styles.visualField}`}>
    <span>Kebutuhan</span>
    <div className="notice notice--info"><FiCheckCircle aria-hidden="true" /><span><strong>{need?.name || "Kebutuhan terpilih"}</strong> · {envelopePrefix}sisa {formatRupiah(remaining)} · Dipilih dari Alokasi Dana.</span></div>
  </div>;
};

const needOption = (candidate) => ({
  value: candidate.need.budget_id,
  label: candidate.need.name || "Kebutuhan",
  meta: `${candidate.envelope.name} · sisa ${formatRupiah(Math.max(0, Number(candidate.need.amount || 0) - Number(candidate.need.used_amount || 0)))}`,
  icon: FiCheckCircle,
});

const needHelperText = ({ automatic, count }) => {
  if (automatic) return "Dipilih otomatis karena hanya satu Kebutuhan yang cocok.";
  if (count > 1) return `${count} Kebutuhan cocok. Pilih salah satu atau pilih Tanpa Kebutuhan secara sadar.`;
  return "Anda dapat mengganti pilihan ini bila diperlukan.";
};

const NeedField = ({ form, candidates, onNeedChange, lockPlanningSelection, budgets, envelopes, allocationMode, errors, outcomeUnknown }) => {
  if (!form.source_account_id || !form.category_id) return null;
  if (lockPlanningSelection && form.budget_id) return <LockedNeedField form={form} candidates={candidates} budgets={budgets} envelopes={envelopes} />;
  if (!candidates.length) {
    return <div className={`notice notice--info ${styles.visualField}`}><FiLayers aria-hidden="true" /><span><strong>Belum ada Kebutuhan yang cocok.</strong> Transaksi dapat dicatat sebagai Pengeluaran Belum Dialokasikan dan akan memakai Dana Tersedia.</span></div>;
  }
  const options = [
    { value: UNALLOCATED_NEED_VALUE, label: "Tanpa Kebutuhan", meta: "Akan memakai Dana Tersedia · Kebutuhan tidak berubah", icon: FiLayers },
    ...candidates.map(needOption),
  ];
  const value = needSelectionValue({ budgetId: form.budget_id, allocationMode });
  const automatic = candidates.length === 1 && allocationMode === "auto" && form.budget_id === candidates[0].need.budget_id;
  const label = candidates.length > 1 ? "Dipakai untuk kebutuhan mana?" : "Kebutuhan";
  return <div className={`field ${styles.visualField}`}>
    <label htmlFor="budget-need">{label}</label>
    <FieldControl icon={FiCheckCircle}><SelectionControl id="budget-need" embedded value={value} onChange={onNeedChange} placeholder="Pilih Kebutuhan" searchable={options.length > 8} ariaLabel="Kebutuhan" options={options} invalid={Boolean(errors.budget_id)} describedBy={errors.budget_id ? "budget-need-error" : undefined} disabled={outcomeUnknown} /></FieldControl>
    {errors.budget_id ? <small id="budget-need-error" className="field__error">{errors.budget_id}</small> : <small>{needHelperText({ automatic, count: candidates.length })}</small>}
  </div>;
};

const AccountCategoryFields = (p) => <>
    {!p.isIncome ? <SourceAccountField form={p.form} accounts={p.accounts} recentTransactions={p.recentTransactions} onSourceAccountChange={p.onSourceAccountChange} errors={p.errors} /> : null}
    {p.isIncome || p.isTransfer ? <DestinationAccountField form={p.form} accounts={p.compatibleDestinationAccounts} update={p.update} errors={p.errors} /> : null}
    {!p.isTransfer ? <CategoryField form={p.form} visibleCategories={p.visibleCategories} recentTransactions={p.recentTransactions} update={p.update} errors={p.errors} /> : null}
    {p.form.transaction_type === TRANSACTION_TYPES.EXPENSE ? <NeedField form={p.form} candidates={p.allocationCandidates} onNeedChange={p.onNeedChange} lockPlanningSelection={p.lockPlanningSelection} budgets={p.budgets} envelopes={p.envelopes} allocationMode={p.allocationMode} errors={p.errors} outcomeUnknown={p.outcomeUnknown} /> : null}
  </>;

const DirectDetailsFields = ({ form, update, errors }) => <><label className={`field ${styles.visualField}`}><span>Metode pembayaran</span><FieldControl icon={FiCreditCard}><SelectionControl id="payment-method" embedded value={form.payment_method} onChange={(value) => update("payment_method", value)} ariaLabel="Metode pembayaran" options={[...(form.payment_method === "autodebit" ? [{ value: "autodebit", label: "Auto-debit (data lama)", disabled: true }] : []), ...PAYMENT_METHOD_OPTIONS.map((item) => ({ value: item.value, label: item.label, icon: item.icon }))]} /></FieldControl></label><label className={`field form-grid__full ${styles.notesField}`} htmlFor="description"><span>Catatan</span><textarea id="description" rows="2" maxLength="250" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Opsional" aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "description-error" : undefined} />{errors.description ? <small id="description-error" className="field__error">{errors.description}</small> : null}</label></>;

const ValidationSummary = ({ errors }) => {
  const messages = Object.values(errors || {}).filter(Boolean);
  if (!messages.length) return null;
  return <div className="notice notice--danger form-grid__full" role="alert" aria-live="assertive"><FiAlertTriangle aria-hidden="true" /><span><strong>Lengkapi data transaksi yang wajib dipilih.</strong> {messages[0]}</span></div>;
};

const FundsWarning = ({ warning }) => warning ? <div className="notice notice--warning form-grid__full" role="status"><FiAlertTriangle aria-hidden="true" /><span><strong>{warning.title}</strong> {warning.message}</span></div> : null;

const TransactionFields = (p) => <><ValidationSummary errors={p.errors} />{p.lockType ? null : <TypeSelector form={p.form} update={p.update} />}<AmountDateFields form={p.form} update={p.update} errors={p.errors} amountRef={p.amountRef} /><AccountCategoryFields {...p} /><DirectDetailsFields form={p.form} update={p.update} errors={p.errors} /><FundsWarning warning={p.fundsWarning} /><TransactionImpactPreview impact={p.impact} isTransfer={p.isTransfer} />{p.confirmation ? <div className="notice notice--warning form-grid__full" role="alert"><FiAlertTriangle /><span>{p.confirmation.message} Periksa data, lalu tekan “Simpan tetap” untuk mengonfirmasi.</span></div> : null}{p.submitState.error ? <div className="notice notice--danger form-grid__full" role="alert">{p.submitState.error.message}</div> : null}</>;


export default TransactionFields;
