import { createElement } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowDownLeft,
  FiArrowUpRight,
  FiBookOpen,
  FiBriefcase,
  FiCoffee,
  FiCreditCard,
  FiDollarSign,
  FiEdit3,
  FiFileText,
  FiGift,
  FiHeart,
  FiHome,
  FiMap,
  FiMoreHorizontal,
  FiMusic,
  FiRepeat,
  FiRotateCcw,
  FiShoppingBag,
  FiSmile,
  FiTarget,
  FiTool,
  FiTrendingUp,
  FiTruck,
  FiUsers,
  FiWifi,
  FiZap,
} from "react-icons/fi";

const iconSvg = (props, children) => createElement("svg", {
  ...props,
  viewBox: "0 0 24 24",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
}, children);

export const WeddingRingIcon = (props) => iconSvg(props, [
  createElement("circle", {
    key: "band",
    cx: 12,
    cy: 14,
    r: 6,
    stroke: "currentColor",
    strokeWidth: 1.8,
  }),
  createElement("path", {
    key: "diamond",
    d: "m8.5 7 2-4h3l2 4-3.5 3-3.5-3Z",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  }),
]);

export const SavingsIcon = (props) => iconSvg(props, [
  createElement("path", {
    key: "body",
    d: "M5 10c1.5-3 4-4 7-4 4.5 0 7 2.5 7 6 0 2.5-1.4 4.2-3.7 5.1L15 20h-3l-.5-2H9l-.5 2h-3L5 17.2A6 6 0 0 1 3 13v-2h2Z",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  }),
  createElement("path", {
    key: "details",
    d: "M14 9h.01M18 10l2-1v4h-1",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  }),
]);

export const TRANSACTION_LABELS = Object.freeze({
  expense: "Pengeluaran",
  income: "Pemasukan",
  transfer: "Transfer",
  refund: "Pengembalian",
  adjustment: "Penyesuaian",
});

export const TRANSACTION_ICONS = Object.freeze({
  expense: FiArrowDownLeft,
  income: FiArrowUpRight,
  transfer: FiRepeat,
  refund: FiRotateCcw,
  adjustment: FiEdit3,
});

export const CATEGORY_ICON_GROUPS = Object.freeze([
  { id: "all", label: "Semua" },
  { id: "finance", label: "Keuangan" },
  { id: "daily", label: "Harian" },
  { id: "goal", label: "Tujuan" },
  { id: "lifestyle", label: "Gaya hidup" },
]);

