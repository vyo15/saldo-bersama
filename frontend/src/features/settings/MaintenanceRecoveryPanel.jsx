import { FiHardDrive, FiShield } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import styles from "./Settings.module.css";

export const formatMaintenanceCount = (value) => Number(value || 0).toLocaleString("id-ID");

export const readMaintenanceRecoveryToken = (storageKey) => {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(storageKey) || "null");
    return value?.idempotencyKey ? value : null;
  } catch {
    return null;
  }
};

export const storeMaintenanceRecoveryToken = (storageKey, value) => {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    else window.sessionStorage.removeItem(storageKey);
  } catch { /* Browser storage is only a recovery hint. Backend remains authoritative. */ }
};

export const MaintenanceSummaryGrid = ({ labels, summary, ariaLabel }) => (
  <div className={styles.resetPreviewGrid} aria-label={ariaLabel}>
    {labels.map(([key, label]) => (
      <div key={key}><span>{label}</span><strong>{formatMaintenanceCount(summary?.[key])}</strong></div>
    ))}
  </div>
);

export const SafetyBackupPreflight = ({ resource, readiness }) => {
  const statusText = resource.status === "loading" || resource.status === "refreshing"
    ? "Memeriksa Google Drive..."
    : readiness.text;
  return (
    <div className={styles.resetSafetyPreflight}>
      <span className={styles.serviceIcon}><FiHardDrive aria-hidden="true" /></span>
      <span>
        <strong>Safety backup Google Drive</strong>
        <small>{statusText}</small>
        {readiness.errorCode ? <small>Kode diagnosis: {readiness.errorCode}</small> : null}
      </span>
      <span className={`status-badge status-badge--${readiness.tone}`}>{readiness.label}</span>
    </div>
  );
};

const MaintenanceRecoveryPanel = ({
  maintenanceMode,
  busy = false,
  onRecover,
  title = "Mode pemulihan aktif",
  description = "Perubahan data diblokir sampai pemeriksaan konsistensi data lulus. Jangan mencoba reset atau pemulihan lain sebelum proses ini selesai.",
}) => {
  if (!maintenanceMode) return null;
  return (
    <Card className={styles.maintenanceRecoveryPanel}>
      <div className="panel__header">
        <div><h2>{title}</h2><p>{description}</p></div>
        <FiShield aria-hidden="true" />
      </div>
      <div className="notice notice--warning" role="status">
        <span>Sistem hanya akan membuka kembali perubahan data jika pemeriksaan konsistensi tidak menemukan masalah. Perubahan status dan hasil pemulihan tetap dicatat di audit.</span>
      </div>
      <Button type="button" variant="danger" icon={FiShield} loading={busy} disabled={busy} onClick={onRecover}>Periksa konsistensi & pulihkan</Button>
    </Card>
  );
};

export default MaintenanceRecoveryPanel;
