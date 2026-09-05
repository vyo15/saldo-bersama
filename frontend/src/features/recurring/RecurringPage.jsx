import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { currentMonthInJakarta } from "../../domain/dates.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { filterByOwnership } from "../../domain/ownership.js";
import ManualReminderModal from "../reminders/ManualReminderModal.jsx";
import {
  useRecurringAttention,
  useRecurringOccurrenceRecovery,
  useRecurringPaymentActions,
  useRecurringRuleActions,
} from "./useRecurringActions.js";
import { scheduleMatchesFilter } from "./recurringPresentation.js";
import styles from "./RecurringPage.module.css";

const RecurringDialogLayer = lazy(() => import("./RecurringDialogLayer.jsx"));
const RecurringScheduleView = lazy(() => import("./RecurringScheduleView.jsx"));

const activeAccounts = (bootstrap, overview) => {
  const balanceLookup = new Map((overview?.accountBalances || []).map((item) => [item.account_id, item]));
  return bootstrap?.accounts?.filter((item) => item.status === "active")
    .map((item) => ({ ...item, ...(balanceLookup.get(item.account_id) || {}) })) || [];
};
const activeCategories = (bootstrap, kind) => bootstrap?.categories?.filter((item) => item.status === "active" && item.transaction_type === kind) || [];

const samePlanningOwnership = (left, right) => String(left?.scope || "") === String(right?.scope || "")
  && String(left?.owner_user_id || "") === String(right?.owner_user_id || "");

const linkedBudgetCandidatesForRecurring = (budgets, item) => (budgets || []).filter((budget) => budget.envelope_rule_id
  && budget.envelope_source_account_id
  && budget.category_id === item?.category_id
  && samePlanningOwnership(budget, item)
  && budget.envelope_source_account_id === item?.default_account_id);

const linkedBudgetForRecurring = (budgets, item) => {
  const candidates = linkedBudgetCandidatesForRecurring(budgets, item);
  return candidates.length === 1 ? candidates[0] : null;
};

const recurringBudgetSuggestions = (budgets) => {
  const grouped = new Map();
  for (const budget of budgets || []) {
    if (!budget.category_id || !budget.envelope_rule_id || !budget.envelope_source_account_id) continue;
    const values = grouped.get(budget.category_id) || [];
    values.push(budget);
    grouped.set(budget.category_id, values);
  }
  return Object.fromEntries([...grouped.entries()].flatMap(([categoryId, values]) => {
    if (values.length !== 1) return [];
    const item = values[0];
    return [[categoryId, { account_id: item.envelope_source_account_id, envelope_name: item.envelope_name }]];
  }));
};

const eligiblePaymentEnvelopes = (items, payment, account) => {
  if (payment.item?.kind !== "expense" || !account?.account_id) return [];
  const active = (items || []).filter((item) => item.status === "active"
    && payment.transaction_date >= item.period_start
    && payment.transaction_date <= item.period_end
    && item.source_account_id === account.account_id);
  return filterByOwnership(active.filter((item) => item.can_record_expense === true), account);
};

const recurringViewData = ({ resource, filter, bootstrap, overview, rules, payments, envelopeResource, budgetResource }) => {
  const allItems = resource.data?.items || [];
  const accounts = activeAccounts(bootstrap, overview);
  const paymentAccounts = filterByOwnership(accounts, payments.payment.item);
  const selectedPaymentAccount = paymentAccounts.find((item) => item.account_id === payments.payment.account_id) || null;
  return {
    allItems,
    filteredItems: allItems.filter((item) => scheduleMatchesFilter(item, filter)),
    accounts,
    categories: activeCategories(bootstrap, rules.form.kind),
    editCategories: activeCategories(bootstrap, rules.editRule?.kind),
    paymentAccounts,
    paymentEnvelopes: eligiblePaymentEnvelopes(envelopeResource.data?.items || [], payments.payment, selectedPaymentAccount),
    budgets: budgetResource.data?.items || [],
  };
};

const recurringRulePlanningData = ({ accounts, budgets, user }) => {
  const memberMode = user?.role === "member";
  const ruleAccounts = accounts.filter((item) => item.can_transact !== false);
  const ruleBudgets = budgets.filter((item) => item.can_manage !== false);
  return {
    memberMode,
    canManagePlanning: ruleAccounts.length > 0,
    ruleAccounts,
    budgetSuggestions: recurringBudgetSuggestions(ruleBudgets),
  };
};

const recurringDialogOpen = ({ rules, payments, recovery }) => Boolean(
  rules.createOpen
  || rules.editRule
  || rules.archiveRuleTarget
  || payments.payment.item
  || payments.reverseTarget
  || recovery.skipTarget
  || recovery.restoreOccurrenceTarget,
);

