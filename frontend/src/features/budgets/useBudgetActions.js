import { useState } from "react";
import { assertPositiveRupiah } from "../../domain/money.js";
import { todayInJakarta } from "../../domain/dates.js";
import { createPlanningPaymentSchedule } from "../../shared/workflows/planningSchedules.js";
import {
  archiveBudget as requestArchiveBudget,
  deleteUnusedBudget as requestDeleteUnusedBudget,
  previewBudgetLifecycle,
  upsertBudget,
} from "./budgets.api.js";
import { useBudgetBatchDraft } from "./useBudgetBatchDraft.js";

export const emptyBudgetForm = (overrides = {}) => ({
  category_id: "",
  envelope_rule_id: "",
  envelope_period_id: "",
  amount: "",
  warning_threshold: 80,
  scope: "shared",
  owner_user_id: "",
  recording_mode: "flexible",
  schedule_frequency: "monthly",
  schedule_due_day: 20,
  schedule_start_date: todayInJakarta(),
  schedule_payment_method: "transfer",
  ...overrides,
});

const budgetOwnershipUpdates = (value) => value === "shared"
  ? { scope: "shared", owner_user_id: "" }
  : { scope: "personal", owner_user_id: String(value).replace(/^user:/, "") };

const budgetMatchesOwnership = (item, form) => item.category_id === form.category_id
  && item.scope === form.scope
  && String(item.owner_user_id || "") === String(form.owner_user_id || "");

export const budgetMatchesForm = (item, form) => budgetMatchesOwnership(item, form)
  && String(item.envelope_rule_id || "") === String(form.envelope_rule_id || "");

const findBudgetForForm = (items, form) => items.find((item) => budgetMatchesForm(item, form))
  || (form.envelope_rule_id ? items.find((item) => budgetMatchesOwnership(item, form) && !item.envelope_rule_id) : null)
  || null;

const formFromBudget = (item, envelopeRuleId = item?.envelope_rule_id || "", envelopePeriodId = "") => ({
  category_id: item?.category_id || "",
  envelope_rule_id: envelopeRuleId || "",
  envelope_period_id: envelopePeriodId || "",
  amount: String(item?.amount || ""),
  warning_threshold: Number(item?.warning_threshold || 80),
  scope: item?.scope || "shared",
  owner_user_id: item?.owner_user_id || "",
  recording_mode: "flexible",
  schedule_frequency: "monthly",
  schedule_due_day: 20,
  schedule_start_date: todayInJakarta(),
  schedule_payment_method: "transfer",
});

const budgetSaveContext = async ({ form, period, existingBudget, pendingSchedule }) => {
  const completingSchedule = Boolean(pendingSchedule);
  const amount = pendingSchedule?.amount ?? assertPositiveRupiah(form.amount);
  const recordingMode = pendingSchedule ? "scheduled" : form.recording_mode;
  if (!pendingSchedule) {
    await upsertBudget({
      category_id: form.category_id,
      warning_threshold: form.warning_threshold,
      scope: form.scope,
      period_key: period,
      amount,
      envelope_rule_id: form.envelope_rule_id || null,
      envelope_period_id: form.envelope_period_id || null,
      owner_user_id: form.scope === "personal" ? form.owner_user_id : null,
      row_version: existingBudget?.row_version,
    }, { rowVersion: existingBudget?.row_version });
  }
  return { completingSchedule, amount, recordingMode };
};

const budgetScheduleFromForm = (form, amount) => {
  const dueDay = Number(form.schedule_due_day);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new Error("Tanggal jatuh tempo harus antara 1–31.");
  return {
    amount,
    category_id: form.category_id,
    frequency: form.schedule_frequency || "monthly",
    due_day: dueDay,
    start_date: form.schedule_start_date || todayInJakarta(),
    payment_method: form.schedule_payment_method || "transfer",
  };
};

const shouldCreateBudgetSchedule = ({ pendingSchedule, existingBudget, recordingMode }) => Boolean(pendingSchedule || !existingBudget) && recordingMode === "scheduled";

const createBudgetSchedule = async ({ schedule, categories, scheduleAccountId }) => {
  if (!scheduleAccountId) throw new Error("Rekening sumber Alokasi Dana belum tersedia untuk membuat jadwal.");
  const category = categories.find((item) => item.category_id === schedule.category_id);
  await createPlanningPaymentSchedule({
    name: category?.name || "Pembayaran rutin",
    kind: "expense",
    expected_amount: schedule.amount,
    due_day: schedule.due_day,
    category_id: schedule.category_id,
    default_account_id: scheduleAccountId,
    payment_method: schedule.payment_method,
    frequency: schedule.frequency,
    start_date: schedule.start_date,
    auto_debit: false,
  }, {});
};

