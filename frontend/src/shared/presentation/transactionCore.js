import { TRANSACTION_TYPES } from "../../domain/constants.js";

export const TRANSACTION_LABELS = Object.freeze({
  [TRANSACTION_TYPES.EXPENSE]: "Pengeluaran",
  [TRANSACTION_TYPES.INCOME]: "Pemasukan",
  [TRANSACTION_TYPES.TRANSFER]: "Transfer",
  [TRANSACTION_TYPES.REFUND]: "Pengembalian",
  [TRANSACTION_TYPES.ADJUSTMENT]: "Penyesuaian",
});

const cleanTransactionText = (value) => String(value || "").trim();

export const transactionDisplayTitle = (item = {}, category = null) => cleanTransactionText(item.description)
  || cleanTransactionText(category?.name)
  || cleanTransactionText(item.merchant)
  || TRANSACTION_LABELS[item.transaction_type]
  || "Transaksi";

export const transactionListMetadata = ({ item = {}, category = null, account = "", creator = "" } = {}) => {
  const title = transactionDisplayTitle(item, category);
  const seen = new Set([title]);
  return [item.merchant, account, category?.name, creator]
    .map(cleanTransactionText)
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
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
