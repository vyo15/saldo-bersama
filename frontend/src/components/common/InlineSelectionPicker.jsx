import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FiChevronDown, FiSearch } from "react-icons/fi";
import { SelectionVisual } from "./SelectionField.jsx";
import UserAvatar from "./UserAvatar.jsx";
import styles from "./InlineSelectionPicker.module.css";

const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("id-ID");
const optionValue = (option) => String(option?.value ?? "");
const sameValue = (left, right) => String(left ?? "") === String(right ?? "");
const optionKey = (option, index) => `${optionValue(option)}:${index}`;

const optionMatches = (option, query) => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  return [option?.label, option?.meta, option?.description, option?.keywords]
    .some((candidate) => normalize(candidate).includes(normalizedQuery));
};

const normalizeGroups = (groups = []) => groups
  .map((group, index) => ({
    key: String(group?.key || group?.label || index),
    label: String(group?.label || ""),
    options: Array.isArray(group?.options) ? group.options : [],
  }))
  .filter((group) => group.options.length);

const PickerCopy = ({ option, placeholder, placeholderMeta }) => (
  <span className={styles.copy}>
    <span className={styles.titleRow}>
      <strong className={!option ? styles.placeholder : undefined}>{option?.label || placeholder}</strong>
      {option?.badge ? <span className={`${styles.badge}${option.badgeTone === "primary" ? ` ${styles.badgePrimary}` : ""}`}>{option.badge}</span> : null}
    </span>
    {(option?.meta || option?.description || (!option && placeholderMeta)) ? <small>{option?.meta || option?.description || placeholderMeta}</small> : null}
  </span>
);

const PickerVisual = ({ option, placeholderOption }) => {
  const visualOption = option || placeholderOption;
  if (!visualOption) return <span className={styles.visualPlaceholder} aria-hidden="true" />;
  return <span className={`${styles.visualWrap}${visualOption.user ? ` ${styles.userVisual}` : ""}`} aria-hidden={!visualOption.user}>
    {visualOption.user ? <UserAvatar user={visualOption.user} size="md" /> : <SelectionVisual option={visualOption} />}
  </span>;
};

const usePickerOptions = ({ options, groups, value, query }) => {
  const safeOptions = useMemo(() => options || [], [options]);
  const safeGroups = useMemo(() => normalizeGroups(groups), [groups]);
  const allOptions = useMemo(
    () => safeGroups.length ? safeGroups.flatMap((group) => group.options) : safeOptions,
    [safeGroups, safeOptions],
  );
  const selectedOption = useMemo(
    () => allOptions.find((option) => sameValue(option?.value, value)) || null,
    [allOptions, value],
  );
  const alternatives = useMemo(
    () => allOptions.filter((option) => !selectedOption || !sameValue(option?.value, selectedOption.value)),
    [allOptions, selectedOption],
  );
  const filteredOptions = useMemo(
    () => safeGroups.length ? [] : alternatives.filter((option) => optionMatches(option, query)),
    [alternatives, query, safeGroups.length],
  );
  const filteredGroups = useMemo(() => safeGroups.map((group) => ({
    ...group,
    options: group.options.filter((option) => (
      (!selectedOption || !sameValue(option?.value, selectedOption.value)) && optionMatches(option, query)
    )),
  })).filter((group) => group.options.length), [query, safeGroups, selectedOption]);
  return { selectedOption, alternatives, filteredOptions, filteredGroups, grouped: safeGroups.length > 0 };
};

const usePickerDisclosure = ({ value, disabled, locked, searchable }) => {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    setExpanded(false);
    setQuery("");
  }, [value, disabled, locked]);

  useEffect(() => {
    if (!expanded || !searchable) return;
    window.requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
  }, [expanded, searchable]);

  const close = ({ restoreFocus = false } = {}) => {
    setExpanded(false);
    setQuery("");
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  return { expanded, setExpanded, query, setQuery, triggerRef, searchRef, close };
};

const nextOptionIndex = ({ key, index, length }) => {
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowDown") return Math.min(length - 1, index + 1);
  return Math.max(0, index - 1);
};

