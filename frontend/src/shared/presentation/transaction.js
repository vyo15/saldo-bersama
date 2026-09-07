import { createElement } from "react";
import { DEFAULT_CATEGORY_ICON_BY_TYPE as DOMAIN_DEFAULT_CATEGORY_ICON_BY_TYPE, TRANSACTION_TYPES } from "../../domain/constants.js";
import {
  FiActivity,
  FiBookOpen,
  FiBriefcase,
  FiEdit3,
  FiFileText,
  FiGift,
  FiHeart,
  FiHome,
  FiMap,
  FiMoreHorizontal,
  FiPlayCircle,
  FiMusic,
  FiRotateCcw,
  FiShoppingBag,
  FiTarget,
  FiTool,
  FiUsers,
  FiWifi,
  FiZap,
} from "react-icons/fi";
import {
  AccountIcon,
  BalanceIcon,
  EmergencyFundIcon,
  FoodIcon,
  MoneyInIcon,
  MoneyOutIcon,
  SavingsIcon,
  TransferIcon,
  TransportIcon,
} from "../../components/common/FinanceChoiceIcons.jsx";

export {
  TRANSACTION_LABELS,
  accountTransactionDirection,
  formatTransactionDate,
  transactionDisplayTitle,
  transactionListMetadata,
  transactionSign,
  transactionTone,
} from "./transactionCore.js";

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

export const CatIcon = (props) => iconSvg(props, [
  createElement("path", {
    key: "head",
    d: "M5 9 4 4l4 2.4A8 8 0 0 1 12 5c1.5 0 2.8.4 4 1.4L20 4l-1 5v4c0 4-3 7-7 7s-7-3-7-7V9Z",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  }),
  createElement("path", {
    key: "face",
    d: "M9 12h.01M15 12h.01M10 15c1.3 1 2.7 1 4 0",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  }),
]);

export const TRANSACTION_ICONS = Object.freeze({
  [TRANSACTION_TYPES.EXPENSE]: MoneyOutIcon,
  [TRANSACTION_TYPES.INCOME]: MoneyInIcon,
  [TRANSACTION_TYPES.TRANSFER]: TransferIcon,
  [TRANSACTION_TYPES.REFUND]: FiRotateCcw,
  [TRANSACTION_TYPES.ADJUSTMENT]: FiEdit3,
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
  { key: "emergency", label: "Dana darurat", group: "goal", terms: "darurat emergency perlindungan", icon: EmergencyFundIcon },
  { key: "money", label: "Uang", group: "finance", terms: "uang dana tunai cash", icon: BalanceIcon },
  { key: "account", label: "Rekening", group: "finance", terms: "rekening bank kartu saldo", icon: AccountIcon },
  { key: "salary", label: "Gaji", group: "finance", terms: "gaji pekerjaan kantor salary", icon: FiBriefcase },
  { key: "business", label: "Usaha", group: "finance", terms: "usaha bisnis sampingan profit", icon: FiBriefcase },
  { key: "refund", label: "Refund", group: "finance", terms: "refund pengembalian dana", icon: FiRotateCcw },
  { key: "shopping", label: "Belanja", group: "daily", terms: "belanja shopping kebutuhan", icon: FiShoppingBag },
  { key: "food", label: "Makanan", group: "daily", terms: "makan makanan minuman restoran kopi", icon: FoodIcon },
  { key: "transport", label: "Transportasi", group: "daily", terms: "transport kendaraan mobil motor bensin", icon: TransportIcon },
  { key: "home", label: "Rumah", group: "daily", terms: "rumah kontrakan properti", icon: FiHome },
  { key: "renovation", label: "Renovasi", group: "goal", terms: "renovasi bangunan perbaikan rumah", icon: FiTool },
  { key: "bill", label: "Tagihan", group: "daily", terms: "tagihan invoice pembayaran cicilan", icon: FiFileText },
  { key: "electricity", label: "Listrik", group: "daily", terms: "listrik token pln daya", icon: FiZap },
  { key: "internet", label: "Internet", group: "daily", terms: "internet wifi pulsa data", icon: FiWifi },
  { key: "education", label: "Pendidikan", group: "goal", terms: "pendidikan sekolah buku kuliah adik", icon: FiBookOpen },
  { key: "health", label: "Kesehatan", group: "daily", terms: "kesehatan obat dokter rumah sakit", icon: FiActivity },
  { key: "travel", label: "Perjalanan", group: "lifestyle", terms: "travel perjalanan wisata jalan jalan liburan", icon: FiMap },
  { key: "entertainment", label: "Hiburan", group: "lifestyle", terms: "hiburan game nonton rekreasi", icon: FiPlayCircle },
  { key: "music", label: "Musik", group: "lifestyle", terms: "musik konser langganan", icon: FiMusic },
  { key: "gift", label: "Hadiah", group: "lifestyle", terms: "hadiah kado pemberian", icon: FiGift },
  { key: "family", label: "Keluarga", group: "lifestyle", terms: "keluarga orang tua anak saudara", icon: FiUsers },
  { key: "partner", label: "Pasangan", group: "lifestyle", terms: "pasangan bersama cinta", icon: FiHeart },
  { key: "cat", label: "Kucing", group: "lifestyle", terms: "kucing cat hewan peliharaan pet", icon: CatIcon },
  { key: "other", label: "Lainnya", group: "lifestyle", terms: "lainnya umum other", icon: FiMoreHorizontal },
]);

const CATEGORY_ICON_BY_KEY = new Map(CATEGORY_ICON_OPTIONS.map((option) => [option.key, option]));

export const DEFAULT_CATEGORY_ICON_BY_TYPE = DOMAIN_DEFAULT_CATEGORY_ICON_BY_TYPE;

export const categoryIconOption = (key, transactionType = "expense") => CATEGORY_ICON_BY_KEY.get(String(key || "").trim())
  || CATEGORY_ICON_BY_KEY.get(DEFAULT_CATEGORY_ICON_BY_TYPE[transactionType])
  || CATEGORY_ICON_BY_KEY.get("other");

export const categoryIconKey = (key, transactionType = "expense") => categoryIconOption(key, transactionType).key;
export const categoryIcon = (key, transactionType = "expense") => categoryIconOption(key, transactionType).icon;

export const transactionIcon = (type) => TRANSACTION_ICONS[type] || FiActivity;

export const transactionCategoryIcon = (category, type) => {
  if (type === "transfer" || type === "adjustment") return transactionIcon(type);
  return categoryIcon(category?.icon, type);
};
