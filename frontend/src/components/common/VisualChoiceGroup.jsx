import { FiCheck } from "react-icons/fi";
import styles from "./VisualChoiceGroup.module.css";

const toneClass = (tone) => tone === "expense"
  ? styles.expense
  : tone === "income"
    ? styles.income
    : tone === "refund"
      ? styles.refund
      : "";

const groupClassName = ({ className, compact, denseTiles, descriptive, plainIcons, wrapLabels }) => [
  styles.group,
  ...Object.entries({ compact, denseTiles, wrapLabels, plainIcons, descriptive })
    .filter(([, enabled]) => Boolean(enabled))
    .map(([variant]) => styles[variant]),
  className,
].filter(Boolean).join(" ");

const VisualChoiceOption = ({ descriptive, disabled, index, name, onChange, option, required, value }) => {
  const Icon = option.icon;
  const checked = String(value ?? "") === String(option.value ?? "");
  return (
    <label className={`${styles.option}${option.disabled ? ` ${styles.optionDisabled}` : ""}`}>
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
};

const VisualChoiceGroup = ({
  legend,
  value,
  onChange,
  options,
  name,
  columns = 4,
  mobileColumns,
  compact = false,
  denseTiles = false,
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
  const rootClassName = groupClassName({ className, compact, denseTiles, descriptive, plainIcons, wrapLabels });
  return (
    <fieldset
      className={rootClassName}
      style={{ "--visual-choice-columns": safeColumns, "--visual-choice-mobile-columns": safeMobileColumns }}
      disabled={disabled}
    >
      <legend>{legend}</legend>
      <div className={styles.grid}>
        {options.map((option, index) => (
          <VisualChoiceOption
            key={String(option.value)}
            descriptive={descriptive}
            disabled={disabled}
            index={index}
            name={name}
            onChange={onChange}
            option={option}
            required={required}
            value={value}
          />
        ))}
      </div>
      {helper ? <small className={`${styles.helper}${helperPanel ? ` ${styles.helperPanel}` : ""}`}>{helper}</small> : null}
    </fieldset>
  );
};

export default VisualChoiceGroup;