const focusAdjacentOption = (event) => {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  const current = event.target.closest?.("[data-inline-selection-option]");
  if (!current || !keys.includes(event.key)) return;
  const items = [...event.currentTarget.querySelectorAll("[data-inline-selection-option]:not(:disabled)")];
  if (!items.length) return;
  event.preventDefault();
  const index = items.indexOf(current);
  const nextIndex = nextOptionIndex({ key: event.key, index, length: items.length });
  items[nextIndex]?.focus({ preventScroll: true });
};

const PickerTrigger = ({
  canExpand,
  triggerRef,
  expanded,
  listId,
  required,
  error,
  describedBy,
  disabled,
  locked,
  selectedOption,
  placeholderOption,
  placeholder,
  placeholderMeta,
  onToggle,
}) => {
  const content = <>
    <PickerVisual option={selectedOption} placeholderOption={placeholderOption} />
    <PickerCopy option={selectedOption} placeholder={placeholder} placeholderMeta={placeholderMeta} />
    {canExpand ? <FiChevronDown className={`${styles.chevron}${expanded ? ` ${styles.chevronOpen}` : ""}`} aria-hidden="true" /> : null}
  </>;

  if (!canExpand) return <div className={styles.selected} aria-disabled={disabled || locked || undefined}>{content}</div>;
  return <button
    ref={triggerRef}
    type="button"
    className={styles.selected}
    role="combobox"
    aria-haspopup="listbox"
    aria-expanded={expanded}
    aria-controls={listId}
    aria-required={required || undefined}
    aria-invalid={Boolean(error) || undefined}
    aria-describedby={describedBy}
    onClick={onToggle}
  >
    {content}
  </button>;
};

const PickerOption = ({ option, expanded, placeholder, onChoose }) => (
  <button
    type="button"
    className={styles.option}
    role="option"
    aria-selected="false"
    disabled={option.disabled}
    tabIndex={expanded ? 0 : -1}
    data-inline-selection-option
    onClick={() => onChoose(option)}
  >
    <PickerVisual option={option} />
    <PickerCopy option={option} placeholder={placeholder} />
    <span className={styles.radio} aria-hidden="true" />
  </button>
);

const PickerSearch = ({ searchRef, query, setQuery, searchPlaceholder, expanded, listId }) => (
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
      tabIndex={expanded ? 0 : -1}
      aria-controls={listId}
    />
  </label>
);

const PickerOptions = ({ options, expanded, placeholder, onChoose }) => options.map((option, index) => (
  <PickerOption key={optionKey(option, index)} option={option} expanded={expanded} placeholder={placeholder} onChoose={onChoose} />
));

const PickerGroups = ({ groups, expanded, placeholder, onChoose }) => groups.map((group) => (
  <section key={group.key} className={styles.optionGroup} role="group" aria-label={group.label || undefined}>
    {group.label ? <span className={styles.groupLabel}>{group.label}</span> : null}
    <div className={styles.groupOptions}>
      <PickerOptions options={group.options} expanded={expanded} placeholder={placeholder} onChoose={onChoose} />
    </div>
  </section>
));

const PickerList = ({
  expanded,
  searchable,
  searchRef,
  query,
  setQuery,
  searchPlaceholder,
  listId,
  label,
  filteredOptions,
  filteredGroups,
  grouped,
  placeholder,
  emptyText,
  onChoose,
  footer,
}) => {
  const hasOptions = grouped ? filteredGroups.length > 0 : filteredOptions.length > 0;
  return <div className={`${styles.list}${expanded ? ` ${styles.listOpen}` : ""}`} aria-hidden={!expanded}>
    <div className={styles.listInner}>
      {searchable ? <PickerSearch searchRef={searchRef} query={query} setQuery={setQuery} searchPlaceholder={searchPlaceholder} expanded={expanded} listId={listId} /> : null}
      <div id={listId} className={styles.options} role="listbox" aria-label={`Pilihan ${label}`}>
        {hasOptions
          ? grouped
            ? <PickerGroups groups={filteredGroups} expanded={expanded} placeholder={placeholder} onChoose={onChoose} />
            : <PickerOptions options={filteredOptions} expanded={expanded} placeholder={placeholder} onChoose={onChoose} />
          : <p className={styles.empty}>{emptyText}</p>}
      </div>
      {footer ? <div className={styles.listFooter}>{footer}</div> : null}
    </div>
  </div>;
};

