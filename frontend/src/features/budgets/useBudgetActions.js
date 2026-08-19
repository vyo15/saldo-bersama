import { useState } from "react";
import { assertPositiveRupiah } from "../../domain/money.js";
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
  ...overrides,
});

const budgetOwnershipUpdates = (value) => value === "shared"
  ? { scope: "shared", owner_user_id: "" }
  : { scope: "personal", owner_user_id: String(value).replace(/^user:/, "") };

export const budgetMatchesForm = (item, form) => item.category_id === form.category_id
  && item.scope === form.scope
  && String(item.owner_user_id || "") === String(form.owner_user_id || "");

const formFromBudget = (item, envelopeRuleId = item?.envelope_rule_id || "") => ({
  category_id: item?.category_id || "",
  envelope_rule_id: envelopeRuleId || "",
  amount: String(item?.amount || ""),
  warning_threshold: Number(item?.warning_threshold || 80),
  scope: item?.scope || "shared",
  owner_user_id: item?.owner_user_id || "",
});

export const useBudgetFormController = ({ items, period, notify, refresh }) => {
  const [form, setForm] = useState(emptyBudgetForm);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [saveState, setSaveState] = useState({ status: "idle", error: null });
  const existingBudget = items.find((item) => budgetMatchesForm(item, form)) || null;

  const resetSaveState = () => setSaveState({ status: "idle", error: null });
  const selectCategory = (categoryId) => {
    setMessage(null);
    resetSaveState();
    setForm((currentForm) => {
      const nextForm = { ...currentForm, category_id: categoryId };
      const current = items.find((item) => budgetMatchesForm(item, nextForm)) || null;
      if (!current) return { ...nextForm, amount: "", warning_threshold: 80 };
      return formFromBudget(current, nextForm.envelope_rule_id || current.envelope_rule_id || "");
    });
  };
  const selectOwnership = (value) => {
    setMessage(null);
    resetSaveState();
    setForm((currentForm) => {
      const nextForm = { ...currentForm, ...budgetOwnershipUpdates(value) };
      const current = items.find((item) => budgetMatchesForm(item, nextForm)) || null;
      if (!current) return { ...nextForm, amount: "", warning_threshold: 80 };
      return formFromBudget(current, nextForm.envelope_rule_id || current.envelope_rule_id || "");
    });
  };
  const openBudgetForm = (initial = {}) => {
    setForm(emptyBudgetForm(initial));
    setMessage(null);
    resetSaveState();
    setFormOpen(true);
  };
  const closeBudgetForm = () => {
    if (saveState.status === "submitting") return;
    setFormOpen(false);
    setForm(emptyBudgetForm());
    resetSaveState();
  };
  const editBudget = (item, overrides = {}) => {
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
      await upsertBudget({
        ...form,
        period_key: period,
        amount: assertPositiveRupiah(form.amount),
        envelope_rule_id: form.envelope_rule_id || null,
        owner_user_id: form.scope === "personal" ? form.owner_user_id : null,
        row_version: existingBudget?.row_version,
      }, { rowVersion: existingBudget?.row_version });
      setForm(emptyBudgetForm());
      setFormOpen(false);
      resetSaveState();
      notify({
        message: existingBudget ? "Batas pengeluaran berhasil diperbarui." : "Batas pengeluaran berhasil dibuat.",
        tone: "success",
        dedupeKey: existingBudget ? "budgets:update" : "budgets:create",
      });
      await refresh();
    } catch (error) {
      setSaveState({ status: "error", error });
    }
  };
  return { form, setForm, formOpen, setFormOpen, message, setMessage, saveState, existingBudget, selectCategory, selectOwnership, openBudgetForm, closeBudgetForm, editBudget, saveBudget };
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
      notify({ message: error.message || "Status batas pengeluaran gagal diperiksa.", tone: "danger", dedupeKey: "budgets:lifecycle-preview-error" });
    }
  };
  const applyBudgetLifecycle = async (reason) => {
    if (!archiveTarget) return;
    const { budget, preview } = archiveTarget;
    setArchiveState({ status: "submitting", error: null });
    try {
      if (preview.canDeleteUnused) {
        await requestDeleteUnusedBudget({ budget_id: budget.budget_id, row_version: budget.row_version, reason }, { rowVersion: budget.row_version });
        notify({ message: "Batas pengeluaran yang belum pernah digunakan berhasil dihapus permanen.", tone: "success", dedupeKey: "budgets:delete-unused" });
      } else {
        await requestArchiveBudget({ budget_id: budget.budget_id, row_version: budget.row_version, reason }, { rowVersion: budget.row_version });
        notify({ message: "Batas pengeluaran berhasil diarsipkan. Transaksi dan laporan historis tetap tersimpan.", tone: "success", dedupeKey: "budgets:archive" });
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
