import { todayInJakarta } from "../../domain/dates.js";

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

export const compactPlanningDate = (value) => {
  if (!validDate(value)) return "";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(date);
};

export const planningDueState = (value, { completed = false, today = todayInJakarta() } = {}) => {
  const date = validDate(value) ? String(value) : "";
  const compact = compactPlanningDate(date);
  if (completed) return { state: "completed", label: compact ? `Selesai · ${compact}` : "Selesai", warning: false };
  if (!date) return { state: "scheduled", label: "Terjadwal", warning: false };
  if (date < today) return { state: "overdue", label: `Terlambat · ${compact}`, warning: true };
  if (date === today) return { state: "today", label: "Jatuh tempo hari ini", warning: true };

  const tomorrowDate = new Date(`${today}T00:00:00Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = `${tomorrowDate.getUTCFullYear()}-${String(tomorrowDate.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getUTCDate()).padStart(2, "0")}`;
  if (date === tomorrow) return { state: "tomorrow", label: "Jatuh tempo besok", warning: false };
  return { state: "scheduled", label: compact || date, warning: false };
};
