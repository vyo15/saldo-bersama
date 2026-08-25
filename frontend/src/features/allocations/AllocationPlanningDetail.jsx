import { lazy, Suspense } from "react";
import { useTransactionComposer } from "../../app/TransactionComposerContext.jsx";
import { FiArrowLeft, FiBell, FiEdit2, FiMoreHorizontal, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { formatDateLongIndonesia, todayInJakarta } from "../../domain/dates.js";
import { budgetPeriodMeta, budgetVisualState } from "../../shared/presentation/budget.js";
import { useBudgetFormController, useBudgetLifecycleController } from "../budgets/useBudgetActions.js";
import { allocationAssigneeLabel, allocationNeedsFundingSummary, allocationPeriodLabel, allocationSourceLabel, allocationUsage } from "./allocationPresentation.js";

const BudgetDialogLayer = lazy(() => import("../budgets/BudgetDialogLayer.jsx"));

const BudgetLimitRow = ({ budget, periodMeta, canManage, canLifecycle, onRecord, onEdit, onLifecycle, onReminder }) => {
  const amount = Math.max(0, Number(budget.amount || 0));
  const used = Math.max(0, Number(budget.used_amount || 0));
  const status = budgetVisualState(budget, periodMeta);
  const tone = status.key === "danger" ? "is-danger" : ["warning", "pace"].includes(status.key) ? "is-warning" : "";
  return <div className="allocation-limit-row" data-budget-id={budget.budget_id}>
    <div className="allocation-limit-row__main"><div><strong>{budget.name}</strong><small>Terpakai <Money value={used} /> dari anggaran <Money value={amount} /></small></div><span className={tone}>{status.label}</span></div>
    <ProgressBar value={used} max={amount} label={`Pemakaian ${budget.name} ${Math.round(status.usedPercent)}%`} />
    {onRecord || canManage || canLifecycle ? <div className="allocation-limit-row__actions">{onRecord ? <Button variant="primary" icon={FiPlus} onClick={() => onRecord(budget)}>Catat</Button> : null}{canManage ? <><Button icon={FiEdit2} onClick={() => onEdit(budget)}>Edit</Button><Button icon={FiBell} onClick={() => onReminder(budget)}>Pengingat</Button></> : null}{canLifecycle ? <Button icon={FiMoreHorizontal} onClick={() => onLifecycle(budget)}>Kelola</Button> : null}</div> : null}
  </div>;
};

const RecurringRelatedRow = ({ item }) => <div className="allocation-related-row"><div><strong>{item.name}</strong><small>{formatDateLongIndonesia(item.due_date) || item.due_date}</small></div><div><Money value={item.expected_amount} /><small>{item.status === "paid" || item.status === "received" ? "Selesai" : item.status === "overdue" ? "Terlambat" : item.due_date === todayInJakarta() ? "Menunggu konfirmasi" : "Terjadwal"}</small></div></div>;

const AllocationNeedsFundingSummary = ({ item, linkedBudgets, canAdjustAllocation, onAdjustAllocation }) => {
  const summary = allocationNeedsFundingSummary(item, linkedBudgets);
  return <>
    <div className="allocation-needs-summary" aria-label="Ringkasan kebutuhan dan dana alokasi">
      <div><span>Total kebutuhan</span><strong><Money value={summary.planned} /></strong></div>
      <div><span>Dana alokasi</span><strong><Money value={summary.allocated} /></strong></div>
      <div data-tone={summary.gap > 0 ? "warning" : "neutral"}><span>{summary.gap > 0 ? "Kurang" : "Belum direncanakan"}</span><strong><Money value={summary.gap > 0 ? summary.gap : summary.unplanned} tone={summary.gap > 0 ? "negative" : "default"} /></strong></div>
    </div>
    {summary.gap > 0 ? <div className="allocation-needs-gap" role="status">
      <div><strong>Kebutuhan melebihi dana alokasi.</strong><span>Tambahkan <Money value={summary.gap} /> bila Anda memang ingin seluruh Kebutuhan tercakup. Dana tidak berubah otomatis.</span></div>
      {canAdjustAllocation ? <Button variant="primary" icon={FiPlus} onClick={() => onAdjustAllocation(item, summary.gap)}>Tambah <Money value={summary.gap} /> ke alokasi</Button> : null}
    </div> : null}
  </>;
};

const AllocationPlanningDetail = ({
  item,
  budgets,
  linkedBudgets,
  relatedRecurring,
  canManage,
  canLifecycle,
  period,
  notify,
  refreshBudgetPlanning,
  expenseCategories,
  users,
  usersStatus,
  onBack,
  onBudgetReminder,
  onOpenRecurring,
  canAdjustAllocation,
  onAdjustAllocation,
}) => {
  const { openTransactionComposer } = useTransactionComposer();
  const usage = allocationUsage(item);
  const sourceLabel = allocationSourceLabel(item);
  const assigneeLabel = allocationAssigneeLabel(item);
  const periodLabel = allocationPeriodLabel(item.period_start, item.period_end);
  const today = todayInJakarta();
  const periodMeta = budgetPeriodMeta(period, today);
  const canRecordExpense = Boolean(item.can_record_expense && item.source_account_id)
    && (!item.period_start || today >= item.period_start)
    && (!item.period_end || today <= item.period_end);
  const budgetFormController = useBudgetFormController({ items: budgets, period, notify, refresh: refreshBudgetPlanning });
  const budgetLifecycleController = useBudgetLifecycleController({ notify, refresh: refreshBudgetPlanning, setForm: budgetFormController.setForm, setFormOpen: budgetFormController.setFormOpen });
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

  return <>
    <div className="allocation-planning-detail">
      <button type="button" className="allocation-detail-back" onClick={onBack}><FiArrowLeft aria-hidden="true" />Semua Alokasi Dana</button>
      <Card className="allocation-detail-hero">
        <div><span>Alokasi Dana</span><h2>{item.name}</h2><p>{sourceLabel} · {assigneeLabel} · {periodLabel}</p></div>
        {canRecordExpense ? <div className="allocation-detail-hero__action"><Button variant="primary" icon={FiPlus} onClick={() => recordExpense()}>Catat pengeluaran</Button></div> : null}
        <div className="allocation-detail-hero__metrics">
          <div><span>Dialokasikan</span><strong><Money value={usage.allocated} /></strong></div>
          <div><span>Terpakai</span><strong><Money value={usage.used} /></strong></div>
          <div><span>Tersisa</span><strong><Money value={item.remaining_amount} tone={Number(item.remaining_amount || 0) < 0 ? "negative" : "default"} /></strong></div>
        </div>
        {usage.reserved > 0 ? <p className="allocation-detail-reserved-note">Dipesan <Money value={usage.reserved} /> untuk transaksi terjadwal. Nilai ini sudah mengurangi dana yang tersisa.</p> : null}
      </Card>
      <div className="allocation-detail-grid">
        <Card className="allocation-detail-panel"><div className="allocation-detail-panel__header"><div><h3>Kebutuhan</h3><p>Atur kategori dan anggaran yang menggunakan Alokasi Dana ini.</p></div>{canManage ? <Button variant="primary" icon={FiPlus} onClick={openBudgetForm}>Tambah kebutuhan</Button> : null}</div>{linkedBudgets.length ? <><AllocationNeedsFundingSummary item={item} linkedBudgets={linkedBudgets} canAdjustAllocation={canAdjustAllocation} onAdjustAllocation={onAdjustAllocation} /><div className="allocation-limit-list">{linkedBudgets.map((budget) => <BudgetLimitRow key={budget.budget_id} budget={budget} periodMeta={periodMeta} canManage={canManage && budget.can_manage !== false} canLifecycle={canLifecycle} onRecord={canRecordExpense ? recordExpense : null} onEdit={editBudget} onLifecycle={budgetLifecycleController.openBudgetLifecycle} onReminder={onBudgetReminder} />)}</div></> : <EmptyState variant="inline" title="Belum ada kebutuhan" description={canManage ? "Tambahkan kebutuhan pertama agar penggunaan dana pada Alokasi ini mudah dipantau." : "Belum ada Kebutuhan yang dapat Anda kelola pada Alokasi Dana ini."} action={canManage ? <Button variant="primary" icon={FiPlus} onClick={openBudgetForm}>Tambah kebutuhan</Button> : null} />}</Card>
        <Card className="allocation-detail-panel"><div className="allocation-detail-panel__header"><div><h3>Jadwal Terkait</h3><p>Jadwal pengeluaran dengan rekening dan kategori yang terhubung ke kebutuhan pada Alokasi Dana ini.</p></div><Button onClick={onOpenRecurring}>Lihat semua jadwal</Button></div>{relatedRecurring.length ? <div className="allocation-related-list">{relatedRecurring.map((entry) => <RecurringRelatedRow key={entry.occurrence_id} item={entry} />)}</div> : <EmptyState variant="inline" title="Belum ada jadwal terkait" description="Jadwal akan muncul saat kategori Kebutuhan dipakai pada Jadwal Rutin dengan rekening sumber yang sama." />}</Card>
      </div>
    </div>
    {(budgetFormController.formOpen || budgetLifecycleController.archiveTarget) ? <Suspense fallback={null}><BudgetDialogLayer canManage={canManage} canLifecycle={canLifecycle} categories={expenseCategories} users={users} usersStatus={usersStatus} formController={budgetFormController} lifecycleController={budgetLifecycleController} lockedEnvelope={item} /></Suspense> : null}
  </>;
};

export default AllocationPlanningDetail;