const recurringHeaderActions = ({ period, onPeriodChange, canManagePlanning, allItems, rules }) => (
  <div className={styles.headerActions}>
    <label className="field field--compact">
      <span>Periode</span>
      <input type="month" value={period} onChange={onPeriodChange} />
    </label>
    {canManagePlanning && allItems.length ? <Button variant="primary" icon={FiPlus} onClick={rules.openCreate}>Tambah jadwal</Button> : null}
  </div>
);

const useRecurringEnvelopeSuggestion = ({ payment, setPayment, envelopeResource, budgetResource, paymentEnvelopes, budgets }) => {
  const autoEnvelopeKey = useRef("");
  const linkedPaymentBudget = linkedBudgetForRecurring(budgets, payment.item);
  const suggestedPaymentEnvelope = linkedPaymentBudget?.envelope_rule_id
    ? paymentEnvelopes.find((item) => item.envelope_rule_id === linkedPaymentBudget.envelope_rule_id) || null
    : null;

  useEffect(() => {
    if (!payment.item || payment.item.kind !== "expense") {
      autoEnvelopeKey.current = "";
      return;
    }
    if (envelopeResource.status === "loading" || budgetResource.status === "loading") return;
    const key = `${payment.item.occurrence_id}|${payment.account_id}|${payment.transaction_date}`;
    if (autoEnvelopeKey.current === key) return;
    autoEnvelopeKey.current = key;
    if (payment.envelope_period_id || !suggestedPaymentEnvelope) return;
    setPayment((current) => current.item?.occurrence_id === payment.item.occurrence_id && !current.envelope_period_id
      ? { ...current, envelope_period_id: suggestedPaymentEnvelope.envelope_period_id, overspend_reason: "" }
      : current);
  }, [budgetResource.status, envelopeResource.status, payment, setPayment, suggestedPaymentEnvelope]);
};

