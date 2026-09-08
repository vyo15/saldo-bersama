import { lazy, Suspense, useEffect } from "react";
import { useNavigate } from "react-router";
import { useTransactionComposer } from "../../app/TransactionComposerContext.jsx";
import { FiArrowLeft, FiArrowRight, FiBell, FiEdit2, FiPlus, FiSliders } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { formatDateLongIndonesia, todayInJakarta } from "../../domain/dates.js";
import { budgetPeriodMeta, budgetVisualState } from "../../shared/presentation/budget.js";
import { categoryIcon } from "../../shared/presentation/transaction.js";
import { useBudgetFormController, useBudgetLifecycleController } from "../budgets/useBudgetActions.js";
import { allocationAssigneeLabel, allocationNeedsFundingSummary, allocationPeriodLabel, allocationSourceLabel, allocationUsage } from "./allocationPresentation.js";
import { allocationClass } from "./allocationStyles.js";

const BudgetDialogLayer = lazy(() => import("../budgets/BudgetDialogLayer.jsx"));
const COMPLETED_RECURRING_STATUSES = new Set(["paid", "received"]);
const INACTIVE_RECURRING_STATUSES = new Set(["cancelled", "skipped"]);

const samePlanningOwnership = (left, right) => String(left?.scope || "") === String(right?.scope || "")
  && String(left?.owner_user_id || "") === String(right?.owner_user_id || "");

const unambiguousRelatedRecurring = (relatedRecurring, budgets, item) => (relatedRecurring || []).filter((entry) => {
  const candidates = (budgets || []).filter((budget) => budget.envelope_rule_id
    && budget.envelope_source_account_id
    && budget.category_id === entry.category_id
    && samePlanningOwnership(budget, entry)
    && budget.envelope_source_account_id === entry.default_account_id);
  return candidates.length === 1 && candidates[0].envelope_rule_id === item.envelope_rule_id;
});

