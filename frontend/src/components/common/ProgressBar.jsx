import styles from "./ProgressBar.module.css";

const ProgressBar = ({ value, max, label }) => {
  const percentage = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  return (
    <div className={`${styles.root} progress`} data-ui="progress">
      <progress
        className={styles.progress}
        max="100"
        value={percentage}
        aria-label={`${label}: ${percentage}%`}
      >
        {percentage}%
      </progress>
      <span className={styles.value} aria-hidden="true">{percentage}%</span>
    </div>
  );
};

export default ProgressBar;
