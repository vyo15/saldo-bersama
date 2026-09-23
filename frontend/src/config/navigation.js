import {
  FiBarChart2,
  FiBell,
  FiCheckSquare,
  FiHome,
  FiList,
  FiPieChart,
  FiSettings,
  FiTag,
  FiTarget,
  FiUsers,
} from "react-icons/fi";
import { AccountIcon, InvestmentIcon } from "../components/common/FinanceChoiceIcons.jsx";

export const PRIMARY_NAVIGATION = Object.freeze([
  { to: "/", label: "Beranda", icon: FiHome, end: true },
  { to: "/transaksi", label: "Transaksi", icon: FiList },
  { to: "/perencanaan", label: "Atur Dana", description: "Kelola Alokasi Dana, Jadwal Rutin, dan Kewajiban dalam satu tempat.", icon: FiPieChart },
  { to: "/target", label: "Target", description: "Pantau tujuan, progres, sisa, dan kebutuhan dana sampai target tercapai.", icon: FiTarget },
  { to: "/laporan", label: "Laporan", icon: FiBarChart2 },
  { to: "/rekening", label: "Rekening", description: "Kelola seluruh rekening keluarga berdasarkan pemegang.", icon: AccountIcon },
  { to: "/investasi", label: "Investasi", description: "Pantau saham, reksa dana, nilai aset, dan aktivitas investasi yang dicatat manual.", icon: InvestmentIcon },
  { to: "/kategori", label: "Kategori", description: "Atur kategori transaksi yang digunakan.", icon: FiTag },
  { to: "/anggota", label: "Anggota", description: "Kelola anggota yang dapat mengakses Saldo Bersama.", icon: FiUsers, ownerOnly: true },
  { to: "/persetujuan", label: "Persetujuan", description: "Tinjau pengajuan rekening, kategori, dan transfer.", icon: FiCheckSquare, ownerOnly: true },
  { to: "/notifikasi", label: "Notifikasi", description: "Lihat pengingat dan kondisi keuangan aktif yang perlu ditinjau.", icon: FiBell },
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
    label: "Atur Dana",
    description: "Alokasi Dana, Jadwal Rutin, Kewajiban, dan target keuangan.",
    icon: FiPieChart,
    items: pickNavigation("/perencanaan", "/target"),
  }),
  navigationByPath.get("/laporan"),
  freezeGroup({
    id: "finance",
    label: "Keuangan",
    description: "Rekening, kategori, dan investasi.",
    icon: AccountIcon,
    items: pickNavigation("/rekening", "/kategori", "/investasi"),
  }),
  freezeGroup({
    id: "management",
    label: "Kelola",
    description: "Anggota dan persetujuan Administrator.",
    icon: FiUsers,
    ownerOnly: true,
    items: pickNavigation("/anggota", "/persetujuan"),
  }),
]);

export const MOBILE_PRIMARY_NAVIGATION = Object.freeze(pickNavigation("/", "/perencanaan", "/transaksi"));

export const MOBILE_SECONDARY_GROUPS = Object.freeze([
  freezeGroup({ id: "planning", label: "Rencana", items: pickNavigation("/target") }),
  freezeGroup({ id: "insight", label: "Insight", items: pickNavigation("/laporan") }),
  freezeGroup({ id: "financial-data", label: "Data keuangan", items: pickNavigation("/rekening", "/kategori") }),
  freezeGroup({ id: "investment", label: "Investasi", items: pickNavigation("/investasi") }),
  freezeGroup({ id: "people", label: "Akses", items: pickNavigation("/anggota", "/persetujuan") }),
  freezeGroup({ id: "application", label: "Aplikasi", items: pickNavigation("/notifikasi", "/pengaturan") }),
]);

export const MOBILE_SECONDARY_NAVIGATION = Object.freeze(MOBILE_SECONDARY_GROUPS.flatMap((group) => group.items));

export const normalizeNavigationPath = (pathname) => {
  const normalized = `/${String(pathname || "").replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? normalized : normalized.replace(/\/+$/, "");
};

export const matchesNavigationPath = (pathname, item) => {
  const current = normalizeNavigationPath(pathname);
  const target = normalizeNavigationPath(item?.to);
  return item?.end ? current === target : current === target || current.startsWith(`${target}/`);
};

export const isMobileSecondaryNavigationPath = (pathname) => MOBILE_SECONDARY_NAVIGATION.some((item) => matchesNavigationPath(pathname, item));

export const CONTEXTUAL_NAVIGATION_PARENTS = Object.freeze({
  "/notifikasi": Object.freeze({ to: "/", label: "Beranda", area: "home" }),
  "/rekonsiliasi": Object.freeze({ to: "/rekening", label: "Rekening", area: "more" }),
});

const MOBILE_CONTEXTUAL_SECONDARY_PATHS = Object.freeze(
  Object.keys(CONTEXTUAL_NAVIGATION_PARENTS).filter((path) => CONTEXTUAL_NAVIGATION_PARENTS[path].area === "more"),
);

export const contextualNavigationParent = (pathname) => {
  const current = normalizeNavigationPath(pathname);
  const match = Object.entries(CONTEXTUAL_NAVIGATION_PARENTS).find(([path]) => current === path || current.startsWith(`${path}/`));
  return match?.[1] || null;
};

export const isSafeInternalNavigationTarget = (value) => {
  const target = String(value || "").trim();
  const hasControlCharacters = [...target].some((character) => character.charCodeAt(0) < 32);
  if (!target.startsWith("/") || target.startsWith("//") || target.includes("\\") || hasControlCharacters) return false;
  return true;
};

export const safeInternalNavigationTarget = (value, fallback = "/") => (
  isSafeInternalNavigationTarget(value) ? String(value).trim() : fallback
);

export const navigationLabelForPath = (pathname, fallback = "Beranda") => {
  const normalized = normalizeNavigationPath(String(pathname || "").split(/[?#]/, 1)[0]);
  if (normalized === "/") return "Beranda";
  if (normalized === "/rekonsiliasi") return "Rekening";
  const primary = PRIMARY_NAVIGATION.find((item) => matchesNavigationPath(normalized, item));
  if (primary) return primary.label;
  if (normalized.startsWith("/pengaturan/")) return "Pengaturan";
  return fallback;
};

export const mobileNavigationArea = (pathname) => {
  const current = normalizeNavigationPath(pathname);
  if (current === "/" || current === "/notifikasi") return "home";
  if (current === "/perencanaan" || current.startsWith("/perencanaan/")) return "planning";
  if (current === "/transaksi" || current.startsWith("/transaksi/")) return "transactions";
  if (MOBILE_CONTEXTUAL_SECONDARY_PATHS.some((path) => current === path || current.startsWith(`${path}/`))) return "more";
  if (isMobileSecondaryNavigationPath(current)) return "more";
  return "";
};

export const mobilePrimaryScrollKey = (pathname) => {
  const current = normalizeNavigationPath(pathname);
  if (current === "/") return "/";
  if (current === "/perencanaan" || current.startsWith("/perencanaan/")) return "/perencanaan";
  if (current === "/transaksi" || current.startsWith("/transaksi/")) return "/transaksi";
  return "";
};
