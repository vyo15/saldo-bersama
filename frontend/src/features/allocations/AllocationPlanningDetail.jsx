import { lazy, Suspense, useEffect, useState } from "react";
import LazyActionFallback from "../../components/feedback/LazyActionFallback.jsx";
import { useNavigate } from "react-router";
import { useTransactionComposer } from "../../app/TransactionComposerContext.jsx";
import { FiArrowLeft, FiArrowRight, FiBell, FiMoreHorizontal, FiPlus, FiSliders } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { formatDateLongIndonesia, todayInJakarta } from "../../domain/dates.js";
import { budgetPeriodMeta, budgetRemainingAmount, budgetVisualState } from "../../shared/presentation/budget.js";
import { useBudgetFormController, useBudgetLifecycleController } from "../budgets/useBudgetActions.js";
import { allocationAssigneeLabel, allocationNeedsFundingSummary, allocationPeriodLabel, allocationSourceLabel, allocationUsage } from "./allocationPresentation.js";
import { allocationClass } from "./allocationStyles.js";
import { BudgetLimitRow, BudgetNeedDetailModal } from "./AllocationNeedRow.jsx";

const BudgetDialogLayer = lazy(() => import("../budgets/BudgetDialogLayer.jsx"));
const COMPLETED_RECURRING_STATUSES = new Set(["paid", "received"]);
const INACTIVE_RECURRING_STATUSES = new Set(["cancelled", "skipped"]);

const samePlanningOwnership = (left, right) => String(left?.scope || "") === String(right?.scope || "")
  && String(left?.owner_user_id || "") === String(right?.owner_user_id || "");

const unambiguousRelatedRecurring = (relatedRecurring, budgets, item) => (relatedRecurring || []).filter((entry) => {
  if (entry.budget_id) {
    const linkedBudget = (budgets || []).find((budget) => budget.budget_id === entry.budget_id);
    return linkedBudget?.envelope_rule_id === item.envelope_rule_id;
  }
  const candidates = (budgets || []).filter((budget) => budget.envelope_rule_id
    && budget.envelope_source_account_id
    && budget.category_id === entry.category_id
    && samePlanningOwnership(budget, entry)
    && budget.envelope_source_account_id === entry.default_account_id);
  return candidates.length === 1 && candidates[0].envelope_rule_id === item.envelope_rule_id;
});

const recurringScheduleForBudget = (budget, relatedRecurring, today) => {
  const items = (relatedRecurring || []).filter((entry) => entry.budget_id
    ? entry.budget_id === budget.budget_id
    : entry.category_id === budget.category_id);
  if (!items.length) return null;
  const openItems = items
    .filter((entry) => !COMPLETED_RECURRING_STATUSES.has(entry.status) && !INACTIVE_RECURRING_STATUSES.has(entry.status))
    .sort((left, right) => String(left.due_date || "").localeCompare(String(right.due_date || "")));
  const completedItems = items
    .filter((entry) => COMPLETED_RECURRING_STATUSES.has(entry.status))
    .sort((left, right) => String(right.due_date || "").localeCompare(String(left.due_date || "")));
  const item = openItems[0] || completedItems[0] || items[0];
  const dueLabel = formatDateLongIndonesia(item.due_date) || item.due_date || "";
  const completed = COMPLETED_RECURRING_STATUSES.has(item.status);
  const label = completed
    ? `Selesai${dueLabel ? ` · ${dueLabel}` : ""}`
    : item.status === "overdue"
      ? `Terlambat${dueLabel ? ` · ${dueLabel}` : ""}`
      : item.due_date === today
        ? "Jatuh tempo hari ini"
        : `Terjadwal${dueLabel ? ` · ${dueLabel}` : ""}`;
  return { item, label, canPay: !completed && item.can_pay !== false };
};

const AllocationNeedsFundingSummary = ({ item, linkedBudgets, canAdjustAllocation, onAdjustAllocation }) => {
  const summary = allocationNeedsFundingSummary(item, linkedBudgets);
  if (summary.gap <= 0) return null;
  return <div className={allocationClass("allocation-needs-gap")} role="status">
      <div><strong>Dana Alokasi lama belum mengikuti total Kebutuhan.</strong><span>Kurang <Money value={summary.gap} />. Kebutuhan baru sekarang menyesuaikan dana otomatis; data lama ini dapat dipulihkan sekali.</span></div>
      {canAdjustAllocation ? <Button variant="primary" icon={FiSliders} onClick={() => onAdjustAllocation(item, summary.gap)}>Pulihkan dana</Button> : null}
    </div>;
};


const canRecordAllocationExpense = (item, today) => Boolean(item.can_record_expense && item.source_account_id)
  && (!item.period_start || today >= item.period_start)
  && (!item.period_end || today <= item.period_end);

