import {
  FiBell, FiCalendar, FiChevronRight, FiDatabase, FiLock, FiMonitor, FiShield, FiTool,
} from "react-icons/fi";
import { Link } from "react-router";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { backendPresentation, roleLabel } from "./settingsPresentation.js";
import styles from "./Settings.module.css";

const SETTINGS_GROUPS = Object.freeze([
  {
    label: "Umum",
    items: [
      { to: "/pengaturan/notifikasi", label: "Notifikasi", description: "Pengingat & Web Push perangkat ini", icon: FiBell },
      { to: "/pengaturan/perangkat", label: "Perangkat & sesi", description: "Kelola perangkat yang masih login", icon: FiMonitor },
      { to: "/pengaturan/integrasi", label: "Integrasi Google", description: "Sheets, Calendar & Drive", icon: FiCalendar },
    ],
  },
  {
    label: "Data",
    items: [
      { to: "/pengaturan/data", label: "Data & cadangan", description: "Export, import, backup & pemulihan", icon: FiDatabase, ownerOnly: true },
      { to: "/pengaturan/pemeliharaan", label: "Pemeliharaan data", description: "Reset testing & reset seluruh data", icon: FiTool, ownerOnly: true, maintenanceAware: true },
    ],
  },
  {
    label: "Sistem",
    items: [
      { to: "/pengaturan/periode", label: "Periode & integritas", description: "Kontrol periode dan pemeriksaan data", icon: FiLock, ownerOnly: true },
      { to: "/pengaturan/audit", label: "Audit aktivitas", description: "Riwayat perubahan penting & keamanan", icon: FiShield, ownerOnly: true },
    ],
  },
]);

const accountInitial = (user) => String(user?.name || user?.email || "S").trim().charAt(0).toUpperCase() || "S";

const SettingsNavigationRow = ({ item, maintenanceMode }) => {
  const Icon = item.icon;
  const maintenanceLabel = item.maintenanceAware && maintenanceMode ? "Maintenance" : "";
  return (
    <Link className={styles.settingsListRow} to={item.to}>
      <span className={styles.settingsListIcon}><Icon aria-hidden="true" /></span>
      <span className={styles.settingsListCopy}>
        <strong>{item.label}</strong>
        <small>{item.description}</small>
      </span>
      <span className={styles.settingsListMeta}>
        {maintenanceLabel ? <span className={styles.settingsListAlert}>{maintenanceLabel}</span> : null}
        <FiChevronRight aria-hidden="true" />
      </span>
    </Link>
  );
};

const SettingsPage = () => {
  const { user } = useAuth();
  const { bootstrap } = useFinance();
  const healthResource = useApiResource("system.health");
  const backend = backendPresentation(healthResource);
  const ownerMode = user?.role === "owner";
  const timezone = bootstrap?.config?.timezone || healthResource.data?.timezone || "Asia/Jakarta";

  return (
    <section className={styles.settingsHome} aria-label="Ringkasan dan navigasi pengaturan">
      <RefreshWarning error={healthResource.refreshError} onRetry={healthResource.reload} />

      <section className={styles.settingsAccountCard} aria-label="Akun dan status sistem">
        <span className={styles.settingsAccountAvatar} aria-hidden="true">{accountInitial(user)}</span>
        <div className={styles.settingsAccountCopy}>
          <strong>{user?.email || "Akun aktif"}</strong>
          <span>{roleLabel(user?.role)} · {timezone}</span>
        </div>
        <span className={`status-badge status-badge--${backend.tone}`} role="status" aria-live="polite">{backend.label}</span>
        <p>{backend.summary}</p>
      </section>

      {SETTINGS_GROUPS.map((group) => {
        const visibleItems = group.items.filter((item) => !item.ownerOnly || ownerMode);
        if (!visibleItems.length) return null;
        return (
          <section className={styles.settingsGroup} key={group.label} aria-labelledby={`settings-group-${group.label.toLowerCase()}`}>
            <h2 id={`settings-group-${group.label.toLowerCase()}`}>{group.label}</h2>
            <div className={styles.settingsList}>
              {visibleItems.map((item) => (
                <SettingsNavigationRow key={item.to} item={item} maintenanceMode={Boolean(healthResource.data?.maintenanceMode)} />
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
};

export default SettingsPage;
