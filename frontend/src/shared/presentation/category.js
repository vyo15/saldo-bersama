import { CATEGORY_NATURES, CATEGORY_TYPES } from "../../domain/constants.js";

export const CATEGORY_TYPE_OPTIONS = Object.freeze([
  { value: CATEGORY_TYPES.EXPENSE, label: "Uang keluar" },
  { value: CATEGORY_TYPES.INCOME, label: "Uang masuk" },
  { value: CATEGORY_TYPES.REFUND, label: "Pengembalian dana" },
]);

export const CATEGORY_TYPE_LABELS = Object.freeze(Object.fromEntries(
  CATEGORY_TYPE_OPTIONS.map((item) => [item.value, item.label]),
));

export const EXPENSE_NATURE_OPTIONS = Object.freeze([
  { value: CATEGORY_NATURES.FIXED, label: "Kewajiban tetap", example: "KPR, sewa, internet" },
  { value: CATEGORY_NATURES.VARIABLE, label: "Kebutuhan rutin", example: "Makan, listrik, transportasi" },
  { value: CATEGORY_NATURES.UNEXPECTED, label: "Tidak terduga", example: "Perbaikan kendaraan" },
  { value: CATEGORY_NATURES.DISCRETIONARY, label: "Gaya hidup", example: "Hiburan atau nongkrong" },
  { value: CATEGORY_NATURES.EMERGENCY, label: "Darurat", example: "Kebutuhan mendesak" },
  { value: CATEGORY_NATURES.OTHER, label: "Lainnya", example: "Pengeluaran khusus" },
]);

export const CATEGORY_NATURE_LABELS = Object.freeze({
  ...Object.fromEntries(EXPENSE_NATURE_OPTIONS.map((item) => [item.value, item.label])),
  [CATEGORY_NATURES.SAVINGS]: "Tabungan (kategori lama)",
});

export const categoryTypeLabel = (value) => CATEGORY_TYPE_LABELS[value] || value || "Tidak diketahui";

export const categoryNatureLabel = (nature, transactionType) => transactionType === "expense"
  ? CATEGORY_NATURE_LABELS[nature] || nature || "Belum diklasifikasikan"
  : "Tidak memakai sifat pengeluaran";

export const categoryNatureForType = (transactionType, currentNature = "variable") => {
  if (transactionType !== CATEGORY_TYPES.EXPENSE) return CATEGORY_NATURES.OTHER;
  if (currentNature === CATEGORY_NATURES.SAVINGS || EXPENSE_NATURE_OPTIONS.some((item) => item.value === currentNature)) return currentNature;
  return CATEGORY_NATURES.VARIABLE;
};

export const expenseNatureOptions = ({ includeLegacySavings = false } = {}) => includeLegacySavings
  ? [...EXPENSE_NATURE_OPTIONS, { value: CATEGORY_NATURES.SAVINGS, label: "Tabungan (kategori lama, sebaiknya diganti)", legacy: true }]
  : EXPENSE_NATURE_OPTIONS;
