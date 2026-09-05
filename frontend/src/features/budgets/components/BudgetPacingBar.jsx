import styles from "./BudgetInsightCard.module.css";

const clampPercent = (value) => Math.min(100, Math.max(0, Number(value || 0)));

const BudgetPacingBar = ({ usedPercent, elapsedPercent, isCurrent, state, label }) => {
  const used = clampPercent(usedPercent);
  const elapsed = clampPercent(elapsedPercent);
  return (
    <div
      className={`${styles.pacing} ${styles[`pacing_${state.key}`] || ""}`}
      aria-label={`${label}: ${Math.round(usedPercent)}% terpakai${isCurrent ? `, periode berjalan ${Math.round(elapsed)}%` : ""}`}
      role="img"
    >
      <div className={styles.pacingTrack} aria-hidden="true">
        <span className={styles.pacingFill} style={{ "--budget-pacing-scale": used / 100 }} />
      </div>
      {isCurrent ? <>
        <span className={styles.todayMarker} style={{ left: `calc(${elapsed}% - 1px)` }} aria-hidden="true" />
        <span className={styles.todayLabel} style={{ left: `clamp(0px, calc(${elapsed}% - 18px), calc(100% - 38px))` }} aria-hidden="true">Hari ini</span>
      </> : <span className={styles.periodComplete} aria-hidden="true">Periode selesai</span>}
    </div>
  );
};

export default BudgetPacingBar;
