import { userRoleLabel } from "../../shared/presentation/user.js";

const MONTH_LABELS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]);

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
  const allocated = Math.max(0, Number(item?.allocated_amount || 0));
  const used = Math.max(0, Number(item?.used_amount || 0));
  const reserved = Math.max(0, Number(item?.reserved_amount || 0));
  const committed = used + reserved;
  const percentage = allocated > 0 ? Math.max(0, Math.round((committed / allocated) * 100)) : 0;
  if (committed <= 0) return { allocated, used, reserved, committed, percentage, label: "Belum terpakai", tone: "idle" };
  if (allocated <= 0 || committed > allocated) return { allocated, used, reserved, committed, percentage, label: "Melebihi dana Kantong", tone: "danger" };
  if (percentage >= 100) return { allocated, used, reserved, committed, percentage, label: "Dana Kantong penuh", tone: "danger" };
  if (percentage >= 80) return { allocated, used, reserved, committed, percentage, label: "Menipis", tone: "warning" };
  return { allocated, used, reserved, committed, percentage, label: "Sedang digunakan", tone: "active" };
};
