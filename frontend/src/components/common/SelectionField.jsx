import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FiCheck, FiChevronDown, FiSearch } from "react-icons/fi";
import styles from "./SelectionField.module.css";

const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("id-ID");
const sameValue = (left, right) => String(left ?? "") === String(right ?? "");
const optionKey = (option, index) => `${String(option.value ?? "")}:${index}`;

const filterOptions = (options, query) => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return options;
  return options.filter((option) => (
    normalize(option.label).includes(normalizedQuery)
    || normalize(option.meta).includes(normalizedQuery)
  ));
};

const useSelectionOverlay = ({ open, setOpen, searchable, rootRef, searchRef }) => {
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, rootRef, setOpen]);

  useEffect(() => {
    if (!open || !searchable) return;
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, searchable, searchRef]);
};

const SelectionOption = ({ option, index, isSelected, onChoose }) => (
  <button
    key={optionKey(option, index)}
    type="button"
    className={`${styles.option} ${isSelected ? styles.selected : ""}`.trim()}
    aria-pressed={isSelected}
    disabled={option.disabled}
    onClick={() => onChoose(option)}
  >
    <span className={styles.optionCopy}>
      <span className={styles.optionLabel}>{option.label}</span>
      {option.meta ? <span className={styles.optionMeta}>{option.meta}</span> : null}
    </span>
    <FiCheck className={styles.check} aria-hidden="true" />
  </button>
);

const SelectionOptions = ({ options, value, onChoose }) => {
  if (!options.length) return <p className={styles.empty}>Tidak ada pilihan yang cocok.</p>;
  return options.map((option, index) => (
    <SelectionOption
      key={optionKey(option, index)}
      option={option}
      index={index}
      isSelected={sameValue(option.value, value)}
      onChoose={onChoose}
    />
  ));
};


const findSelectedOption = (options, value) => options.find((option) => sameValue(option.value, value)) ?? null;

const buildControlClass = ({ compact, embedded, open, className }) => [
  styles.control,
  compact ? styles.compact : "",
  embedded ? styles.embedded : "",
  open ? styles.open : "",
  className,
].filter(Boolean).join(" ");

const SelectionTrigger = ({
  id,
  open,
  panelId,
  required,
  invalid,
  describedBy,
  disabled,
  ariaLabel,
  selected,
  placeholder,
  onToggle,
}) => (
  <button
    id={id}
    type="button"
    className={styles.trigger}
    aria-label={ariaLabel}
    aria-expanded={open}
    aria-controls={panelId}
    aria-required={required || undefined}
    aria-invalid={invalid || undefined}
    aria-describedby={describedBy}
    disabled={disabled}
    onClick={onToggle}
  >
    <span className={styles.triggerCopy}>
      <span className={`${styles.triggerValue} ${selected ? "" : styles.placeholder}`.trim()}>
        {selected?.label || placeholder}
      </span>
      {selected?.meta ? <span className={styles.triggerMeta}>{selected.meta}</span> : null}
    </span>
    <FiChevronDown className={styles.chevron} aria-hidden="true" />
  </button>
);

const SelectionPanel = ({
  panelId,
  searchable,
  searchPlaceholder,
  query,
  setQuery,
  searchRef,
  options,
  value,
  onChoose,
}) => (
  <div id={panelId} className={styles.panel}>
    {searchable ? (
      <label className={styles.search}>
        <FiSearch aria-hidden="true" />
        <span className="sr-only">{searchPlaceholder}</span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
        />
      </label>
    ) : null}
    <div className={styles.options}>
      <SelectionOptions options={options} value={value} onChoose={onChoose} />
    </div>
  </div>
);

export const SelectionControl = ({
  id,
  value,
  onChange,
  options = [],
  placeholder = "Pilih",
  disabled = false,
  searchable = false,
  searchPlaceholder = "Cari…",
  ariaLabel,
  required = false,
  invalid = false,
  describedBy,
  compact = false,
  embedded = false,
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const generatedId = useId();
  const panelId = `selection-${generatedId.replace(/:/g, "")}`;
  const selected = findSelectedOption(options, value);
  const filtered = useMemo(() => filterOptions(options, query), [options, query]);
  const rootClass = buildControlClass({ compact, embedded, open, className });

  useSelectionOverlay({ open, setOpen, searchable, rootRef, searchRef });

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const choose = (option) => {
    if (option.disabled) return;
    onChange?.(option.value);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={rootClass}>
      <SelectionTrigger
        id={id}
        open={open}
        panelId={panelId}
        required={required}
        invalid={invalid}
        describedBy={describedBy}
        disabled={disabled}
        ariaLabel={ariaLabel}
        selected={selected}
        placeholder={placeholder}
        onToggle={() => setOpen((current) => !current)}
      />
      {open ? (
        <SelectionPanel
          panelId={panelId}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          query={query}
          setQuery={setQuery}
          searchRef={searchRef}
          options={filtered}
          value={value}
          onChoose={choose}
        />
      ) : null}
    </div>
  );
};

const SelectionField = ({
  label,
  id,
  value,
  onChange,
  options = [],
  placeholder = "Pilih",
  helper = "",
  error = "",
  disabled = false,
  required = false,
  searchable = false,
  searchPlaceholder = "Cari…",
  ariaLabel,
  invalid = false,
  describedBy,
  compact = false,
  className = "",
  hideLabel = false,
}) => (
  <div className={`field ${className}`.trim()}>
    {label ? <span className={hideLabel ? "sr-only" : undefined}>{label}{required ? " *" : ""}</span> : null}
    <SelectionControl
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      searchable={searchable}
      searchPlaceholder={searchPlaceholder}
      ariaLabel={ariaLabel || label}
      required={required}
      invalid={invalid || Boolean(error)}
      describedBy={describedBy}
      compact={compact}
    />
    {helper ? <small>{helper}</small> : null}
    {error ? <small className="field__error">{error}</small> : null}
  </div>
);

export default SelectionField;
