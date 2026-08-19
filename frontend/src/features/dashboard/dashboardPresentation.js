const ALERT_TARGETS = Object.freeze({
  reconciliation_difference: { prefix: "reconciliation-difference", fallbackPath: "/rekonsiliasi" },
  reconciliation_stale: { prefix: "reconciliation-stale", fallbackPath: "/rekonsiliasi" },
  unallocated_expense: { prefix: "unallocated", fallbackPath: "/transaksi" },
  unallocated_funds: { prefix: "unallocated-funds", fallbackPath: "/perencanaan/kantong" },
  budget_threshold: { prefix: "budget", fallbackPath: "/perencanaan/kantong" },
  envelope_threshold: { prefix: "envelope", fallbackPath: "/perencanaan/kantong" },
  recurring_overdue: { prefix: "recurring-overdue", fallbackPath: "/perencanaan/jadwal" },
  recurring_due: { prefix: "recurring-due", fallbackPath: "/perencanaan/jadwal" },
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

const guidance = ({ instruction, actionLabel, to, baseState, state = {} }) => ({
  instruction,
  actionLabel,
  to,
  state: { ...baseState, ...state },
});

const entityState = (key, value) => (value ? { [key]: value } : {});

const ALERT_GUIDANCE_BUILDERS = Object.freeze({
  reconciliation_difference: ({ to, baseState, entityId }) => guidance({
    instruction: "Masukkan saldo rekening yang benar saat ini. Rekening akan dipilih otomatis agar Anda tidak perlu mencarinya lagi.",
    actionLabel: "Cocokkan saldo",
    to,
    baseState,
    state: entityState("accountId", entityId),
  }),
  reconciliation_stale: ({ to, baseState, entityId }) => guidance({
    instruction: "Cek saldo sebenarnya di bank atau uang tunai Anda, lalu masukkan nilainya untuk memastikan catatan aplikasi masih sesuai.",
    actionLabel: "Cek saldo sekarang",
    to,
    baseState,
    state: entityState("accountId", entityId),
  }),
  unallocated_expense: ({ alert, to, baseState }) => {
    const period = alertPeriod(alert);
    return guidance({
      instruction: "Pilih pengeluaran yang belum memiliki alokasi, buka Edit, lalu tentukan Alokasi Dana yang sesuai.",
      actionLabel: "Pilih Alokasi Dana",
      to,
      baseState,
      state: { allocation: "unallocated", ...entityState("period", period) },
    });
  },
  unallocated_funds: ({ alert, to, baseState }) => {
    const period = alertPeriod(alert);
    return guidance({
      instruction: "Dana ini masih tersedia di rekening dan belum dibagi ke Alokasi Dana. Tambahkan hanya jumlah yang memang ingin dialokasikan; saldo rekening tidak berubah.",
      actionLabel: "Atur Alokasi Dana",
      to,
      baseState,
      state: { attentionAction: "fund", ...entityState("period", period) },
    });
  },
  budget_threshold: ({ alert, to, baseState, entityId }) => guidance({
    instruction: alert.severity === "danger"
      ? "Periksa transaksi yang membuat anggaran terlampaui. Ubah anggaran kebutuhan hanya jika rencana memang berubah."
      : "Periksa pemakaian kategori ini dan pastikan sisa anggaran cukup sampai akhir periode.",
    actionLabel: "Periksa kebutuhan",
    to,
    baseState,
    state: entityState("attentionBudgetId", entityId),
  }),
  envelope_threshold: ({ alert, to, baseState, entityId }) => guidance({
    instruction: alert.severity === "danger"
      ? "Periksa transaksi pada Alokasi Dana ini karena dana yang dialokasikan sudah habis atau terlampaui."
      : "Periksa dana tersisa sebelum membuat pengeluaran berikutnya dari Alokasi Dana ini.",
    actionLabel: "Periksa Alokasi Dana",
    to,
    baseState,
    state: entityState("attentionEnvelopeId", entityId),
  }),
  recurring_overdue: ({ to, baseState, entityId }) => guidance({
    instruction: "Jika tagihan sudah dibayar, catat pembayaran aktual sekarang. Jika belum, periksa nominal dan rekening sebelum melanjutkan.",
    actionLabel: "Catat pembayaran",
    to,
    baseState,
    state: { ...entityState("attentionOccurrenceId", entityId), attentionAction: "payment" },
  }),
  recurring_due: ({ to, baseState, entityId }) => guidance({
    instruction: "Periksa tagihan yang akan jatuh tempo. Jika sudah dibayar lebih awal, catat aktualnya agar saldo dan jadwal tetap sinkron.",
    actionLabel: "Buka tagihan ini",
    to,
    baseState,
    state: entityState("attentionOccurrenceId", entityId),
  }),
  goal_behind: ({ to, baseState, entityId }) => guidance({
    instruction: "Target berada di bawah ritme rencana. Tambahkan dana jika kondisi keuangan memungkinkan; jangan mengambil dana dari rekening yang tidak sesuai.",
    actionLabel: "Tambah dana target",
    to,
    baseState,
    state: { ...entityState("attentionGoalId", entityId), attentionAction: "deposit" },
  }),
});

const defaultAlertGuidance = ({ to, baseState }) => guidance({
  instruction: "Buka bagian terkait untuk melihat data yang perlu diperiksa sebelum mengambil tindakan.",
  actionLabel: "Buka tindakan",
  to,
  baseState,
});

export const dashboardAlertGuidance = (alert = {}) => {
  const config = ALERT_TARGETS[alert.type];
  const context = {
    alert,
    entityId: alertEntityId(alert),
    to: safeTargetPath(alert, config?.fallbackPath || "/"),
    baseState: { attentionSource: "dashboard", attentionType: alert.type || "unknown" },
  };
  return (ALERT_GUIDANCE_BUILDERS[alert.type] || defaultAlertGuidance)(context);
};

export const formatPeriod = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  if (!match) return String(value || "Periode aktif");
  const parsed = new Date(`${match[1]}-${match[2]}-01T00:00:00+07:00`);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(parsed);
};

export const absoluteAmount = (value) => Math.abs(Number(value || 0));
