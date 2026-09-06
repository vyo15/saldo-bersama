import { FiCheck } from "react-icons/fi";
import styles from "./VisualChoiceGroup.module.css";

const toneClass = (tone) => tone === "expense"
  ? styles.expense
  : tone === "income"
    ? styles.income
    : "";

const VisualChoiceGroup = ({
  legend,
  value,
  onChange,
  options,
  name,
  columns = 4,
  mobileColumns,
  compact = false,
  disabled = false,
  required = false,
  helper = "",
  className = "",
  wrapLabels = false,
  plainIcons = false,
  descriptive = false,
  helperPanel = false,
}) => {
  const safeColumns = Math.max(1, Math.min(Number(columns) || 1, 4));
  const safeMobileColumns = Math.max(1, Math.min(Number(mobileColumns) || Math.min(safeColumns, 2), 4));
  return (
    <fieldset
      className={`${styles.group}${compact ? ` ${styles.compact}` : ""}${wrapLabels ? ` ${styles.wrapLabels}` : ""}${plainIcons ? ` ${styles.plainIcons}` : ""}${descriptive ? ` ${styles.descriptive}` : ""}${className ? ` ${className}` : ""}`}
      style={{ "--visual-choice-columns": safeColumns, "--visual-choice-mobile-columns": safeMobileColumns }}
      disabled={disabled}
    >
      <legend>{legend}</legend>
      <div className={styles.grid}>
        {options.map((option, index) => {
          const Icon = option.icon;
          const checked = String(value ?? "") === String(option.value ?? "");
          return (
            <label key={String(option.value)} className={`${styles.option}${option.disabled ? ` ${styles.optionDisabled}` : ""}`}>
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                disabled={disabled || option.disabled}
                required={required && index === 0}
              />
              <span className={`${styles.card} ${toneClass(option.tone)}${Icon ? "" : ` ${styles.noIcon}`}`}>
                {descriptive ? <span className={styles.selectionMark} aria-hidden="true"><FiCheck /></span> : null}
                {Icon ? <span className={styles.iconWrap}><Icon aria-hidden="true" /></span> : null}
                <span className={styles.label}>{option.label}</span>
                {option.description ? <small className={styles.description}>{option.description}</small> : null}
              </span>
            </label>
          );
        })}
      </div>
      {helper ? <small className={`${styles.helper}${helperPanel ? ` ${styles.helperPanel}` : ""}`}>{helper}</small> : null}
    </fieldset>
  );
};

export default VisualChoiceGroup;
