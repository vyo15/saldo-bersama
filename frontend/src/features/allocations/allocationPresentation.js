import { userRoleLabel } from "../../shared/presentation/user.js";

const MONTH_LABELS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]);

const nonNegativeNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

const parseDateParts = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

export const allocationAssigneeLabel = (item) => {
  if (!item?.assignee_user_id) return "Bersama";
  const name = String(item.assignee_name || "Pengguna").trim();
  return `${name} · ${userRoleLabel(item.assignee_role)}`;
};

export const allocationSourceLabel = (item) => item?.source_account_name || "Sumber belum ditentukan";

export const allocationPeriodLabel = (startValue, endValue) => {
  const start = parseDateParts(startValue); const end = parseDateParts(endValue);
  if (!start || !end) return `${startValue || "?"} – ${endValue || "?"}`;
  if (start.year === end.year && start.month === end.month) return `${start.day}–${end.day} ${MONTH_LABELS[start.month - 1]} ${start.year}`;
  if (start.year === end.year) return `${start.day} ${MONTH_LABELS[start.month - 1]} – ${end.day} ${MONTH_LABELS[end.month - 1]} ${start.year}`;
  return `${start.day} ${MONTH_LABELS[start.month - 1]} ${start.year} – ${end.day} ${MONTH_LABELS[end.month - 1]} ${end.year}`;
};

export const allocationUsage = (item) => {
  const allocated = nonNegativeNumber(item?.allocated_amount);
  const used = nonNegativeNumber(item?.used_amount);
  const reserved = nonNegativeNumber(item?.reserved_amount);
  const committed = used + reserved;
  const percentage = allocated > 0 ? Math.max(0, Math.round((committed / allocated) * 100)) : 0;
  if (committed <= 0) return { allocated, used, reserved, committed, percentage, label: "Belum terpakai", tone: "idle" };
  if (allocated <= 0 || committed > allocated) return { allocated, used, reserved, committed, percentage, label: "Dana terlampaui", tone: "danger" };
  if (percentage >= 100) return { allocated, used, reserved, committed, percentage, label: "Dana alokasi habis", tone: "danger" };
  if (percentage >= 80) return { allocated, used, reserved, committed, percentage, label: "Menipis", tone: "warning" };
  return { allocated, used, reserved, committed, percentage, label: "Sedang digunakan", tone: "active" };
};

export const allocationNeedsFundingSummary = (item, budgets = []) => {
  const allocated = nonNegativeNumber(item?.allocated_amount);
  const planned = (budgets || []).reduce((total, budget) => total + nonNegativeNumber(budget?.amount), 0);
  const gap = Math.max(0, planned - allocated);
  const unplanned = Math.max(0, allocated - planned);
  const status = gap > 0 ? "needs-funding" : planned > 0 && unplanned === 0 ? "balanced" : "available";
  return { allocated, planned, gap, unplanned, status };
};
