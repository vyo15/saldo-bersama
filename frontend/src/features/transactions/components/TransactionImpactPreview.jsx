import { TRANSACTION_TYPES } from "../../../domain/constants.js";
import { formatRupiah } from "../../../domain/money.js";
import styles from "../TransactionForm.module.css";

const signedRupiah = (value) => {
  const amount = Number(value || 0);
  if (amount === 0) return "tidak berubah";
  return `${amount > 0 ? "+" : "−"}${formatRupiah(Math.abs(amount))}`;
};

const ImpactValue = ({ label, value, delta, resultLabel = "jadi" }) => (
  <span className={styles.impactValue}>
    <span className={styles.impactValueCopy}>
      <small>{label}</small>
      <strong>{resultLabel} {formatRupiah(value)}</strong>
    </span>
    <span className={`${styles.impactDelta} ${Number(delta || 0) < 0 ? styles.impactDeltaNegative : ""}`.trim()}>
      {signedRupiah(delta)}
    </span>
  </span>
);

const changedAccounts = (impact) => (impact.accountChanges || []).filter((item) => Number(item.balanceAfter || 0) !== Number(item.balanceBefore || 0));

const expenseImpactFootnote = (impact) => {
  const safeDelta = Number(impact.safeToSpendDelta || 0);
  const needName = impact.budget?.name || "Kebutuhan terpilih";
  if (impact.budget && safeDelta === 0) return `Sumber pengurangan dana: ${needName}. Dana Tersedia tidak berubah.`;
  if (impact.budget && safeDelta < 0) return `${needName} memakai dana yang sudah disiapkan; kekurangan ${formatRupiah(Math.abs(safeDelta))} memakai Dana Tersedia.`;
  if (impact.envelope && safeDelta === 0) return `Sumber pengurangan dana: ${impact.envelope.name}. Dana Tersedia tidak berubah.`;
  if (!impact.envelope) return "Sumber pengurangan dana: Dana Tersedia. Kebutuhan tidak berubah.";
  return "Dampak pengeluaran mengikuti sisa Alokasi dan Dana Tersedia yang ditampilkan di atas.";
};

const transferImpactFootnote = (safeDelta) => {
  if (safeDelta === 0) return "Pemindahan antar rekening operasional tidak mengubah Dana Tersedia keluarga.";
  if (safeDelta < 0) return "Sebagian dana berpindah keluar dari uang operasional, sehingga Dana Tersedia berkurang.";
  return "Dana kembali ke rekening operasional, sehingga Dana Tersedia bertambah.";
};

const impactFootnote = (impact) => {
  if (impact.transactionType === TRANSACTION_TYPES.EXPENSE) return expenseImpactFootnote(impact);
  if (impact.transactionType === TRANSACTION_TYPES.TRANSFER) return transferImpactFootnote(Number(impact.safeToSpendDelta || 0));
  return impact.isEdit ? "Dampak dihitung sebagai perubahan terhadap transaksi yang tersimpan saat ini." : "Dampak berikut akan diterapkan setelah transaksi disimpan.";
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
      <span className={styles.impactEyebrow}>Setelah disimpan</span>
      <div className={styles.impactTransferRoute}>
        {accounts.map((item) => (
          <ImpactValue key={item.accountId} label={`Rekening · ${item.account.name || "Rekening"}`} value={item.balanceAfter} delta={item.balanceAfter - item.balanceBefore} resultLabel="saldo" />
        ))}
        {impact.budget ? (
          <ImpactValue label={impact.budget.name || "Kebutuhan"} value={budgetAfter} delta={budgetAfter - budgetBefore} resultLabel="sisa" />
        ) : impact.envelope ? (
          <ImpactValue label={impact.envelope.name} value={envelopeAfter} delta={envelopeAfter - envelopeBefore} resultLabel="sisa" />
        ) : null}
        <ImpactValue label="Dana Tersedia" value={safeAfter} delta={safeAfter - safeBefore} resultLabel="sisa" />
      </div>
      <small className={styles.impactFootnote}>{impactFootnote(impact)}</small>
    </div>
  );
};

export default TransactionImpactPreview;
