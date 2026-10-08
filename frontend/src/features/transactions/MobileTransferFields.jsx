import { FiAlertTriangle, FiArrowRight, FiCalendar, FiChevronRight } from "react-icons/fi";
import { AccountIcon, BalanceIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import InlineSelectionPicker from "../../components/common/InlineSelectionPicker.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import { accountOptionVisual } from "../../components/common/selectionOptionVisuals.js";
import { formatDateLongIndonesia } from "../../domain/dates.js";
import { formatRupiah } from "../../domain/money.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { sourceAccountPicker } from "./transactionFormSmartDefaults.js";
import { transactionSubmitFeedback } from "./transactionErrorPresentation.js";
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

const TransferAmount = ({ form, update, errors, amountRef, submitting, confirmation, intentLocked, transferApprovalRequired }) => (
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
        aria-label={submitting ? "Memproses transfer" : intentLocked ? "Coba lagi transfer dengan data yang sama" : confirmation ? "Konfirmasi transfer tetap" : transferApprovalRequired ? "Ajukan transfer ke Administrator" : "Transfer sekarang"}
        title={intentLocked ? "Coba lagi data yang sama" : confirmation ? "Konfirmasi transfer tetap" : transferApprovalRequired ? "Ajukan transfer ke Administrator" : "Transfer sekarang"}
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

const TransferImpactValue = ({ label, value, icon: Icon, ariaLabel }) => (
  <span className={styles.impactStat} aria-label={ariaLabel}>
    <span className={styles.impactStatIcon} aria-hidden="true"><Icon /></span>
    <span className={styles.impactStatCopy}>
      <small>{label}</small>
      <strong>{formatRupiah(value)}</strong>
    </span>
  </span>
);

const ImpactPreview = ({ impact, transferApprovalRequired = false }) => {
  if (!impact || Number(impact.amount || 0) <= 0 || !impact.source || !impact.destination) return null;
  const safeDelta = Number(impact.safeToSpendDelta || 0);
  const safeAfter = Number(impact.safeToSpendAfter || 0);
  return (
    <section className={styles.impact} aria-live="polite">
      <div className={styles.impactHeader}>
        <span className={styles.impactLabel}>{transferApprovalRequired ? "Jika disetujui Administrator" : "Setelah transfer"}</span>
        <strong className={styles.impactAmount}>{formatRupiah(impact.amount)}</strong>
      </div>
      <div className={styles.impactStats}>
        <TransferImpactValue
          label={`Dari · ${impact.source.name}`}
          value={impact.sourceAfter}
          icon={AccountIcon}
          ariaLabel={`Saldo akhir rekening asal ${impact.source.name}: ${formatRupiah(impact.sourceAfter)}`}
        />
        <TransferImpactValue
          label={`Ke · ${impact.destination.name}`}
          value={impact.destinationAfter}
          icon={AccountIcon}
          ariaLabel={`Saldo akhir rekening tujuan ${impact.destination.name}: ${formatRupiah(impact.destinationAfter)}`}
        />
        {safeDelta !== 0 ? (
          <TransferImpactValue
            label="Dana Tersedia"
            value={safeAfter}
            icon={BalanceIcon}
            ariaLabel={`Dana Tersedia setelah transfer: ${formatRupiah(safeAfter)}`}
          />
        ) : null}
      </div>
      <p>{safeDelta === 0 ? "Pemindahan antar rekening operasional tidak mengubah Dana Tersedia keluarga." : safeDelta < 0 ? "Dana berpindah keluar dari uang operasional sehingga Dana Tersedia berkurang." : "Dana kembali ke rekening operasional sehingga Dana Tersedia bertambah."}</p>
    </section>
  );
};

const TransferStatus = ({ confirmation, submitState, onReviewTransactions }) => {
  const feedback = transactionSubmitFeedback(submitState.error);
  return <>
    {confirmation ? <div className={styles.warning} role="alert"><FiAlertTriangle aria-hidden="true" /><span>{confirmation.message} Periksa data, lalu tekan tombol panah sekali lagi untuk mengonfirmasi.</span></div> : null}
    {feedback ? <div className={feedback.tone === "danger" ? styles.failure : styles.warning} role="alert"><FiAlertTriangle aria-hidden="true" /><span><strong>{feedback.title}.</strong> {feedback.message}{feedback.reviewRecommended && onReviewTransactions ? <button type="button" className={styles.feedbackAction} onClick={onReviewTransactions}>Periksa transaksi</button> : null}</span></div> : null}
  </>;
};

const MutationRecoveryNotice = ({ visible, onReviewTransactions }) => visible ? <div className={styles.warning} role="status"><FiAlertTriangle aria-hidden="true" /><span><strong>Ada transfer yang belum terkonfirmasi.</strong> Periksa transaksi terbaru. Jika belum tercatat, masukkan kembali data transfer sebelumnya dengan data yang sama.{onReviewTransactions ? <button type="button" className={styles.feedbackAction} onClick={onReviewTransactions}>Periksa transaksi</button> : null}</span></div> : null;

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
  transferApprovalRequired,
  onReviewTransactions,
  unresolvedIntentPresent,
}) => {
  const sourceAccounts = sourceAccountPicker({
    accounts,
    transactionType: form.transaction_type,
    selectedAccountId: form.source_account_id,
    recentTransactions,
  });

  return (
    <div className={styles.composer}>
      <MutationRecoveryNotice visible={unresolvedIntentPresent} onReviewTransactions={onReviewTransactions} />
      <TransferAccountPicker
        label="Dari rekening"
        value={form.source_account_id}
        onChange={onSourceAccountChange}
        accounts={sourceAccounts}
        balanceMode="available"
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
        placeholderMeta={compatibleDestinationAccounts.length ? undefined : "Tidak ada rekening tujuan yang kompatibel"}
        error={errors.destination_account_id}
        disabled={outcomeUnknown || compatibleDestinationAccounts.length === 0}
        emptyText="Belum ada rekening tujuan yang kompatibel."
      />
      <TransferNote form={form} update={update} intentLocked={outcomeUnknown} />
      {transferApprovalRequired ? <div className={styles.warning} role="status">Transfer ini memerlukan persetujuan Administrator. Saldo tidak berubah hingga disetujui.</div> : null}
      <TransferAmount form={form} update={update} errors={errors} amountRef={amountRef} submitting={submitting} confirmation={confirmation} intentLocked={outcomeUnknown} transferApprovalRequired={transferApprovalRequired} />
      <TransferDate form={form} update={update} errors={errors} intentLocked={outcomeUnknown} />
      <ImpactPreview impact={impact} transferApprovalRequired={transferApprovalRequired} />
      <TransferStatus confirmation={confirmation} submitState={submitState} onReviewTransactions={onReviewTransactions} />
    </div>
  );
};

export default MobileTransferFields;
