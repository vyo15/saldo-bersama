export const CATEGORY_TYPE_OPTIONS = Object.freeze([
  { value: "expense", label: "Uang keluar" },
  { value: "income", label: "Uang masuk" },
  { value: "refund", label: "Pengembalian dana" },
]);

export const CATEGORY_TYPE_LABELS = Object.freeze(Object.fromEntries(
  CATEGORY_TYPE_OPTIONS.map((item) => [item.value, item.label]),
));

export const EXPENSE_NATURE_OPTIONS = Object.freeze([
  { value: "fixed", label: "Kewajiban tetap", example: "KPR, sewa, internet" },
  { value: "variable", label: "Kebutuhan rutin", example: "Makan, listrik, transportasi" },
  { value: "unexpected", label: "Kebutuhan tidak terduga", example: "Perbaikan kendaraan" },
  { value: "discretionary", label: "Keinginan dan gaya hidup", example: "Hiburan atau nongkrong" },
  { value: "emergency", label: "Kondisi darurat", example: "Kebutuhan mendesak" },
  { value: "other", label: "Lainnya", example: "Pengeluaran khusus" },
]);

export const CATEGORY_NATURE_LABELS = Object.freeze({
  ...Object.fromEntries(EXPENSE_NATURE_OPTIONS.map((item) => [item.value, item.label])),
  savings: "Tabungan (kategori lama)",
});

export const categoryTypeLabel = (value) => CATEGORY_TYPE_LABELS[value] || value || "Tidak diketahui";

export const categoryNatureLabel = (nature, transactionType) => transactionType === "expense"
  ? CATEGORY_NATURE_LABELS[nature] || nature || "Belum diklasifikasikan"
  : "Tidak memakai sifat pengeluaran";

export const categoryNatureForType = (transactionType, currentNature = "variable") => {
  if (transactionType !== "expense") return "other";
  if (currentNature === "savings" || EXPENSE_NATURE_OPTIONS.some((item) => item.value === currentNature)) return currentNature;
  return "variable";
};

export const expenseNatureOptions = ({ includeLegacySavings = false } = {}) => includeLegacySavings
  ? [...EXPENSE_NATURE_OPTIONS, { value: "savings", label: "Tabungan (kategori lama, sebaiknya diganti)", legacy: true }]
  : EXPENSE_NATURE_OPTIONS;
