import { FiDatabase, FiShield } from "react-icons/fi";
import Card from "../../components/common/Card.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { backendPresentation, roleLabel } from "./settingsPresentation.js";
import styles from "./Settings.module.css";

const SettingsPage = () => {
  const { user } = useAuth();
  const { bootstrap } = useFinance();
  const healthResource = useApiResource("system.health");
  const backend = backendPresentation(healthResource);

  return (
    <section className={styles.pageContent} aria-labelledby="settings-overview-title">
      <RefreshWarning error={healthResource.refreshError} onRetry={healthResource.reload} />
      <div className={styles.pageHeading}>
        <p className="eyebrow">Ringkasan sistem</p>
        <h2 id="settings-overview-title">Akses dan sumber data resmi</h2>
        <p>Turso tetap menjadi sumber data resmi. Pilih menu di atas untuk mengelola perangkat, integrasi, anggota, portabilitas, pemulihan, periode, atau audit.</p>
      </div>
      <div className="settings-grid">
        <Card className="settings-card">
          <FiShield aria-hidden="true" />
          <div><h2>Akses aplikasi</h2><p>{user?.email} · {roleLabel(user?.role)}</p></div>
          <span className="status-badge status-badge--active">Diizinkan</span>
        </Card>
        <Card className="settings-card">
          <FiDatabase aria-hidden="true" />
          <div><h2>Turso database</h2><p role="status" aria-live="polite">{backend.summary} · {bootstrap?.config?.timezone || healthResource.data?.timezone || "Asia/Jakarta"}</p></div>
          <span className={`status-badge status-badge--${backend.tone}`}>{backend.label}</span>
        </Card>
      </div>
      <div className="notice notice--info" role="status">
        <span>Menu administratif hanya terlihat bagi pemilik. Pembatasan utama tetap dilakukan backend pada setiap request.</span>
      </div>
    </section>
  );
};

export default SettingsPage;
