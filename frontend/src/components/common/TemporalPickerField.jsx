import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FiArrowLeft, FiCalendar, FiChevronLeft, FiChevronRight, FiClock } from "react-icons/fi";
import { currentMonthInJakarta, formatDateLongIndonesia, todayInJakarta } from "../../domain/dates.js";
import Button from "./Button.jsx";
import Modal from "./Modal.jsx";
import { useModalSubview } from "./ModalSubviewContext.js";
import styles from "./TemporalPickerField.module.css";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const pad2 = (value) => String(value).padStart(2, "0");

const parseDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return { year, month, day };
};

const parseMonth = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
};

const dateValue = ({ year, month, day }) => `${year}-${pad2(month)}-${pad2(day)}`;
const monthValue = ({ year, month }) => `${year}-${pad2(month)}`;
const compareTemporal = (left, right) => String(left || "").localeCompare(String(right || ""));
const withinBounds = (value, min, max) => (!min || compareTemporal(value, min) >= 0) && (!max || compareTemporal(value, max) <= 0);

const addDays = (value, delta) => {
  const parsed = parseDate(value);
  if (!parsed) return value;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + delta));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
};

const displayDate = (value) => formatDateLongIndonesia(value) || "Pilih tanggal";
const displayMonth = (value) => {
  const parsed = parseMonth(value);
  return parsed ? `${MONTHS[parsed.month - 1]} ${parsed.year}` : "Pilih periode";
};
const displayTime = (value) => /^\d{2}:\d{2}$/.test(String(value || "")) ? value : "Pilih waktu";

const pickerPresentation = (kind, value) => {
  if (kind === "month") return { title: "Pilih periode", description: "Pilih bulan dan tahun.", value: displayMonth(value), Icon: FiCalendar };
  if (kind === "time") return { title: "Pilih waktu", description: "Format 24 jam · 00:00–23:59.", value: displayTime(value), Icon: FiClock };
  return { title: "Pilih tanggal", description: "Pilih tanggal kalender.", value: displayDate(value), Icon: FiCalendar };
};

const CalendarPanel = ({ value, min, max, onConfirm, onCancel }) => {
  const fallback = parseDate(value) || parseDate(todayInJakarta());
  const [selected, setSelected] = useState(() => withinBounds(dateValue(fallback), min, max) ? dateValue(fallback) : (min || max || dateValue(fallback)));
  const selectedParts = parseDate(selected) || fallback;
  const [view, setView] = useState({ year: selectedParts.year, month: selectedParts.month });
  const first = new Date(Date.UTC(view.year, view.month - 1, 1));
  const leading = (first.getUTCDay() + 6) % 7;
  const totalDays = new Date(Date.UTC(view.year, view.month, 0)).getUTCDate();
  const previousDays = new Date(Date.UTC(view.year, view.month - 1, 0)).getUTCDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const ordinal = index - leading + 1;
    if (ordinal < 1) {
      const date = new Date(Date.UTC(view.year, view.month - 2, previousDays + ordinal));
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), outside: true };
    }
    if (ordinal > totalDays) {
      const date = new Date(Date.UTC(view.year, view.month - 1, ordinal));
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), outside: true };
    }
    return { year: view.year, month: view.month, day: ordinal, outside: false };
  });
  const shiftMonth = (delta) => {
    const date = new Date(Date.UTC(view.year, view.month - 1 + delta, 1));
    setView({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 });
  };
  const chooseQuick = (candidate) => {
    if (!withinBounds(candidate, min, max)) return;
    const parsed = parseDate(candidate);
    setSelected(candidate);
    setView({ year: parsed.year, month: parsed.month });
  };
  const today = todayInJakarta();
  const yesterday = addDays(today, -1);
  return <div className={styles.panel}>
    <div className={styles.quickActions} aria-label="Pilihan tanggal cepat">
      <button type="button" onClick={() => chooseQuick(yesterday)} disabled={!withinBounds(yesterday, min, max)}>Kemarin</button>
      <button type="button" onClick={() => chooseQuick(today)} disabled={!withinBounds(today, min, max)}>Hari ini</button>
    </div>
    <div className={styles.calendarHeader}>
      <strong>{MONTHS[view.month - 1]} {view.year}</strong>
      <div className={styles.calendarNavigation}>
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Bulan sebelumnya"><FiChevronLeft aria-hidden="true" /></button>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Bulan berikutnya"><FiChevronRight aria-hidden="true" /></button>
      </div>
    </div>
    <div className={styles.weekdays} aria-hidden="true">{WEEKDAYS.map((item) => <span key={item}>{item}</span>)}</div>
    <div className={styles.calendarGrid} role="grid" aria-label={`${MONTHS[view.month - 1]} ${view.year}`}>
      {cells.map((cell) => {
        const candidate = dateValue(cell);
        const disabled = !withinBounds(candidate, min, max);
        const selectedCell = candidate === selected;
        const todayCell = candidate === today;
        return <button
          key={candidate}
          type="button"
          role="gridcell"
          className={[styles.dayButton, cell.outside ? styles.outsideDay : "", selectedCell ? styles.selected : "", todayCell ? styles.today : ""].filter(Boolean).join(" ")}
          disabled={disabled}
          aria-selected={selectedCell}
          aria-current={todayCell ? "date" : undefined}
          onClick={() => { setSelected(candidate); if (cell.outside) setView({ year: cell.year, month: cell.month }); }}
        >{cell.day}</button>;
      })}
    </div>
    <div className={styles.pickerActions}>
      <Button type="button" onClick={onCancel}>Batal</Button>
      <Button type="button" variant="primary" onClick={() => onConfirm(selected)}>Pilih {displayDate(selected)}</Button>
    </div>
  </div>;
};

