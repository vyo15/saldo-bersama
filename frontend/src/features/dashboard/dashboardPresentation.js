import { FiCalendar, FiDollarSign, FiPieChart, FiTarget } from "react-icons/fi";

export const QUICK_ACTIONS = Object.freeze([
  { to: "/rekening", label: "Rekening", icon: FiDollarSign },
  { to: "/alokasi", label: "Alokasi", icon: FiPieChart },
  { to: "/tagihan", label: "Tagihan", icon: FiCalendar },
  { to: "/target", label: "Target", icon: FiTarget },
]);

export const formatPeriod = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  if (!match) return String(value || "Periode aktif");
  const parsed = new Date(`${match[1]}-${match[2]}-01T00:00:00+07:00`);
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(parsed);
};

export const absoluteAmount = (value) => Math.abs(Number(value || 0));
