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

export const emptyBudgetForm = (overrides = {}) => ({
  category_id: "",
  envelope_rule_id: "",
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

const formFromBudget = (item, envelopeRuleId = item?.envelope_rule_id || "") => ({
  category_id: item?.category_id || "",
  envelope_rule_id: envelopeRuleId || "",
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
      owner_user_id: form.scope === "personal" ? form.owner_user_id : null,
      row_version: existingBudget?.row_version,
    }, { rowVersion: existingBudget?.row_version });
  }
  return { completingSchedule, amount, recordingMode };
};

const budgetScheduleFromForm = (form, amount) => ({
  amount,
  category_id: form.category_id,
  frequency: form.schedule_frequency || "monthly",
  due_day: Number(form.schedule_due_day || 20),
  start_date: form.schedule_start_date || todayInJakarta(),
  payment_method: form.schedule_payment_method || "transfer",
});

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

export const useBudgetFormController = ({ items, period, notify, refresh, categories = [], scheduleAccountId = "" }) => {
  const [form, setForm] = useState(emptyBudgetForm);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [saveState, setSaveState] = useState({ status: "idle", error: null });
  const [pendingSchedule, setPendingSchedule] = useState(null);
  const existingBudget = findBudgetForForm(items, form);

  const resetSaveState = () => setSaveState({ status: "idle", error: null });
  const selectCategory = (categoryId) => {
    setMessage(null);
    resetSaveState();
    setForm((currentForm) => {
      const nextForm = { ...currentForm, category_id: categoryId };
      const current = findBudgetForForm(items, nextForm);
      if (!current) return { ...nextForm, amount: "", warning_threshold: 80 };
      return formFromBudget(current, nextForm.envelope_rule_id || current.envelope_rule_id || "");
    });
  };
  const selectOwnership = (value) => {
    setMessage(null);
    resetSaveState();
    setForm((currentForm) => {
      const nextForm = { ...currentForm, ...budgetOwnershipUpdates(value) };
      const current = findBudgetForForm(items, nextForm);
      if (!current) return { ...nextForm, amount: "", warning_threshold: 80 };
      return formFromBudget(current, nextForm.envelope_rule_id || current.envelope_rule_id || "");
    });
  };
  const openBudgetForm = (initial = {}) => {
    setPendingSchedule(null);
    setForm(emptyBudgetForm(initial));
    setMessage(null);
    resetSaveState();
    setFormOpen(true);
  };
  const closeBudgetForm = () => {
    if (saveState.status === "submitting") return;
    setFormOpen(false);
    setForm(emptyBudgetForm());
    setPendingSchedule(null);
    resetSaveState();
  };
  const editBudget = (item, overrides = {}) => {
    setPendingSchedule(null);
    setForm({ ...formFromBudget(item), ...overrides });
    setMessage(null);
    resetSaveState();
    setFormOpen(true);
  };
  const saveBudget = async (event) => {
    event.preventDefault();
    setSaveState({ status: "submitting", error: null });
    setMessage(null);
    try {
      const saveContext = await budgetSaveContext({ form, period, existingBudget, pendingSchedule });
      if (shouldCreateBudgetSchedule({ pendingSchedule, existingBudget, recordingMode: saveContext.recordingMode })) {
        const schedule = pendingSchedule || budgetScheduleFromForm(form, saveContext.amount);
        try {
          await createBudgetSchedule({ schedule, categories, scheduleAccountId });
          setPendingSchedule(null);
        } catch (scheduleError) {
          setPendingSchedule(schedule);
          setSaveState({ status: "error", error: new Error(`Kebutuhan sudah tersimpan, tetapi jadwal belum berhasil dibuat. ${scheduleError.message || "Coba simpan jadwal lagi."}`) });
          await refresh();
          return;
        }
      }
      setForm(emptyBudgetForm());
      setFormOpen(false);
      resetSaveState();
      notify({ ...budgetSaveFeedback({ ...saveContext, existingBudget }), tone: "success" });
      await refresh();
    } catch (error) {
      setSaveState({ status: "error", error });
    }
  };
  return { form, setForm, formOpen, setFormOpen, message, setMessage, saveState, pendingSchedule, existingBudget, selectCategory, selectOwnership, openBudgetForm, closeBudgetForm, editBudget, saveBudget };
};

export const useBudgetLifecycleController = ({ notify, refresh, setForm, setFormOpen }) => {
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
        await requestDeleteUnusedBudget({ budget_id: budget.budget_id, row_version: budget.row_version, reason }, { rowVersion: budget.row_version });
        notify({ message: "Kebutuhan yang belum pernah digunakan berhasil dihapus permanen.", tone: "success", dedupeKey: "budgets:delete-unused" });
      } else {
        await requestArchiveBudget({ budget_id: budget.budget_id, row_version: budget.row_version, reason }, { rowVersion: budget.row_version });
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
