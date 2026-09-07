import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FiCheck, FiChevronDown, FiSearch } from "react-icons/fi";
import UserAvatar from "./UserAvatar.jsx";
import styles from "./SelectionField.module.css";

const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("id-ID");
const sameValue = (left, right) => String(left ?? "") === String(right ?? "");
const optionKey = (option, index) => `${String(option.value ?? "")}:${index}`;
const hasOptionVisual = (option = {}) => Boolean(option.visual || option.icon || option.image || option.avatar || option.mark);

const filterOptions = (options, query) => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return options;
  return options.filter((option) => (
    normalize(option.label).includes(normalizedQuery)
    || normalize(option.meta).includes(normalizedQuery)
    || normalize(option.keywords).includes(normalizedQuery)
  ));
};

const normalizeGroups = (groups = []) => groups
  .map((group, index) => ({
    key: String(group.key || group.label || index),
    label: String(group.label || ""),
    options: Array.isArray(group.options) ? group.options : [],
  }))
  .filter((group) => group.options.length);

const filterGroups = (groups, query) => normalizeGroups(groups)
  .map((group) => ({ ...group, options: filterOptions(group.options, query) }))
  .filter((group) => group.options.length);

const flattenSelectionOptions = (options, groups) => groups.length
  ? groups.flatMap((group) => group.options)
  : options;

const focusTrigger = (triggerRef) => window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));

const useSelectionOverlay = ({ open, setOpen, searchable, rootRef, searchRef, triggerRef }) => {
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      focusTrigger(triggerRef);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, rootRef, setOpen, triggerRef]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      if (searchable) {
        searchRef.current?.focus();
        return;
      }
      const selected = rootRef.current?.querySelector('[data-selection-option][aria-selected="true"]');
      const first = rootRef.current?.querySelector("[data-selection-option]:not(:disabled)");
      (selected || first)?.focus?.({ preventScroll: true });
    });
  }, [open, searchable, rootRef, searchRef]);
};

const selectionVisualContent = (option = {}) => {
  if (option.visual) return option.visual;
  if (option.avatar) return <UserAvatar user={option.avatar} />;
  if (option.image) {
    const logo = option.imageKind === "brand-logo";
    return <img src={option.image} alt="" width={logo ? 40 : 42} height={logo ? 40 : 27} loading="lazy" decoding="async" />;
  }
  if (option.icon) {
    const Icon = option.icon;
    return <Icon />;
  }
  if (option.mark) return <span>{option.mark}</span>;
  return null;
};

export const SelectionVisual = ({ option, trigger = false }) => {
  if (!hasOptionVisual(option)) return null;
  const className = [
    styles.visual,
    trigger ? styles.triggerVisual : styles.optionVisual,
    option.image ? styles.imageVisual : "",
    option.imageKind === "brand-logo" ? styles.brandLogoVisual : "",
    option.mark ? styles.markVisual : "",
  ].filter(Boolean).join(" ");
  return <span className={className} aria-hidden="true" title={option.visualLabel || undefined}>{selectionVisualContent(option)}</span>;
};

const SelectionOption = ({ option, isSelected, onChoose, reserveVisual }) => (
  <button
    type="button"
    className={`${styles.option} ${isSelected ? styles.selected : ""}`.trim()}
    role="option"
    aria-selected={isSelected}
    data-selection-option
    disabled={option.disabled}
    onClick={() => onChoose(option)}
  >
    {hasOptionVisual(option) ? <SelectionVisual option={option} /> : reserveVisual ? <span className={`${styles.visual} ${styles.optionVisual} ${styles.visualPlaceholder}`} aria-hidden="true" /> : null}
    <span className={styles.optionCopy}>
      <span className={styles.optionLabel}>{option.label}</span>
      {option.meta ? <span className={styles.optionMeta}>{option.meta}</span> : null}
    </span>
    <FiCheck className={styles.check} aria-hidden="true" />
  </button>
);

const SelectionOptions = ({ options, value, onChoose, reserveVisual }) => options.map((option, index) => (
  <SelectionOption
    key={optionKey(option, index)}
    option={option}
    isSelected={sameValue(option.value, value)}
    onChoose={onChoose}
    reserveVisual={reserveVisual}
  />
));

const SelectionGroups = ({ groups, value, onChoose, reserveVisual }) => groups.map((group) => (
  <section key={group.key} className={styles.optionGroup} role="group" aria-label={group.label || undefined}>
    {group.label ? <span className={styles.groupLabel}>{group.label}</span> : null}
    <div className={styles.options}>
      <SelectionOptions options={group.options} value={value} onChoose={onChoose} reserveVisual={reserveVisual} />
    </div>
  </section>
));

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
  triggerRef,
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
  onArrowOpen,
}) => (
  <button
    ref={triggerRef}
    id={id}
    type="button"
    role="combobox"
    className={styles.trigger}
    aria-label={ariaLabel}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-controls={panelId}
    aria-required={required || undefined}
    aria-invalid={invalid || undefined}
    aria-describedby={describedBy}
    disabled={disabled}
    onClick={onToggle}
    onKeyDown={(event) => {
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      onArrowOpen(event.key);
    }}
  >
    {selected ? <SelectionVisual option={selected} trigger /> : null}
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
  ariaLabel,
  searchable,
  searchPlaceholder,
  query,
  setQuery,
  searchRef,
  options,
  groups,
  value,
  onChoose,
  reserveVisual,
}) => {
  const hasGroups = groups.length > 0;
  const hasOptions = hasGroups ? groups.some((group) => group.options.length) : options.length > 0;
  return (
    <div className={styles.panel} data-selection-panel>
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
            aria-controls={panelId}
          />
        </label>
      ) : null}
      <div id={panelId} className={styles.listbox} role="listbox" aria-label={ariaLabel}>
        {hasOptions ? (
          hasGroups
            ? <SelectionGroups groups={groups} value={value} onChoose={onChoose} reserveVisual={reserveVisual} />
            : <div className={styles.options}><SelectionOptions options={options} value={value} onChoose={onChoose} reserveVisual={reserveVisual} /></div>
        ) : <p className={styles.empty}>Tidak ada pilihan yang cocok.</p>}
      </div>
    </div>
  );
};

