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
