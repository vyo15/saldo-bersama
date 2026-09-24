import styles from "./ProgressBar.module.css";

const ProgressBar = ({ value, max = 100, label = "Progress", tone = "default", showValue = true, compact = false }) => {
  const percentage = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  return (
    <div
      className={`${styles.root} progress`}
      data-ui="progress"
      data-tone={tone}
      data-compact={compact ? "true" : "false"}
      data-show-value={showValue ? "true" : "false"}
    >
      <progress
        className={styles.progress}
        max="100"
        value={percentage}
        aria-label={`${label}: ${percentage}%`}
      >
        {percentage}%
      </progress>
      {showValue ? <span className={styles.value} aria-hidden="true">{percentage}%</span> : null}
    </div>
  );
};

export default ProgressBar;