const useSelectionKeyboard = ({ rootRef, open, setOpen, searchable, triggerRef }) => {
  const pendingDirectionRef = useRef("");

  const openFromArrow = (direction) => {
    pendingDirectionRef.current = direction;
    setOpen(true);
  };

  useEffect(() => {
    if (!open || searchable || !pendingDirectionRef.current) return;
    const direction = pendingDirectionRef.current;
    pendingDirectionRef.current = "";
    window.requestAnimationFrame(() => {
      const items = [...(rootRef.current?.querySelectorAll("[data-selection-option]:not(:disabled)") || [])];
      if (!items.length) return;
      if (direction === "ArrowUp") items.at(-1)?.focus?.({ preventScroll: true });
      else items[0]?.focus?.({ preventScroll: true });
    });
  }, [open, rootRef, searchable]);

  const focusOptionByKey = (items, option, key) => {
    const currentIndex = items.indexOf(option);
    const targetIndex = key === "Home"
      ? 0
      : key === "End"
        ? items.length - 1
        : key === "ArrowDown"
          ? Math.min(items.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
    items[targetIndex]?.focus?.({ preventScroll: true });
  };

  const onKeyDown = (event) => {
    const option = event.target.closest?.("[data-selection-option]");
    const search = event.target === rootRef.current?.querySelector('input[type="search"]');
    if (!option && !search) return;
    const items = [...(rootRef.current?.querySelectorAll("[data-selection-option]:not(:disabled)") || [])];
    if (!items.length) return;

    if (search) {
      if (event.key !== "ArrowDown") return;
      event.preventDefault();
      items[0]?.focus?.({ preventScroll: true });
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    focusOptionByKey(items, option, event.key);
  };

  const closeAndRestoreFocus = () => {
    setOpen(false);
    focusTrigger(triggerRef);
  };

  return { openFromArrow, onKeyDown, closeAndRestoreFocus };
};

export const SelectionControl = ({
  id,
  value,
  onChange,
  options = [],
  groups = [],
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
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const generatedId = useId();
  const panelId = `selection-${generatedId.replace(/:/g, "")}`;
  const normalizedGroups = useMemo(() => normalizeGroups(groups), [groups]);
  const allOptions = useMemo(
    () => flattenSelectionOptions(options, normalizedGroups),
    [normalizedGroups, options],
  );
  const selected = findSelectedOption(allOptions, value);
  const filtered = useMemo(() => filterOptions(options, query), [options, query]);
  const filteredGroups = useMemo(() => filterGroups(normalizedGroups, query), [normalizedGroups, query]);
  const filteredAllOptions = useMemo(
    () => flattenSelectionOptions(filtered, filteredGroups),
    [filtered, filteredGroups],
  );
  const reserveVisual = filteredAllOptions.some(hasOptionVisual);
  const rootClass = buildControlClass({ compact, embedded, open, className });
  const { openFromArrow, onKeyDown, closeAndRestoreFocus } = useSelectionKeyboard({ rootRef, open, setOpen, searchable, triggerRef });

  useSelectionOverlay({ open, setOpen, searchable, rootRef, searchRef, triggerRef });

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const choose = (option) => {
    if (option.disabled) return;
    onChange?.(option.value);
    closeAndRestoreFocus();
  };

  return (
    <div ref={rootRef} className={rootClass} onKeyDown={onKeyDown}>
      <SelectionTrigger
        id={id}
        triggerRef={triggerRef}
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
        onArrowOpen={openFromArrow}
      />
      {open ? (
        <SelectionPanel
          panelId={panelId}
          ariaLabel={ariaLabel || "Pilihan"}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          query={query}
          setQuery={setQuery}
          searchRef={searchRef}
          options={filtered}
          groups={filteredGroups}
          value={value}
          onChoose={choose}
          reserveVisual={reserveVisual}
        />
      ) : null}
    </div>
  );
};

const SelectionFieldLabel = ({ label, hideLabel, required }) => {
  if (!label) return null;
  return <span className={hideLabel ? "sr-only" : undefined}>{label}{required ? " *" : ""}</span>;
};

const SelectionField = ({
  label,
  id,
  value,
  onChange,
  options = [],
  groups = [],
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
    <SelectionFieldLabel label={label} hideLabel={hideLabel} required={required} />
    <SelectionControl
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      groups={groups}
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
