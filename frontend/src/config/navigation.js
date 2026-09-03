import {
  FiBarChart2,
  FiCheckCircle,
  FiCheckSquare,
  FiCreditCard,
  FiHome,
  FiList,
  FiLayers,
  FiPieChart,
  FiSettings,
  FiTag,
  FiTarget,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";

export const PRIMARY_NAVIGATION = Object.freeze([
  { to: "/", label: "Beranda", icon: FiHome, end: true },
  { to: "/transaksi", label: "Transaksi", icon: FiList },
  { to: "/perencanaan", label: "Perencanaan", description: "Kelola Alokasi Dana, kebutuhan, dan Jadwal Rutin dalam satu tempat.", icon: FiPieChart },
  { to: "/anggaran", label: "Anggaran", description: "Ringkasan seluruh Kebutuhan dari Alokasi Dana untuk periode yang dipilih.", icon: FiLayers },
  { to: "/target", label: "Target", description: "Kumpulkan dana ke rekening tujuan dan pantau progres sampai nominal target.", icon: FiTarget },
  { to: "/laporan", label: "Laporan", icon: FiBarChart2 },
  { to: "/rekening", label: "Rekening", description: "Kelola rekening bersama dan pribadi.", icon: FiCreditCard },
  { to: "/investasi", label: "Investasi", description: "Catat Cash RDN, saham yang dimiliki, harga manual, P/L, dan pencocokan catatan.", icon: FiTrendingUp },
  { to: "/kategori", label: "Kategori", description: "Atur kategori transaksi yang digunakan.", icon: FiTag },
  { to: "/anggota", label: "Anggota", description: "Kelola anggota yang dapat mengakses Saldo Bersama.", icon: FiUsers, ownerOnly: true },
  { to: "/persetujuan", label: "Persetujuan", description: "Tinjau pengajuan rekening, kategori, dan transfer.", icon: FiCheckSquare, ownerOnly: true },
  { to: "/rekonsiliasi", label: "Cocokkan saldo", description: "Periksa apakah saldo aplikasi sama dengan saldo aktual.", icon: FiCheckCircle },
  { to: "/pengaturan", label: "Pengaturan", description: "Atur aplikasi dan integrasi.", icon: FiSettings },
]);

const navigationByPath = new Map(PRIMARY_NAVIGATION.map((item) => [item.to, item]));
const pickNavigation = (...paths) => paths.map((path) => navigationByPath.get(path)).filter(Boolean);
const freezeGroup = (group) => Object.freeze({ ...group, items: Object.freeze(group.items) });

export const DESKTOP_NAVIGATION = Object.freeze([
  navigationByPath.get("/"),
  navigationByPath.get("/transaksi"),
  freezeGroup({
    id: "planning",
    label: "Perencanaan",
    description: "Alokasi Dana, Anggaran, Jadwal Rutin, dan target keuangan.",
    icon: FiPieChart,
    items: pickNavigation("/perencanaan", "/anggaran", "/target"),
  }),
  navigationByPath.get("/laporan"),
  freezeGroup({
    id: "financial-data",
    label: "Data keuangan",
    description: "Rekening dan referensi kategori transaksi.",
    icon: FiCreditCard,
    items: pickNavigation("/rekening", "/kategori"),
  }),
  navigationByPath.get("/investasi"),
  navigationByPath.get("/anggota"),
  navigationByPath.get("/persetujuan"),
  navigationByPath.get("/rekonsiliasi"),
]);

export const MOBILE_PRIMARY_NAVIGATION = Object.freeze(pickNavigation("/", "/transaksi", "/laporan"));

export const MOBILE_SECONDARY_GROUPS = Object.freeze([
  freezeGroup({ id: "planning", label: "Perencanaan", items: pickNavigation("/perencanaan", "/anggaran", "/target") }),
  freezeGroup({ id: "financial-data", label: "Data keuangan", items: pickNavigation("/rekening", "/kategori") }),
  freezeGroup({ id: "investment", label: "Investasi", items: pickNavigation("/investasi") }),
  freezeGroup({ id: "balance-control", label: "Kontrol saldo", items: pickNavigation("/rekonsiliasi") }),
  freezeGroup({ id: "people", label: "Akses", items: pickNavigation("/anggota", "/persetujuan") }),
  freezeGroup({ id: "application", label: "Aplikasi", items: pickNavigation("/pengaturan") }),
]);

export const MOBILE_SECONDARY_NAVIGATION = Object.freeze(MOBILE_SECONDARY_GROUPS.flatMap((group) => group.items));

const normalizePathname = (pathname) => {
  const normalized = `/${String(pathname || "").replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
};

export const matchesNavigationPath = (pathname, item) => {
  const current = normalizePathname(pathname);
  const target = normalizePathname(item?.to);
  return item?.end ? current === target : current === target || current.startsWith(`${target}/`);
};

export const isMobileSecondaryNavigationPath = (pathname) => MOBILE_SECONDARY_NAVIGATION.some((item) => matchesNavigationPath(pathname, item));
