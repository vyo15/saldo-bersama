import { FiCreditCard, FiPieChart, FiRepeat, FiTarget } from "react-icons/fi";

export const QUICK_ACTIONS = Object.freeze([
  { to: "/rekening", label: "Rekening", icon: FiCreditCard },
  { to: "/alokasi", label: "Alokasi", icon: FiPieChart },
  { to: "/tagihan", label: "Jadwal rutin", icon: FiRepeat },
  { to: "/target", label: "Target", icon: FiTarget },
]);

const ALERT_TARGETS = Object.freeze({
  reconciliation_difference: { prefix: "reconciliation-difference", fallbackPath: "/rekonsiliasi" },
  reconciliation_stale: { prefix: "reconciliation-stale", fallbackPath: "/rekonsiliasi" },
  unallocated_expense: { prefix: "unallocated", fallbackPath: "/transaksi" },
  budget_threshold: { prefix: "budget", fallbackPath: "/anggaran" },
  envelope_threshold: { prefix: "envelope", fallbackPath: "/alokasi" },
  recurring_overdue: { prefix: "recurring-overdue", fallbackPath: "/tagihan" },
  recurring_due: { prefix: "recurring-due", fallbackPath: "/tagihan" },
  goal_behind: { prefix: "goal-behind", fallbackPath: "/target" },
});

const alertEntityId = (alert) => {
  const config = ALERT_TARGETS[alert?.type];
  const id = String(alert?.id || "");
  if (!config || !id.startsWith(`${config.prefix}:`)) return "";
  return id.slice(config.prefix.length + 1).split(":")[0] || "";
};

const safeTargetPath = (alert, fallbackPath = "/") => {
  const value = String(alert?.targetPath || "");
  const internalPath = value.startsWith("/") && !value.startsWith("//");
  if (!internalPath) return fallbackPath;
  return fallbackPath === "/" || value === fallbackPath ? value : fallbackPath;
};

const alertPeriod = (alert) => {
  const candidate = alertEntityId(alert);
  return /^\d{4}-\d{2}$/.test(candidate) ? candidate : "";
};

export const dashboardAlertGuidance = (alert = {}) => {
  const entityId = alertEntityId(alert);
  const config = ALERT_TARGETS[alert.type];
  const to = safeTargetPath(alert, config?.fallbackPath || "/");
  const baseState = { attentionSource: "dashboard", attentionType: alert.type || "unknown" };

  switch (alert.type) {
    case "reconciliation_difference":
      return {
        instruction: "Masukkan saldo rekening yang benar saat ini. Rekening akan dipilih otomatis agar Anda tidak perlu mencarinya lagi.",
        actionLabel: "Cocokkan saldo",
        to,
        state: { ...baseState, ...(entityId ? { accountId: entityId } : {}) },
      };
    case "reconciliation_stale":
      return {
        instruction: "Cek saldo sebenarnya di bank atau uang tunai Anda, lalu masukkan nilainya untuk memastikan catatan aplikasi masih sesuai.",
        actionLabel: "Cek saldo sekarang",
        to,
        state: { ...baseState, ...(entityId ? { accountId: entityId } : {}) },
      };
    case "unallocated_expense": {
      const period = alertPeriod(alert);
      return {
        instruction: "Pilih pengeluaran yang belum memiliki kantong, buka Edit, lalu tentukan alokasi seperti Makan, Bensin, Rumah, atau jatah lainnya.",
        actionLabel: "Pilih alokasi",
        to,
        state: { ...baseState, allocation: "unallocated", ...(period ? { period } : {}) },
      };
    }
    case "budget_threshold":
      return {
        instruction: alert.severity === "danger" ? "Periksa transaksi yang membuat anggaran terlampaui. Ubah batas hanya jika rencana anggarannya memang berubah." : "Periksa pemakaian kategori ini dan pastikan sisa anggaran cukup sampai akhir periode.",
        actionLabel: "Periksa anggaran",
        to,
        state: { ...baseState, ...(entityId ? { attentionBudgetId: entityId } : {}) },
      };
    case "envelope_threshold":
      return {
        instruction: alert.severity === "danger" ? "Periksa transaksi pada kantong ini karena jatah sudah habis atau terlampaui." : "Periksa sisa jatah sebelum membuat pengeluaran berikutnya dari kantong ini.",
        actionLabel: "Periksa alokasi",
        to,
        state: { ...baseState, ...(entityId ? { attentionEnvelopeId: entityId } : {}) },
      };
    case "recurring_overdue":
      return {
        instruction: "Jika tagihan sudah dibayar, catat pembayaran aktual sekarang. Jika belum, periksa nominal dan rekening sebelum melanjutkan.",
        actionLabel: "Catat pembayaran",
        to,
        state: { ...baseState, ...(entityId ? { attentionOccurrenceId: entityId } : {}), attentionAction: "payment" },
      };
    case "recurring_due":
      return {
        instruction: "Periksa tagihan yang akan jatuh tempo. Jika sudah dibayar lebih awal, catat aktualnya agar saldo dan jadwal tetap sinkron.",
        actionLabel: "Buka tagihan ini",
        to,
        state: { ...baseState, ...(entityId ? { attentionOccurrenceId: entityId } : {}) },
      };
    case "goal_behind":
      return {
        instruction: "Target berada di bawah ritme rencana. Tambahkan dana jika kondisi keuangan memungkinkan; jangan mengambil dana dari rekening yang tidak sesuai.",
        actionLabel: "Tambah dana target",
        to,
        state: { ...baseState, ...(entityId ? { attentionGoalId: entityId } : {}), attentionAction: "deposit" },
      };
    default:
      return {
        instruction: "Buka bagian terkait untuk melihat data yang perlu diperiksa sebelum mengambil tindakan.",
        actionLabel: "Buka tindakan",
        to,
        state: baseState,
      };
  }
};

export const formatPeriod = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  if (!match) return String(value || "Periode aktif");
  const parsed = new Date(`${match[1]}-${match[2]}-01T00:00:00+07:00`);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(parsed);
};

export const absoluteAmount = (value) => Math.abs(Number(value || 0));
