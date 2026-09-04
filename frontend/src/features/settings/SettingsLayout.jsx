import {
  FiArchive, FiBell, FiCalendar, FiDatabase, FiDownload, FiDownloadCloud,
  FiLock, FiMonitor, FiRefreshCw, FiShield, FiTrash2, FiUploadCloud,
} from "react-icons/fi";
import { NavLink, Outlet } from "react-router";
import PageHeader from "../../components/common/PageHeader.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import styles from "./Settings.module.css";

const SETTINGS_NAVIGATION_GROUPS = Object.freeze([
  {
    label: "Umum",
    items: [
      { to: "/pengaturan", end: true, label: "Ringkasan", icon: FiDatabase },
      { to: "/pengaturan/notifikasi", label: "Notifikasi", icon: FiBell },
      { to: "/pengaturan/perangkat", label: "Perangkat & sesi", icon: FiMonitor },
      { to: "/pengaturan/integrasi", label: "Integrasi Google", icon: FiCalendar },
    ],
  },
  {
    label: "Data & Penyimpanan",
    items: [
      { to: "/pengaturan/export", label: "Export data", icon: FiDownload, ownerOnly: true },
      { to: "/pengaturan/import", label: "Import data", icon: FiUploadCloud, ownerOnly: true },
      { to: "/pengaturan/backup", label: "Backup data", icon: FiDownloadCloud, ownerOnly: true },
      { to: "/pengaturan/pemulihan", label: "Pulihkan data", icon: FiArchive, ownerOnly: true },
    ],
  },
  {
    label: "Reset & Pemeliharaan Data",
    items: [
      { to: "/pengaturan/reset-data", label: "Reset data testing", icon: FiRefreshCw, ownerOnly: true },
      { to: "/pengaturan/reset-semua", label: "Reset semua data", icon: FiTrash2, ownerOnly: true },
    ],
  },
  {
    label: "Kontrol Sistem",
    items: [
      { to: "/pengaturan/periode", label: "Periode dan integritas", icon: FiLock, ownerOnly: true },
      { to: "/pengaturan/audit", label: "Audit aktivitas", icon: FiShield, ownerOnly: true },
    ],
  },
]);

const SettingsLayout = () => {
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";

  return (
    <div className="page-stack settings-page">
      <PageHeader title="Pengaturan" help="Kelola notifikasi, integrasi, data, backup, pemulihan, dan administrasi aplikasi. Tindakan berisiko tetap meminta validasi dan konfirmasi tersendiri." />
      <nav className={styles.settingsNavigation} aria-label="Menu pengaturan">
        {SETTINGS_NAVIGATION_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (item.ownerOnly && !ownerMode) return false;
            return true;
          });

          if (visibleItems.length === 0) return null;

          return (
            <section key={group.label} className={styles.settingsNavigationGroup} aria-label={group.label}>
              <h2 className={styles.settingsNavigationGroupTitle}>{group.label}</h2>
              <div className={styles.settingsNavigationGroupItems}>
                {visibleItems.map(({ to, end, label, icon: Icon }) => (
                  <NavLink key={to} to={to} end={end} className={({ isActive }) => `${styles.settingsNavigationLink}${isActive ? ` ${styles.isActive}` : ""}`}>
                    <span className={styles.settingsNavigationIcon}><Icon aria-hidden="true" /></span>
                    <span className={styles.settingsNavigationCopy}><strong>{label}</strong></span>
                  </NavLink>
                ))}
              </div>
            </section>
          );
        })}
      </nav>
      <div className={styles.pageContent}><Outlet /></div>
    </div>
  );
};

export default SettingsLayout;
