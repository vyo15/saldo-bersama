import { FiArrowLeft, FiChevronRight } from "react-icons/fi";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import PageHeader from "../../components/common/PageHeader.jsx";
import PageInfoButton from "../../components/common/PageInfoButton.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import {
  desktopSettingsCategoriesForRole,
  desktopSettingsCategoryForPath,
  normalizeSettingsPath,
  settingsItemMatchesPath,
} from "./settingsNavigation.js";
import styles from "./Settings.module.css";

const SETTINGS_ROUTE_META = Object.freeze({
  "/pengaturan": {
    title: "Pengaturan",
    description: "Atur akun, integrasi, data, dan kontrol sistem dari satu tempat.",
    summary: "Pilih kategori dan menu yang ingin dikelola. Desktop memakai navigasi bertingkat agar ruang lebar tetap rapi; mobile tetap ringkas.",
    help: {
      title: "Tentang Pengaturan",
      content: "Pada mobile, Pengaturan memakai grouped-list yang ringkas. Pada desktop, fungsi yang sama disusun sebagai kategori, submenu, dan panel detail agar tidak terasa seperti tampilan mobile yang dibentangkan.",
    },
  },
  "/pengaturan/notifikasi": {
    title: "Notifikasi",
    summary: "Kelola Web Push perangkat ini dan jenis pengingat yang ingin diterima.",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Notifikasi",
      content: "Kelola Web Push untuk perangkat ini serta jenis pengingat yang ingin diterima. Pengaturan satu perangkat tidak otomatis menonaktifkan perangkat lain.",
    },
  },
  "/pengaturan/perangkat": {
    title: "Perangkat & sesi",
    summary: "Pantau sesi login aktif dan cabut perangkat yang tidak lagi digunakan.",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Perangkat & sesi",
      content: "Lihat sesi login yang masih aktif dan cabut perangkat yang tidak lagi digunakan. Mencabut sesi tidak menghapus transaksi, saldo, atau data keuangan.",
    },
  },
  "/pengaturan/integrasi": {
    title: "Integrasi Google",
    summary: "Periksa kesiapan Google Sheets, Calendar, dan Drive dari satu panel.",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Integrasi Google",
      content: "Periksa kesiapan Google Sheets, Calendar, dan Drive. Integrasi membantu sinkronisasi, pengingat, serta safety backup; data keuangan utama tetap berada di database aplikasi.",
    },
  },
  "/pengaturan/data": {
    title: "Data & cadangan",
    summary: "Akses export, import, backup, dan pemulihan tanpa mencampur workflow masing-masing.",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Data & cadangan",
      content: "Export, import, backup, dan pemulihan dikelompokkan di satu hub agar navigasi lebih sederhana. Setiap workflow tetap memakai route, validasi, dan proteksi backend masing-masing.",
    },
  },
  "/pengaturan/export": {
    title: "Export data",
    summary: "Buat salinan data untuk dibaca atau dianalisis tanpa mengubah dataset aktif.",
    backTo: "/pengaturan/data",
    backLabel: "Data & cadangan",
    help: {
      title: "Tentang Export data",
      content: "Export membuat salinan data untuk dibaca atau dianalisis. File export bukan mekanisme restore dan tidak menggantikan backup teknis.",
    },
  },
  "/pengaturan/import": {
    title: "Import transaksi",
    summary: "Preview seluruh file terlebih dahulu sebelum transaksi ditambahkan.",
    backTo: "/pengaturan/data",
    backLabel: "Data & cadangan",
    help: {
      title: "Tentang Import transaksi",
      content: "Import menambahkan transaksi dari JSON atau CSV setelah seluruh file lolos preview. Jika ada data invalid atau konflik, aplikasi tidak melakukan partial import.",
    },
  },
  "/pengaturan/backup": {
    title: "Backup data",
    summary: "Buat safety backup teknis terverifikasi ke Google Drive.",
    backTo: "/pengaturan/data",
    backLabel: "Data & cadangan",
    help: {
      title: "Tentang Backup data",
      content: "Backup membuat salinan teknis terverifikasi di Google Drive untuk kebutuhan pemulihan. Gunakan export jika tujuan Anda hanya membaca atau menganalisis data.",
    },
  },
  "/pengaturan/pemulihan": {
    title: "Pemulihan data",
    summary: "Pulihkan arsip atau jalankan full restore melalui preview terverifikasi.",
    backTo: "/pengaturan/data",
    backLabel: "Data & cadangan",
    help: {
      title: "Tentang Pemulihan data",
      content: "Pulihkan item arsip secara terbatas bila memungkinkan. Full restore mengganti dataset aktif dan hanya digunakan setelah preview backup terverifikasi.",
    },
  },
  "/pengaturan/pemeliharaan": {
    title: "Pemeliharaan data",
    summary: "Reset testing dan reset seluruh data tetap terpisah sesuai tingkat risikonya.",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Pemeliharaan data",
      content: "Reset testing dan reset seluruh data berada dalam satu halaman bertab, tetapi preview, safety check, konfirmasi, recovery, dan API keduanya tetap terpisah sesuai tingkat risiko.",
    },
  },
  "/pengaturan/periode": {
    title: "Periode & integritas",
    summary: "Periksa integritas dan kelola lifecycle periode secara eksplisit.",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Periode & integritas",
      content: "Periksa integritas sebelum menutup periode. Periode tertutup mengunci perubahan sampai Administrator membukanya kembali secara eksplisit dan tercatat di audit.",
    },
  },
  "/pengaturan/audit": {
    title: "Audit aktivitas",
    summary: "Telusuri aktivitas penting, actor, entity, dan hasil operasi.",
    backTo: "/pengaturan",
    backLabel: "Pengaturan",
    help: {
      title: "Tentang Audit aktivitas",
      content: "Audit menampilkan aktivitas penting, siapa yang melakukan, data yang terdampak, dan hasil operasi. Gunakan halaman ini untuk menelusuri perubahan serta status maintenance, bukan untuk mengedit data finansial.",
    },
  },
});

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

