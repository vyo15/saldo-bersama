import { TRANSACTION_TYPES } from "../../domain/constants.js";

export const QUICK_RECORD_ACTIONS = Object.freeze([
  Object.freeze({ id: "expense", label: "Pengeluaran", description: "Belanja, kebutuhan, dan pengeluaran harian." }),
  Object.freeze({ id: "commitment", label: "Bayar kewajiban", description: "KPR, cicilan, pinjaman, atau Arisan." }),
  Object.freeze({ id: "income", label: "Pemasukan", description: "Gaji, pendapatan, atau uang masuk lainnya." }),
  Object.freeze({ id: "transfer", label: "Transfer", description: "Pindahkan uang antar rekening." }),
  Object.freeze({ id: "goal", label: "Setor ke target", description: "Pilih target lalu arahkan dana melalui Alokasi." }),
  Object.freeze({ id: "investment", label: "Investasi", description: "Catat pembelian atau posisi aset investasi." }),
]);

const TRANSACTION_ACTION_TYPES = Object.freeze({
  expense: TRANSACTION_TYPES.EXPENSE,
  income: TRANSACTION_TYPES.INCOME,
  transfer: TRANSACTION_TYPES.TRANSFER,
});

export const quickRecordTransactionOptions = (actionId) => {
  const initialType = TRANSACTION_ACTION_TYPES[actionId];
  return initialType ? { initialType } : null;
};

export const quickRecordNavigation = (actionId) => {
  if (actionId === "goal") return {
    to: "/target",
    state: { workflowSource: "quick-record", workflowAction: "goal-deposit" },
  };
  if (actionId === "investment") return {
    to: "/investasi",
    state: { workflowSource: "quick-record", workflowAction: "record-investment" },
  };
  return null;
};

const periodFromDate = (value) => {
  const match = String(value || "").match(/^(\d{4}-\d{2})-\d{2}$/);
  return match?.[1] || "";
};

export const commitmentPaymentNavigation = (commitment) => {
  const occurrenceId = String(commitment?.next_occurrence_id || "");
  if (!occurrenceId) return null;
  const period = periodFromDate(commitment?.next_due_date);
  return {
    to: "/perencanaan/jadwal",
    state: {
      workflowSource: "quick-record",
      workflowAction: "pay-recurring",
      occurrenceId,
      ...(period ? { period } : {}),
    },
  };
};
