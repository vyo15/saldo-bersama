import {
  FiBarChart2,
  FiCreditCard,
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
  { to: "/alokasi", label: "Alokasi", description: "Atur kantong dan pembagian dana.", icon: FiPieChart },
  { to: "/tagihan", label: "Tagihan", description: "Kelola kewajiban dan jadwal rutin.", icon: FiRepeat },
  { to: "/target", label: "Target", description: "Pantau tabungan dan tujuan keuangan.", icon: FiTarget },
  { to: "/laporan", label: "Laporan", icon: FiBarChart2 },
  { to: "/rekening", label: "Rekening", description: "Kelola rekening bersama dan pribadi.", icon: FiCreditCard },
  { to: "/kategori", label: "Kategori", description: "Atur kategori transaksi yang digunakan.", icon: FiTag },
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
    description: "Alokasi, tagihan, dan target dalam satu tempat.",
    icon: FiPieChart,
    items: pickNavigation("/alokasi", "/tagihan", "/target"),
  }),
  navigationByPath.get("/laporan"),
  freezeGroup({
    id: "management",
    label: "Kelola",
    description: "Rekening dan referensi transaksi.",
    icon: FiCreditCard,
    items: pickNavigation("/rekening", "/kategori"),
  }),
]);

export const MOBILE_PRIMARY_NAVIGATION = Object.freeze(pickNavigation("/", "/transaksi", "/laporan"));

export const MOBILE_SECONDARY_GROUPS = Object.freeze([
  freezeGroup({ id: "planning", label: "Perencanaan", items: pickNavigation("/alokasi", "/tagihan", "/target") }),
  freezeGroup({ id: "management", label: "Kelola keuangan", items: pickNavigation("/rekening", "/kategori") }),
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
