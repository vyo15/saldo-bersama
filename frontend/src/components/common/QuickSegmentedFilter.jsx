import styles from "./QuickSegmentedFilter.module.css";

// Presentational only: feature owners keep their domain-specific filter values and permissions.
const QuickSegmentedFilter = ({ options, value, onChange, label, className = "", compact = false }) => {
  const activeIndex = options.findIndex((option) => option.value === value);
  return <div className={`${styles.root} ${compact ? styles.compact : ""} ${className}`.trim()} role="group" aria-label={label} data-count={options.length} data-active-index={activeIndex} data-active-tone={options[activeIndex]?.tone || "neutral"}>
    {options.map((option) => {
      const Icon = option.icon;
      return <button key={option.value} type="button" className={styles.segment} data-tone={option.tone || "neutral"} aria-pressed={value === option.value} disabled={option.disabled} onClick={() => onChange(option.value)}>
        {Icon ? <Icon className={styles.icon} aria-hidden="true" /> : null}
        <span className={styles.label}>{option.label}</span>
        {option.count != null ? <span className={styles.count} aria-label={`${option.count} item`}>{option.count}</span> : null}
      </button>;
    })}
  </div>;
};

export default QuickSegmentedFilter;
