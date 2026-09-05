import { FiAlertTriangle, FiArrowRight, FiCalendar, FiChevronRight, FiCreditCard } from "react-icons/fi";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { formatRupiah } from "../../domain/money.js";
import { accountProviderLabel } from "../../shared/presentation/account.js";
import styles from "./MobileTransferFields.module.css";

const accountBalance = (accountBalances, accountId) => accountBalances.find((item) => item.account_id === accountId) || null;

const accountBalanceLabel = (accountBalances, accountId, mode) => {
  const balance = accountBalance(accountBalances, accountId);
  if (!balance) return "Saldo belum tersedia";
  if (mode === "available") return `Tersedia ${formatRupiah(balance.available_balance ?? balance.balance ?? 0)}`;
  return `Saldo ${formatRupiah(balance.balance || 0)}`;
};

const AccountIdentity = ({ account, accountBalances, balanceMode }) => (
  <span className={styles.accountCopy}>
    <strong>{String(account.account_name || account.name || "Rekening")}</strong>
    <small>{accountProviderLabel(account)} · {accountBalanceLabel(accountBalances, account.account_id, balanceMode)}</small>
  </span>
);

const AccountPickerRow = ({ id, label, account, accountBalances, balanceMode, placeholder, helper, onClick, error, disabled }) => (
  <section className={styles.section}>
    <span className={styles.sectionLabel}>{label}</span>
    <button
      id={id}
      className={styles.accountPicker}
      type="button"
      onClick={onClick}
      aria-invalid={Boolean(error)}
      aria-describedby={error ? `${id}-error` : undefined}
      disabled={disabled}
    >
      <span className={styles.accountIcon} aria-hidden="true"><FiCreditCard /></span>
      {account
        ? <AccountIdentity account={account} accountBalances={accountBalances} balanceMode={balanceMode} />
        : <span className={styles.accountCopy}><strong>{placeholder}</strong><small>{helper}</small></span>}
      <FiChevronRight className={styles.chevron} aria-hidden="true" />
    </button>
    {error ? <small id={`${id}-error`} className={styles.error}>{error}</small> : null}
  </section>
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
      <input
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
  accountBalances,
  compatibleDestinationAccounts,
  openMobileSelection,
  impact,
  confirmation,
  submitState,
  submitting,
  outcomeUnknown,
}) => {
  const source = accounts.find((item) => item.account_id === form.source_account_id) || null;
  const destination = compatibleDestinationAccounts.find((item) => item.account_id === form.destination_account_id) || null;

  return (
    <div className={styles.composer}>
      <AccountPickerRow
        id="source-account"
        label="Dari rekening"
        account={source}
        accountBalances={accountBalances}
        balanceMode="available"
        placeholder="Pilih rekening sumber"
        helper="Hanya rekening dengan dana tersedia yang dapat dipakai"
        onClick={() => openMobileSelection("source-account")}
        error={errors.source_account_id}
        disabled={outcomeUnknown}
      />
      <AccountPickerRow
        id="destination-account"
        label="Ke rekening"
        account={destination}
        accountBalances={accountBalances}
        balanceMode="balance"
        placeholder="Pilih rekening tujuan"
        helper={compatibleDestinationAccounts.length ? "Pilih rekening penerima" : "Tidak ada rekening tujuan yang kompatibel"}
        onClick={() => openMobileSelection("destination-account")}
        error={errors.destination_account_id}
        disabled={outcomeUnknown || compatibleDestinationAccounts.length === 0}
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
