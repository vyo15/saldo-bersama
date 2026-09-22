const ALERT_TARGETS = Object.freeze({
  investment_reconciliation_difference: { prefix: "investment-reconciliation-difference", fallbackPath: "/investasi" },
  investment_reconciliation_stale: { prefix: "investment-reconciliation-stale", fallbackPath: "/investasi" },
  reconciliation_difference: { prefix: "reconciliation-difference", fallbackPath: "/rekonsiliasi" },
  reconciliation_stale: { prefix: "reconciliation-stale", fallbackPath: "/rekonsiliasi" },
  unallocated_expense: { prefix: "unallocated", fallbackPath: "/transaksi" },
  unallocated_funds: { prefix: "unallocated-funds", fallbackPath: "/perencanaan/kantong" },
  budget_threshold: { prefix: "budget", fallbackPath: "/perencanaan/kantong" },
  envelope_threshold: { prefix: "envelope", fallbackPath: "/perencanaan/kantong" },
  recurring_overdue: { prefix: "recurring-overdue", fallbackPath: "/perencanaan/jadwal" },
  recurring_due: { prefix: "recurring-due", fallbackPath: "/perencanaan/jadwal" },
  recurring_funding_shortage: { prefix: "recurring-funding-shortage", fallbackPath: "/perencanaan/jadwal" },
  recurring_completed: { prefix: "recurring-completed", fallbackPath: "/perencanaan/jadwal" },
  recording_consistency: { prefix: "recording-consistency", fallbackPath: "/transaksi" },
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
  investment_reconciliation_difference: ({ to, baseState, entityId }) => guidance({
    instruction: "Buka Investasi dan periksa nilai aset yang tercatat. Pencocokan investasi lama tetap tersedia sebagai histori bila alert ini berasal dari data lama.",
    actionLabel: "Cocokkan investasi",
    to,
    baseState,
    state: entityState("attentionRdnAccountId", entityId),
  }),
  investment_reconciliation_stale: ({ to, baseState, entityId }) => guidance({
    instruction: "Buka Investasi dan periksa apakah nilai aset yang tercatat masih sesuai. Alert pencocokan lama tidak diperlukan untuk pencatatan investasi baru.",
    actionLabel: "Cocokkan investasi",
    to,
    baseState,
    state: entityState("attentionRdnAccountId", entityId),
  }),
  reconciliation_difference: ({ to, baseState, entityId }) => guidance({
    instruction: "Rekening akan dipilih otomatis. Masukkan saldo yang Anda lihat saat ini agar sistem membandingkannya dengan saldo yang tercatat.",
    actionLabel: "Pastikan saldo sesuai",
    to,
    baseState,
    state: entityState("accountId", entityId),
  }),
  reconciliation_stale: ({ to, baseState, entityId }) => guidance({
    instruction: "Lihat saldo di bank atau uang tunai Anda, lalu masukkan angka terbaru untuk memastikan catatan aplikasi masih sesuai.",
    actionLabel: "Pastikan saldo sesuai",
    to,
    baseState,
    state: entityState("accountId", entityId),
  }),
  unallocated_expense: ({ alert, to, baseState }) => {
    const period = alertPeriod(alert);
    return guidance({
      instruction: "Buka pengeluaran yang belum masuk rencana, lalu hubungkan ke Kebutuhan yang sesuai. Alokasi Dana tetap dapat dipilih manual bila memang diperlukan.",
      actionLabel: "Rapikan transaksi",
      to,
      baseState,
      state: { allocation: "unallocated", ...entityState("period", period) },
    });
  },
  unallocated_funds: ({ alert, to, baseState, entityId }) => guidance({
    instruction: "Kebutuhan pada Alokasi Dana ini lebih besar dari dana yang sudah dipisahkan. Tambahkan dana sesuai kekurangan bila memang ingin seluruh kebutuhan tercakup; saldo bank fisik tidak berubah sampai transaksi nyata dicatat.",
    actionLabel: "Tambahkan dana alokasi",
    to,
    baseState,
    state: {
      attentionAction: "fund",
      ...entityState("attentionEnvelopeId", alert.envelopePeriodId || entityId),
      attentionSuggestedAmount: Number(alert.fundingGap || 0),
      ...entityState("period", alert.period || ""),
    },
  }),
  budget_threshold: ({ alert, to, baseState, entityId }) => guidance({
    instruction: alert.severity === "danger"
      ? "Periksa transaksi yang membuat kebutuhan melewati rencana. Ubah nominal kebutuhan hanya jika rencana memang berubah."
      : "Periksa pemakaian kebutuhan ini dan pastikan sisa rencana cukup sampai akhir periode.",
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
  recurring_funding_shortage: ({ to, baseState, entityId }) => guidance({
    instruction: "Dana pada rekening pembayaran belum cukup untuk jadwal ini. Periksa rekening atau nominal sebelum mencatat pembayaran.",
    actionLabel: "Periksa tagihan",
    to,
    baseState,
    state: entityState("attentionOccurrenceId", entityId),
  }),
  recurring_completed: ({ to, baseState, entityId }) => guidance({
    instruction: "Pembayaran rutin ini sudah tercatat. Buka jadwal untuk melihat detail dan pembayaran berikutnya.",
    actionLabel: "Lihat pembayaran",
    to,
    baseState,
    state: entityState("attentionOccurrenceId", entityId),
  }),
  recording_consistency: ({ to, baseState }) => guidance({
    instruction: "Buka transaksi bila ada aktivitas yang belum sempat dicatat atau dirapikan.",
    actionLabel: "Buka transaksi",
    to,
    baseState,
  }),
  goal_behind: ({ to, baseState, entityId }) => guidance({
    instruction: "Target berada di bawah ritme rencana. Tambahkan dana tunai atau investasi langsung dari Target.",
    actionLabel: "Tambah dana",
    to,
    baseState,
    state: { ...entityState("attentionGoalId", entityId), attentionAction: "fund" },
  }),
});

const defaultAlertGuidance = ({ to, baseState }) => guidance({
  instruction: "Buka bagian terkait untuk melihat data yang perlu diperiksa sebelum mengambil tindakan.",
  actionLabel: "Buka tindakan",
  to,
  baseState,
});

export const financialAlertGuidance = (alert = {}, { source = "dashboard" } = {}) => {
  const config = ALERT_TARGETS[alert.type];
  const context = {
    alert,
    entityId: alertEntityId(alert),
    to: safeTargetPath(alert, config?.fallbackPath || "/"),
    baseState: { attentionSource: source, attentionType: alert.type || "unknown" },
  };
  return (ALERT_GUIDANCE_BUILDERS[alert.type] || defaultAlertGuidance)(context);
};
