import { useCallback, useEffect, useRef, useState } from "react";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { todayInJakarta } from "../../domain/dates.js";
import { validateCostShareInput } from "../../domain/validation.js";
import {
  archiveRecurringRule,
  cancelRecurringOccurrence,
  createRecurringRule,
  deleteUnusedRecurringRule,
  payRecurringOccurrence,
  previewRecurringRuleLifecycle,
  restoreRecurringOccurrence,
  reverseRecurringPayment,
  updateRecurringRule,
} from "./recurring.api.js";

const recurringRefreshKeys = Object.freeze(["recurring.list", "reports.monthly", "app.initialState"]);
const recurringLedgerRefreshKeys = Object.freeze(["recurring.list", "transactions.list", "accounts.list", "envelopes.list", "budgets.list", "reports.monthly", "app.initialState"]);
const initialRuleForm = () => ({ name: "", kind: "expense", expected_amount: "", due_day: 20, category_id: "", default_account_id: "", payment_method: "transfer", frequency: "monthly", start_date: todayInJakarta() });
const initialPayment = () => ({ item: null, account_id: "", amount: "", transaction_date: todayInJakarta(), envelope_period_id: "", overspend_reason: "", cost_share_mode: "unspecified", cost_share_percentages: [] });
const refreshRecurring = async ({ invalidate, resource, refreshOverview, keys = recurringRefreshKeys }) => { invalidate(keys); await Promise.allSettled([resource.reload(), refreshOverview()]); };