const budgetSaveFeedback = ({ completingSchedule, existingBudget, recordingMode }) => {
  if (completingSchedule || (!existingBudget && recordingMode === "scheduled")) {
    return { message: "Kebutuhan dan jadwal pembayaran berhasil dibuat.", dedupeKey: "budgets:create-scheduled" };
  }
  if (existingBudget) return { message: "Kebutuhan berhasil diperbarui.", dedupeKey: "budgets:update" };
  return { message: "Kebutuhan berhasil dibuat.", dedupeKey: "budgets:create" };
};

const useBudgetFormState = ({ items }) => {
  const [form, setForm] = useState(emptyBudgetForm);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create-single");
  const [message, setMessage] = useState(null);
  const [saveState, setSaveState] = useState({ status: "idle", error: null });
  const [pendingSchedule, setPendingSchedule] = useState(null);
  const existingBudget = formMode === "edit-single" ? findBudgetForForm(items, form) : null;
  const resetSaveState = () => setSaveState({ status: "idle", error: null });
  const selectCategory = (categoryId) => {
    setMessage(null);
    resetSaveState();
    setForm((currentForm) => {
      const nextForm = { ...currentForm, category_id: categoryId };
      const current = findBudgetForForm(items, nextForm);
      return current ? formFromBudget(current, nextForm.envelope_rule_id || current.envelope_rule_id || "", nextForm.envelope_period_id || "") : { ...nextForm, amount: "", warning_threshold: 80 };
    });
  };
  const selectOwnership = (value) => {
    setMessage(null);
    resetSaveState();
    setForm((currentForm) => {
      const nextForm = { ...currentForm, ...budgetOwnershipUpdates(value) };
      const current = findBudgetForForm(items, nextForm);
      return current ? formFromBudget(current, nextForm.envelope_rule_id || current.envelope_rule_id || "", nextForm.envelope_period_id || "") : { ...nextForm, amount: "", warning_threshold: 80 };
    });
  };
  const open = (initial) => {
    setPendingSchedule(null);
    setForm(emptyBudgetForm(initial));
    setFormMode(initial.envelope_rule_id ? "create-batch" : "create-single");
    setMessage(null);
    resetSaveState();
    setFormOpen(true);
  };
  const close = () => {
    if (saveState.status === "submitting") return false;
    setFormOpen(false);
    setForm(emptyBudgetForm());
    setFormMode("create-single");
    setPendingSchedule(null);
    resetSaveState();
    return true;
  };
  const edit = (item, overrides) => {
    setPendingSchedule(null);
    setForm({ ...formFromBudget(item, overrides?.envelope_rule_id || item?.envelope_rule_id || "", overrides?.envelope_period_id || ""), ...overrides });
    setFormMode("edit-single");
    setMessage(null);
    resetSaveState();
    setFormOpen(true);
  };
  const finishSave = () => {
    setForm(emptyBudgetForm());
    setFormMode("create-single");
    setFormOpen(false);
    resetSaveState();
  };
  return {
    form, setForm, formOpen, setFormOpen, formMode, message, setMessage, saveState, setSaveState,
    pendingSchedule, setPendingSchedule, existingBudget, resetSaveState, selectCategory, selectOwnership,
    open, close, edit, finishSave,
  };
};

