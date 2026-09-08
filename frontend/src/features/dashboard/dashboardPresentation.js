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

const operablePlanningAccounts = (overview = {}) => (overview.accountBalances || [])
  .filter((item) => item.account_type !== "investment" && item.can_transact !== false);

export const dashboardNeedEmptyAction = (overview = {}) => {
  const manageable = (overview.envelopes || []).filter((item) => item.can_manage_needs);
  if (manageable.length === 1) return {
    label: "Tambah kebutuhan",
    description: "Atur rencana bulan ini",
    to: "/perencanaan/kantong",
    state: { workflowSource: "dashboard-empty-action", workflowAction: "add-need", envelopeRuleId: manageable[0].envelope_rule_id },
  };
  if (manageable.length > 1) return {
    label: "Tambah kebutuhan",
    description: "Pilih Alokasi Dana yang akan dipakai",
    to: "/perencanaan/kantong",
    state: { workflowSource: "dashboard-empty-action", workflowAction: "choose-need-allocation" },
  };
  if (operablePlanningAccounts(overview).length) return {
    label: "Buat Alokasi Dana",
    description: "Siapkan dana untuk kebutuhan bulan ini",
    to: "/perencanaan/kantong",
    state: { workflowSource: "dashboard-empty-action", workflowAction: "create-allocation" },
  };
  return {
    label: "Siapkan rekening",
    description: "Aktifkan rekening sebelum membuat rencana",
    to: "/rekening",
    state: null,
  };
};

export const dashboardRecurringEmptyAction = (overview = {}) => operablePlanningAccounts(overview).length
  ? {
      label: "Tambah jadwal rutin",
      description: "Catat pemasukan atau pengeluaran berulang",
      to: "/perencanaan/jadwal",
      state: { workflowSource: "dashboard-empty-action", workflowAction: "create-recurring" },
    }
  : {
      label: "Siapkan rekening",
      description: "Aktifkan rekening sebelum membuat jadwal",
      to: "/rekening",
      state: null,
    };

export const dashboardGoalEmptyAction = (overview = {}) => operablePlanningAccounts(overview).some((item) => item.owner_scope === "shared")
  ? {
      label: "Buat target",
      description: "Mulai pantau progres tujuan keuangan",
      to: "/target",
      state: { workflowSource: "dashboard-empty-action", workflowAction: "create-goal" },
    }
  : {
      label: "Siapkan rekening Bersama",
      description: "Target membutuhkan rekening Bersama aktif",
      to: "/rekening",
      state: null,
    };