const AllocationNeedsPanel = ({
  item,
  linkedBudgets,
  expenseCategories,
  periodMeta,
  safeRelatedRecurring,
  today,
  canManage,
  canRecordExpense,
  canAdjustAllocation,
  onAdjustAllocation,
  openBudgetForm,
  recordExpense,
  openSchedule,
  editBudget,
}) => {
  const [needFilter, setNeedFilter] = useState("all");
  const [detailTarget, setDetailTarget] = useState(null);
  const categoryLookup = new Map((expenseCategories || []).map((category) => [category.category_id, category]));
  const budgetState = linkedBudgets.map((budget) => ({
    budget,
    status: budgetVisualState(budget, periodMeta),
    used: Math.max(0, Number(budget.used_amount || 0)),
  }));
  const attentionCount = budgetState.filter((entry) => entry.status.attention).length;
  const unusedCount = budgetState.filter((entry) => entry.used <= 0).length;
  const filteredBudgets = budgetState.filter((entry) => {
    if (needFilter === "attention") return entry.status.attention;
    if (needFilter === "unused") return entry.used <= 0;
    return true;
  }).map((entry) => entry.budget);
  const showFilters = linkedBudgets.length > 4;

  return <section className={allocationClass("allocation-detail-section allocation-detail-section--needs")} aria-labelledby="allocation-needs-title">
    <div className={allocationClass("allocation-detail-panel__header")}>
      <div><h3 id="allocation-needs-title">Kebutuhan</h3><p>Pantau sisa dana dan catat pemakaian.</p></div>
      {linkedBudgets.length ? <span className={allocationClass("allocation-detail-section__count")}>{linkedBudgets.length} item</span> : null}
    </div>
    {linkedBudgets.length ? <>
      <AllocationNeedsFundingSummary item={item} linkedBudgets={linkedBudgets} canAdjustAllocation={canAdjustAllocation} onAdjustAllocation={onAdjustAllocation} />
      {showFilters ? <div className={allocationClass("allocation-needs-filter")} role="group" aria-label="Filter kebutuhan">
        <button type="button" className={allocationClass(`allocation-needs-filter__button ${needFilter === "all" ? "is-active" : ""}`)} aria-pressed={needFilter === "all"} onClick={() => setNeedFilter("all")}>Semua <span>{linkedBudgets.length}</span></button>
        <button type="button" className={allocationClass(`allocation-needs-filter__button ${needFilter === "attention" ? "is-active" : ""}`)} aria-pressed={needFilter === "attention"} onClick={() => setNeedFilter("attention")}>Perhatian <span>{attentionCount}</span></button>
        <button type="button" className={allocationClass(`allocation-needs-filter__button ${needFilter === "unused" ? "is-active" : ""}`)} aria-pressed={needFilter === "unused"} onClick={() => setNeedFilter("unused")}>Belum dipakai <span>{unusedCount}</span></button>
      </div> : null}
      {filteredBudgets.length ? <div className={allocationClass("allocation-limit-list")}>{filteredBudgets.map((budget) => {
        const category = categoryLookup.get(budget.category_id);
        const schedule = recurringScheduleForBudget(budget, safeRelatedRecurring, today);
        return <BudgetLimitRow
          key={budget.budget_id}
          budget={budget}
          category={category}
          periodMeta={periodMeta}
          schedule={schedule}
          canManage={canManage && budget.can_manage !== false}
          onRecord={canRecordExpense ? recordExpense : null}
          onOpenSchedule={openSchedule}
          onEdit={editBudget}
          onOpenDetail={() => setDetailTarget({ budget, category, schedule, periodMeta })}
        />;
      })}</div> : <p className={allocationClass("allocation-needs-filter__empty")}>Tidak ada kebutuhan pada filter ini.</p>}
      {canManage ? <Button className={allocationClass("allocation-needs-add")} variant="secondary" icon={FiPlus} onClick={openBudgetForm}>Tambah kebutuhan</Button> : null}
      <BudgetNeedDetailModal target={detailTarget} onClose={() => setDetailTarget(null)} />
    </> : <EmptyState
      variant="inline"
      title="Belum ada kebutuhan"
      description={canManage ? "Tambahkan kebutuhan pertama agar penggunaan dana pada Alokasi ini mudah dipantau." : "Belum ada Kebutuhan yang dapat Anda kelola pada Alokasi Dana ini."}
      action={canManage ? <Button variant="primary" icon={FiPlus} onClick={openBudgetForm}>Tambah kebutuhan</Button> : null}
    />}
  </section>;
};

