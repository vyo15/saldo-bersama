const TRANSACTION_FIELD_ERROR_CODES = Object.freeze({
  CATEGORY_REQUIRED: "category_id",
  INVALID_CATEGORY: "category_id",
  CATEGORY_TYPE_MISMATCH: "category_id",
  SAME_TRANSFER_ACCOUNT: "destination_account_id",
  TRANSACTION_BEFORE_INITIAL_BALANCE: "transaction_date",
  ADJUSTMENT_REASON_REQUIRED: "description",
  OVERSPEND_REASON_REQUIRED: "description",
  OVER_BUDGET_CONFIRMATION_REQUIRED: "description",
});

const FALLBACK_FIELD_MESSAGES = Object.freeze({
  category_id: "Pilih kategori transaksi yang sesuai.",
  destination_account_id: "Pilih rekening tujuan yang berbeda dari rekening sumber.",
  transaction_date: "Pilih tanggal transaksi yang dapat digunakan.",
  description: "Lengkapi catatan yang diperlukan untuk transaksi ini.",
});

export const transactionFieldErrorsFromApiError = (error) => {
  const field = TRANSACTION_FIELD_ERROR_CODES[String(error?.code || "")];
  if (!field) return {};
  const message = String(error?.message || "").trim() || FALLBACK_FIELD_MESSAGES[field];
  return { [field]: message };
};

export const transactionSubmitFeedback = (error) => {
  if (!error) return null;
  const code = String(error.code || "");
  if (code === "MUTATION_INTENT_LOCKED") {
    return {
      tone: "warning",
      title: "Transaksi sebelumnya belum terkonfirmasi",
      message: "Periksa transaksi terbaru. Jika belum tercatat, ulangi transaksi sebelumnya dengan data yang sama sebelum menyimpan transaksi baru.",
      reviewRecommended: true,
    };
  }
  if (["OUTCOME_UNKNOWN", "IDEMPOTENCY_IN_PROGRESS", "IDEMPOTENCY_OUTCOME_UNKNOWN"].includes(code)) {
    return {
      tone: "warning",
      title: "Hasil penyimpanan belum pasti",
      message: "Jangan ubah data. Coba lagi data yang sama untuk memastikan hasil tanpa membuat transaksi ganda.",
    };
  }
  if (code === "PERIOD_CLOSED") {
    return { tone: "warning", title: "Periode sudah ditutup", message: "Transaksi tidak dapat disimpan pada periode yang sudah ditutup." };
  }
  if (["INSUFFICIENT_BALANCE", "UNALLOCATED_FUNDS_INSUFFICIENT", "ENVELOPE_LIMIT"].includes(code)) {
    return { tone: "warning", title: "Dana belum mencukupi", message: String(error.message || "Dana yang tersedia belum cukup untuk transaksi ini.") };
  }
  if (["CONFLICT", "ROW_VERSION_CONFLICT", "STALE_WRITE"].includes(code)) {
    return { tone: "warning", title: "Data sudah berubah", message: "Muat ulang data terbaru sebelum mencoba menyimpan kembali." };
  }
  if (code === "OFFLINE") {
    return { tone: "warning", title: "Perangkat sedang offline", message: "Sambungkan kembali ke internet sebelum menyimpan transaksi." };
  }
  return {
    tone: "danger",
    title: "Transaksi belum dapat disimpan",
    message: String(error.message || "Terjadi kendala saat menyimpan transaksi. Coba lagi."),
  };
};