const SettingsDesktopNavigation = ({ pathname, role }) => {
  const categories = desktopSettingsCategoriesForRole(role);
  const activeCategory = desktopSettingsCategoryForPath(pathname, role);
  if (!activeCategory) return null;

  return (
    <>
      <aside className={styles.settingsDesktopCategories} aria-label="Kategori pengaturan">
        <span className={styles.settingsDesktopPaneLabel}>Kategori</span>
        <nav className={styles.settingsDesktopNavList}>
          {categories.map((category) => {
            const Icon = category.icon;
            const active = category.items.some((item) => settingsItemMatchesPath(item, pathname));
            return (
              <Link key={category.id} className={`${styles.settingsDesktopCategory}${active ? ` ${styles.isActive}` : ""}`} to={category.items[0].to} aria-current={active ? "page" : undefined}>
                <span className={styles.settingsDesktopCategoryIcon}><Icon aria-hidden="true" /></span>
                <span className={styles.settingsDesktopCategoryCopy}>
                  <strong>{category.label}</strong>
                  <small>{category.description}</small>
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <aside className={styles.settingsDesktopSubmenu} aria-label={`Menu ${activeCategory.label}`}>
        <span className={styles.settingsDesktopPaneLabel}>Menu</span>
        <nav className={styles.settingsDesktopNavList}>
          {activeCategory.items.map((item) => {
            const Icon = item.icon;
            const active = settingsItemMatchesPath(item, pathname);
            return (
              <NavLink key={item.to} className={`${styles.settingsDesktopSubmenuItem}${active ? ` ${styles.isActive}` : ""}`} to={item.to} aria-current={active ? "page" : undefined}>
                <span className={styles.settingsDesktopSubmenuIcon}><Icon aria-hidden="true" /></span>
                <span className={styles.settingsDesktopSubmenuCopy}>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <FiChevronRight aria-hidden="true" />
              </NavLink>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

const SettingsDesktopHeader = ({ meta }) => (
  <header className={styles.settingsDesktopDetailHeader}>
    <div>
      <span className={styles.settingsDesktopEyebrow}>Pengaturan</span>
      <div className={styles.settingsDesktopTitleLine}>
        <h1>{meta.title}</h1>
        <PageInfoButton title={meta.help.title}>{meta.help.content}</PageInfoButton>
      </div>
      <p>{meta.summary || meta.description}</p>
    </div>
  </header>
);

const SettingsLayout = () => {
  const { user } = useAuth();
  const location = useLocation();
  const normalizedPath = normalizeSettingsPath(location.pathname);
  const overview = normalizedPath === "/pengaturan";
  const meta = settingsMetaForPath(normalizedPath);

  return (
    <div className={`page-stack settings-page ${styles.settingsPage}`}>
      <div className={styles.settingsMobileHeader}>
        {overview ? (
          <PageHeader title={meta.title} description={meta.description} help={meta.help} />
        ) : (
          <SettingsDetailHeader meta={meta} />
        )}
      </div>

      <section className={styles.settingsWorkspace} aria-label="Workspace pengaturan">
        <SettingsDesktopNavigation pathname={normalizedPath} role={user?.role} />
        <div className={styles.settingsDesktopContent}>
          <SettingsDesktopHeader meta={meta} />
          <div className={styles.settingsRouteContent}><Outlet /></div>
        </div>
      </section>
    </div>
  );
};

export default SettingsLayout;
