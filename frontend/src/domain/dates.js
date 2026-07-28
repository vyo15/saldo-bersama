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

export const currentMonthBoundsInJakarta = () => {
  const { year, month } = dateParts();
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
};
