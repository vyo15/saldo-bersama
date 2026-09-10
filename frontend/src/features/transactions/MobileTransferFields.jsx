import { FiAlertTriangle, FiArrowRight, FiCalendar, FiChevronRight } from "react-icons/fi";
import { AccountIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { accountOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { formatRupiah } from "../../domain/money.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { sourceAccountPicker } from "./transactionFormSmartDefaults.js";
import styles from "./MobileTransferFields.module.css";

import TemporalInput from "../../components/common/TemporalInput.jsx";
const transferAccountOptions = ({ accounts, mode }) => accounts.map((account) => ({
  value: account.account_id,
  label: accountDisplayLabel(account),
  meta: mode === "available"
    ? `Tersedia ${formatRupiah(account.available_balance ?? account.balance ?? 0)}`
    : `Saldo ${formatRupiah(account.balance || 0)}`,
  ...accountOptionVisual(account),
}));

const TransferAccountPicker = ({
  label,
  value,
  onChange,
  accounts,
  balanceMode,
  placeholderMeta,
  error,
  disabled,
  emptyText,
}) => (
  <InlineSelectionPicker
    label={label}
    required
    value={value}
    onChange={onChange}
    options={transferAccountOptions({ accounts, mode: balanceMode })}
    placeholder="Pilih rekening"
    placeholderMeta={placeholderMeta}
    placeholderOption={{ icon: AccountIcon }}
    searchable={accounts.length > 8}
    searchPlaceholder="Cari rekening…"
    emptyText={emptyText}
    error={error}
    disabled={disabled}
  />
);

const TransferNote = ({ form, update, intentLocked }) => (
  <section className={styles.section}>
    <div className={styles.labelRow}>
      <label className={styles.sectionLabel} htmlFor="mobile-transfer-description">Catatan</label>
      <span>{String(form.description || "").length}/250</span>
    </div>
    <textarea
      id="mobile-transfer-description"
      className={styles.note}
      rows="2"
      maxLength="250"
      value={form.description}
      onChange={(event) => update("description", event.target.value)}
      onInput={(event) => {
        event.currentTarget.style.height = "auto";
        event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 130)}px`;
      }}
      placeholder="Contoh: Pindah saldo untuk kebutuhan bulanan"
      disabled={intentLocked}
    />
  </section>
);

const TransferAmount = ({ form, update, errors, amountRef, submitting, confirmation, intentLocked }) => (
  <section className={styles.section}>
    <span className={styles.sectionLabel}>Nominal</span>
    <div className={styles.amountCard}>
      <div className={styles.amountInputWrap}>
        <span className={styles.currency} aria-hidden="true">Rp</span>
        <MoneyInput
          ref={amountRef}
          id="transaction-amount"
          label="Jumlah transfer"
          value={form.amount}
          onChange={(value) => update("amount", value)}
          error={errors.amount}
          required
          disabled={intentLocked}
        />
      </div>
      <button
        className={styles.submitButton}
        type="submit"
        disabled={submitting}
        aria-label={submitting ? "Memproses transfer" : intentLocked ? "Coba lagi transfer dengan data yang sama" : confirmation ? "Konfirmasi transfer tetap" : "Transfer sekarang"}
        title={intentLocked ? "Coba lagi data yang sama" : confirmation ? "Konfirmasi transfer tetap" : "Transfer sekarang"}
      >
        <FiArrowRight aria-hidden="true" />
      </button>
    </div>
  </section>
);

const TransferDate = ({ form, update, errors, intentLocked }) => (
  <section className={styles.section}>
    <span className={styles.sectionLabel}>Tanggal transaksi</span>
    <label className={styles.dateCard} htmlFor="mobile-transfer-date">
      <span className={styles.dateIcon} aria-hidden="true"><FiCalendar /></span>
      <span className={styles.dateCopy}>
        <small>Tanggal</small>
        <strong>{formatDateLongIndonesia(form.transaction_date) || "Pilih tanggal"}</strong>
      </span>
      <FiChevronRight className={styles.chevron} aria-hidden="true" />
      <TemporalInput
        id="mobile-transfer-date"
        type="date"
        value={form.transaction_date}
        onChange={(event) => update("transaction_date", event.target.value)}
        aria-invalid={Boolean(errors.transaction_date)}
        disabled={intentLocked}
      />
    </label>
    {errors.transaction_date ? <small className={styles.error}>{errors.transaction_date}</small> : null}
  </section>
);

const TransferImpactValue = ({ label, value, delta, tone }) => (
  <span className={styles.impactValue}>
    <span>
      <small>{label}</small>
      <b>{formatRupiah(value)}</b>
    </span>
    <strong className={tone === "negative" ? styles.negativeDelta : styles.positiveDelta}>
      {tone === "negative" ? "−" : "+"}{formatRupiah(Math.abs(delta))}
    </strong>
  </span>
);

const ImpactPreview = ({ impact }) => {
  if (!impact || Number(impact.amount || 0) <= 0 || !impact.source || !impact.destination) return null;
  return (
    <section className={styles.impact} aria-live="polite">
      <span className={styles.impactLabel}>Setelah transfer</span>
      <div className={styles.impactRoute}>
        <TransferImpactValue
          label={impact.source.name}
          value={impact.sourceAfter}
          delta={Number(impact.sourceAfter || 0) - Number(impact.source.balance || 0)}
          tone="negative"
        />
        <TransferImpactValue
          label={impact.destination.name}
          value={impact.destinationAfter}
          delta={Number(impact.destinationAfter || 0) - Number(impact.destination.balance || 0)}
          tone="positive"
        />
      </div>
      <p>Total aset tetap. Transfer memakai dana yang belum dialokasikan dari rekening sumber.</p>
    </section>
  );
};

const TransferStatus = ({ confirmation, submitState }) => (
  <>
    {confirmation ? <div className={styles.warning} role="alert"><FiAlertTriangle aria-hidden="true" /><span>{confirmation.message} Periksa data, lalu tekan tombol panah sekali lagi untuk mengonfirmasi.</span></div> : null}
    {submitState.error ? <div className={styles.failure} role="alert">{submitState.error.message}</div> : null}
  </>
);

const MobileTransferFields = ({
  form,
  update,
  errors,
  amountRef,
  accounts,
  compatibleDestinationAccounts,
  recentTransactions,
  onSourceAccountChange,
  impact,
  confirmation,
  submitState,
  submitting,
  outcomeUnknown,
}) => {
  const sourceAccounts = sourceAccountPicker({
    accounts,
    transactionType: form.transaction_type,
    selectedAccountId: form.source_account_id,
    recentTransactions,
  });

  return (
    <div className={styles.composer}>
      <TransferAccountPicker
        label="Dari rekening"
        value={form.source_account_id}
        onChange={onSourceAccountChange}
        accounts={sourceAccounts}
        balanceMode="available"
        placeholderMeta="Hanya rekening dengan dana tersedia yang dapat dipakai"
        error={errors.source_account_id}
        disabled={outcomeUnknown}
        emptyText="Belum ada rekening sumber dengan dana yang dapat digunakan."
      />
      <TransferAccountPicker
        label="Ke rekening"
        value={form.destination_account_id}
        onChange={(accountId) => update("destination_account_id", accountId)}
        accounts={compatibleDestinationAccounts}
        balanceMode="balance"
        placeholderMeta={compatibleDestinationAccounts.length ? "Pilih rekening penerima" : "Tidak ada rekening tujuan yang kompatibel"}
        error={errors.destination_account_id}
        disabled={outcomeUnknown || compatibleDestinationAccounts.length === 0}
        emptyText="Belum ada rekening tujuan yang kompatibel."
      />
      <TransferNote form={form} update={update} intentLocked={outcomeUnknown} />
      <TransferAmount form={form} update={update} errors={errors} amountRef={amountRef} submitting={submitting} confirmation={confirmation} intentLocked={outcomeUnknown} />
      <TransferDate form={form} update={update} errors={errors} intentLocked={outcomeUnknown} />
      <ImpactPreview impact={impact} />
      <TransferStatus confirmation={confirmation} submitState={submitState} />
      <p className={styles.guard}>{outcomeUnknown ? "Data transfer dikunci sementara. Tekan tombol transfer lagi untuk mencoba request yang sama; jangan ubah nominal atau rekening sampai server memberi hasil definitif." : "Saldo dan dana tersedia baru berubah setelah server mengonfirmasi transfer dan aplikasi menyegarkan data rekening."}</p>
    </div>
  );
};

export default MobileTransferFields;