export const useRecurringRuleActions = (shared) => {
  const createMutation = useGuardedMutation();
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState(initialRuleForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [editState, setEditState] = useState({ status: "idle", error: null });
  const [archiveRuleTarget, setArchiveRuleTarget] = useState(null);
  const openCreate = () => { setMessage(null); setCreateOpen(true); };
  const closeCreate = () => { if (!createMutation.busy) setCreateOpen(false); };
  const createRule = (event) => { event.preventDefault(); setMessage(null); return createMutation.run(async () => { await createRecurringRule({ ...form, auto_debit: false, expected_amount: assertPositiveRupiah(form.expected_amount) }, {}); setForm((current) => ({ ...current, name: "", expected_amount: "" })); setCreateOpen(false); shared.notify({ message: "Jadwal rutin berhasil dibuat." }); await refreshRecurring(shared); }).catch((error) => setMessage({ type: "danger", text: error.message })); };
  const openRuleEditor = (item) => { setEditRule({ recurring_rule_id: item.recurring_rule_id, row_version: item.rule_row_version, name: item.name, kind: item.kind, expected_amount: String(item.rule_expected_amount || ""), frequency: item.frequency, due_day: Number(item.rule_due_day || 1), category_id: item.category_id, default_account_id: item.default_account_id, payment_method: item.payment_method === "autodebit" ? "transfer" : (item.payment_method || "transfer"), start_date: item.start_date || todayInJakarta(), end_date: item.end_date || "", priority: item.priority || "normal", status: item.rule_status || "active" }); setEditState({ status: "idle", error: null }); };
  const saveRule = async (event) => { event.preventDefault(); if (!editRule) return; setEditState({ status: "submitting", error: null }); try { await updateRecurringRule({ ...editRule, auto_debit: false, expected_amount: assertPositiveRupiah(editRule.expected_amount) }, { rowVersion: editRule.row_version }); setEditRule(null); setEditState({ status: "idle", error: null }); shared.notify({ message: "Aturan rutin berhasil diperbarui." }); await refreshRecurring(shared); } catch (error) { setEditState({ status: "error", error }); } };
  const openArchive = async (item) => { setEditState({ status: "submitting", error: null }); try { const preview = await previewRecurringRuleLifecycle({ recurring_rule_id: item.recurring_rule_id, row_version: item.rule_row_version }, { force: true }); setArchiveRuleTarget({ item, preview }); setEditState({ status: "idle", error: null }); } catch (error) { setEditState({ status: "idle", error: null }); shared.notify({ message: error.message || "Status aturan rutin gagal diperiksa.", tone: "danger", dedupeKey: "recurring:lifecycle-preview-error" }); } };
  const applyRuleLifecycle = async (reason, confirmation) => { if (!archiveRuleTarget) return; const { item, preview } = archiveRuleTarget; setEditState({ status: "submitting", error: null }); try { if (preview.canDeleteUnused) { await deleteUnusedRecurringRule({ recurring_rule_id: item.recurring_rule_id, row_version: item.rule_row_version, reason, acknowledged: confirmation.acknowledged }, { rowVersion: item.rule_row_version }); shared.notify({ message: "Aturan rutin yang belum pernah digunakan berhasil dihapus permanen." }); } else { await archiveRecurringRule({ recurring_rule_id: item.recurring_rule_id, row_version: item.rule_row_version, reason }, { rowVersion: item.rule_row_version }); shared.notify({ message: "Aturan rutin berhasil diarsipkan. Transaksi historis tetap tersimpan." }); } setArchiveRuleTarget(null); setEditState({ status: "idle", error: null }); await refreshRecurring(shared); } catch (error) { setEditState({ status: "error", error }); } };
  return { createMutation, message, form, setForm, createOpen, openCreate, closeCreate, editRule, setEditRule, editState, archiveRuleTarget, setArchiveRuleTarget, createRule, openRuleEditor, saveRule, applyRuleLifecycle, openArchive };
};

export const useRecurringPaymentActions = (shared) => {
  const paymentMutation = useGuardedMutation();
  const [payment, setPayment] = useState(initialPayment);
  const [paymentState, setPaymentState] = useState({ status: "idle", error: null });
  const [reverseTarget, setReverseTarget] = useState(null);
  const [incomeSuccess, setIncomeSuccess] = useState(null);
  const [reverseState, setReverseState] = useState({ status: "idle", error: null });
  const openPayment = useCallback((item) => { const remaining = Math.max(0, Number(item.expected_amount || 0) - Number(item.actual_amount || 0)) || item.expected_amount || ""; setPayment({ item, account_id: item.default_account_id || "", amount: String(remaining), transaction_date: todayInJakarta(), envelope_period_id: "", overspend_reason: "", cost_share_mode: "unspecified", cost_share_percentages: [] }); setPaymentState({ status: "idle", error: null }); }, []);
  const completeOccurrence = (event) => {
    event.preventDefault();
    if (!payment.item) return;
    const splitValidation = validateCostShareInput(payment);
    if (!splitValidation.ok) {
      const message = Object.values(splitValidation.errors)[0] || "Pembagian beban biaya tidak valid.";
      setPaymentState({ status: "error", error: new Error(message), fieldErrors: splitValidation.errors });
      return;
    }
    setPaymentState({ status: "submitting", error: null, fieldErrors: {} });
    return paymentMutation.run(async () => {
      const received = payment.item.kind === "income";
      const actualAmount = assertPositiveRupiah(payment.amount);
      const incomeSourceAccountId = received ? payment.account_id : "";
      await payRecurringOccurrence({
        occurrence_id: payment.item.occurrence_id,
        row_version: payment.item.row_version,
        account_id: payment.account_id,
        amount: actualAmount,
        transaction_date: payment.transaction_date,
        envelope_period_id: payment.item.kind === "expense" ? payment.envelope_period_id : "",
        overspend_reason: payment.item.kind === "expense" ? payment.overspend_reason : "",
        cost_share_mode: payment.item.kind === "expense" ? splitValidation.value.mode : "unspecified",
        cost_share_percentages: payment.item.kind === "expense" ? splitValidation.value.percentages : [],
      }, { rowVersion: payment.item.row_version });
      const allocated = Boolean(payment.item.kind === "expense" && payment.envelope_period_id);
      setPayment(initialPayment());
      setPaymentState({ status: "idle", error: null, fieldErrors: {} });
      shared.notify({ message: allocated ? "Aktual berhasil dicatat ke ledger dan sisa alokasi diperbarui." : received ? "Penerimaan rutin berhasil dicatat." : "Pembayaran aktual berhasil dicatat ke ledger." });
      if (received) setIncomeSuccess({ sourceAccountId: incomeSourceAccountId, suggestedAmount: actualAmount });
      await refreshRecurring({ ...shared, keys: recurringLedgerRefreshKeys });
    }).catch((error) => setPaymentState({ status: "error", error, fieldErrors: {} }));
  };
  const reversePayment = async (reason) => { if (!reverseTarget) return; const transactionId = String(reverseTarget.transaction_ids || "").split(",").map((value) => value.trim()).filter(Boolean).at(-1); if (!transactionId) return; setReverseState({ status: "submitting", error: null }); try { await reverseRecurringPayment({ occurrence_id: reverseTarget.occurrence_id, transaction_id: transactionId, row_version: reverseTarget.row_version, reason }, { rowVersion: reverseTarget.row_version }); setReverseTarget(null); setReverseState({ status: "idle", error: null }); shared.notify({ message: "Pembayaran/penerimaan terakhir dibatalkan dan status jadwal dihitung ulang." }); await refreshRecurring({ ...shared, keys: recurringLedgerRefreshKeys }); } catch (error) { setReverseState({ status: "error", error }); } };
  const openReverse = (item) => { setReverseTarget(item); setReverseState({ status: "idle", error: null }); };
  return { paymentMutation, payment, setPayment, paymentState, incomeSuccess, setIncomeSuccess, reverseTarget, setReverseTarget, reverseState, openPayment, completeOccurrence, reversePayment, openReverse };
};

export const useRecurringOccurrenceRecovery = (shared) => {
  const skipMutation = useGuardedMutation();
  const restoreOccurrenceMutation = useGuardedMutation();
  const [skipTarget, setSkipTarget] = useState(null);
  const [skipError, setSkipError] = useState(null);
  const [restoreOccurrenceTarget, setRestoreOccurrenceTarget] = useState(null);
  const [restoreOccurrenceError, setRestoreOccurrenceError] = useState(null);
  const skipOccurrence = (reason) => { if (!skipTarget) return Promise.resolve(); setSkipError(null); return skipMutation.run(async () => { await cancelRecurringOccurrence({ occurrence_id: skipTarget.occurrence_id, row_version: skipTarget.row_version, reason }, { rowVersion: skipTarget.row_version }); setSkipTarget(null); shared.notify({ message: "Periode rutin dilewati. Ledger dan saldo tidak berubah.", tone: "info" }); await refreshRecurring({ ...shared, keys: ["recurring.list", "app.initialState"] }); }).catch(setSkipError); };
  const restoreSkippedOccurrence = (reason) => { if (!restoreOccurrenceTarget) return Promise.resolve(); setRestoreOccurrenceError(null); return restoreOccurrenceMutation.run(async () => { await restoreRecurringOccurrence({ occurrence_id: restoreOccurrenceTarget.occurrence_id, row_version: restoreOccurrenceTarget.row_version, reason }, { rowVersion: restoreOccurrenceTarget.row_version }); setRestoreOccurrenceTarget(null); shared.notify({ message: "Periode rutin berhasil dipulihkan.", tone: "info" }); await refreshRecurring({ ...shared, keys: ["recurring.list", "app.initialState"] }); }).catch(setRestoreOccurrenceError); };
  const openSkip = (item) => { setSkipTarget(item); setSkipError(null); };
  const openRestore = (item) => { setRestoreOccurrenceTarget(item); setRestoreOccurrenceError(null); };
  return { skipMutation, restoreOccurrenceMutation, skipTarget, setSkipTarget, skipError, restoreOccurrenceTarget, setRestoreOccurrenceTarget, restoreOccurrenceError, skipOccurrence, restoreSkippedOccurrence, openSkip, openRestore };
};

export const useRecurringAttention = ({ attention, consumeAttention, resource, setFilter, setKind, setExpandedId, openPayment }) => {
  const attentionHandled = useRef(false);
  const attentionOccurrenceId = String(attention?.attentionOccurrenceId || "");
  useEffect(() => {
    if (attentionHandled.current || !attentionOccurrenceId || resource.status !== "ready") return;
    attentionHandled.current = true;
    const item = (resource.data?.items || []).find((candidate) => candidate.occurrence_id === attentionOccurrenceId);
    if (item) {
      setFilter(attention?.attentionType === "recurring_due" ? "open" : "attention");
      setKind(item.kind === "income" ? "income" : "expense");
      setExpandedId(item.occurrence_id);
      if (attention?.attentionAction === "payment" && item.can_pay) openPayment(item);
    }
    consumeAttention();
  }, [attention?.attentionAction, attention?.attentionType, attentionOccurrenceId, consumeAttention, openPayment, resource.data?.items, resource.status, setExpandedId, setFilter, setKind]);
  return attentionOccurrenceId;
};
