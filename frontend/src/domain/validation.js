import { TRANSACTION_TYPES } from "./constants.js";
import { assertPositiveRupiah } from "./money.js";
import { neutralizeSpreadsheetFormula } from "./security.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isValidIsoDate = (value) => {
  const date = String(value || "");
  if (!ISO_DATE.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 2000 && year <= 2100
    && parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
};

export const validateTransactionInput = (input) => {
  const errors = {};
  const type = input.transaction_type;
  if (!Object.values(TRANSACTION_TYPES).includes(type)) errors.transaction_type = "Jenis transaksi tidak valid.";

  let amount;
  try {
    amount = assertPositiveRupiah(input.amount);
  } catch (error) {
    errors.amount = error.message;
  }

  if (!isValidIsoDate(input.transaction_date)) errors.transaction_date = "Tanggal transaksi tidak valid.";
  if (!input.source_account_id && [TRANSACTION_TYPES.EXPENSE, TRANSACTION_TYPES.TRANSFER, TRANSACTION_TYPES.ADJUSTMENT].includes(type)) errors.source_account_id = "Rekening sumber wajib dipilih.";
  if (!input.destination_account_id && [TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.TRANSFER, TRANSACTION_TYPES.REFUND].includes(type)) {
    errors.destination_account_id = "Rekening tujuan wajib dipilih.";
  }
  if (type === TRANSACTION_TYPES.TRANSFER && input.source_account_id === input.destination_account_id) {
    errors.destination_account_id = "Rekening sumber dan tujuan harus berbeda.";
  }
  if (![TRANSACTION_TYPES.TRANSFER, TRANSACTION_TYPES.ADJUSTMENT].includes(type) && !input.category_id) {
    errors.category_id = "Kategori transaksi wajib dipilih.";
  }
  if (type === TRANSACTION_TYPES.ADJUSTMENT && !String(input.description || "").trim()) {
    errors.description = "Alasan koreksi saldo wajib diisi.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      transaction_id: input.transaction_id || undefined,
      row_version: input.row_version,
      transaction_type: type,
      transaction_date: input.transaction_date,
      amount,
      source_account_id: input.source_account_id || "",
      destination_account_id: input.destination_account_id || "",
      category_id: input.category_id || "",
      envelope_period_id: input.envelope_period_id || "",
      payment_method: String(input.payment_method || "").slice(0, 50),
      description: neutralizeSpreadsheetFormula(input.description).slice(0, 250),
      merchant: neutralizeSpreadsheetFormula(input.merchant).slice(0, 120),
      overspend_reason: neutralizeSpreadsheetFormula(input.overspend_reason).slice(0, 180),
      confirm_duplicate: Boolean(input.confirm_duplicate),
    },
  };
};