const AllocationBudgetDialog = ({ budgetFormController, budgetLifecycleController, canManage, canLifecycle, expenseCategories, budgets, users, usersStatus, item, sourceAccount, onBudgetReminder }) => {
  if (!budgetFormController.formOpen && !budgetLifecycleController.archiveTarget) return null;
  return <Suspense fallback={<LazyActionFallback surface="modal" title="Kebutuhan" label="Menyiapkan form Kebutuhan..." />}><BudgetDialogLayer
    canManage={canManage}
    canLifecycle={canLifecycle || canManage}
    categories={expenseCategories}
    items={budgets}
    users={users}
    usersStatus={usersStatus}
    formController={budgetFormController}
    lifecycleController={budgetLifecycleController}
    lockedEnvelope={item}
    sourceAccount={sourceAccount}
    onReminder={onBudgetReminder}
  /></Suspense>;
};

const useAllocationPlanningDetailState = ({ item, budgets, relatedRecurring, period, notify, refreshBudgetPlanning, expenseCategories, accounts = [] }) => {
  const { openTransactionComposer } = useTransactionComposer();
  const navigate = useNavigate();
  const today = todayInJakarta();
  const sourceAccount = accounts.find((account) => account.account_id === item.source_account_id) || null;
  const budgetFormController = useBudgetFormController({ items: budgets, period, notify, refresh: refreshBudgetPlanning, categories: expenseCategories, scheduleAccountId: item.source_account_id || "" });
  const budgetLifecycleController = useBudgetLifecycleController({ notify, refresh: refreshBudgetPlanning, setForm: budgetFormController.setForm, setFormOpen: budgetFormController.setFormOpen, envelopePeriodId: item.envelope_period_id || "" });
  const canRecordExpense = canRecordAllocationExpense(item, today);
  const openBudgetForm = () => budgetFormController.openBudgetForm({ envelope_rule_id: item.envelope_rule_id, envelope_period_id: item.envelope_period_id, scope: item.scope, owner_user_id: item.owner_user_id || "" });
  const editBudget = (budget) => budgetFormController.editBudget(budget, { envelope_rule_id: item.envelope_rule_id, envelope_period_id: item.envelope_period_id, scope: item.scope, owner_user_id: item.owner_user_id || "" });
  const addBalance = (shortageAmount) => openTransactionComposer({
    initialType: TRANSACTION_TYPES.INCOME,
    initialDraft: {
      transaction_type: TRANSACTION_TYPES.INCOME,
      destination_account_id: item.source_account_id || "",
      amount: Math.max(0, Number(shortageAmount || 0)),
      description: `Tambah saldo untuk Alokasi ${item.name}`,
    },
  });
  const recordAllocationExpense = () => {
    if (!canRecordExpense) return;
    openTransactionComposer({
      initialType: TRANSACTION_TYPES.EXPENSE,
      initialSourceAccountId: item.source_account_id,
      initialDraft: {
        transaction_type: TRANSACTION_TYPES.EXPENSE,
        source_account_id: item.source_account_id,
      },
    });
  };
  const recordNeedExpense = (budget) => {
    if (!canRecordExpense || !budget?.budget_id || !budget?.category_id || !item.envelope_period_id || !item.source_account_id) return;
    const remaining = budgetRemainingAmount(budget);
    openTransactionComposer({
      initialType: TRANSACTION_TYPES.EXPENSE,
      initialSourceAccountId: item.source_account_id,
      initialDraft: {
        transaction_type: TRANSACTION_TYPES.EXPENSE,
        source_account_id: item.source_account_id,
        category_id: budget.category_id,
        envelope_period_id: item.envelope_period_id,
        budget_id: budget.budget_id,
        amount: budget.recording_mode === "fixed_once" ? remaining : "",
        description: budget.name || "",
      },
      initialAllocationContext: { budget, envelope: item },
      planningIntent: {
        mode: "locked-need",
        budget_id: budget.budget_id,
        envelope_period_id: item.envelope_period_id,
        source_account_id: item.source_account_id,
        category_id: budget.category_id,
      },
    });
  };
  const openRecurringWorkflow = (workflow) => navigate("/perencanaan/jadwal", { state: workflow });
  const openSchedule = (scheduleItem, payNow) => {
    const duePeriod = String(scheduleItem?.due_date || "").match(/^(\d{4}-\d{2})-\d{2}$/)?.[1] || "";
    openRecurringWorkflow({
      workflowSource: "allocation-need",
      workflowAction: payNow ? "pay-recurring" : "view-recurring",
      occurrenceId: scheduleItem?.occurrence_id || "",
      ...(duePeriod ? { period: duePeriod } : {}),
    });
  };
  return {
    usage: allocationUsage(item),
    sourceLabel: allocationSourceLabel(item),
    assigneeLabel: allocationAssigneeLabel(item),
    periodLabel: allocationPeriodLabel(item.period_start, item.period_end),
    periodMeta: budgetPeriodMeta(period, today),
    safeRelatedRecurring: unambiguousRelatedRecurring(relatedRecurring, budgets, item),
    today,
    canRecordExpense,
    sourceAccount,
    addBalance,
    budgetFormController,
    budgetLifecycleController,
    openBudgetForm,
    editBudget,
    recordAllocationExpense,
    recordNeedExpense,
    openSchedule,
  };
};

