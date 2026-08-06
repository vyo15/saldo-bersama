import {
  FiBarChart2,
  FiCheckCircle,
  FiCreditCard,
  FiDollarSign,
  FiHome,
  FiList,
  FiPieChart,
  FiRepeat,
  FiSettings,
  FiTag,
  FiTarget,
} from "react-icons/fi";

export const PRIMARY_NAVIGATION = Object.freeze([
  { to: "/", label: "Beranda", icon: FiHome, end: true },
  { to: "/transaksi", label: "Transaksi", icon: FiList },
  { to: "/anggaran", label: "Anggaran", description: "Tetapkan dan pantau batas pengeluaran per kategori.", icon: FiDollarSign },
  { to: "/alokasi", label: "Alokasi", description: "Atur kantong dan pembagian dana.", icon: FiPieChart },
  { to: "/tagihan", label: "Jadwal rutin", description: "Kelola tagihan, pengeluaran tetap, dan pemasukan rutin.", icon: FiRepeat },
  { to: "/target", label: "Target", description: "Pantau tabungan dan tujuan keuangan.", icon: FiTarget },
  { to: "/laporan", label: "Laporan", icon: FiBarChart2 },
  { to: "/rekening", label: "Rekening", description: "Kelola rekening bersama dan pribadi.", icon: FiCreditCard },
  { to: "/kategori", label: "Kategori", description: "Atur kategori transaksi yang digunakan.", icon: FiTag },
  { to: "/rekonsiliasi", label: "Rekonsiliasi", description: "Cocokkan saldo sistem dengan saldo aktual.", icon: FiCheckCircle },
  { to: "/pengaturan", label: "Pengaturan", description: "Atur aplikasi, integrasi, dan akses.", icon: FiSettings },
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
    description: "Anggaran, alokasi, jadwal rutin, dan target dalam satu tempat.",
    icon: FiPieChart,
    items: pickNavigation("/anggaran", "/alokasi", "/tagihan", "/target"),
  }),
  navigationByPath.get("/laporan"),
  freezeGroup({
    id: "financial-data",
    label: "Data keuangan",
    description: "Rekening dan referensi kategori transaksi.",
    icon: FiCreditCard,
    items: pickNavigation("/rekening", "/kategori"),
  }),
  navigationByPath.get("/rekonsiliasi"),
]);

export const MOBILE_PRIMARY_NAVIGATION = Object.freeze(pickNavigation("/", "/transaksi", "/laporan"));

export const MOBILE_SECONDARY_GROUPS = Object.freeze([
  freezeGroup({ id: "planning", label: "Perencanaan", items: pickNavigation("/anggaran", "/alokasi", "/tagihan", "/target") }),
  freezeGroup({ id: "financial-data", label: "Data keuangan", items: pickNavigation("/rekening", "/kategori") }),
  freezeGroup({ id: "balance-control", label: "Kontrol saldo", items: pickNavigation("/rekonsiliasi") }),
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