const recurringScheduleForBudget = (budget, relatedRecurring, today) => {
  const items = (relatedRecurring || []).filter((entry) => entry.category_id === budget.category_id);
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

const BudgetLimitActions = ({ budget, schedule, canManage, onRecord, onOpenSchedule, onEdit }) => {
  const hasPrimaryAction = Boolean(schedule || onRecord);
  if (!hasPrimaryAction && !canManage) return null;
  return <div className={allocationClass("allocation-limit-row__actions")}>
    {schedule ? <Button variant={schedule.canPay ? "primary" : undefined} onClick={() => onOpenSchedule(schedule.item, schedule.canPay)}>{schedule.canPay ? "Catat pembayaran" : "Lihat jadwal"}</Button> : onRecord ? <Button variant="primary" icon={FiPlus} onClick={() => onRecord(budget)}>Catat</Button> : null}
    {schedule && onRecord ? <Button icon={FiPlus} onClick={() => onRecord(budget)}>Catat tambahan</Button> : null}
    {canManage ? <Button icon={FiEdit2} onClick={() => onEdit(budget)}>Edit</Button> : null}
  </div>;
};

const BudgetLimitRow = ({ budget, category, periodMeta, schedule, canManage, onRecord, onOpenSchedule, onEdit }) => {
  const amount = Math.max(0, Number(budget.amount || 0));
  const used = Math.max(0, Number(budget.used_amount || 0));
  const status = budgetVisualState(budget, periodMeta);
  const tone = status.key === "danger" ? "is-danger" : ["warning", "pace"].includes(status.key) ? "is-warning" : "";
  const CategoryIcon = categoryIcon(category?.icon, "expense");
  return <div className={allocationClass("allocation-limit-row")} data-budget-id={budget.budget_id}>
    <div className={allocationClass("allocation-limit-row__main")}>
      <div className={allocationClass("allocation-limit-row__identity")}>
        <span className={allocationClass("allocation-limit-row__icon")}><CategoryIcon aria-hidden="true" /></span>
        <div><strong>{budget.name}</strong><small>Terpakai <Money value={used} /> dari nominal <Money value={amount} /></small><small>Sisa kebutuhan <Money value={Math.max(0, amount - used)} /></small><small>{schedule?.label || "Fleksibel · dapat dicatat berkali-kali"}</small></div>
      </div>
      <span className={allocationClass(tone)}>{status.label}</span>
    </div>
    <ProgressBar value={used} max={amount} label={`Pemakaian ${budget.name} ${Math.round(status.usedPercent)}%`} />
    <BudgetLimitActions budget={budget} schedule={schedule} canManage={canManage} onRecord={onRecord} onOpenSchedule={onOpenSchedule} onEdit={onEdit} />
  </div>;
};

const AllocationNeedsFundingSummary = ({ item, linkedBudgets, canAdjustAllocation, onAdjustAllocation }) => {
  const summary = allocationNeedsFundingSummary(item, linkedBudgets);
  if (summary.gap <= 0) return null;
  return <div className={allocationClass("allocation-needs-gap")} role="status">
      <div><strong>Kebutuhan melebihi dana alokasi.</strong><span>Tambahkan <Money value={summary.gap} /> bila Anda memang ingin seluruh Kebutuhan tercakup. Dana tidak berubah otomatis.</span></div>
      {canAdjustAllocation ? <Button variant="primary" icon={FiSliders} onClick={() => onAdjustAllocation(item, summary.gap)}>Atur dana</Button> : null}
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
  const categoryLookup = new Map((expenseCategories || []).map((category) => [category.category_id, category]));
  return <section className={allocationClass("allocation-detail-section allocation-detail-section--needs")} aria-labelledby="allocation-needs-title">
    <div className={allocationClass("allocation-detail-panel__header")}>
      <div><h3 id="allocation-needs-title">Kebutuhan</h3><p>Atur kategori dan nominal kebutuhan yang menggunakan Alokasi Dana ini.</p></div>
      {linkedBudgets.length ? <span className={allocationClass("allocation-detail-section__count")}>{linkedBudgets.length} item</span> : null}
    </div>
    {canManage && linkedBudgets.length ? <Button className={allocationClass("allocation-needs-add")} variant="secondary" icon={FiPlus} onClick={openBudgetForm}>Tambah kebutuhan</Button> : null}
    {linkedBudgets.length ? <>
      <AllocationNeedsFundingSummary item={item} linkedBudgets={linkedBudgets} canAdjustAllocation={canAdjustAllocation} onAdjustAllocation={onAdjustAllocation} />
      <div className={allocationClass("allocation-limit-list")}>{linkedBudgets.map((budget) => <BudgetLimitRow
        key={budget.budget_id}
        budget={budget}
        category={categoryLookup.get(budget.category_id)}
        periodMeta={periodMeta}
        schedule={recurringScheduleForBudget(budget, safeRelatedRecurring, today)}
        canManage={canManage && budget.can_manage !== false}
        onRecord={canRecordExpense ? recordExpense : null}
        onOpenSchedule={openSchedule}
        onEdit={editBudget}
      />)}</div>
    </> : <EmptyState
      variant="inline"
      title="Belum ada kebutuhan"
      description={canManage ? "Tambahkan kebutuhan pertama agar penggunaan dana pada Alokasi ini mudah dipantau." : "Belum ada Kebutuhan yang dapat Anda kelola pada Alokasi Dana ini."}
      action={canManage ? <Button variant="primary" icon={FiPlus} onClick={openBudgetForm}>Tambah kebutuhan</Button> : null}
    />}
  </section>;
};

const AllocationBudgetDialog = ({ budgetFormController, budgetLifecycleController, canManage, canLifecycle, expenseCategories, users, usersStatus, item, onBudgetReminder }) => {
  if (!budgetFormController.formOpen && !budgetLifecycleController.archiveTarget) return null;
  return <Suspense fallback={null}><BudgetDialogLayer
    canManage={canManage}
    canLifecycle={canLifecycle}
    categories={expenseCategories}
    users={users}
    usersStatus={usersStatus}
    formController={budgetFormController}
    lifecycleController={budgetLifecycleController}
    lockedEnvelope={item}
    onReminder={onBudgetReminder}
  /></Suspense>;
};

const useAllocationPlanningDetailState = ({ item, budgets, relatedRecurring, period, notify, refreshBudgetPlanning, expenseCategories }) => {
  const { openTransactionComposer } = useTransactionComposer();
  const navigate = useNavigate();
  const today = todayInJakarta();
  const budgetFormController = useBudgetFormController({ items: budgets, period, notify, refresh: refreshBudgetPlanning, categories: expenseCategories, scheduleAccountId: item.source_account_id || "" });
  const budgetLifecycleController = useBudgetLifecycleController({ notify, refresh: refreshBudgetPlanning, setForm: budgetFormController.setForm, setFormOpen: budgetFormController.setFormOpen });
  const canRecordExpense = canRecordAllocationExpense(item, today);
  const openBudgetForm = () => budgetFormController.openBudgetForm({ envelope_rule_id: item.envelope_rule_id, scope: item.scope, owner_user_id: item.owner_user_id || "" });
  const editBudget = (budget) => budgetFormController.editBudget(budget, { envelope_rule_id: item.envelope_rule_id, scope: item.scope, owner_user_id: item.owner_user_id || "" });
  const recordExpense = (budget = null) => {
    if (!canRecordExpense) return;
    openTransactionComposer({
      initialType: TRANSACTION_TYPES.EXPENSE,
      initialSourceAccountId: item.source_account_id,
      initialDraft: {
        transaction_type: TRANSACTION_TYPES.EXPENSE,
        source_account_id: item.source_account_id,
        category_id: budget?.category_id || "",
        envelope_period_id: item.envelope_period_id,
      },
    });
  };
  const openRecurringWorkflow = (workflow) => navigate("/perencanaan/jadwal", { state: workflow });
  const openSchedule = (scheduleItem, payNow) => openRecurringWorkflow({
    workflowSource: "allocation-need",
    workflowAction: payNow ? "pay-recurring" : "view-recurring",
    occurrenceId: scheduleItem?.occurrence_id || "",
  });
  return {
    usage: allocationUsage(item),
    sourceLabel: allocationSourceLabel(item),
    assigneeLabel: allocationAssigneeLabel(item),
    periodLabel: allocationPeriodLabel(item.period_start, item.period_end),
    periodMeta: budgetPeriodMeta(period, today),
    safeRelatedRecurring: unambiguousRelatedRecurring(relatedRecurring, budgets, item),
    today,
    canRecordExpense,
    budgetFormController,
    budgetLifecycleController,
    openBudgetForm,
    editBudget,
    recordExpense,
    openSchedule,
  };
};

const showGlobalExpenseAction = (canRecordExpense, linkedBudgets) => canRecordExpense && linkedBudgets.length === 0;
const showStandardAdjustAction = (canAdjustAllocation, item, linkedBudgets) => (
  canAdjustAllocation && allocationNeedsFundingSummary(item, linkedBudgets).gap <= 0
);

const AllocationPlanningDetailView = ({ item, linkedBudgets, canManage, canLifecycle, expenseCategories, users, usersStatus, onBack, onBudgetReminder, onAllocationReminder, onOpenAllocationActions, canAdjustAllocation, onAdjustAllocation, canMoveAllocation, onMoveAllocation, state }) => <>
  <div className={allocationClass("allocation-planning-detail")}>
    <button type="button" className={allocationClass("allocation-detail-back")} onClick={onBack}><FiArrowLeft aria-hidden="true" />Semua Alokasi Dana</button>
    <Card className={allocationClass("allocation-detail-shell")}>
      <section className={allocationClass("allocation-detail-hero")} aria-labelledby="allocation-detail-title">
        <div><span>Alokasi Dana</span><h2 id="allocation-detail-title">{item.name}</h2><p>{state.sourceLabel} · {state.assigneeLabel} · {state.periodLabel}</p></div>
        {showGlobalExpenseAction(state.canRecordExpense, linkedBudgets) ? <div className={allocationClass("allocation-detail-hero__action")}><Button variant="primary" icon={FiPlus} onClick={() => state.recordExpense()}>Catat pengeluaran</Button></div> : null}
        <div className={allocationClass("allocation-detail-hero__metrics")}>
          <div><span>Dialokasikan</span><strong><Money value={state.usage.allocated} /></strong></div>
          <div><span>Terpakai</span><strong><Money value={state.usage.used} /></strong></div>
          <div><span>Tersisa</span><strong><Money value={item.remaining_amount} tone={Number(item.remaining_amount || 0) < 0 ? "negative" : "default"} /></strong></div>
          <div><span>Jumlah kebutuhan</span><strong>{linkedBudgets.length} kebutuhan</strong></div>
        </div>
        {state.usage.reserved > 0 ? <p className={allocationClass("allocation-detail-reserved-note")}>Dipesan <Money value={state.usage.reserved} /> untuk transaksi terjadwal. Nilai ini sudah mengurangi dana yang tersisa.</p> : null}
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
        recordExpense={state.recordExpense}
        openSchedule={state.openSchedule}
        editBudget={state.editBudget}
      />
      <section className={allocationClass("allocation-detail-section allocation-detail-section--management")} aria-labelledby="allocation-management-title">
        <div className={allocationClass("allocation-detail-panel__header")}><div><h3 id="allocation-management-title">Pengaturan alokasi</h3><p>Tindakan yang jarang dipakai dipusatkan di sini agar halaman utama tetap ringkas.</p></div></div>
        <div className="form-actions">
          {showStandardAdjustAction(canAdjustAllocation, item, linkedBudgets) ? <Button icon={FiSliders} onClick={() => onAdjustAllocation(item)}>Atur dana</Button> : null}
          {canMoveAllocation ? <Button icon={FiArrowRight} onClick={() => onMoveAllocation(item)}>Pindahkan dana</Button> : null}
          {item.can_set_reminder ? <Button icon={FiBell} onClick={() => onAllocationReminder(item)}>Pengingat</Button> : null}
          {item.can_close || item.can_archive_rule ? <Button onClick={() => onOpenAllocationActions(item)}>Kelola alokasi</Button> : null}
        </div>
      </section>
    </Card>
  </div>
  <AllocationBudgetDialog
    budgetFormController={state.budgetFormController}
    budgetLifecycleController={state.budgetLifecycleController}
    canManage={canManage}
    canLifecycle={canLifecycle}
    expenseCategories={expenseCategories}
    users={users}
    usersStatus={usersStatus}
    item={item}
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
