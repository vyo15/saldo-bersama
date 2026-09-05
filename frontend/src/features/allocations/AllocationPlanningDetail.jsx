import { lazy, Suspense } from "react";
import { useNavigate } from "react-router";
import { useTransactionComposer } from "../../app/TransactionComposerContext.jsx";
import { FiArrowLeft, FiBell, FiEdit2, FiMoreHorizontal, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { formatDateLongIndonesia, todayInJakarta } from "../../domain/dates.js";
import { budgetPeriodMeta, budgetVisualState } from "../../shared/presentation/budget.js";
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

const BudgetLimitRow = ({ budget, periodMeta, schedule, canManage, canLifecycle, onRecord, onOpenSchedule, onEdit, onLifecycle, onReminder }) => {
  const amount = Math.max(0, Number(budget.amount || 0));
  const used = Math.max(0, Number(budget.used_amount || 0));
  const status = budgetVisualState(budget, periodMeta);
  const tone = status.key === "danger" ? "is-danger" : ["warning", "pace"].includes(status.key) ? "is-warning" : "";
  const scheduleActionLabel = schedule?.canPay ? "Catat pembayaran" : "Lihat jadwal";
  return <div className={allocationClass("allocation-limit-row")} data-budget-id={budget.budget_id}>
    <div className={allocationClass("allocation-limit-row__main")}><div><strong>{budget.name}</strong><small>Terpakai <Money value={used} /> dari anggaran <Money value={amount} /></small><small>Sisa anggaran <Money value={Math.max(0, amount - used)} /></small><small>{schedule?.label || "Fleksibel · dapat dicatat berkali-kali"}</small></div><span className={allocationClass(tone)}>{status.label}</span></div>
    <ProgressBar value={used} max={amount} label={`Pemakaian ${budget.name} ${Math.round(status.usedPercent)}%`} />
    {onRecord || schedule || canManage || canLifecycle ? <div className={allocationClass("allocation-limit-row__actions")}>
      {schedule ? <Button variant={schedule.canPay ? "primary" : undefined} onClick={() => onOpenSchedule(schedule.item, schedule.canPay)}>{scheduleActionLabel}</Button> : onRecord ? <Button variant="primary" icon={FiPlus} onClick={() => onRecord(budget)}>Catat</Button> : null}
      {schedule && onRecord ? <Button icon={FiPlus} onClick={() => onRecord(budget)}>Catat tambahan</Button> : null}
      {canManage ? <><Button icon={FiEdit2} onClick={() => onEdit(budget)}>Edit</Button><Button icon={FiBell} onClick={() => onReminder(budget)}>Pengingat</Button></> : null}
      {canLifecycle ? <Button icon={FiMoreHorizontal} onClick={() => onLifecycle(budget)}>Kelola</Button> : null}
    </div> : null}
  </div>;
};

const RecurringRelatedRow = ({ item }) => <div className={allocationClass("allocation-related-row")}><div><strong>{item.name}</strong><small>{formatDateLongIndonesia(item.due_date) || item.due_date}</small></div><div><Money value={item.expected_amount} /><small>{item.status === "paid" || item.status === "received" ? "Selesai" : item.status === "overdue" ? "Terlambat" : item.due_date === todayInJakarta() ? "Menunggu konfirmasi" : "Terjadwal"}</small></div></div>;

const AllocationNeedsFundingSummary = ({ item, linkedBudgets, canAdjustAllocation, onAdjustAllocation }) => {
  const summary = allocationNeedsFundingSummary(item, linkedBudgets);
  return <>
    <div className={allocationClass("allocation-needs-summary")} aria-label="Ringkasan kebutuhan dan dana alokasi">
      <div><span>Total kebutuhan</span><strong><Money value={summary.planned} /></strong></div>
      <div><span>Dana alokasi</span><strong><Money value={summary.allocated} /></strong></div>
      <div data-tone={summary.gap > 0 ? "warning" : "neutral"}><span>{summary.gap > 0 ? "Kurang" : "Belum direncanakan"}</span><strong><Money value={summary.gap > 0 ? summary.gap : summary.unplanned} tone={summary.gap > 0 ? "negative" : "default"} /></strong></div>
    </div>
    {summary.gap > 0 ? <div className={allocationClass("allocation-needs-gap")} role="status">
      <div><strong>Kebutuhan melebihi dana alokasi.</strong><span>Tambahkan <Money value={summary.gap} /> bila Anda memang ingin seluruh Kebutuhan tercakup. Dana tidak berubah otomatis.</span></div>
      {canAdjustAllocation ? <Button variant="primary" icon={FiPlus} onClick={() => onAdjustAllocation(item, summary.gap)}>Tambah <Money value={summary.gap} /> ke alokasi</Button> : null}
    </div> : null}
  </>;
};


const canRecordAllocationExpense = (item, today) => Boolean(item.can_record_expense && item.source_account_id)
  && (!item.period_start || today >= item.period_start)
  && (!item.period_end || today <= item.period_end);

const continuationCategoryFor = (scheduleContinuation, expenseCategories) => {
  if (!scheduleContinuation) return null;
  return expenseCategories.find((category) => category.category_id === scheduleContinuation.category_id) || null;
};

const AllocationScheduleContinuation = ({ continuation, categoryName, onDismiss, onCreateRecurring }) => {
  if (!continuation) return null;
  return <div>
    <CompactNotice tone="success" title={`Kebutuhan ${categoryName || "baru"} berhasil dibuat.`} role="status">Anggarannya sudah tersimpan. Buat Jadwal Rutin bila pembayaran ini memiliki tanggal atau frekuensi tertentu; saldo tetap tidak berubah sampai pembayaran aktual disimpan.</CompactNotice>
    <div className="form-actions"><Button type="button" onClick={onDismiss}>Selesai</Button><Button type="button" variant="primary" onClick={onCreateRecurring}>Buat Jadwal Rutin</Button></div>
  </div>;
};

const AllocationNeedsPanel = ({
  item,
  linkedBudgets,
  periodMeta,
  safeRelatedRecurring,
  today,
  canManage,
  canLifecycle,
  canRecordExpense,
  canAdjustAllocation,
  onAdjustAllocation,
  openBudgetForm,
  recordExpense,
  openSchedule,
  editBudget,
  budgetLifecycleController,
  onBudgetReminder,
}) => <Card className={allocationClass("allocation-detail-panel")}>
  <div className={allocationClass("allocation-detail-panel__header")}>
    <div><h3>Kebutuhan</h3><p>Atur kategori dan anggaran yang menggunakan Alokasi Dana ini.</p></div>
    {canManage && linkedBudgets.length ? <Button variant="primary" icon={FiPlus} onClick={openBudgetForm}>Tambah kebutuhan</Button> : null}
  </div>
  {linkedBudgets.length ? <>
    <AllocationNeedsFundingSummary item={item} linkedBudgets={linkedBudgets} canAdjustAllocation={canAdjustAllocation} onAdjustAllocation={onAdjustAllocation} />
    <div className={allocationClass("allocation-limit-list")}>{linkedBudgets.map((budget) => <BudgetLimitRow
      key={budget.budget_id}
      budget={budget}
      periodMeta={periodMeta}
      schedule={recurringScheduleForBudget(budget, safeRelatedRecurring, today)}
      canManage={canManage && budget.can_manage !== false}
      canLifecycle={canLifecycle}
      onRecord={canRecordExpense ? recordExpense : null}
      onOpenSchedule={openSchedule}
      onEdit={editBudget}
      onLifecycle={budgetLifecycleController.openBudgetLifecycle}
      onReminder={onBudgetReminder}
    />)}</div>
  </> : <EmptyState
    variant="inline"
    title="Belum ada kebutuhan"
    description={canManage ? "Tambahkan kebutuhan pertama agar penggunaan dana pada Alokasi ini mudah dipantau." : "Belum ada Kebutuhan yang dapat Anda kelola pada Alokasi Dana ini."}
    action={canManage ? <Button variant="primary" icon={FiPlus} onClick={openBudgetForm}>Tambah kebutuhan</Button> : null}
  />}
</Card>;

const AllocationRecurringPanel = ({ safeRelatedRecurring, onOpenRecurring }) => <Card className={allocationClass("allocation-detail-panel")}>
  <div className={allocationClass("allocation-detail-panel__header")}>
    <div><h3>Jadwal Terkait</h3><p>Jadwal hanya ditautkan otomatis ketika kategori, ownership, dan rekening menunjuk tepat satu Kebutuhan.</p></div>
    <Button onClick={() => onOpenRecurring()}>Lihat semua jadwal</Button>
  </div>
  {safeRelatedRecurring.length
    ? <div className={allocationClass("allocation-related-list")}>{safeRelatedRecurring.map((entry) => <RecurringRelatedRow key={entry.occurrence_id} item={entry} />)}</div>
    : <EmptyState variant="inline" title="Belum ada jadwal terkait" description="Buat Jadwal Rutin dari Kebutuhan terjadwal, atau pilih Alokasi Dana saat mencatat aktual bila ada lebih dari satu kandidat." />}
</Card>;

const AllocationBudgetDialog = ({ budgetFormController, budgetLifecycleController, canManage, canLifecycle, expenseCategories, users, usersStatus, item }) => {
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
  /></Suspense>;
};

const useAllocationPlanningDetailState = ({ item, budgets, relatedRecurring, period, notify, refreshBudgetPlanning, expenseCategories }) => {
  const { openTransactionComposer } = useTransactionComposer();
  const navigate = useNavigate();
  const today = todayInJakarta();
  const budgetFormController = useBudgetFormController({ items: budgets, period, notify, refresh: refreshBudgetPlanning });
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
  const scheduleContinuation = budgetFormController.scheduleContinuation;
  const continuationCategory = continuationCategoryFor(scheduleContinuation, expenseCategories);
  const createRecurringFromNeed = () => {
    if (!scheduleContinuation) return;
    openRecurringWorkflow({
      workflowSource: "budget",
      workflowAction: "create-recurring",
      name: continuationCategory?.name || "Pembayaran rutin",
      expectedAmount: scheduleContinuation.amount,
      categoryId: scheduleContinuation.category_id,
      defaultAccountId: item.source_account_id || "",
    });
    budgetFormController.dismissScheduleContinuation();
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
    budgetFormController,
    budgetLifecycleController,
    openBudgetForm,
    editBudget,
    recordExpense,
    openSchedule,
    scheduleContinuation,
    continuationCategory,
    createRecurringFromNeed,
  };
};

const AllocationPlanningDetailView = ({ item, linkedBudgets, canManage, canLifecycle, expenseCategories, users, usersStatus, onBack, onBudgetReminder, onOpenRecurring, canAdjustAllocation, onAdjustAllocation, state }) => <>
  <div className={allocationClass("allocation-planning-detail")}>
    <button type="button" className={allocationClass("allocation-detail-back")} onClick={onBack}><FiArrowLeft aria-hidden="true" />Semua Alokasi Dana</button>
    <Card className={allocationClass("allocation-detail-hero")}>
      <div><span>Alokasi Dana</span><h2>{item.name}</h2><p>{state.sourceLabel} · {state.assigneeLabel} · {state.periodLabel}</p></div>
      {state.canRecordExpense ? <div className={allocationClass("allocation-detail-hero__action")}><Button variant="primary" icon={FiPlus} onClick={() => state.recordExpense()}>Catat pengeluaran</Button></div> : null}
      <div className={allocationClass("allocation-detail-hero__metrics")}>
        <div><span>Dialokasikan</span><strong><Money value={state.usage.allocated} /></strong></div>
        <div><span>Terpakai</span><strong><Money value={state.usage.used} /></strong></div>
        <div><span>Tersisa</span><strong><Money value={item.remaining_amount} tone={Number(item.remaining_amount || 0) < 0 ? "negative" : "default"} /></strong></div>
      </div>
      {state.usage.reserved > 0 ? <p className={allocationClass("allocation-detail-reserved-note")}>Dipesan <Money value={state.usage.reserved} /> untuk transaksi terjadwal. Nilai ini sudah mengurangi dana yang tersisa.</p> : null}
    </Card>
    <AllocationScheduleContinuation
      continuation={state.scheduleContinuation}
      categoryName={state.continuationCategory?.name}
      onDismiss={state.budgetFormController.dismissScheduleContinuation}
      onCreateRecurring={state.createRecurringFromNeed}
    />
    <div className={allocationClass("allocation-detail-grid")}>
      <AllocationNeedsPanel
        item={item}
        linkedBudgets={linkedBudgets}
        periodMeta={state.periodMeta}
        safeRelatedRecurring={state.safeRelatedRecurring}
        today={state.today}
        canManage={canManage}
        canLifecycle={canLifecycle}
        canRecordExpense={state.canRecordExpense}
        canAdjustAllocation={canAdjustAllocation}
        onAdjustAllocation={onAdjustAllocation}
        openBudgetForm={state.openBudgetForm}
        recordExpense={state.recordExpense}
        openSchedule={state.openSchedule}
        editBudget={state.editBudget}
        budgetLifecycleController={state.budgetLifecycleController}
        onBudgetReminder={onBudgetReminder}
      />
      <AllocationRecurringPanel safeRelatedRecurring={state.safeRelatedRecurring} onOpenRecurring={onOpenRecurring} />
    </div>
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
  />
</>;

const AllocationPlanningDetail = (props) => {
  const state = useAllocationPlanningDetailState(props);
  return <AllocationPlanningDetailView {...props} state={state} />;
};

export default AllocationPlanningDetail;
