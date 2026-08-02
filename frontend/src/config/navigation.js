import {
  FiBarChart2,
  FiCalendar,
  FiCreditCard,
  FiHome,
  FiPieChart,
  FiSettings,
  FiTarget,
  FiTrendingUp,
} from "react-icons/fi";

export const PRIMARY_NAVIGATION = Object.freeze([
  { to: "/", label: "Beranda", icon: FiHome, end: true },
  { to: "/transaksi", label: "Transaksi", icon: FiCreditCard },
  { to: "/alokasi", label: "Alokasi", icon: FiPieChart },
  { to: "/tagihan", label: "Tagihan", icon: FiCalendar },
  { to: "/target", label: "Target", icon: FiTarget },
  { to: "/laporan", label: "Laporan", icon: FiBarChart2 },
  { to: "/rekening", label: "Rekening", icon: FiTrendingUp },
  { to: "/pengaturan", label: "Pengaturan", icon: FiSettings },
]);

export const MOBILE_PRIMARY_NAVIGATION = Object.freeze([
  PRIMARY_NAVIGATION[0],
  PRIMARY_NAVIGATION[1],
  PRIMARY_NAVIGATION[5],
]);

export const MOBILE_SECONDARY_NAVIGATION = Object.freeze([
  PRIMARY_NAVIGATION[2],
  PRIMARY_NAVIGATION[3],
  PRIMARY_NAVIGATION[4],
  PRIMARY_NAVIGATION[6],
  PRIMARY_NAVIGATION[7],
]);

const normalizePathname = (pathname) => {
  const normalized = `/${String(pathname || "").replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
};

export const matchesNavigationPath = (pathname, item) => {
  const current = normalizePathname(pathname);
  const target = normalizePathname(item?.to);
  return item?.end ? current === target : current === target || current.startsWith(`${target}/`);
};

export const isMobileSecondaryNavigationPath = (pathname) => (
  MOBILE_SECONDARY_NAVIGATION.some((item) => matchesNavigationPath(pathname, item))
);