const RecurringPage = ({ embedded = false }) => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const location = useLocation();
  const navigate = useNavigate();
  const workflowHandled = useRef("");
  const [period, setPeriod] = useState(currentMonthInJakarta());
  const [filter, setFilter] = useState("all");
  const [kind, setKind] = useState("expense");
  const [expandedId, setExpandedId] = useState(null);
  const [reminderTarget, setReminderTarget] = useState(null);
  const resource = useApiResource("recurring.list", { period });
  const { bootstrap, overview, refreshOverview, invalidate } = useFinance();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const shared = { resource, refreshOverview, invalidate, notify };
  const rules = useRecurringRuleActions(shared);
  const payments = useRecurringPaymentActions(shared);
  const { openPayment, payment, setPayment } = payments;
  const recovery = useRecurringOccurrenceRecovery(shared);
  const envelopeResource = useApiResource("envelopes.list", { period }, { enabled: payments.payment.item?.kind === "expense" });
  const budgetResource = useApiResource("budgets.list", { period });
  const view = recurringViewData({ resource, filter, bootstrap, overview, rules, payments, envelopeResource, budgetResource });
  const attentionOccurrenceId = useRecurringAttention({ attention, consumeAttention, resource, setFilter, setKind, setExpandedId, openPayment });
  useRecurringEnvelopeSuggestion({
    payment,
    setPayment,
    envelopeResource,
    budgetResource,
    paymentEnvelopes: view.paymentEnvelopes,
    budgets: view.budgets,
  });

  useEffect(() => {
    const workflow = location.state;
    if (resource.status !== "ready" || !workflow?.workflowAction) return;
    const workflowKey = `${location.key}|${workflow.workflowAction}`;
    if (workflowHandled.current === workflowKey) return;
    workflowHandled.current = workflowKey;

    if (workflow.workflowAction === "create-recurring") {
      const categoryId = String(workflow.categoryId || "");
      const accountId = String(workflow.defaultAccountId || "");
      const categoryValid = activeCategories(bootstrap, "expense").some((item) => item.category_id === categoryId);
      const accountValid = activeAccounts(bootstrap, overview).some((item) => item.account_id === accountId && item.can_transact !== false);
      rules.setForm((current) => ({
        ...current,
        name: String(workflow.name || current.name || "").slice(0, 100),
        kind: "expense",
        expected_amount: workflow.expectedAmount ? String(workflow.expectedAmount) : current.expected_amount,
        category_id: categoryValid ? categoryId : "",
        default_account_id: accountValid ? accountId : "",
      }));
      setKind("expense");
      rules.openCreate();
    } else if (["pay-recurring", "view-recurring"].includes(workflow.workflowAction)) {
      const occurrenceId = String(workflow.occurrenceId || "");
      const item = (resource.data?.items || []).find((entry) => entry.occurrence_id === occurrenceId) || null;
      if (item) {
        setKind(item.kind === "income" ? "income" : "expense");
        setFilter(workflow.workflowAction === "pay-recurring" ? "open" : "all");
        setExpandedId(item.occurrence_id);
        if (workflow.workflowAction === "pay-recurring" && item.can_pay !== false) openPayment(item);
      } else if (occurrenceId) {
        notify({ message: "Jadwal yang dipilih tidak tersedia pada periode ini.", tone: "warning", dedupeKey: "recurring:workflow-not-found" });
      }
    }

    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [bootstrap, location.hash, location.key, location.pathname, location.search, location.state, navigate, notify, openPayment, overview, resource.data?.items, resource.status, rules]);

  if (resource.status === "loading") return <LoadingScreen label="Memuat jadwal rutin..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  const { allItems, filteredItems, accounts, categories, editCategories, paymentAccounts, paymentEnvelopes, budgets } = view;
  const members = bootstrap?.members?.filter((item) => item.status === "active") || [];
  const { memberMode, canManagePlanning, ruleAccounts, budgetSuggestions } = recurringRulePlanningData({ accounts, budgets, user });
  const openReminder = (item) => setReminderTarget({ entityType: "recurring_occurrence", entityId: item.occurrence_id, name: item.name, suggestedDate: item.due_date });
  const actions = { openPayment: payments.openPayment, openReverse: payments.openReverse, openSkip: recovery.openSkip, openRestore: recovery.openRestore, openRuleEditor: rules.openRuleEditor, openArchive: rules.openArchive, openReminder, openCreate: rules.openCreate };
  const handlePeriodChange = (event) => { setPeriod(event.target.value); setFilter("all"); setKind("expense"); setExpandedId(null); };
  const headerActions = recurringHeaderActions({ period, onPeriodChange: handlePeriodChange, canManagePlanning, allItems, rules });

  return (
    <div className="page-stack">
      <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
      {memberMode ? <CompactNotice tone="info" role="status">Anda dapat membuat dan mengubah jadwal rutin Bersama atau jadwal dari rekening pribadi Anda. Jadwal pribadi anggota lain dan tindakan arsip tetap dikelola Administrator.</CompactNotice> : null}
      {!canManagePlanning ? <CompactNotice tone="warning" title="Belum ada rekening yang dapat digunakan." role="status">Siapkan atau aktifkan rekening terlebih dahulu sebelum membuat Jadwal Rutin. <Link to="/rekening">Lihat Rekening</Link>.</CompactNotice> : null}
      {payments.incomeSuccess ? <div className={styles.incomeSuccess}><CompactNotice tone="success" title="Penerimaan rutin berhasil dicatat." role="status">Dana sudah masuk ke rekening. Anda dapat membaginya ke Alokasi Dana sekarang atau nanti.</CompactNotice><div className={styles.incomeSuccessActions}><Button type="button" onClick={() => payments.setIncomeSuccess(null)}>Nanti</Button><Button type="button" variant="primary" onClick={() => { const success = payments.incomeSuccess; payments.setIncomeSuccess(null); navigate("/perencanaan/kantong", { state: { workflowSource: "recurring-income", workflowAction: "fund", sourceAccountId: success.sourceAccountId, suggestedAmount: success.suggestedAmount } }); }}>Bagi ke Alokasi Dana</Button></div></div> : null}
      {embedded ? <div className={styles.embeddedHeader}><div><h2>Jadwal Rutin</h2><p>Sistem menyiapkan jadwal berulang. Saat waktunya tiba, konfirmasi nominal aktual sebelum saldo berubah.</p></div>{headerActions}</div> : <PageHeader title="Jadwal Rutin" help="Jadwal rutin mengingatkan transaksi berulang. Saldo baru berubah setelah pembayaran atau penerimaan aktual disimpan." actions={headerActions} />}{attentionOccurrenceId ? <CompactNotice tone="info" title="Selesaikan jadwal yang dipilih." role="status">Catat nominal aktual dan rekening. Saldo berubah setelah pembayaran atau penerimaan disimpan.</CompactNotice> : null}
      <Suspense fallback={null}>
        <RecurringScheduleView allItems={allItems} filteredItems={filteredItems} kind={kind} setKind={setKind} filter={filter} setFilter={setFilter} actions={actions} expandedId={expandedId} setExpandedId={setExpandedId} accounts={bootstrap?.accounts || []} categories={bootstrap?.categories || []} budgets={budgets} canCreate={canManagePlanning} />
      </Suspense>
      <ManualReminderModal target={reminderTarget} onClose={() => setReminderTarget(null)} />
      {recurringDialogOpen({ rules, payments, recovery }) ? (
        <Suspense fallback={null}>
          <RecurringDialogLayer rules={rules} payments={payments} recovery={recovery} categories={categories} editCategories={editCategories} accounts={ruleAccounts} paymentAccounts={paymentAccounts} paymentEnvelopes={paymentEnvelopes} envelopeStatus={envelopeResource.status} budgetSuggestions={budgetSuggestions} members={members} />
        </Suspense>
      ) : null}
    </div>
  );
};

export default RecurringPage;
