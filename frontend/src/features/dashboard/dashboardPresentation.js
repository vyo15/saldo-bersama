import { todayInJakarta } from "../../domain/dates.js";

export const formatPeriod = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  if (!match) return String(value || "Periode aktif");
  const parsed = new Date(`${match[1]}-${match[2]}-01T00:00:00+07:00`);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(parsed);
};

export const absoluteAmount = (value) => Math.abs(Number(value || 0));

const jakartaDate = (value) => {
  const normalized = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const canonical = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(parsed);
  return canonical === normalized ? parsed : null;
};

export const dashboardDueLabel = (value, today = todayInJakarta()) => {
  const due = jakartaDate(value);
  const current = jakartaDate(today);
  if (!due || !current) return "Jadwal belum tersedia";
  const days = Math.round((due.getTime() - current.getTime()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} hari terlambat`;
  if (days === 0) return "Hari ini";
  return days === 1 ? "Besok" : `${days} hari lagi`;
};

export const dashboardInsightState = (overview = {}) => {
  const safeToSpend = Math.max(0, Number(overview.safeToSpend || 0));
  const cashFlow = overview.cashFlow || {};
  const net = Number.isFinite(Number(cashFlow.net))
    ? Number(cashFlow.net)
    : Number(cashFlow.income || 0) + Number(cashFlow.refund || 0) - Number(cashFlow.expense || 0);

  if (safeToSpend <= 0) return { kind: "limited", tone: "warning", title: "Ruang aman perlu ditinjau" };
  if (net < 0) return { kind: "cashflow", tone: "warning", title: "Pengeluaran perlu dipantau" };
  return { kind: "safe", tone: "positive", title: "Kondisi keuangan masih aman" };
};
