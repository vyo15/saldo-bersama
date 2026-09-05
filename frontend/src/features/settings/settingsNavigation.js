import {
  FiBell,
  FiCalendar,
  FiDatabase,
  FiLock,
  FiMonitor,
  FiSettings,
  FiShield,
  FiTool,
} from "react-icons/fi";

const DATA_STORAGE_ROUTES = Object.freeze([
  "/pengaturan/data",
  "/pengaturan/export",
  "/pengaturan/import",
  "/pengaturan/backup",
  "/pengaturan/pemulihan",
]);

export const MOBILE_SETTINGS_GROUPS = Object.freeze([
  {
    id: "umum",
    label: "Umum",
    items: [
      { to: "/pengaturan/notifikasi", label: "Notifikasi", description: "Pengingat & Web Push perangkat ini", icon: FiBell },
      { to: "/pengaturan/perangkat", label: "Perangkat & sesi", description: "Kelola perangkat yang masih login", icon: FiMonitor },
      { to: "/pengaturan/integrasi", label: "Integrasi Google", description: "Sheets, Calendar & Drive", icon: FiCalendar },
    ],
  },
  {
    id: "data",
    label: "Data",
    items: [
      { to: "/pengaturan/data", label: "Data & cadangan", description: "Export, import, backup & pemulihan", icon: FiDatabase, ownerOnly: true },
      { to: "/pengaturan/pemeliharaan", label: "Pemeliharaan data", description: "Reset testing & reset seluruh data", icon: FiTool, ownerOnly: true, maintenanceAware: true },
    ],
  },
  {
    id: "sistem",
    label: "Sistem",
    items: [
      { to: "/pengaturan/periode", label: "Periode & integritas", description: "Kontrol periode dan pemeriksaan data", icon: FiLock, ownerOnly: true },
      { to: "/pengaturan/audit", label: "Audit aktivitas", description: "Riwayat perubahan penting & keamanan", icon: FiShield, ownerOnly: true },
    ],
  },
]);

export const DESKTOP_SETTINGS_CATEGORIES = Object.freeze([
  {
    id: "umum",
    label: "Umum",
    description: "Preferensi harian",
    icon: FiSettings,
    items: [
      { to: "/pengaturan/notifikasi", label: "Notifikasi", description: "Push dan jenis pengingat", icon: FiBell },
    ],
  },
  {
    id: "data",
    label: "Data",
    description: "Cadangan & pemeliharaan",
    icon: FiDatabase,
    ownerOnly: true,
    items: [
      {
        to: "/pengaturan/data",
        label: "Data & cadangan",
        description: "Export, import, backup & restore",
        icon: FiDatabase,
        matchPaths: DATA_STORAGE_ROUTES,
      },
      { to: "/pengaturan/pemeliharaan", label: "Pemeliharaan data", description: "Reset testing & reset semua", icon: FiTool },
    ],
  },
  {
    id: "sistem",
    label: "Sistem",
    description: "Integritas & audit",
    icon: FiLock,
    ownerOnly: true,
    items: [
      { to: "/pengaturan/periode", label: "Periode & integritas", description: "Kontrol periode dan pemeriksaan", icon: FiLock },
      { to: "/pengaturan/audit", label: "Audit aktivitas", description: "Riwayat tindakan penting", icon: FiShield },
    ],
  },
  {
    id: "integrasi",
    label: "Integrasi",
    description: "Google & layanan",
    icon: FiCalendar,
    items: [
      { to: "/pengaturan/integrasi", label: "Integrasi Google", description: "Sheets, Calendar & Drive", icon: FiCalendar },
    ],
  },
  {
    id: "keamanan",
    label: "Sesi & keamanan",
    description: "Perangkat aktif",
    icon: FiMonitor,
    items: [
      { to: "/pengaturan/perangkat", label: "Perangkat & sesi", description: "Kelola sesi login aktif", icon: FiMonitor },
    ],
  },
]);

export const normalizeSettingsPath = (pathname) => {
  const value = String(pathname || "/pengaturan");
  return value.length > 1 ? value.replace(/\/+$/, "") : value;
};

export const settingsItemMatchesPath = (item, pathname) => {
  const normalizedPath = normalizeSettingsPath(pathname);
  const matches = item.matchPaths || [item.to];
  return matches.some((path) => normalizeSettingsPath(path) === normalizedPath);
};

export const desktopSettingsCategoriesForRole = (role) => DESKTOP_SETTINGS_CATEGORIES
  .filter((category) => !category.ownerOnly || role === "owner")
  .map((category) => ({
    ...category,
    items: category.items.filter((item) => !item.ownerOnly || role === "owner"),
  }))
  .filter((category) => category.items.length);

export const desktopSettingsCategoryForPath = (pathname, role) => {
  const categories = desktopSettingsCategoriesForRole(role);
  return categories.find((category) => category.items.some((item) => settingsItemMatchesPath(item, pathname))) || categories[0] || null;
};
