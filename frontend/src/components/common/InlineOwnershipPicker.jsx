import { useEffect, useId, useMemo, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import UserAvatar from "./UserAvatar.jsx";
import styles from "./InlineOwnershipPicker.module.css";

const optionValue = (option) => String(option?.value ?? "");

const OwnershipVisual = ({ option, selected = false }) => {
  const Icon = option?.icon;
  return <>
    <span className={`${styles.avatar}${option?.user ? ` ${styles.userAvatar}` : ""}`} aria-hidden={!option?.user}>
      {option?.user ? <UserAvatar user={option.user} size="md" /> : Icon ? <Icon aria-hidden="true" /> : null}
    </span>
    <span className={styles.copy}>
      <span className={styles.titleRow}>
        <strong>{option?.label || "Pilih pengguna"}</strong>
        {option?.badge ? <span className={`${styles.badge}${option.badgeTone === "primary" ? ` ${styles.badgePrimary}` : ""}`}>{option.badge}</span> : null}
      </span>
      {option?.description ? <small>{option.description}</small> : null}
    </span>
    {!selected ? <span className={styles.radio} aria-hidden="true" /> : null}
  </>;
};

const InlineOwnershipPicker = ({
  legend,
  value,
  onChange,
  options,
  disabled = false,
  locked = false,
  required = false,
  helper = "",
  className = "",
}) => {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const safeOptions = useMemo(() => options || [], [options]);
  const selectedOption = safeOptions.find((option) => optionValue(option) === String(value ?? "")) || safeOptions[0] || null;
  const alternatives = safeOptions.filter((option) => optionValue(option) !== optionValue(selectedOption));
  const canExpand = !disabled && !locked && alternatives.length > 0;

  useEffect(() => {
    setExpanded(false);
  }, [value, disabled, locked]);

  const toggle = () => {
    if (canExpand) setExpanded((current) => !current);
  };

  const select = (nextValue) => {
    onChange?.(nextValue);
    setExpanded(false);
  };

  return <fieldset className={`${styles.group}${className ? ` ${className}` : ""}`} disabled={disabled}>
    <legend>{legend}{required ? <span aria-hidden="true"> *</span> : null}</legend>
    <div className={`${styles.shell}${expanded ? ` ${styles.expanded}` : ""}${locked ? ` ${styles.locked}` : ""}`}>
      {canExpand ? <button
        type="button"
        className={styles.selected}
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={toggle}
      >
        <OwnershipVisual option={selectedOption} selected />
        <FiChevronDown className={`${styles.chevron}${expanded ? ` ${styles.chevronOpen}` : ""}`} aria-hidden="true" />
      </button> : <div className={styles.selected} aria-disabled={disabled || locked || undefined}>
        <OwnershipVisual option={selectedOption} selected />
      </div>}

      <div className={`${styles.list}${expanded ? ` ${styles.listOpen}` : ""}`} id={listId} aria-hidden={!expanded}>
        <div className={styles.listInner} role="listbox" aria-label={`Pilihan ${legend}`}>
          {alternatives.map((option) => <button
            key={optionValue(option)}
            type="button"
            className={styles.option}
            role="option"
            aria-selected="false"
            tabIndex={expanded ? 0 : -1}
            onClick={() => select(option.value)}
          >
            <OwnershipVisual option={option} />
          </button>)}
        </div>
      </div>
    </div>
    {helper ? <small className={styles.helper}>{helper}</small> : null}
  </fieldset>;
};

export default InlineOwnershipPicker;
