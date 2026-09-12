import { useState } from "react";
import { assertPositiveRupiah } from "../../domain/money.js";
import { todayInJakarta } from "../../domain/dates.js";
import { createPlanningPaymentSchedule } from "../../shared/workflows/planningSchedules.js";
import {
  previewBudgetLifecycle,
  removeBudget as requestRemoveBudget,
  upsertBudget,
} from "./budgets.api.js";
import { useBudgetBatchDraft } from "./useBudgetBatchDraft.js";

export const emptyBudgetForm = (overrides = {}) => ({
  budget_id: "",
  name: "",
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

const budgetMatchesOwnership = (item, form) => item.scope === form.scope
  && String(item.owner_user_id || "") === String(form.owner_user_id || "");

export const budgetMatchesForm = (item, form) => form.budget_id
  ? item.budget_id === form.budget_id
  : budgetMatchesOwnership(item, form)
    && String(item.envelope_rule_id || "") === String(form.envelope_rule_id || "")
    && String(item.name || "").trim().toLocaleLowerCase("id-ID") === String(form.name || "").trim().toLocaleLowerCase("id-ID");

const findBudgetForForm = (items, form) => form.budget_id
  ? items.find((item) => item.budget_id === form.budget_id) || null
  : null;

const valueOr = (value, fallback) => value || fallback;

const formFromBudget = (item, envelopeRuleId = valueOr(item?.envelope_rule_id, ""), envelopePeriodId = "") => {
  const source = item || {};
  return {
    budget_id: valueOr(source.budget_id, ""),
    name: valueOr(source.name, ""),
    category_id: valueOr(source.category_id, ""),
    envelope_rule_id: valueOr(envelopeRuleId, ""),
    envelope_period_id: valueOr(envelopePeriodId, ""),
    amount: String(valueOr(source.amount, "")),
    warning_threshold: Number(valueOr(source.warning_threshold, 80)),
    scope: valueOr(source.scope, "shared"),
    owner_user_id: valueOr(source.owner_user_id, ""),
    recording_mode: valueOr(source.recording_mode, "flexible"),
    schedule_frequency: "monthly",
    schedule_due_day: 20,
    schedule_start_date: todayInJakarta(),
    schedule_payment_method: "transfer",
  };
};

const budgetSaveContext = async ({ form, period, existingBudget, pendingSchedule }) => {
  const completingSchedule = Boolean(pendingSchedule);
  const amount = pendingSchedule?.amount ?? assertPositiveRupiah(form.amount);
  const recordingMode = pendingSchedule ? "recurring" : form.recording_mode;
  let savedBudget = existingBudget || (pendingSchedule?.budget_id ? { budget_id: pendingSchedule.budget_id } : null);
  if (!pendingSchedule) {
    savedBudget = await upsertBudget({
      budget_id: existingBudget?.budget_id || form.budget_id || null,
      name: String(form.name || "").trim(),
      category_id: form.category_id,
      recording_mode: recordingMode,
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
  return { completingSchedule, amount, recordingMode, savedBudget };
};

const budgetScheduleFromForm = (form, amount) => {
  const dueDay = Number(form.schedule_due_day);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new Error("Tanggal jatuh tempo harus antara 1–31.");
  return {
    name: String(form.name || "").trim(),
    amount,
    category_id: form.category_id,
    frequency: form.schedule_frequency || "monthly",
    due_day: dueDay,
    start_date: form.schedule_start_date || todayInJakarta(),
    payment_method: form.schedule_payment_method || "transfer",
  };
};

const shouldCreateBudgetSchedule = ({ pendingSchedule, existingBudget, recordingMode }) => Boolean(pendingSchedule || !existingBudget) && recordingMode === "recurring";

const createBudgetSchedule = async ({ schedule, categories, scheduleAccountId, budgetId }) => {
  if (!scheduleAccountId) throw new Error("Rekening sumber Alokasi Dana belum tersedia untuk membuat jadwal.");
  const category = categories.find((item) => item.category_id === schedule.category_id);
  await createPlanningPaymentSchedule({
    name: schedule.name || category?.name || "Pembayaran rutin",
    kind: "expense",
    expected_amount: schedule.amount,
    due_day: schedule.due_day,
    category_id: schedule.category_id,
    default_account_id: scheduleAccountId,
    payment_method: schedule.payment_method,
    frequency: schedule.frequency,
    start_date: schedule.start_date,
    auto_debit: false,
    budget_id: budgetId || null,
  }, {});
};

const budgetSaveFeedback = ({ completingSchedule, existingBudget, recordingMode }) => {
  if (completingSchedule || (!existingBudget && recordingMode === "recurring")) {
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
    setForm((currentForm) => ({ ...currentForm, category_id: categoryId }));
  };
  const selectOwnership = (value) => {
    setMessage(null);
    resetSaveState();
    setForm((currentForm) => ({ ...currentForm, ...budgetOwnershipUpdates(value) }));
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
        await createBudgetSchedule({ schedule, categories, scheduleAccountId, budgetId: saveContext.savedBudget?.budget_id || schedule.budget_id });
        state.setPendingSchedule(null);
      } catch (scheduleError) {
        state.setPendingSchedule({ ...schedule, budget_id: saveContext.savedBudget?.budget_id || schedule.budget_id || "" });
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
      const result = await requestRemoveBudget({ budget_id: budget.budget_id, envelope_period_id: envelopePeriodId || null, row_version: budget.row_version, reason }, { rowVersion: budget.row_version });
      const released = Number(result?.released_amount_this_action ?? result?.released_amount ?? preview.releasable_amount ?? 0);
      notify({
        message: result?.outcome === "deleted_unused"
          ? "Kebutuhan yang belum pernah digunakan berhasil dihapus."
          : `Kebutuhan dihapus dari daftar aktif. Histori tetap tersimpan${released > 0 ? ` dan Rp ${released.toLocaleString("id-ID")} kembali menjadi Dana Tersedia` : ""}.`,
        tone: "success",
        dedupeKey: "budgets:remove",
      });
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