const MonthPanel = ({ value, min, max, onConfirm, onCancel }) => {
  const fallback = parseMonth(value) || parseMonth(currentMonthInJakarta());
  const initial = withinBounds(monthValue(fallback), min, max) ? monthValue(fallback) : (min || max || monthValue(fallback));
  const parsedInitial = parseMonth(initial) || fallback;
  const [selected, setSelected] = useState(initial);
  const [year, setYear] = useState(parsedInitial.year);
  return <div className={styles.panel}>
    <div className={styles.yearHeader}>
      <button type="button" onClick={() => setYear((current) => current - 1)} aria-label="Tahun sebelumnya"><FiChevronLeft aria-hidden="true" /></button>
      <strong>{year}</strong>
      <button type="button" onClick={() => setYear((current) => current + 1)} aria-label="Tahun berikutnya"><FiChevronRight aria-hidden="true" /></button>
    </div>
    <div className={styles.monthGrid} role="grid" aria-label={`Pilih bulan tahun ${year}`}>
      {MONTHS.map((label, index) => {
        const candidate = `${year}-${pad2(index + 1)}`;
        const disabled = !withinBounds(candidate, min, max);
        const selectedMonth = selected === candidate;
        return <button key={label} type="button" role="gridcell" className={`${styles.monthButton}${selectedMonth ? ` ${styles.selected}` : ""}`} disabled={disabled} aria-selected={selectedMonth} onClick={() => setSelected(candidate)}>{label.slice(0, 3)}</button>;
      })}
    </div>
    <div className={styles.pickerActions}>
      <Button type="button" onClick={onCancel}>Batal</Button>
      <Button type="button" variant="primary" onClick={() => onConfirm(selected)}>Pilih {displayMonth(selected)}</Button>
    </div>
  </div>;
};

const jakartaTime = () => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${lookup.hour}:${lookup.minute}`;
};

const normalizeTime = (value, fallback = "00:00") => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return fallback;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${pad2(hour)}:${pad2(minute)}`;
};