const groupClassName = (className) => `${styles.group}${className ? ` ${className}` : ""}`;
const shellClassName = ({ expanded, locked, error }) => `${styles.shell}${expanded ? ` ${styles.expanded}` : ""}${locked ? ` ${styles.locked}` : ""}${error ? ` ${styles.invalid}` : ""}`;
const describedByIds = ({ helper, helperId, error, errorId }) => [helper ? helperId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;

const usePickerController = ({ value, onChange, options, groups, helper, error, disabled, locked, searchable, hasFooter }) => {
  const listId = useId();
  const helperId = useId();
  const errorId = useId();
  const disclosure = usePickerDisclosure({ value, disabled, locked, searchable });
  const optionState = usePickerOptions({ options, groups, value, query: disclosure.query });
  const enabledAlternative = optionState.alternatives.some((option) => !option.disabled);
  const canExpand = !disabled && !locked && (enabledAlternative || hasFooter);
  const describedBy = describedByIds({ helper, helperId, error, errorId });

  const choose = (option) => {
    if (option.disabled) return;
    onChange?.(option.value);
    disclosure.close({ restoreFocus: true });
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape" && disclosure.expanded) {
      event.preventDefault();
      event.stopPropagation();
      disclosure.close({ restoreFocus: true });
      return;
    }
    focusAdjacentOption(event);
  };

  const toggle = () => {
    if (!canExpand) return;
    disclosure.setExpanded((current) => !current);
  };

  return { listId, helperId, errorId, disclosure, optionState, canExpand, describedBy, choose, onKeyDown, toggle };
};

const PickerMessages = ({ helper, helperId, error, errorId }) => <>
  {helper ? <small id={helperId} className={styles.helper}>{helper}</small> : null}
  {error ? <small id={errorId} className={styles.error}>{error}</small> : null}
</>;

const PickerField = ({
  label,
  placeholder,
  placeholderMeta,
  placeholderOption,
  helper,
  error,
  disabled,
  locked,
  required,
  searchable,
  searchPlaceholder,
  emptyText,
  className,
  footer,
  controller,
}) => {
  const { disclosure, optionState } = controller;
  return <fieldset className={groupClassName(className)} disabled={disabled} onKeyDown={controller.onKeyDown}>
    <legend>{label}{required ? <span aria-hidden="true"> *</span> : null}</legend>
    <div className={shellClassName({ expanded: disclosure.expanded, locked, error })}>
      <PickerTrigger canExpand={controller.canExpand} triggerRef={disclosure.triggerRef} expanded={disclosure.expanded} listId={controller.listId} required={required} error={error} describedBy={controller.describedBy} disabled={disabled} locked={locked} selectedOption={optionState.selectedOption} placeholderOption={placeholderOption} placeholder={placeholder} placeholderMeta={placeholderMeta} onToggle={controller.toggle} />
      <PickerList expanded={disclosure.expanded} searchable={searchable} searchRef={disclosure.searchRef} query={disclosure.query} setQuery={disclosure.setQuery} searchPlaceholder={searchPlaceholder} listId={controller.listId} label={label} filteredOptions={optionState.filteredOptions} filteredGroups={optionState.filteredGroups} grouped={optionState.grouped} placeholder={placeholder} emptyText={emptyText} onChoose={controller.choose} footer={footer} />
    </div>
    <PickerMessages helper={helper} helperId={controller.helperId} error={error} errorId={controller.errorId} />
  </fieldset>;
};

const InlineSelectionPicker = ({
  label,
  value,
  onChange,
  options = [],
  groups = [],
  placeholder = "Pilih",
  placeholderMeta = "",
  placeholderOption = null,
  helper = "",
  error = "",
  disabled = false,
  locked = false,
  required = false,
  searchable = false,
  searchPlaceholder = "Cari…",
  emptyText = "Tidak ada pilihan yang cocok.",
  className = "",
  footer = null,
}) => {
  const controller = usePickerController({ value, onChange, options, groups, helper, error, disabled, locked, searchable, hasFooter: Boolean(footer) });
  return <PickerField label={label} placeholder={placeholder} placeholderMeta={placeholderMeta} placeholderOption={placeholderOption} helper={helper} error={error} disabled={disabled} locked={locked} required={required} searchable={searchable} searchPlaceholder={searchPlaceholder} emptyText={emptyText} className={className} footer={footer} controller={controller} />;
};

export default InlineSelectionPicker;
