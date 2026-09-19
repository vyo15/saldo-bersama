import { useEffect, useState } from "react";
import {
  FiAlertTriangle,
  FiCalendar,
  FiCheckCircle,
  FiChevronDown,
  FiChevronRight,
  FiChevronUp,
  FiGrid,
  FiLayers,
  FiTag,
} from "react-icons/fi";
import { AccountIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { accountOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { formatRupiah } from "../../domain/money.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import MobileTransactionCategoryField from "./MobileTransactionCategoryField.jsx";
import { UNALLOCATED_NEED_VALUE, needSelectionValue, sourceAccountPicker } from "./transactionFormSmartDefaults.js";
import { PAYMENT_METHOD_OPTIONS, QUICK_EXPENSE_AMOUNTS, TRANSACTION_TYPE_OPTIONS, paymentMethodLabel, quickAmountLabel } from "./transactionFormPresentation.js";
import TransactionImpactPreview from "./components/TransactionImpactPreview.jsx";
import styles from "./MobileTransactionFields.module.css";
import TemporalInput from "../../components/common/TemporalInput.jsx";

const TypeSelector = ({ form, update, lockType }) => lockType ? null : (
  <VisualChoiceGroup
    className={styles.typeSelector}
    legend="Jenis transaksi"
    name="transaction_type"
    value={form.transaction_type}
    onChange={(value) => update("transaction_type", value)}
    options={TRANSACTION_TYPE_OPTIONS}
    columns={4}
    mobileColumns={4}
    plainIcons
  />
);


const amountPrompt = (transactionType) => {
  if (transactionType === TRANSACTION_TYPES.EXPENSE) return "Berapa yang dikeluarkan?";
  if (transactionType === TRANSACTION_TYPES.INCOME) return "Berapa yang diterima?";
  if (transactionType === TRANSACTION_TYPES.REFUND) return "Berapa dana yang dikembalikan?";
  return "Nominal";
};

const categoryFieldLabel = (transactionType) => transactionType === TRANSACTION_TYPES.INCOME ? "Sumber" : "Kategori";

const AmountField = ({ form, update, errors, amountRef }) => (
  <section className={styles.section}>
    <div className={styles.amountVisual}>
      <MoneyInput ref={amountRef} id="transaction-amount" label={amountPrompt(form.transaction_type)} value={form.amount} onChange={(value) => update("amount", value)} error={errors.amount} required />
      <span className={styles.currencyBadge} aria-hidden="true">Rp</span>
      <FiGrid className={styles.amountIcon} aria-hidden="true" />
    </div>
    {form.transaction_type === TRANSACTION_TYPES.EXPENSE ? (
      <div className={styles.quickAmounts} aria-label="Nominal pengeluaran cepat">
        {QUICK_EXPENSE_AMOUNTS.map((amount) => (
          <button key={amount} type="button" aria-pressed={Number(form.amount || 0) === amount} onClick={() => update("amount", String(amount))}>
            {quickAmountLabel(amount)}
          </button>
        ))}
      </div>
    ) : null}
  </section>
);

const DetailCopy = ({ label, value, meta, error, errorId }) => (
  <span className={styles.detailCopy}>
    <span className={styles.detailKey}>{label}</span>
    <span className={styles.detailValue}>{value}</span>
    {meta ? <span className={styles.detailMeta}>{meta}</span> : null}
    {error ? <span id={errorId} className={styles.detailError}>{error}</span> : null}
  </span>
);

const LockedContextRow = ({ icon: Icon, label, value, meta }) => (
  <div className={styles.contextLocked} role="status">
    <span className={styles.detailIcon} aria-hidden="true"><Icon /></span>
    <DetailCopy label={label} value={value} meta={meta} />
    <FiCheckCircle className={styles.contextLockedCheck} aria-label="Dikunci dari Alokasi Dana" />
  </div>
);

const DateRow = ({ form, update, errors, min = "", max = "" }) => (
  <label className={styles.detailRow} htmlFor="transaction-date">
    <span className={styles.detailIcon} aria-hidden="true"><FiCalendar /></span>
    <DetailCopy label="Tanggal" value={formatDateLongIndonesia(form.transaction_date) || "Pilih tanggal"} error={errors.transaction_date} errorId="transaction-date-error" />
    <FiChevronRight className={styles.chevron} aria-hidden="true" />
    <TemporalInput
      id="transaction-date"
      className={styles.nativeOverlay}
      type="date"
      value={form.transaction_date}
      min={min || undefined}
      max={max || undefined}
      onChange={(event) => update("transaction_date", event.target.value)}
      aria-invalid={Boolean(errors.transaction_date)}
      aria-describedby={errors.transaction_date ? "transaction-date-error" : undefined}
    />
  </label>
);

const sourceAccountOptionMeta = (item, transactionType) => {
  if ([TRANSACTION_TYPES.TRANSFER, TRANSACTION_TYPES.EXPENSE].includes(transactionType)) return `Tersedia ${formatRupiah(item.available_balance ?? item.balance ?? 0)}`;
  return `Saldo ${formatRupiah(item.balance || 0)}`;
};

const TransactionAccountField = (p) => {
  const destinationMode = p.isIncome;
  if (p.lockPlanningSelection && !destinationMode) {
    const selected = p.accounts.find((item) => item.account_id === p.form.source_account_id) || null;
    return <LockedContextRow
      icon={AccountIcon}
      label="Dari rekening"
      value={selected ? accountDisplayLabel(selected) : "Rekening Alokasi"}
      meta={selected ? `${sourceAccountOptionMeta(selected, p.form.transaction_type)} · Terkunci dari Alokasi` : "Terkunci dari Alokasi"}
    />;
  }
  const pickerAccounts = destinationMode
    ? p.compatibleDestinationAccounts
    : sourceAccountPicker({ accounts: p.accounts, transactionType: p.form.transaction_type, selectedAccountId: p.form.source_account_id, recentTransactions: p.recentTransactions });
  const value = destinationMode ? p.form.destination_account_id : p.form.source_account_id;
  const label = destinationMode ? "Masuk ke rekening" : "Dari rekening";
  const error = destinationMode ? p.errors.destination_account_id : p.errors.source_account_id;
  const options = pickerAccounts.map((item) => ({
    value: item.account_id,
    label: accountDisplayLabel(item),
    meta: destinationMode ? `Saldo ${formatRupiah(item.balance || 0)}` : sourceAccountOptionMeta(item, p.form.transaction_type),
    ...accountOptionVisual(item),
  }));
  return (
    <InlineSelectionPicker
      label={label}
      required
      value={value}
      onChange={destinationMode ? (accountId) => p.update("destination_account_id", accountId) : p.onSourceAccountChange}
      options={options}
      placeholder="Pilih rekening"
      placeholderOption={{ icon: AccountIcon }}
      searchable={options.length > 8}
      searchPlaceholder="Cari rekening…"
      emptyText={destinationMode ? "Belum ada rekening tujuan yang dapat digunakan." : "Belum ada rekening sumber yang dapat digunakan."}
      error={error}
      disabled={p.outcomeUnknown}
    />
  );
};

const LockedCategoryField = (p) => {
  const category = p.visibleCategories.find((item) => item.category_id === p.form.category_id) || null;
  return <LockedContextRow
    icon={FiTag}
    label="Kategori"
    value={category?.name || "Kategori Kebutuhan"}
    meta="Mengikuti Kebutuhan yang dipilih"
  />;
};

const needMeta = (candidate) => {
  const amount = Math.max(0, Number(candidate.need.amount || 0));
  const used = Math.max(0, Number(candidate.need.used_amount || 0));
  return `${candidate.envelope.name} · sisa ${formatRupiah(Math.max(0, amount - used))}`;
};

const lockedPlanningNeed = (p) => {
  if (!p.lockPlanningSelection || !p.form.budget_id) return null;
  const contextual = p.allocationCandidates.find((item) => item.need.budget_id === p.form.budget_id && item.envelope.envelope_period_id === p.form.envelope_period_id) || null;
  return contextual || {
    need: p.budgets.find((item) => item.budget_id === p.form.budget_id) || null,
    envelope: p.envelopes.find((item) => item.envelope_period_id === p.form.envelope_period_id) || null,
  };
};

// Penggunaan dana dibuat progresif: nol kandidat memakai Dana Tersedia otomatis,
// satu kandidat auto-link namun tetap dapat diubah, dan beberapa kandidat meminta pilihan user.
// eslint-disable-next-line complexity
const NeedField = (p) => {
  if (p.form.transaction_type !== TRANSACTION_TYPES.EXPENSE || !p.form.source_account_id || !p.form.category_id) return null;
  const locked = lockedPlanningNeed(p);
  const lockedNeed = locked?.need || null;
  const lockedEnvelope = locked?.envelope || null;
  if (locked) {
    const amount = Math.max(0, Number(lockedNeed?.amount || 0));
    const used = Math.max(0, Number(lockedNeed?.used_amount || 0));
    const remaining = Math.max(0, amount - used);
    return <div className={styles.needLocked} role="status">
      <FiCheckCircle aria-hidden="true" />
      <span>
        <strong>{lockedEnvelope?.name ? `${lockedEnvelope.name} · ${lockedNeed?.name || "Kebutuhan"}` : lockedNeed?.name || "Kebutuhan terpilih"}</strong>
        <small>Sisa {formatRupiah(remaining)}</small>
      </span>
      <small>Dari Alokasi</small>
    </div>;
  }

  if (!p.allocationCandidates.length) {
    return (
      <div className={styles.needField}>
        <span className={styles.sectionLabel}>Penggunaan dana</span>
        <div className={styles.needEmpty} role="status">
          <FiLayers aria-hidden="true" />
          <span>
            <strong>Dana Tersedia</strong>
            <small>Belum ada Kebutuhan yang cocok · transaksi dicatat tanpa Alokasi.</small>
          </span>
        </div>
      </div>
    );
  }

  const automatic = p.allocationCandidates.length === 1
    && p.allocationMode === "auto"
    && p.form.budget_id === p.allocationCandidates[0].need.budget_id;
  const options = [
    {
      value: UNALLOCATED_NEED_VALUE,
      label: "Dana Tersedia",
      meta: "Tanpa Alokasi · Kebutuhan tidak berubah",
      icon: FiLayers,
    },
    ...p.allocationCandidates.map((candidate) => ({
      value: candidate.need.budget_id,
      label: candidate.need.name || "Kebutuhan",
      meta: needMeta(candidate),
      icon: FiCheckCircle,
      ...(automatic && p.allocationCandidates.length === 1 ? { badge: "Otomatis", badgeTone: "primary" } : {}),
    })),
  ];
  const value = needSelectionValue({ budgetId: p.form.budget_id, allocationMode: p.allocationMode });
  const ambiguous = p.allocationCandidates.length > 1;

  return (
    <div className={styles.needField}>
      <InlineSelectionPicker
        label="Penggunaan dana"
        value={value}
        onChange={p.onNeedChange}
        options={options}
        placeholder={ambiguous ? "Pilih penggunaan dana" : "Pilih Kebutuhan"}
        placeholderMeta={ambiguous ? `${p.allocationCandidates.length} Kebutuhan cocok · pilih salah satu atau Dana Tersedia` : ""}
        placeholderOption={{ icon: FiLayers }}
        searchable={options.length > 8}
        searchPlaceholder="Cari Kebutuhan…"
        emptyText="Belum ada Kebutuhan yang cocok."
        error={p.errors.budget_id || ""}
        disabled={p.outcomeUnknown}
      />
      {automatic ? <small className={styles.smartMatch}><FiCheckCircle aria-hidden="true" /> Dipilih otomatis karena hanya satu Kebutuhan yang cocok · ketuk untuk mengubah.</small> : null}
    </div>
  );
};

const PrimaryDetails = (p) => (
  <section className={styles.section}>
    <div className={styles.detailStack}>
      <TransactionAccountField {...p} />
      {p.lockPlanningSelection ? <LockedCategoryField {...p} /> : <MobileTransactionCategoryField
        key={`${p.form.transaction_type}:${p.form.source_account_id}`}
        form={p.form}
        update={p.update}
        visibleCategories={p.visibleCategories}
        recentTransactions={p.recentTransactions}
        errors={p.errors}
        outcomeUnknown={p.outcomeUnknown}
        label={categoryFieldLabel(p.form.transaction_type)}
      />}
      <NeedField {...p} />
      <DateRow form={p.form} update={p.update} errors={p.errors} min={p.planningDateMin} max={p.planningDateMax} />
    </div>
  </section>
);

const PaymentMethods = ({ form, update }) => {
  const directOptions = PAYMENT_METHOD_OPTIONS.filter((item) => item.value);
  const options = form.payment_method === "autodebit"
    ? [{ value: "autodebit", label: paymentMethodLabel("autodebit"), legacy: true }, ...directOptions]
    : directOptions;
  return (
    <section className={styles.section}>
      <span className={styles.sectionLabel}>Metode pembayaran</span>
      <div className={styles.paymentChoices} aria-label="Metode pembayaran">
        {options.map((item) => (
          <button key={item.value || "unset"} type="button" className={item.legacy ? styles.legacyPayment : undefined} aria-pressed={form.payment_method === item.value} aria-disabled={item.legacy || undefined} onClick={() => { if (!item.legacy) update("payment_method", form.payment_method === item.value ? "" : item.value); }}>
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
};

const NotesField = ({ form, update, errors }) => (
  <section className={styles.section}>
    <label className={styles.sectionLabel} htmlFor="description">Catatan</label>
    <textarea
      id="description"
      className={styles.notes}
      rows="2"
      maxLength="250"
      value={form.description}
      onChange={(event) => update("description", event.target.value)}
      onInput={(event) => { event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 130)}px`; }}
      placeholder="Opsional"
      aria-invalid={Boolean(errors.description)}
      aria-describedby={errors.description ? "description-error" : undefined}
    />
    {errors.description ? <small id="description-error" className={styles.error}>{errors.description}</small> : null}
  </section>
);

const AdditionalDetails = (p) => {
  const shouldOpen = p.isEditing || Boolean(p.form.payment_method || p.form.description) || Boolean(p.errors.description);
  const [open, setOpen] = useState(shouldOpen);
  useEffect(() => {
    if (p.errors.description) setOpen(true);
  }, [p.errors.description]);
  return (
    <section className={styles.additionalDetails}>
      <button type="button" className={styles.additionalToggle} aria-expanded={open} aria-controls="transaction-additional-details" onClick={() => setOpen((current) => !current)}>
        <span><strong>Catatan & metode pembayaran</strong><small>Opsional</small></span>
        {open ? <FiChevronUp aria-hidden="true" /> : <FiChevronDown aria-hidden="true" />}
      </button>
      {open ? (
        <div id="transaction-additional-details" className={styles.additionalBody}>
          <PaymentMethods form={p.form} update={p.update} />
          <NotesField form={p.form} update={p.update} errors={p.errors} />
        </div>
      ) : null}
    </section>
  );
};

const ValidationSummary = ({ errors }) => {
  const messages = Object.values(errors || {}).filter(Boolean);
  if (!messages.length) return null;
  return <div className={styles.validationNotice} role="alert" aria-live="assertive"><FiAlertTriangle aria-hidden="true" /><span><strong>Lengkapi data transaksi yang wajib dipilih.</strong> {messages[0]}</span></div>;
};

const FundsWarning = ({ warning }) => warning ? <div className={styles.warningNotice} role="status"><FiAlertTriangle aria-hidden="true" /><span><strong>{warning.title}</strong> {warning.message}</span></div> : null;

const SubmitFeedback = ({ confirmation, submitState }) => (
  <>
    {confirmation ? <div className={styles.warningNotice} role="alert"><FiAlertTriangle aria-hidden="true" /><span>{confirmation.message} Periksa data, lalu tekan “Simpan tetap” untuk mengonfirmasi.</span></div> : null}
    {submitState.error ? <div className={styles.failureNotice} role="alert">{submitState.error.message}</div> : null}
  </>
);

const MobileTransactionFields = (p) => (
  <div className={styles.composer}>
    <ValidationSummary errors={p.errors} />
    <TypeSelector form={p.form} update={p.update} lockType={p.lockType} />
    <AmountField form={p.form} update={p.update} errors={p.errors} amountRef={p.amountRef} />
    <PrimaryDetails {...p} />
    <AdditionalDetails {...p} />
    <FundsWarning warning={p.fundsWarning} />
    <TransactionImpactPreview impact={p.impact} isTransfer={false} />
    <SubmitFeedback confirmation={p.confirmation} submitState={p.submitState} />
  </div>
);

export default MobileTransactionFields;
