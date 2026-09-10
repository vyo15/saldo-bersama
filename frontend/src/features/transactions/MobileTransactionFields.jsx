import { FiAlertTriangle, FiCalendar, FiChevronRight, FiGrid, FiLayers } from "react-icons/fi";
import { AccountIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { accountOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { formatRupiah } from "../../domain/money.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { userRoleLabel } from "../../shared/presentation/user.js";
import MobileTransactionCategoryField from "./MobileTransactionCategoryField.jsx";
import { orderedEnvelopeOptions, sourceAccountPicker } from "./transactionFormSmartDefaults.js";
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

const AmountField = ({ form, update, errors, amountRef }) => (
  <section className={styles.section}>
    <div className={styles.amountVisual}>
      <MoneyInput
        ref={amountRef}
        id="transaction-amount"
        value={form.amount}
        onChange={(value) => update("amount", value)}
        error={errors.amount}
        required
      />
      <span className={styles.currencyBadge} aria-hidden="true">Rp</span>
      <FiGrid className={styles.amountIcon} aria-hidden="true" />
    </div>
    {form.transaction_type === TRANSACTION_TYPES.EXPENSE ? (
      <div className={styles.quickAmounts} aria-label="Nominal pengeluaran cepat">
        {QUICK_EXPENSE_AMOUNTS.map((amount) => (
          <button
            key={amount}
            type="button"
            aria-pressed={Number(form.amount || 0) === amount}
            onClick={() => update("amount", String(amount))}
          >
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

const DateRow = ({ form, update, errors }) => (
  <label className={styles.detailRow} htmlFor="transaction-date">
    <span className={styles.detailIcon} aria-hidden="true"><FiCalendar /></span>
    <DetailCopy
      label="Tanggal"
      value={formatDateLongIndonesia(form.transaction_date) || "Pilih tanggal"}
      error={errors.transaction_date}
      errorId="transaction-date-error"
    />
    <FiChevronRight className={styles.chevron} aria-hidden="true" />
    <TemporalInput
      id="transaction-date"
      className={styles.nativeOverlay}
      type="date"
      value={form.transaction_date}
      onChange={(event) => update("transaction_date", event.target.value)}
      aria-invalid={Boolean(errors.transaction_date)}
      aria-describedby={errors.transaction_date ? "transaction-date-error" : undefined}
    />
  </label>
);

const compactAllocationHint = ({ form, candidates }) => {
  if (!form.source_account_id) return "Pilih rekening terlebih dahulu";
  if (!form.category_id) return "Pilih kategori terlebih dahulu";
  if (candidates.length > 1) return `${candidates.length} Alokasi cocok`;
  if (candidates.length === 1) return `${candidates[0].envelope.name} direkomendasikan`;
  return "Opsional";
};

const sourceAccountOptionMeta = (item, transactionType) => {
  if ([TRANSACTION_TYPES.TRANSFER, TRANSACTION_TYPES.EXPENSE].includes(transactionType)) {
    return `Tersedia ${formatRupiah(item.available_balance ?? item.balance ?? 0)}`;
  }
  return `Saldo ${formatRupiah(item.balance || 0)}`;
};

const TransactionAccountField = (p) => {
  const destinationMode = p.isIncome;
  const pickerAccounts = destinationMode
    ? p.compatibleDestinationAccounts
    : sourceAccountPicker({
      accounts: p.accounts,
      transactionType: p.form.transaction_type,
      selectedAccountId: p.form.source_account_id,
      recentTransactions: p.recentTransactions,
    });
  const value = destinationMode ? p.form.destination_account_id : p.form.source_account_id;
  const label = destinationMode ? "Rekening tujuan" : "Rekening sumber";
  const placeholderMeta = destinationMode
    ? "Pilih rekening yang menerima dana"
    : "Hanya rekening yang dapat dipakai ditampilkan";
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
      placeholderMeta={placeholderMeta}
      placeholderOption={{ icon: AccountIcon }}
      searchable={options.length > 8}
      searchPlaceholder="Cari rekening…"
      emptyText={destinationMode ? "Belum ada rekening tujuan yang dapat digunakan." : "Belum ada rekening sumber yang dapat digunakan."}
      error={error}
      disabled={p.outcomeUnknown}
    />
  );
};

const envelopeOptionMeta = (item) => {
  const assignee = item.assignee_user_id
    ? `${item.assignee_name || "Pengguna"} · ${userRoleLabel(item.assignee_role)}`
    : "Bersama";
  return `${assignee} · sisa ${formatRupiah(item.remaining_amount || 0)}`;
};

const EnvelopeField = (p) => {
  const disabled = !p.form.source_account_id || !p.form.category_id;
  const hint = compactAllocationHint({ form: p.form, candidates: p.allocationCandidates });
  const options = disabled ? [] : [
    {
      value: "",
      label: "Belum dialokasikan",
      meta: "Gunakan dana rekening tanpa mengikat ke Alokasi Dana",
      icon: FiLayers,
    },
    ...orderedEnvelopeOptions(p.compatibleEnvelopes, p.allocationCandidates).map((item) => ({
      value: item.envelope_period_id,
      label: item.name,
      meta: envelopeOptionMeta(item),
      icon: FiLayers,
    })),
  ];

  return (
    <InlineSelectionPicker
      label="Alokasi Dana · opsional"
      value={p.form.envelope_period_id}
      onChange={p.onEnvelopeChange}
      options={options}
      placeholder={disabled ? "Belum tersedia" : "Pilih Alokasi Dana"}
      placeholderMeta={hint}
      placeholderOption={{ icon: FiLayers }}
      searchable={options.length > 8}
      searchPlaceholder="Cari Alokasi Dana…"
      emptyText="Belum ada Alokasi Dana yang cocok."
      disabled={disabled || p.outcomeUnknown}
    />
  );
};

const DetailGroup = (p) => (
  <section className={styles.section}>
    <span className={styles.sectionLabel}>Detail transaksi</span>
    <div className={styles.detailStack}>
      <DateRow form={p.form} update={p.update} errors={p.errors} />
      <TransactionAccountField {...p} />
      <MobileTransactionCategoryField
        key={`${p.form.transaction_type}:${p.form.source_account_id}`}
        form={p.form}
        update={p.update}
        visibleCategories={p.visibleCategories}
        recentTransactions={p.recentTransactions}
        errors={p.errors}
        outcomeUnknown={p.outcomeUnknown}
      />
      {p.form.transaction_type === TRANSACTION_TYPES.EXPENSE ? <EnvelopeField {...p} /> : null}
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
          <button
            key={item.value || "unset"}
            type="button"
            className={item.legacy ? styles.legacyPayment : undefined}
            aria-pressed={form.payment_method === item.value}
            aria-disabled={item.legacy || undefined}
            onClick={() => {
              if (!item.legacy) update("payment_method", form.payment_method === item.value ? "" : item.value);
            }}
          >
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
      onInput={(event) => {
        event.currentTarget.style.height = "auto";
        event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 130)}px`;
      }}
      placeholder="Opsional"
      aria-invalid={Boolean(errors.description)}
      aria-describedby={errors.description ? "description-error" : undefined}
    />
    {errors.description ? <small id="description-error" className={styles.error}>{errors.description}</small> : null}
  </section>
);

const ValidationSummary = ({ errors }) => {
  const messages = Object.values(errors || {}).filter(Boolean);
  if (!messages.length) return null;
  return (
    <div className={styles.validationNotice} role="alert" aria-live="assertive">
      <FiAlertTriangle aria-hidden="true" />
      <span><strong>Lengkapi data transaksi yang wajib dipilih.</strong> {messages[0]}</span>
    </div>
  );
};

const FundsWarning = ({ warning }) => warning ? (
  <div className={styles.warningNotice} role="status">
    <FiAlertTriangle aria-hidden="true" />
    <span><strong>{warning.title}</strong> {warning.message}</span>
  </div>
) : null;

const SubmitFeedback = ({ confirmation, submitState }) => (
  <>
    {confirmation ? (
      <div className={styles.warningNotice} role="alert">
        <FiAlertTriangle aria-hidden="true" />
        <span>{confirmation.message} Periksa data, lalu tekan “Simpan tetap” untuk mengonfirmasi.</span>
      </div>
    ) : null}
    {submitState.error ? <div className={styles.failureNotice} role="alert">{submitState.error.message}</div> : null}
  </>
);

const MobileTransactionFields = (p) => (
    <div className={styles.composer}>
      <ValidationSummary errors={p.errors} />
      <TypeSelector form={p.form} update={p.update} lockType={p.lockType} />
      <AmountField form={p.form} update={p.update} errors={p.errors} amountRef={p.amountRef} />
      <DetailGroup {...p} />
      <PaymentMethods form={p.form} update={p.update} />
      <NotesField form={p.form} update={p.update} errors={p.errors} />
      <FundsWarning warning={p.fundsWarning} />
      <TransactionImpactPreview impact={p.impact} isTransfer={false} />
      <SubmitFeedback confirmation={p.confirmation} submitState={p.submitState} />
    </div>
  );

export default MobileTransactionFields;
