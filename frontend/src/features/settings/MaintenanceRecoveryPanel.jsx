import { FiShield } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import styles from "./Settings.module.css";

const MaintenanceRecoveryPanel = ({
  maintenanceMode,
  busy = false,
  onRecover,
  title = "Mode pemulihan aktif",
  description = "Perubahan data diblokir sampai integrity check lulus. Jangan mencoba operasi destructive lain sebelum recovery selesai.",
}) => {
  if (!maintenanceMode) return null;
  return (
    <Card className={styles.maintenanceRecoveryPanel}>
      <div className="panel__header">
        <div><h2>{title}</h2><p>{description}</p></div>
        <FiShield aria-hidden="true" />
      </div>
      <div className="notice notice--warning" role="status">
        <span>Recovery hanya akan membuka maintenance jika integrity check tidak menemukan masalah. Perubahan maintenance dan audit recovery dilakukan atomik di backend.</span>
      </div>
      <Button type="button" variant="danger" icon={FiShield} loading={busy} disabled={busy} onClick={onRecover}>Periksa integritas & pulihkan</Button>
    </Card>
  );
};

export default MaintenanceRecoveryPanel;
