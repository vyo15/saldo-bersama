import { FiShield } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import styles from "./Settings.module.css";

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
