import { FiLayers } from "react-icons/fi";
import { AccountIcon, BalanceIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import { TRANSACTION_TYPES } from "../../../domain/constants.js";
import { formatRupiah } from "../../../domain/money.js";
import styles from "../TransactionForm.module.css";

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
  if (impact.isEdit) return "Dampak dihitung sebagai perubahan terhadap transaksi yang tersimpan saat ini.";
  return null;
};

const impactAmountLabel = (impact) => {
  if (impact.isEdit) return null;
  const amount = formatRupiah(Math.abs(Number(impact.amount || 0)));
  if (impact.transactionType === TRANSACTION_TYPES.EXPENSE) return `−${amount}`;
  if ([TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.REFUND, TRANSACTION_TYPES.ADJUSTMENT].includes(impact.transactionType)) return `+${amount}`;
  return amount;
};

const amountToneClass = (impact) => {
  if (impact.transactionType === TRANSACTION_TYPES.EXPENSE) return styles.impactAmountNegative;
  if (impact.transactionType === TRANSACTION_TYPES.TRANSFER) return styles.impactAmountNeutral;
  return "";
};

const ImpactStat = ({ label, value, icon: Icon, ariaLabel }) => (
  <span className={styles.impactStat} aria-label={ariaLabel}>
    <span className={styles.impactStatIcon} aria-hidden="true"><Icon /></span>
    <span className={styles.impactStatCopy}>
      <small>{label}</small>
      <strong>{formatRupiah(value)}</strong>
    </span>
  </span>
);

const impactStats = ({ impact, accounts, budgetAfter, envelopeAfter, safeBefore, safeAfter }) => {
  const stats = accounts.map((item) => ({
    key: `account-${item.accountId}`,
    label: item.account.name || "Rekening",
    value: item.balanceAfter,
    icon: AccountIcon,
    ariaLabel: `Saldo akhir rekening ${item.account.name || "Rekening"}: ${formatRupiah(item.balanceAfter)}`,
  }));

  if (impact.budget) {
    stats.push({
      key: `budget-${impact.budget.budget_id || impact.budget.name}`,
      label: impact.budget.name || "Kebutuhan",
      value: budgetAfter,
      icon: FiLayers,
      ariaLabel: `Sisa ${impact.budget.name || "Kebutuhan"}: ${formatRupiah(budgetAfter)}`,
    });
  } else if (impact.envelope) {
    stats.push({
      key: `envelope-${impact.envelope.envelope_period_id || impact.envelope.name}`,
      label: impact.envelope.name || "Alokasi Dana",
      value: envelopeAfter,
      icon: FiLayers,
      ariaLabel: `Sisa ${impact.envelope.name || "Alokasi Dana"}: ${formatRupiah(envelopeAfter)}`,
    });
  }

  if (safeAfter !== safeBefore) {
    stats.push({
      key: "safe-to-spend",
      label: "Dana Tersedia",
      value: safeAfter,
      icon: BalanceIcon,
      ariaLabel: `Dana Tersedia setelah disimpan: ${formatRupiah(safeAfter)}`,
    });
  }

  return stats;
};

const TransactionImpactPreview = ({ impact }) => {
  if (!impact || Number(impact.amount || 0) <= 0) return null;
  const accounts = changedAccounts(impact);
  const budgetAfter = Number(impact.budgetRemainingAfter || 0);
  const envelopeAfter = Number(impact.envelopeAfter || 0);
  const safeBefore = Number(impact.safeToSpendBefore || 0);
  const safeAfter = Number(impact.safeToSpendAfter || 0);
  const amountLabel = impactAmountLabel(impact);
  const stats = impactStats({ impact, accounts, budgetAfter, envelopeAfter, safeBefore, safeAfter });
  const footnote = impactFootnote(impact);

  return (
    <div className={`form-grid__full ${styles.impactPreview}`} aria-live="polite">
      <div className={styles.impactHeader}>
        <span className={styles.impactTitle}>Setelah disimpan</span>
        {amountLabel ? <strong className={`${styles.impactAmount} ${amountToneClass(impact)}`.trim()}>{amountLabel}</strong> : null}
      </div>
      {stats.length ? (
        <div className={styles.impactStats}>
          {stats.map((item) => <ImpactStat key={item.key} {...item} />)}
        </div>
      ) : null}
      {footnote ? <small className={styles.impactFootnote}>{footnote}</small> : null}
    </div>
  );
};

export default TransactionImpactPreview;
