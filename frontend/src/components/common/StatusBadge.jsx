const STATUS_META = Object.freeze({
  active: { label: "Aktif", tone: "active" },
  archived: { label: "Diarsipkan", tone: "neutral" },
  paid: { label: "Dibayar", tone: "active" },
  received: { label: "Diterima", tone: "active" },
  partial: { label: "Sebagian", tone: "warning" },
  scheduled: { label: "Terjadwal", tone: "info" },
  expected: { label: "Diharapkan", tone: "info" },
  overdue: { label: "Terlambat", tone: "danger" },
  late: { label: "Terlambat diterima", tone: "danger" },
  cancelled: { label: "Dibatalkan", tone: "danger" },
  closed: { label: "Ditutup", tone: "neutral" },
  reopened: { label: "Dibuka kembali", tone: "info" },
  warning: { label: "Waspada", tone: "warning" },
  matched: { label: "Cocok", tone: "active" },
  difference: { label: "Ada selisih", tone: "warning" },
  pending: { label: "Menunggu", tone: "info" },
  sent: { label: "Terkirim", tone: "active" },
  failed: { label: "Gagal", tone: "danger" },
  expired: { label: "Kedaluwarsa", tone: "neutral" },
});

const StatusBadge = ({ status }) => {
  const normalized = String(status || "unknown").toLowerCase();
  const meta = STATUS_META[normalized] || { label: normalized.replaceAll("_", " "), tone: "neutral" };
  return <span className={`status-badge status-badge--${meta.tone}`}>{meta.label}</span>;
};

export default StatusBadge;