const TimePanel = ({ value, min, max, onConfirm, onCancel }) => {
  const normalizedValue = normalizeTime(value, withinBounds("08:00", min, max) ? "08:00" : (min || max || "00:00"));
  const initial = withinBounds(normalizedValue, min, max) ? normalizedValue : (min || max || normalizedValue);
  const [selected, setSelected] = useState(initial);
  const [hour, minute] = selected.split(":").map(Number);
  const [hourText, setHourText] = useState(pad2(hour));
  const [minuteText, setMinuteText] = useState(pad2(minute));
  const hourRef = useRef(null);
  const minuteRef = useRef(null);
  useEffect(() => {
    setHourText(pad2(hour));
    setMinuteText(pad2(minute));
    hourRef.current?.querySelector(`[data-value="${pad2(hour)}"]`)?.scrollIntoView({ block: "center" });
    minuteRef.current?.querySelector(`[data-value="${pad2(minute)}"]`)?.scrollIntoView({ block: "center" });
  }, [hour, minute]);
  const setParts = (nextHour, nextMinute) => {
    const candidate = `${pad2(Math.min(23, Math.max(0, nextHour)))}:${pad2(Math.min(59, Math.max(0, nextMinute)))}`;
    if (withinBounds(candidate, min, max)) setSelected(candidate);
  };
  const applyTyped = (part, raw, commit = false) => {
    const cleaned = String(raw).replace(/\D/g, "").slice(0, 2);
    if (part === "hour") setHourText(cleaned);
    else setMinuteText(cleaned);
    if (!cleaned) return;
    if (!commit && cleaned.length < 2) return;
    const numeric = Number(cleaned);
    if (part === "hour") setParts(Math.min(23, numeric), minute);
    else setParts(hour, Math.min(59, numeric));
  };
  const addMinutes = (delta) => {
    const total = ((hour * 60) + minute + delta + 1440) % 1440;
    const candidate = `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
    if (withinBounds(candidate, min, max)) setSelected(candidate);
  };
  const chooseNow = () => {
    const candidate = jakartaTime();
    if (withinBounds(candidate, min, max)) setSelected(candidate);
  };
  return <div className={styles.panel}>
    <div className={styles.timeInputs}>
      <label><input inputMode="numeric" maxLength={2} value={hourText} onFocus={(event) => event.target.select()} onChange={(event) => applyTyped("hour", event.target.value)} onBlur={(event) => applyTyped("hour", event.target.value, true)} aria-label="Jam" /><span>JAM</span></label>
      <strong aria-hidden="true">:</strong>
      <label><input inputMode="numeric" maxLength={2} value={minuteText} onFocus={(event) => event.target.select()} onChange={(event) => applyTyped("minute", event.target.value)} onBlur={(event) => applyTyped("minute", event.target.value, true)} aria-label="Menit" /><span>MENIT</span></label>
    </div>
    <div className={styles.quickActions} aria-label="Pilihan waktu cepat">
      <button type="button" onClick={chooseNow} disabled={!withinBounds(jakartaTime(), min, max)}>Sekarang</button>
      <button type="button" onClick={() => addMinutes(30)}>+30 menit</button>
    </div>
    <div className={styles.timeWheels}>
      <div><span>JAM</span><div className={styles.wheel} ref={hourRef}>{Array.from({ length: 24 }, (_, current) => {
        const candidate = `${pad2(current)}:${pad2(minute)}`;
        const disabled = !withinBounds(candidate, min, max);
        return <button data-value={pad2(current)} key={current} type="button" className={current === hour ? styles.wheelSelected : ""} disabled={disabled} aria-pressed={current === hour} onClick={() => setParts(current, minute)}>{pad2(current)}</button>;
      })}</div></div>
      <div><span>MENIT</span><div className={styles.wheel} ref={minuteRef}>{Array.from({ length: 60 }, (_, current) => {
        const candidate = `${pad2(hour)}:${pad2(current)}`;
        const disabled = !withinBounds(candidate, min, max);
        return <button data-value={pad2(current)} key={current} type="button" className={current === minute ? styles.wheelSelected : ""} disabled={disabled} aria-pressed={current === minute} onClick={() => setParts(hour, current)}>{pad2(current)}</button>;
      })}</div></div>
    </div>
    <p className={styles.timeHint}>Waktu dapat dipilih sampai presisi satu menit.</p>
    <div className={styles.pickerActions}>
      <Button type="button" onClick={onCancel}>Batal</Button>
      <Button type="button" variant="primary" onClick={() => onConfirm(selected)}>Pilih pukul {selected}</Button>
    </div>
  </div>;
};

const PickerPanel = ({ kind, ...props }) => {
  if (kind === "month") return <MonthPanel {...props} />;
  if (kind === "time") return <TimePanel {...props} />;
  return <CalendarPanel {...props} />;
};

const TemporalPickerField = ({
  kind = "date",
  value = "",
  onChange,
  min,
  max,
  disabled = false,
  required = false,
  id,
  name,
  ariaLabel,
  ariaInvalid,
  ariaDescribedBy,
  className = "",
  compact = false,
  embedded = false,
  title,
  description,
}) => {
  const generatedId = useId();
  const controlId = id || generatedId;
  const modalSubview = useModalSubview();
  const [standaloneOpen, setStandaloneOpen] = useState(false);
  const presentation = useMemo(() => pickerPresentation(kind, value), [kind, value]);
  const pickerTitle = title || presentation.title;
  const pickerDescription = description || presentation.description;
  const closeStandalone = () => setStandaloneOpen(false);
  const confirm = (nextValue, close) => {
    onChange?.(nextValue);
    close();
  };
  const open = () => {
    if (disabled) return;
    if (modalSubview?.openSubview) {
      modalSubview.openSubview({
        title: pickerTitle,
        description: pickerDescription,
        content: <PickerPanel kind={kind} value={value} min={min} max={max} onCancel={modalSubview.closeSubview} onConfirm={(nextValue) => confirm(nextValue, modalSubview.closeSubview)} />,
      });
      return;
    }
    setStandaloneOpen(true);
  };
  const buttonClass = [styles.fieldButton, compact ? styles.compact : "", embedded ? styles.embedded : "", className].filter(Boolean).join(" ");
  const Icon = presentation.Icon;
  return <>
    <button
      id={controlId}
      name={name}
      type="button"
      className={buttonClass}
      onClick={open}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-required={required || undefined}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      aria-haspopup="dialog"
      aria-expanded={standaloneOpen || undefined}
      data-temporal-picker={kind}
    >
      <span className={styles.fieldIcon} aria-hidden="true"><Icon /></span>
      <span className={styles.fieldValue}>{presentation.value}</span>
      <FiChevronRight className={styles.fieldChevron} aria-hidden="true" />
    </button>
    <Modal
      open={standaloneOpen}
      title={pickerTitle}
      description={pickerDescription}
      onClose={closeStandalone}
      closeIcon={FiArrowLeft}
      closeLabel="Kembali"
      mobileSwipeToClose={false}
      size="sm"
      className={styles.standaloneModal}
    >
      <PickerPanel kind={kind} value={value} min={min} max={max} onCancel={closeStandalone} onConfirm={(nextValue) => confirm(nextValue, closeStandalone)} />
    </Modal>
  </>;
};

export default TemporalPickerField;
