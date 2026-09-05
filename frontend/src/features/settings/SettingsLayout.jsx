import { FiArrowLeft } from "react-icons/fi";
import { Link, Outlet, useLocation } from "react-router";
import PageHeader from "../../components/common/PageHeader.jsx";
import PageInfoButton from "../../components/common/PageInfoButton.jsx";
import styles from "./Settings.module.css";

const SETTINGS_ROUTE_META = Object.freeze({
  "/pengaturan": {
    title: "Pengaturan",
    description: "Atur akun, integrasi, data, dan kontrol sistem dari satu tempat.",
    help: {
      title: "Tentang Pengaturan",
      content: "Halaman utama Pengaturan hanya menampilkan kelompok fungsi penting. Buka satu bagian untuk melihat detailnya agar layar tetap ringkas dan mudah dipindai.",
    },
  },
  "/pengaturan/notifikasi": {
    title: "Notifikasi",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Notifikasi",
      content: "Kelola Web Push untuk perangkat ini serta jenis pengingat yang ingin diterima. Pengaturan satu perangkat tidak otomatis menonaktifkan perangkat lain.",
    },
  },
  "/pengaturan/perangkat": {
    title: "Perangkat & sesi",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Perangkat & sesi",
      content: "Lihat sesi login yang masih aktif dan cabut perangkat yang tidak lagi digunakan. Mencabut sesi tidak menghapus transaksi, saldo, atau data keuangan.",
    },
  },
  "/pengaturan/integrasi": {
    title: "Integrasi Google",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Integrasi Google",
      content: "Periksa kesiapan Google Sheets, Calendar, dan Drive. Integrasi membantu sinkronisasi, pengingat, serta safety backup; data keuangan utama tetap berada di database aplikasi.",
    },
  },
  "/pengaturan/data": {
    title: "Data & cadangan",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Data & cadangan",
      content: "Export, import, backup, dan pemulihan dikelompokkan di satu hub agar navigasi lebih sederhana. Setiap workflow tetap memakai route, validasi, dan proteksi backend masing-masing.",
    },
  },
  "/pengaturan/export": {
    title: "Export data",
    backTo: "/pengaturan/data",
    backLabel: "Data & cadangan",
    help: {
      title: "Tentang Export data",
      content: "Export membuat salinan data untuk dibaca atau dianalisis. File export bukan mekanisme restore dan tidak menggantikan backup teknis.",
    },
  },
  "/pengaturan/import": {
    title: "Import transaksi",
    backTo: "/pengaturan/data",
    backLabel: "Data & cadangan",
    help: {
      title: "Tentang Import transaksi",
      content: "Import menambahkan transaksi dari JSON atau CSV setelah seluruh file lolos preview. Jika ada data invalid atau konflik, aplikasi tidak melakukan partial import.",
    },
  },
  "/pengaturan/backup": {
    title: "Backup data",
    backTo: "/pengaturan/data",
    backLabel: "Data & cadangan",
    help: {
      title: "Tentang Backup data",
      content: "Backup membuat salinan teknis terverifikasi di Google Drive untuk kebutuhan pemulihan. Gunakan export jika tujuan Anda hanya membaca atau menganalisis data.",
    },
  },
  "/pengaturan/pemulihan": {
    title: "Pemulihan data",
    backTo: "/pengaturan/data",
    backLabel: "Data & cadangan",
    help: {
      title: "Tentang Pemulihan data",
      content: "Pulihkan item arsip secara terbatas bila memungkinkan. Full restore mengganti dataset aktif dan hanya digunakan setelah preview backup terverifikasi.",
    },
  },
  "/pengaturan/pemeliharaan": {
    title: "Pemeliharaan data",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Pemeliharaan data",
      content: "Reset testing dan reset seluruh data berada dalam satu halaman bertab, tetapi preview, safety check, konfirmasi, recovery, dan API keduanya tetap terpisah sesuai tingkat risiko.",
    },
  },
  "/pengaturan/periode": {
    title: "Periode & integritas",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Periode & integritas",
      content: "Periksa integritas sebelum menutup periode. Periode tertutup mengunci perubahan sampai Administrator membukanya kembali secara eksplisit dan tercatat di audit.",
    },
  },
  "/pengaturan/audit": {
    title: "Audit aktivitas",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Audit aktivitas",
      content: "Audit menampilkan aktivitas penting, siapa yang melakukan, data yang terdampak, dan hasil operasi. Gunakan halaman ini untuk menelusuri perubahan serta status maintenance, bukan untuk mengedit data finansial.",
    },
  },
});

const normalizeSettingsPath = (pathname) => pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
const settingsMetaForPath = (pathname) => SETTINGS_ROUTE_META[normalizeSettingsPath(pathname)] || SETTINGS_ROUTE_META["/pengaturan"];

const SettingsDetailHeader = ({ meta }) => (
  <header className={styles.settingsDetailHeader}>
    <Link className={styles.settingsBackLink} to={meta.backTo || "/pengaturan"} aria-label={`Kembali ke ${meta.backLabel || "Pengaturan"}`}>
      <FiArrowLeft aria-hidden="true" />
      <span>{meta.backLabel || "Pengaturan"}</span>
    </Link>
    <div className={styles.settingsDetailTitleRow}>
      <h1>{meta.title}</h1>
      <PageInfoButton title={meta.help.title}>{meta.help.content}</PageInfoButton>
    </div>
  </header>
);

const SettingsLayout = () => {
  const location = useLocation();
  const normalizedPath = normalizeSettingsPath(location.pathname);
  const overview = normalizedPath === "/pengaturan";
  const meta = settingsMetaForPath(normalizedPath);

  return (
    <div className="page-stack settings-page">
      {overview ? (
        <PageHeader title={meta.title} description={meta.description} help={meta.help} />
      ) : (
        <SettingsDetailHeader meta={meta} />
      )}
      <div className={styles.settingsRouteContent}><Outlet /></div>
    </div>
  );
};

export default SettingsLayout;