export const CATEGORY_ICON_OPTIONS = Object.freeze([
  { key: "wedding_ring", label: "Cincin", group: "goal", terms: "nikah pernikahan wedding cincin", icon: WeddingRingIcon },
  { key: "savings", label: "Tabungan", group: "finance", terms: "tabungan celengan simpan saving", icon: SavingsIcon },
  { key: "target", label: "Target", group: "goal", terms: "target tujuan goal", icon: FiTarget },
  { key: "emergency", label: "Dana darurat", group: "goal", terms: "darurat emergency perlindungan", icon: FiAlertTriangle },
  { key: "money", label: "Uang", group: "finance", terms: "uang dana tunai cash", icon: FiDollarSign },
  { key: "account", label: "Rekening", group: "finance", terms: "rekening bank kartu saldo", icon: FiCreditCard },
  { key: "salary", label: "Gaji", group: "finance", terms: "gaji pekerjaan kantor salary", icon: FiBriefcase },
  { key: "business", label: "Usaha", group: "finance", terms: "usaha bisnis sampingan profit", icon: FiTrendingUp },
  { key: "refund", label: "Refund", group: "finance", terms: "refund pengembalian dana", icon: FiRotateCcw },
  { key: "shopping", label: "Belanja", group: "daily", terms: "belanja shopping kebutuhan", icon: FiShoppingBag },
  { key: "food", label: "Makanan", group: "daily", terms: "makan makanan minuman restoran kopi", icon: FiCoffee },
  { key: "transport", label: "Transportasi", group: "daily", terms: "transport kendaraan mobil motor bensin", icon: FiTruck },
  { key: "home", label: "Rumah", group: "daily", terms: "rumah kontrakan properti", icon: FiHome },
  { key: "renovation", label: "Renovasi", group: "goal", terms: "renovasi bangunan perbaikan rumah", icon: FiTool },
  { key: "bill", label: "Tagihan", group: "daily", terms: "tagihan invoice pembayaran cicilan", icon: FiFileText },
  { key: "electricity", label: "Listrik", group: "daily", terms: "listrik token pln daya", icon: FiZap },
  { key: "internet", label: "Internet", group: "daily", terms: "internet wifi pulsa data", icon: FiWifi },
  { key: "education", label: "Pendidikan", group: "goal", terms: "pendidikan sekolah buku kuliah adik", icon: FiBookOpen },
  { key: "health", label: "Kesehatan", group: "daily", terms: "kesehatan obat dokter rumah sakit", icon: FiActivity },
  { key: "travel", label: "Perjalanan", group: "lifestyle", terms: "travel perjalanan wisata jalan jalan liburan", icon: FiMap },
  { key: "entertainment", label: "Hiburan", group: "lifestyle", terms: "hiburan game nonton rekreasi", icon: FiSmile },
  { key: "music", label: "Musik", group: "lifestyle", terms: "musik konser langganan", icon: FiMusic },
  { key: "gift", label: "Hadiah", group: "lifestyle", terms: "hadiah kado pemberian", icon: FiGift },
  { key: "family", label: "Keluarga", group: "lifestyle", terms: "keluarga orang tua anak saudara", icon: FiUsers },
  { key: "partner", label: "Pasangan", group: "lifestyle", terms: "pasangan bersama cinta", icon: FiHeart },
  { key: "other", label: "Lainnya", group: "lifestyle", terms: "lainnya umum other", icon: FiMoreHorizontal },
]);

const CATEGORY_ICON_BY_KEY = new Map(CATEGORY_ICON_OPTIONS.map((option) => [option.key, option]));

export const DEFAULT_CATEGORY_ICON_BY_TYPE = Object.freeze({
  expense: "shopping",
  income: "salary",
  refund: "refund",
});

export const categoryIconOption = (key, transactionType = "expense") => CATEGORY_ICON_BY_KEY.get(String(key || "").trim())
  || CATEGORY_ICON_BY_KEY.get(DEFAULT_CATEGORY_ICON_BY_TYPE[transactionType])
  || CATEGORY_ICON_BY_KEY.get("other");

export const categoryIconKey = (key, transactionType = "expense") => categoryIconOption(key, transactionType).key;
export const categoryIcon = (key, transactionType = "expense") => categoryIconOption(key, transactionType).icon;

export const transactionIcon = (type) => TRANSACTION_ICONS[type] || FiCreditCard;

export const transactionCategoryIcon = (category, type) => {
  if (type === "transfer" || type === "adjustment") return transactionIcon(type);
  return categoryIcon(category?.icon, type);
};

export const formatTransactionDate = (value) => {
  if (!value) return "Tanggal tidak tersedia";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(parsed);
};

export const transactionTone = (type) => type === "expense"
  ? "negative"
  : ["income", "refund"].includes(type) ? "positive" : "default";

export const transactionSign = (type) => type === "expense"
  ? "−"
  : ["income", "refund"].includes(type) ? "+" : "";

export const accountTransactionDirection = (item = {}, selectedAccountId = "") => {
  if (item.status && item.status !== "active") return { prefix: "", tone: "neutral" };
  if (item.transaction_type !== "transfer") {
    return {
      prefix: transactionSign(item.transaction_type),
      tone: transactionTone(item.transaction_type),
    };
  }
  if (item.source_account_id === selectedAccountId) return { prefix: "−", tone: "negative" };
  if (item.destination_account_id === selectedAccountId) return { prefix: "+", tone: "positive" };
  return { prefix: "", tone: "neutral" };
};