export const useBudgetFormController = ({ items, period, notify, refresh, categories = [], scheduleAccountId = "" }) => {
  const state = useBudgetFormState({ items });
  const batch = useBudgetBatchDraft({
    items, period, form: state.form, resetSaveState: state.resetSaveState, setSaveState: state.setSaveState,
  });
  const openBudgetForm = (initial = {}) => {
    state.open(initial);
    batch.reset(true);
  };
  const closeBudgetForm = () => {
    if (state.close()) batch.reset(false);
  };
  const editBudget = (item, overrides = {}) => {
    state.edit(item, overrides);
    batch.reset(false);
  };
  const saveBatch = async () => {
    const result = await batch.save();
    const count = Number(result?.count || batch.rows.length);
    state.finishSave();
    batch.reset(false);
    notify({ message: `${count} kebutuhan berhasil ditambahkan.`, tone: "success", dedupeKey: "budgets:create-batch" });
    await refresh();
  };
  const saveSingle = async () => {
    const saveContext = await budgetSaveContext({ form: state.form, period, existingBudget: state.existingBudget, pendingSchedule: state.pendingSchedule });
    if (shouldCreateBudgetSchedule({ pendingSchedule: state.pendingSchedule, existingBudget: state.existingBudget, recordingMode: saveContext.recordingMode })) {
      const schedule = state.pendingSchedule || budgetScheduleFromForm(state.form, saveContext.amount);
      try {
        await createBudgetSchedule({ schedule, categories, scheduleAccountId });
        state.setPendingSchedule(null);
      } catch (scheduleError) {
        state.setPendingSchedule(schedule);
        state.setSaveState({ status: "error", error: new Error(`Kebutuhan sudah tersimpan, tetapi jadwal belum berhasil dibuat. ${scheduleError.message || "Coba simpan jadwal lagi."}`) });
        await refresh();
        return false;
      }
    }
    state.finishSave();
    notify({ ...budgetSaveFeedback({ ...saveContext, existingBudget: state.existingBudget }), tone: "success" });
    await refresh();
    return true;
  };
  const saveBudget = async (event) => {
    event.preventDefault();
    state.setSaveState({ status: "submitting", error: null });
    state.setMessage(null);
    try {
      if (state.formMode === "create-batch") await saveBatch();
      else await saveSingle();
    } catch (error) {
      batch.focusError(error);
      state.setSaveState({ status: "error", error });
    }
  };
  return {
    form: state.form, setForm: state.setForm, formOpen: state.formOpen, setFormOpen: state.setFormOpen, formMode: state.formMode,
    message: state.message, setMessage: state.setMessage, saveState: state.saveState, pendingSchedule: state.pendingSchedule, existingBudget: state.existingBudget,
    batchRows: batch.rows, activeBatchRowId: batch.activeRowId, batchTotal: batch.total, batchLimit: batch.limit,
    updateBatchRow: batch.updateRow, addBatchRow: batch.addRow, removeBatchRow: batch.removeRow, selectBatchRow: batch.selectRow,
    selectCategory: state.selectCategory, selectOwnership: state.selectOwnership, openBudgetForm, closeBudgetForm, editBudget, saveBudget,
  };
};

export const useBudgetLifecycleController = ({ notify, refresh, setForm, setFormOpen, envelopePeriodId = "" }) => {
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });
  const openBudgetLifecycle = async (budget) => {
    setArchiveState({ status: "submitting", error: null });
    try {
      const preview = await previewBudgetLifecycle({ budget_id: budget.budget_id, row_version: budget.row_version }, { force: true });
      setArchiveTarget({ budget, preview });
      setArchiveState({ status: "idle", error: null });
    } catch (error) {
      setArchiveState({ status: "idle", error: null });
      notify({ message: error.message || "Status kebutuhan gagal diperiksa.", tone: "danger", dedupeKey: "budgets:lifecycle-preview-error" });
    }
  };
  const applyBudgetLifecycle = async (reason) => {
    if (!archiveTarget) return;
    const { budget, preview } = archiveTarget;
    setArchiveState({ status: "submitting", error: null });
    try {
      if (preview.canDeleteUnused) {
        await requestDeleteUnusedBudget({ budget_id: budget.budget_id, envelope_period_id: envelopePeriodId || null, row_version: budget.row_version, reason }, { rowVersion: budget.row_version });
        notify({ message: "Kebutuhan yang belum pernah digunakan berhasil dihapus permanen.", tone: "success", dedupeKey: "budgets:delete-unused" });
      } else {
        await requestArchiveBudget({ budget_id: budget.budget_id, envelope_period_id: envelopePeriodId || null, row_version: budget.row_version, reason }, { rowVersion: budget.row_version });
        notify({ message: "Kebutuhan berhasil diarsipkan. Transaksi dan laporan historis tetap tersimpan.", tone: "success", dedupeKey: "budgets:archive" });
      }
      setArchiveTarget(null);
      setArchiveState({ status: "idle", error: null });
      setForm((current) => budgetMatchesForm(budget, current) ? emptyBudgetForm() : current);
      setFormOpen(false);
      await refresh();
    } catch (error) {
      setArchiveState({ status: "error", error });
    }
  };
  return { archiveTarget, archiveState, setArchiveTarget, openBudgetLifecycle, applyBudgetLifecycle };
};
