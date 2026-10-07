import { FiArchive, FiChevronRight, FiDownload, FiDownloadCloud, FiUploadCloud } from "react-icons/fi";
import { Link } from "react-router";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import styles from "./Settings.module.css";

const DATA_ACTIONS = Object.freeze([
  {
    to: "/pengaturan/export",
    label: "Export data",
    description: "Salinan data untuk dibaca atau dianalisis.",
    meta: "Buka export",
    icon: FiDownload,
  },
  {
    to: "/pengaturan/import",
    label: "Import transaksi",
    description: "Tambahkan transaksi dari JSON atau CSV.",
    meta: "Buka import",
    icon: FiUploadCloud,
  },
  {
    to: "/pengaturan/backup",
    label: "Backup data",
    description: "Simpan backup terverifikasi ke Google Drive.",
    meta: "Buat backup",
    icon: FiDownloadCloud,
  },
  {
    to: "/pengaturan/pemulihan",
    label: "Pulihkan data",
    description: "Pulihkan arsip atau backup yang sudah diverifikasi.",
    meta: "Buka pemulihan",
    icon: FiArchive,
  },
]);

const DataStoragePage = () => (
  <OwnerSettingsGuard>
    <section className={`${styles.pageContent} ${styles.dataStorageHub}`} aria-labelledby="data-storage-title">
      <div className={styles.pageHeading}>
        <h2 id="data-storage-title">Data & cadangan</h2>
        <p>Pilih tindakan data yang dibutuhkan.</p>
      </div>
      <div className={styles.dataStorageGrid}>
        {DATA_ACTIONS.map(({ to, label, description, meta, icon: Icon }) => (
          <Link key={to} className={styles.dataStorageCard} to={to}>
            <span className={styles.dataStorageIcon}><Icon aria-hidden="true" /></span>
            <span className={styles.dataStorageCopy}>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <span className={styles.dataStorageMeta}>{meta}<FiChevronRight aria-hidden="true" /></span>
          </Link>
        ))}
      </div>
    </section>
  </OwnerSettingsGuard>
);

export default DataStoragePage;
