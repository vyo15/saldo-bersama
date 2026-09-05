import { FiAlertTriangle, FiCalendar, FiChevronRight, FiCreditCard, FiGrid, FiLayers, FiTag } from "react-icons/fi";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { formatRupiah } from "../../domain/money.js";
import CostShareField from "./CostShareField.jsx";
import { PAYMENT_METHOD_OPTIONS, QUICK_EXPENSE_AMOUNTS, TRANSACTION_TYPE_OPTIONS, paymentMethodLabel, quickAmountLabel } from "./transactionFormPresentation.js";
import TransactionImpactPreview from "./components/TransactionImpactPreview.jsx";
import styles from "./MobileTransactionFields.module.css";

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
    <input
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

const SelectionRow = ({ id, icon: Icon, label, value, meta, error, errorId, onClick, disabled = false }) => (
  <button
    id={id}
    className={styles.detailRow}
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-invalid={Boolean(error)}
    aria-describedby={error ? errorId : undefined}
  >
    <span className={styles.detailIcon} aria-hidden="true"><Icon /></span>
    <DetailCopy label={label} value={value} meta={meta} error={error} errorId={errorId} />
    <FiChevronRight className={styles.chevron} aria-hidden="true" />
  </button>
);

const compactAllocationHint = ({ form, candidates }) => {
  if (!form.source_account_id) return "Pilih rekening terlebih dahulu";
  if (!form.category_id) return "Pilih kategori terlebih dahulu";
  if (candidates.length > 1) return `${candidates.length} Alokasi cocok`;
  if (candidates.length === 1) return `${candidates[0].envelope.name} direkomendasikan`;
  return "Opsional";
};

const selectedDestinationAccount = (p) => (
  p.compatibleDestinationAccounts.find((item) => item.account_id === p.form.destination_account_id)
  || p.accounts.find((item) => item.account_id === p.form.destination_account_id)
  || null
);

const accountDetail = ({ isIncome, selectedAccount }) => {
  if (!selectedAccount) {
    return isIncome
      ? { value: "Pilih rekening tujuan", meta: "Pilih rekening yang menerima dana" }
      : { value: "Pilih rekening sumber", meta: "Hanya rekening yang dapat dipakai ditampilkan" };
  }
  const value = selectedAccount.account_name || selectedAccount.name;
  if (isIncome) return { value, meta: `Saldo ${formatRupiah(selectedAccount.balance || 0)}` };
  return {
    value,
    meta: `Dana tersedia ${formatRupiah(selectedAccount.available_balance ?? selectedAccount.balance ?? 0)}`,
  };
};

const DetailGroup = (p) => {
  const selectedSource = p.accounts.find((item) => item.account_id === p.form.source_account_id) || null;
  const selectedDestination = selectedDestinationAccount(p);
  const selectedCategory = p.visibleCategories.find((item) => item.category_id === p.form.category_id) || null;
  const selectedEnvelope = p.compatibleEnvelopes.find((item) => item.envelope_period_id === p.form.envelope_period_id) || null;
  const envelopeDisabled = !p.form.source_account_id || !p.form.category_id;
  const envelopeHint = compactAllocationHint({ form: p.form, candidates: p.allocationCandidates });
  const accountLabel = p.isIncome ? "Rekening tujuan" : "Rekening sumber";
  const selectedAccount = p.isIncome ? selectedDestination : selectedSource;
  const { value: accountValue, meta: accountMeta } = accountDetail({ isIncome: p.isIncome, selectedAccount });

  return (
    <section className={styles.section}>
      <span className={styles.sectionLabel}>Detail transaksi</span>
      <div className={styles.detailGroup}>
        <DateRow form={p.form} update={p.update} errors={p.errors} />
        <SelectionRow
          id={p.isIncome ? "destination-account" : "source-account"}
          icon={FiCreditCard}
          label={accountLabel}
          value={accountValue}
          meta={accountMeta}
          error={p.isIncome ? p.errors.destination_account_id : p.errors.source_account_id}
          errorId={p.isIncome ? "destination-account-error" : "source-account-error"}
          onClick={() => p.openMobileSelection(p.isIncome ? "destination-account" : "source-account")}
        />
        <SelectionRow
          id="category"
          icon={FiTag}
          label="Kategori"
          value={selectedCategory?.name || "Pilih kategori"}
          meta={!selectedCategory ? "Kategori menyesuaikan jenis transaksi" : undefined}
          error={p.errors.category_id}
          errorId="category-error"
          onClick={() => p.openMobileSelection("category")}
        />
        {p.form.transaction_type === TRANSACTION_TYPES.EXPENSE ? (
          <SelectionRow
            id="envelope"
            icon={FiLayers}
            label="Alokasi Dana · opsional"
            value={selectedEnvelope?.name || (envelopeDisabled ? "Belum tersedia" : "Belum dialokasikan")}
            meta={selectedEnvelope ? `Sisa ${formatRupiah(selectedEnvelope.remaining_amount || 0)}` : envelopeHint}
            onClick={() => p.openMobileSelection("envelope")}
            disabled={envelopeDisabled}
          />
        ) : null}
      </div>
    </section>
  );
};

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

const MobileTransactionFields = (p) => {
  const source = p.accounts.find((item) => item.account_id === p.form.source_account_id) || null;
  const showCostShare = p.form.transaction_type === TRANSACTION_TYPES.EXPENSE && source?.owner_scope === "shared";

  return (
    <div className={styles.composer}>
      <ValidationSummary errors={p.errors} />
      <TypeSelector form={p.form} update={p.update} lockType={p.lockType} />
      <AmountField form={p.form} update={p.update} errors={p.errors} amountRef={p.amountRef} />
      <DetailGroup {...p} />
      <CostShareField
        visible={showCostShare}
        form={p.form}
        members={p.members}
        setForm={p.setForm}
        onChange={p.onCostShareChange}
        errors={p.errors}
      />
      <PaymentMethods form={p.form} update={p.update} />
      <NotesField form={p.form} update={p.update} errors={p.errors} />
      <FundsWarning warning={p.fundsWarning} />
      <TransactionImpactPreview impact={p.impact} isTransfer={false} />
      <SubmitFeedback confirmation={p.confirmation} submitState={p.submitState} />
    </div>
  );
};

export default MobileTransactionFields;
