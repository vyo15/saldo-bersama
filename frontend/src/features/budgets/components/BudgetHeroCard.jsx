import Money from "../../../components/common/Money.jsx";
import budgetWalletHero from "../../../assets/budget-illustrations/budget-wallet-hero.webp";
import styles from "../BudgetsPage.module.css";

const BudgetHeroArtwork = () => (
  <div className={styles.heroArtwork} aria-hidden="true">
    <img className={styles.heroIllustration} src={budgetWalletHero} alt="" decoding="async" />
  </div>
);

const BudgetHeroCard = ({ totals, periodMeta }) => {
  const remaining = totals.amount - totals.used;
  const percentage = totals.amount > 0 ? (totals.used / totals.amount) * 100 : 0;
  const fill = Math.min(100, Math.max(0, percentage));
  return (
    <section className={styles.heroCard} aria-label="Ringkasan anggaran">
      <div className={styles.heroGlow} aria-hidden="true" />
      <BudgetHeroArtwork />
      <div className={styles.heroCopy}>
        <span className={styles.heroLabel}>{periodMeta?.isCurrent ? "Sisa anggaran bulan ini" : "Sisa anggaran periode ini"}</span>
        <strong className={styles.heroValue}><Money value={remaining} tone={remaining < 0 ? "negative" : "default"} /></strong>
        <p className={styles.heroMeta}>Terpakai <Money value={totals.used} /> dari <Money value={totals.amount} /></p>
        <div className={styles.heroProgress} aria-label={`Total pemakaian anggaran ${Math.round(percentage)}%`}>
          <span style={{ width: `${fill}%` }} />
        </div>
        <div className={styles.heroProgressMeta}><span>Keseluruhan</span><strong>{percentage.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</strong></div>
      </div>
    </section>
  );
};

export default BudgetHeroCard;
