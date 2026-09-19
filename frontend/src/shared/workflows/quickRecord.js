import { TRANSACTION_TYPES } from "../../domain/constants.js";

export const QUICK_RECORD_ACTIONS = Object.freeze([
  Object.freeze({ id: "expense", label: "Pengeluaran", description: "Belanja, kebutuhan, dan pengeluaran harian." }),
  Object.freeze({ id: "commitment", label: "Bayar kewajiban", description: "KPR, cicilan, pinjaman, atau Arisan." }),
  Object.freeze({ id: "income", label: "Pemasukan", description: "Gaji, pendapatan, atau uang masuk lainnya." }),
  Object.freeze({ id: "transfer", label: "Transfer", description: "Pindahkan uang antar rekening." }),
  Object.freeze({ id: "goal", label: "Target", description: "Pilih target lalu arahkan dana melalui Alokasi." }),
  Object.freeze({ id: "investment", label: "Investasi", description: "Catat pembelian atau posisi aset investasi." }),
]);

const TRANSACTION_ACTIONS = Object.freeze({
  expense: Object.freeze({
    initialType: TRANSACTION_TYPES.EXPENSE,
    lockType: true,
    title: "Catat pengeluaran",
    description: "Catat uang yang baru saja keluar.",
    submitLabel: "Simpan pengeluaran",
  }),
  income: Object.freeze({
    initialType: TRANSACTION_TYPES.INCOME,
    lockType: true,
    title: "Catat pemasukan",
    description: "Catat uang yang baru saja masuk.",
    submitLabel: "Simpan pemasukan",
  }),
  transfer: Object.freeze({
    initialType: TRANSACTION_TYPES.TRANSFER,
    lockType: true,
    title: "Catat transfer",
    description: "Pindahkan dana antar rekening.",
    submitLabel: "Catat transfer",
  }),
});

export const quickRecordTransactionOptions = (actionId) => {
  const options = TRANSACTION_ACTIONS[actionId];
  return options ? { ...options } : null;
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

export const quickRecordGoalNavigation = (goal) => {
  const goalId = String(goal?.goal_id || "");
  if (!goalId) return quickRecordNavigation("goal");
  return {
    to: "/perencanaan/kantong",
    state: { workflowSource: "quick-record", workflowAction: "goal-plan", goalId, manualAmount: true },
  };
};

export const quickRecordInvestmentNavigation = (portfolio) => {
  const portfolioId = String(portfolio?.portfolio_id || "");
  return {
    to: "/investasi",
    state: {
      workflowSource: "quick-record",
      workflowAction: "record-investment",
      ...(portfolioId ? { portfolioId, initialDraft: { lots: "" } } : {}),
    },
  };
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
