import { TRANSACTION_TYPES } from "./constants.js";
import { assertPositiveRupiah } from "./money.js";
import { neutralizeSpreadsheetFormula } from "./security.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isValidIsoDate = (value) => {
  const date = String(value || "");
  if (!ISO_DATE.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
};

const sourceAccountRequired = (type) => [
  TRANSACTION_TYPES.EXPENSE,
  TRANSACTION_TYPES.TRANSFER,
  TRANSACTION_TYPES.ADJUSTMENT,
].includes(type);

const destinationAccountRequired = (type) => [
  TRANSACTION_TYPES.INCOME,
  TRANSACTION_TYPES.TRANSFER,
  TRANSACTION_TYPES.REFUND,
].includes(type);

const categoryRequired = (type) => ![
  TRANSACTION_TYPES.TRANSFER,
  TRANSACTION_TYPES.ADJUSTMENT,
].includes(type);

const validateAmount = (input, errors) => {
  try {
    return assertPositiveRupiah(input.amount);
  } catch (error) {
    errors.amount = error.message;
    return undefined;
  }
};

const validateTransactionReferences = (input, type, errors) => {
  if (sourceAccountRequired(type) && !input.source_account_id) errors.source_account_id = "Rekening sumber wajib dipilih.";
  if (destinationAccountRequired(type) && !input.destination_account_id) errors.destination_account_id = "Rekening tujuan wajib dipilih.";
  if (type === TRANSACTION_TYPES.TRANSFER && input.source_account_id === input.destination_account_id) {
    errors.destination_account_id = "Rekening sumber dan tujuan harus berbeda.";
  }
  if (categoryRequired(type) && !input.category_id) errors.category_id = "Kategori transaksi wajib dipilih.";
};

const validateTransactionDetails = (input, type, errors) => {
  if (!isValidIsoDate(input.transaction_date)) errors.transaction_date = "Tanggal transaksi tidak valid.";
  if (type === TRANSACTION_TYPES.ADJUSTMENT && !String(input.description || "").trim()) {
    errors.description = "Alasan koreksi saldo wajib diisi.";
  }
};

const normalizedTransactionValue = (input, type, amount) => ({
  transaction_id: input.transaction_id || undefined,
  row_version: input.row_version,
  transaction_type: type,
  transaction_date: input.transaction_date,
  amount,
  source_account_id: input.source_account_id || "",
  destination_account_id: input.destination_account_id || "",
  category_id: input.category_id || "",
  envelope_period_id: input.envelope_period_id || "",
  payment_method: String(input.payment_method || "").slice(0, 40),
  description: neutralizeSpreadsheetFormula(input.description).slice(0, 250),
  merchant: neutralizeSpreadsheetFormula(input.merchant).slice(0, 120),
  overspend_reason: neutralizeSpreadsheetFormula(input.overspend_reason).slice(0, 180),
  confirm_duplicate: Boolean(input.confirm_duplicate),
});

export const validateTransactionInput = (input) => {
  const errors = {};
  const type = input.transaction_type;
  if (!Object.values(TRANSACTION_TYPES).includes(type)) errors.transaction_type = "Jenis transaksi tidak valid.";
  const amount = validateAmount(input, errors);
  validateTransactionDetails(input, type, errors);
  validateTransactionReferences(input, type, errors);
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: normalizedTransactionValue(input, type, amount) };
};
