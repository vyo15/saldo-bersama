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

export const PRIMARY_NAVIGATION = [
  { to: "/", label: "Beranda", icon: FiHome, end: true },
  { to: "/transaksi", label: "Transaksi", icon: FiCreditCard },
  { to: "/alokasi", label: "Alokasi", icon: FiPieChart },
  { to: "/tagihan", label: "Tagihan", icon: FiCalendar },
  { to: "/target", label: "Target", icon: FiTarget },
  { to: "/laporan", label: "Laporan", icon: FiBarChart2 },
  { to: "/rekening", label: "Rekening", icon: FiTrendingUp },
  { to: "/pengaturan", label: "Pengaturan", icon: FiSettings },
];

export const MOBILE_NAVIGATION = PRIMARY_NAVIGATION.slice(0, 4);
