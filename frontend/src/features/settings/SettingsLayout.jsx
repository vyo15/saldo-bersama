import {
  FiArchive, FiBell, FiCalendar, FiDatabase, FiDownload, FiDownloadCloud,
  FiLock, FiShield, FiUploadCloud, FiUsers,
} from "react-icons/fi";
import { NavLink, Outlet } from "react-router";
import PageHeader from "../../components/common/PageHeader.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import styles from "./Settings.module.css";

const SETTINGS_NAVIGATION = Object.freeze([
  { to: "/pengaturan", end: true, label: "Ringkasan", description: "Akses dan kesiapan backend", icon: FiDatabase },
  { to: "/pengaturan/notifikasi", label: "Notifikasi", description: "Perangkat dan Web Push", icon: FiBell },
  { to: "/pengaturan/integrasi", label: "Integrasi Google", description: "Sheets dan Calendar", icon: FiCalendar },
  { to: "/pengaturan/anggota", label: "Akses anggota", description: "Pemilik dan pasangan", icon: FiUsers, ownerOnly: true },
  { to: "/pengaturan/export", label: "Export data", description: "Salinan Excel baca", icon: FiDownload, ownerOnly: true },
  { to: "/pengaturan/import", label: "Import transaksi", description: "Preview dan apply atomik", icon: FiUploadCloud, ownerOnly: true },
  { to: "/pengaturan/backup", label: "Backup teknis", description: "Snapshot terverifikasi", icon: FiDownloadCloud, ownerOnly: true },
  { to: "/pengaturan/pemulihan", label: "Pemulihan data", description: "Arsip dan full restore", icon: FiArchive, ownerOnly: true },
  { to: "/pengaturan/periode", label: "Periode dan integritas", description: "Tutup buku dan validasi", icon: FiLock, ownerOnly: true },
  { to: "/pengaturan/audit", label: "Audit aktivitas", description: "Log append-only", icon: FiShield, ownerOnly: true },
]);

const SettingsLayout = () => {
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  return (
    <div className="page-stack settings-page">
      <PageHeader title="Pengaturan" description="Setiap bagian hanya memuat data yang dibutuhkan. Tindakan berisiko tetap dilindungi backend, konfirmasi, audit, dan row version." />
      <nav className={styles.settingsNavigation} aria-label="Menu pengaturan">
        {SETTINGS_NAVIGATION.filter((item) => !item.ownerOnly || ownerMode).map(({ to, end, label, description, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `${styles.settingsNavigationLink}${isActive ? ` ${styles.isActive}` : ""}`}>
            <span className={styles.settingsNavigationIcon}><Icon aria-hidden="true" /></span>
            <span className={styles.settingsNavigationCopy}><strong>{label}</strong><small>{description}</small></span>
          </NavLink>
        ))}
      </nav>
      <div className={styles.pageContent}><Outlet /></div>
    </div>
  );
};

export default SettingsLayout;
