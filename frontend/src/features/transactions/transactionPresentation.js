import {
  FiArrowDownLeft,
  FiArrowUpRight,
  FiCreditCard,
  FiEdit3,
  FiRepeat,
  FiRotateCcw,
} from "react-icons/fi";

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

export const transactionIcon = (type) => TRANSACTION_ICONS[type] || FiCreditCard;

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