const showGlobalExpenseAction = (canRecordExpense, linkedBudgets) => canRecordExpense && linkedBudgets.length === 0;

const AllocationPlanningDetailView = ({ item, linkedBudgets, budgets, canManage, canLifecycle, expenseCategories, users, usersStatus, onBack, onBudgetReminder, onAllocationReminder, onOpenAllocationActions, canAdjustAllocation, onAdjustAllocation, canMoveAllocation, onMoveAllocation, state }) => <>
  <div className={allocationClass("allocation-planning-detail")}>
    <button type="button" className={allocationClass("allocation-detail-back")} onClick={onBack}><FiArrowLeft aria-hidden="true" />Semua Alokasi Dana</button>
    <Card className={allocationClass("allocation-detail-shell")}>
      <section className={allocationClass("allocation-detail-hero")} aria-labelledby="allocation-detail-title">
        <div className={allocationClass("allocation-detail-hero__heading")}>
          <div><span>Alokasi Dana</span><h2 id="allocation-detail-title">{item.name}</h2><p>{state.sourceLabel} · {state.assigneeLabel} · {state.periodLabel}</p></div>
          {(canMoveAllocation || item.can_set_reminder || item.can_archive_rule) ? <details className={allocationClass("allocation-detail-menu")}>
            <summary aria-label={`Kelola Alokasi ${item.name}`} title="Kelola Alokasi"><FiMoreHorizontal aria-hidden="true" /></summary>
            <div className={allocationClass("allocation-detail-menu__items")}>
              {canMoveAllocation ? <Button icon={FiArrowRight} onClick={() => onMoveAllocation(item)}>Pindahkan dana</Button> : null}
              {item.can_set_reminder ? <Button icon={FiBell} onClick={() => onAllocationReminder(item)}>Pengingat</Button> : null}
              {item.can_archive_rule ? <Button onClick={() => onOpenAllocationActions(item)}>Hapus dari daftar</Button> : null}
            </div>
          </details> : null}
        </div>
        {showGlobalExpenseAction(state.canRecordExpense, linkedBudgets) ? <div className={allocationClass("allocation-detail-hero__action")}><Button variant="primary" icon={FiPlus} onClick={state.recordAllocationExpense}>Catat pengeluaran</Button></div> : null}
        <div className={allocationClass("allocation-detail-hero__metrics allocation-detail-hero__metrics--compact")}>
          <div><span>Masih tersedia</span><strong><Money value={item.remaining_amount} tone={Number(item.remaining_amount || 0) < 0 ? "negative" : "default"} /></strong></div>
          <div><span>Sudah dipakai</span><strong><Money value={state.usage.used} /></strong><small>dari <Money value={state.usage.allocated} /></small></div>
          <div><span>Untuk jadwal</span><strong><Money value={state.usage.reserved} /></strong></div>
        </div>
      </section>
      <AllocationNeedsPanel
        item={item}
        linkedBudgets={linkedBudgets}
        expenseCategories={expenseCategories}
        periodMeta={state.periodMeta}
        safeRelatedRecurring={state.safeRelatedRecurring}
        today={state.today}
        canManage={canManage}
        canRecordExpense={state.canRecordExpense}
        canAdjustAllocation={canAdjustAllocation}
        onAdjustAllocation={onAdjustAllocation}
        openBudgetForm={state.openBudgetForm}
        recordExpense={state.recordNeedExpense}
        openSchedule={state.openSchedule}
        editBudget={state.editBudget}
      />
    </Card>
  </div>
  <AllocationBudgetDialog
    budgetFormController={state.budgetFormController}
    budgetLifecycleController={state.budgetLifecycleController}
    canManage={canManage}
    canLifecycle={canLifecycle}
    expenseCategories={expenseCategories}
    budgets={budgets}
    users={users}
    usersStatus={usersStatus}
    item={item}
    sourceAccount={state.sourceAccount}
    onBudgetReminder={onBudgetReminder}
  />
</>;

const AllocationPlanningDetail = (props) => {
  const state = useAllocationPlanningDetailState(props);
  const { canManage, initialAction, onInitialActionConsumed } = props;
  const { openBudgetForm } = state;

  useEffect(() => {
    if (initialAction !== "add-need") return;
    onInitialActionConsumed?.();
    if (canManage) openBudgetForm();
  }, [canManage, initialAction, onInitialActionConsumed, openBudgetForm]);

  return <AllocationPlanningDetailView {...props} state={state} />;
};

export default AllocationPlanningDetail;
