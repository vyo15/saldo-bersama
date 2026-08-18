import { FiAlertTriangle, FiArrowRight, FiCalendar, FiChevronDown, FiCreditCard } from "react-icons/fi";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { formatRupiah } from "../../domain/money.js";
import { accountDisplayLabel, accountProviderLabel } from "../../shared/presentation/account.js";
import styles from "./MobileTransferFields.module.css";

const accountBalance = (accountBalances, accountId) => accountBalances.find((item) => item.account_id === accountId) || null;

const accountBalanceLabel = (accountBalances, accountId) => {
  const balance = accountBalance(accountBalances, accountId);
  if (!balance) return "Saldo belum tersedia";
  return `Saldo ${formatRupiah(balance.balance || 0)} · tersedia ${formatRupiah(balance.available_balance ?? balance.balance ?? 0)}`;
};

const AccountIdentity = ({ account, accountBalances }) => (
  <span className={styles.accountCopy}>
    <strong>{String(account.account_name || account.name || "Rekening")}</strong>
    <small>{accountProviderLabel(account)} · {accountBalanceLabel(accountBalances, account.account_id)}</small>
  </span>
);

const SourceAccount = ({ accounts, accountBalances, form, onSourceAccountChange, errors, intentLocked }) => {
  const source = accounts.find((item) => item.account_id === form.source_account_id) || null;
  return (
    <section className={styles.section}>
      <span className={styles.sectionLabel}>Dari rekening</span>
      <label className={styles.sourceCard} htmlFor="mobile-transfer-source-account">
        <span className={styles.accountIcon} aria-hidden="true"><FiCreditCard /></span>
        {source ? <AccountIdentity account={source} accountBalances={accountBalances} /> : <span className={styles.accountCopy}><strong>Pilih rekening sumber</strong><small>Rekening aktif yang dapat bertransaksi</small></span>}
        <FiChevronDown className={styles.chevron} aria-hidden="true" />
        <select
          id="mobile-transfer-source-account"
          value={form.source_account_id}
          onChange={(event) => onSourceAccountChange(event.target.value)}
          aria-invalid={Boolean(errors.source_account_id)}
          disabled={intentLocked}
        >
          <option value="">Pilih rekening</option>
          {accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountDisplayLabel(account)}</option>)}
        </select>
      </label>
      {errors.source_account_id ? <small className={styles.error}>{errors.source_account_id}</small> : null}
    </section>
  );
};

const DestinationAccounts = ({ accounts, accountBalances, form, update, errors, intentLocked }) => (
  <fieldset className={styles.destinationFieldset} disabled={intentLocked}>
    <legend className={styles.sectionLabel}>Ke rekening</legend>
    {accounts.length ? (
      <div className={styles.destinationScroller}>
        {accounts.map((account) => (
          <label className={styles.destinationOption} key={account.account_id}>
            <input
              type="radio"
              name="mobile-transfer-destination"
              value={account.account_id}
              checked={form.destination_account_id === account.account_id}
              onChange={() => update("destination_account_id", account.account_id)}
            />
            <span className={styles.destinationCard}>
              <span className={styles.destinationIcon} aria-hidden="true"><FiCreditCard /></span>
              <AccountIdentity account={account} accountBalances={accountBalances} />
            </span>
          </label>
        ))}
      </div>
    ) : <div className={styles.emptyDestination}>Tidak ada rekening tujuan aktif dengan ruang kepemilikan yang sama.</div>}
    {errors.destination_account_id ? <small className={styles.error}>{errors.destination_account_id}</small> : null}
  </fieldset>
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

const ImpactPreview = ({ impact }) => {
  if (!impact || Number(impact.amount || 0) <= 0 || !impact.source || !impact.destination) return null;
  return (
    <section className={styles.impact} aria-live="polite">
      <div className={styles.impactHead}>
        <span>Preview dampak saldo</span>
        <strong>Total aset tetap</strong>
      </div>
      <div className={styles.impactRoute}>
        <span><small>{impact.source.name}</small><b>{formatRupiah(impact.source.balance || 0)} → {formatRupiah(impact.sourceAfter)}</b><small>Dana tersedia {formatRupiah(impact.sourceAvailable)} → {formatRupiah(impact.sourceAvailableAfter)}</small></span>
        <FiArrowRight aria-hidden="true" />
        <span><small>{impact.destination.name}</small><b>{formatRupiah(impact.destination.balance || 0)} → {formatRupiah(impact.destinationAfter)}</b><small>Dana tersedia {formatRupiah(impact.destinationAvailable)} → {formatRupiah(impact.destinationAvailableAfter)}</small></span>
      </div>
      <p>Transfer memakai dana yang belum dialokasikan. Dana di dalam kantong tidak ikut terpakai.</p>
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
  onSourceAccountChange,
  impact,
  confirmation,
  submitState,
  submitting,
  outcomeUnknown,
}) => (
  <div className={styles.composer}>
    <SourceAccount accounts={accounts} accountBalances={accountBalances} form={form} onSourceAccountChange={onSourceAccountChange} errors={errors} intentLocked={outcomeUnknown} />
    <DestinationAccounts accounts={compatibleDestinationAccounts} accountBalances={accountBalances} form={form} update={update} errors={errors} intentLocked={outcomeUnknown} />
    <TransferNote form={form} update={update} intentLocked={outcomeUnknown} />
    <TransferAmount form={form} update={update} errors={errors} amountRef={amountRef} submitting={submitting} confirmation={confirmation} intentLocked={outcomeUnknown} />
    <TransferDate form={form} update={update} errors={errors} intentLocked={outcomeUnknown} />
    <ImpactPreview impact={impact} />
    <TransferStatus confirmation={confirmation} submitState={submitState} />
    <p className={styles.guard}>{outcomeUnknown ? "Data transfer dikunci sementara. Tekan tombol transfer lagi untuk mencoba request yang sama; jangan ubah nominal atau rekening sampai server memberi hasil definitif." : "Saldo dan dana tersedia baru berubah setelah server mengonfirmasi transfer dan aplikasi menyegarkan data rekening."}</p>
  </div>
);

export default MobileTransferFields;
