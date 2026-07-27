const STATUS_LABELS = {
  active: "Aktif",
  paid: "Dibayar",
  received: "Diterima",
  scheduled: "Terjadwal",
  overdue: "Terlambat",
  cancelled: "Dibatalkan",
  closed: "Ditutup",
  warning: "Waspada",
};

const StatusBadge = ({ status }) => (
  <span className={`status-badge status-badge--${status}`}>{STATUS_LABELS[status] || status}</span>
);

export default StatusBadge;
