import { todayInJakarta } from "../../domain/dates.js";
import { assertPositiveRupiah } from "../../domain/money.js";

export const BUDGET_BATCH_LIMIT = 20;
let rowSequence = 0;

const nextRowId = () => `budget-batch-${Date.now()}-${rowSequence += 1}`;
const normalizedName = (value) => String(value || "").trim().toLocaleLowerCase("id-ID");

export const createBudgetBatchRow = (overrides = {}) => ({
  id: overrides.id || nextRowId(),
  name: "",
  category_id: "",
  amount: "",
  recording_mode: "flexible",
  schedule_frequency: "monthly",
  schedule_due_day: 20,
  schedule_start_date: todayInJakarta(),
  schedule_payment_method: "transfer",
  ...overrides,
});

export const createInitialBudgetBatchRows = () => [createBudgetBatchRow()];

const rowError = (message, rowId, field = "") => Object.assign(new Error(message), { rowId, field });

const validateSchedule = (row) => {
  if (row.recording_mode !== "recurring") return;
  const dueDay = Number(row.schedule_due_day);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw rowError("Tanggal jatuh tempo harus antara 1–31.", row.id, "schedule_due_day");
  }
  if (!row.schedule_start_date) throw rowError("Tanggal mulai jadwal belum diisi.", row.id, "schedule_start_date");
};

export const validateBudgetBatchRow = (row, index = 0) => {
  if (!String(row?.name || "").trim()) throw rowError(`Isi nama kebutuhan ${index + 1}.`, row?.id, "name");
  if (String(row.name).trim().length > 100) throw rowError("Nama kebutuhan maksimal 100 karakter.", row.id, "name");
  if (!row?.category_id) throw rowError(`Pilih kategori untuk kebutuhan ${index + 1}.`, row?.id, "category_id");
  try {
    assertPositiveRupiah(row.amount);
  } catch {
    throw rowError(`Nominal kebutuhan ${index + 1} harus lebih dari Rp0.`, row.id, "amount");
  }
  if (!["flexible", "fixed_once", "recurring"].includes(String(row.recording_mode || ""))) {
    throw rowError("Pola kebutuhan tidak valid.", row.id, "recording_mode");
  }
  validateSchedule(row);
  return true;
};

export const validateBudgetBatchRows = (rows) => {
  if (!Array.isArray(rows) || !rows.length) throw new Error("Tambahkan minimal satu kebutuhan.");
  if (rows.length > BUDGET_BATCH_LIMIT) throw new Error(`Maksimal ${BUDGET_BATCH_LIMIT} kebutuhan dapat disimpan sekaligus.`);
  const seenNames = new Set();
  rows.forEach((row, index) => {
    validateBudgetBatchRow(row, index);
    const key = normalizedName(row.name);
    if (seenNames.has(key)) throw rowError("Nama kebutuhan yang sama tidak dapat ditambahkan dua kali.", row.id, "name");
    seenNames.add(key);
  });
};

export const findBudgetBatchNeedMatch = (items, form, row) => {
  const sameOwnership = (item) => item.scope === form.scope
    && String(item.owner_user_id || "") === String(form.owner_user_id || "");
  const sameName = (item) => normalizedName(item.name) === normalizedName(row.name);
  const candidates = (items || []).filter((item) => sameName(item) && sameOwnership(item));
  return {
    linked: candidates.find((item) => String(item.envelope_rule_id || "") === String(form.envelope_rule_id || "")) || null,
    legacy: candidates.find((item) => item.category_id === row.category_id && !item.envelope_rule_id) || null,
  };
};

export const buildBudgetBatchPayload = ({ rows, form, period, items = [] }) => {
  validateBudgetBatchRows(rows);
  if (!form?.envelope_rule_id) throw new Error("Alokasi Dana belum dipilih.");
  return {
    period_key: period,
    envelope_rule_id: form.envelope_rule_id,
    envelope_period_id: form.envelope_period_id || null,
    scope: form.scope,
    owner_user_id: form.scope === "personal" ? form.owner_user_id : null,
    items: rows.map((row) => {
      const match = findBudgetBatchNeedMatch(items, form, row);
      if (match.linked) {
        throw rowError("Nama kebutuhan ini sudah dipakai pada Alokasi Dana tersebut.", row.id, "name");
      }
      const legacy = match.legacy;
      return {
        name: String(row.name).trim(),
        category_id: row.category_id,
        amount: assertPositiveRupiah(row.amount),
        warning_threshold: 80,
        row_version: legacy?.row_version ?? null,
        recording_mode: row.recording_mode,
        schedule_frequency: row.schedule_frequency,
        schedule_due_day: Number(row.schedule_due_day),
        schedule_start_date: row.schedule_start_date,
        schedule_payment_method: row.schedule_payment_method,
      };
    }),
  };
};

export const budgetBatchTotal = (rows) => (rows || []).reduce((total, row) => {
  const amount = Number(row?.amount || 0);
  return total + (Number.isFinite(amount) && amount > 0 ? amount : 0);
}, 0);

export const budgetBatchScheduleLabel = (row) => {
  if (row?.recording_mode === "fixed_once") return "Sekali bayar";
  if (row?.recording_mode !== "recurring") return "Fleksibel";
  const labels = {
    weekly: "Mingguan",
    biweekly: "Dua mingguan",
    monthly: "Bulanan",
    bimonthly: "Dua bulanan",
    quarterly: "Tiga bulanan",
    semiannual: "Semester",
    annual: "Tahunan",
  };
  const frequency = labels[row.schedule_frequency] || "Berulang";
  return `${frequency} · tgl ${Number(row.schedule_due_day || 0) || "—"}`;
};
