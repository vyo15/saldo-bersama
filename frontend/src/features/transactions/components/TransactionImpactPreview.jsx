import { TRANSACTION_TYPES } from "../../../domain/constants.js";
import { formatRupiah } from "../../../domain/money.js";
import styles from "../TransactionForm.module.css";

const signedRupiah = (value) => {
  const amount = Number(value || 0);
  if (amount === 0) return formatRupiah(0);
  return `${amount > 0 ? "+" : "−"}${formatRupiah(Math.abs(amount))}`;
};

const ImpactValue = ({ label, value, delta, hideDelta = false }) => (
  <span className={styles.impactValue}>
    <span className={styles.impactValueCopy}>
      <small>{label}</small>
      <strong>{formatRupiah(value)}</strong>
    </span>
    {hideDelta ? null : (
      <span className={`${styles.impactDelta} ${Number(delta || 0) < 0 ? styles.impactDeltaNegative : ""}`.trim()}>
        {signedRupiah(delta)}
      </span>
    )}
  </span>
);

const changedAccounts = (impact) => (impact.accountChanges || []).filter((item) => Number(item.balanceAfter || 0) !== Number(item.balanceBefore || 0));

const impactFootnote = (impact) => {
  const safeDelta = Number(impact.safeToSpendDelta || 0);
  if (impact.transactionType === TRANSACTION_TYPES.EXPENSE && impact.envelope && safeDelta === 0) {
    return "Dana Tersedia tidak berubah karena pengeluaran memakai dana yang sudah disiapkan.";
  }
  if (impact.transactionType === TRANSACTION_TYPES.EXPENSE && !impact.envelope) {
    return "Pengeluaran belum masuk rencana, sehingga langsung mengurangi Dana Tersedia.";
  }
  if (impact.transactionType === TRANSACTION_TYPES.TRANSFER && safeDelta === 0) {
    return "Pemindahan antar rekening operasional tidak mengubah Dana Tersedia keluarga.";
  }
  if (impact.transactionType === TRANSACTION_TYPES.TRANSFER && safeDelta < 0) {
    return "Sebagian dana berpindah keluar dari uang operasional, sehingga Dana Tersedia berkurang.";
  }
  if (impact.transactionType === TRANSACTION_TYPES.TRANSFER && safeDelta > 0) {
    return "Dana kembali ke rekening operasional, sehingga Dana Tersedia bertambah.";
  }
  return impact.isEdit ? "Perkiraan perubahan dari transaksi yang tersimpan saat ini." : "Perkiraan setelah transaksi disimpan.";
};

const TransactionImpactPreview = ({ impact }) => {
  if (!impact || Number(impact.amount || 0) <= 0) return null;
  const accounts = changedAccounts(impact);
  const budgetBefore = Number(impact.budgetRemainingBefore || 0);
  const budgetAfter = Number(impact.budgetRemainingAfter || 0);
  const envelopeBefore = Number(impact.envelope?.remaining_amount || 0);
  const envelopeAfter = Number(impact.envelopeAfter || 0);
  const safeBefore = Number(impact.safeToSpendBefore || 0);
  const safeAfter = Number(impact.safeToSpendAfter || 0);

  return (
    <div className={`form-grid__full ${styles.impactPreview}`} aria-live="polite">
      <span className={styles.impactEyebrow}>Perkiraan setelah disimpan</span>
      <div className={styles.impactTransferRoute}>
        {impact.budget ? (
          <ImpactValue label={`Sisa ${impact.budget.name || "Kebutuhan"}`} value={budgetAfter} delta={budgetAfter - budgetBefore} />
        ) : impact.envelope ? (
          <ImpactValue label={`Sisa ${impact.envelope.name}`} value={envelopeAfter} delta={envelopeAfter - envelopeBefore} />
        ) : null}
        <ImpactValue label="Dana Tersedia" value={safeAfter} delta={safeAfter - safeBefore} hideDelta={safeAfter === safeBefore} />
        {accounts.map((item) => (
          <ImpactValue key={item.accountId} label={item.account.name || "Rekening"} value={item.balanceAfter} delta={item.balanceAfter - item.balanceBefore} />
        ))}
      </div>
      <small className={styles.impactFootnote}>{impactFootnote(impact)}</small>
    </div>
  );
};

export default TransactionImpactPreview;
