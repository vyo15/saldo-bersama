const TIMEZONE = "Asia/Jakarta";

const dateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
};

export const todayInJakarta = () => {
  const { year, month, day } = dateParts();
  return `${year}-${month}-${day}`;
};

export const currentMonthInJakarta = () => {
  const { year, month } = dateParts();
  return `${year}-${month}`;
};

export const previousMonthInJakarta = () => {
  const { year, month } = dateParts();
  const previous = new Date(Date.UTC(Number(year), Number(month) - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const currentMonthBoundsInJakarta = () => {
  const { year, month } = dateParts();
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
};

export const formatDateTimeJakarta = (value, { fallback = "" } = {}) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return value || fallback;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TIMEZONE,
  }).format(date);
};

export const formatDateLongIndonesia = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "";
  const parsed = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  const normalized = dateParts(parsed);
  if (`${normalized.year}-${normalized.month}-${normalized.day}` !== value) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIMEZONE,
  }).format(parsed);
};
