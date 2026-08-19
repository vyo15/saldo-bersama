import { lazy, Suspense } from "react";
import { FiArrowLeft, FiBell, FiEdit2, FiMoreHorizontal, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { formatDateLongIndonesia, todayInJakarta } from "../../domain/dates.js";
import { useBudgetFormController, useBudgetLifecycleController } from "../budgets/useBudgetActions.js";
import { allocationAssigneeLabel, allocationPeriodLabel, allocationSourceLabel, allocationUsage } from "./allocationPresentation.js";

const BudgetDialogLayer = lazy(() => import("../budgets/BudgetDialogLayer.jsx"));

const BudgetLimitRow = ({ budget, canManage, onEdit, onLifecycle, onReminder }) => {
  const amount = Math.max(0, Number(budget.amount || 0));
  const used = Math.max(0, Number(budget.used_amount || 0));
  const percent = amount > 0 ? Math.round((used / amount) * 100) : 0;
  return <div className="allocation-limit-row" data-budget-id={budget.budget_id}>
    <div className="allocation-limit-row__main"><div><strong>{budget.name}</strong><small><Money value={used} /> dari <Money value={amount} /></small></div><span className={percent >= 100 ? "is-danger" : percent >= Number(budget.warning_threshold || 80) ? "is-warning" : ""}>{percent}%</span></div>
    <ProgressBar value={used} max={amount} label={`Pemakaian ${budget.name}`} />
    {canManage ? <div className="allocation-limit-row__actions"><Button icon={FiEdit2} onClick={() => onEdit(budget)}>Edit</Button><Button icon={FiBell} onClick={() => onReminder(budget)}>Pengingat</Button><Button icon={FiMoreHorizontal} onClick={() => onLifecycle(budget)}>Kelola</Button></div> : null}
  </div>;
};

const RecurringRelatedRow = ({ item }) => <div className="allocation-related-row"><div><strong>{item.name}</strong><small>{formatDateLongIndonesia(item.due_date) || item.due_date}</small></div><div><Money value={item.expected_amount} /><small>{item.status === "paid" || item.status === "received" ? "Selesai" : item.status === "overdue" ? "Terlambat" : item.due_date === todayInJakarta() ? "Menunggu konfirmasi" : "Terjadwal"}</small></div></div>;

const AllocationPlanningDetail = ({
  item,
  budgets,
  linkedBudgets,
  relatedRecurring,
  canManage,
  canLifecycle,
  sharedOnly,
  period,
  notify,
  refreshBudgetPlanning,
  expenseCategories,
  users,
  usersStatus,
  onBack,
  onBudgetReminder,
  onOpenRecurring,
}) => {
  const usage = allocationUsage(item);
  const sourceLabel = allocationSourceLabel(item);
  const assigneeLabel = allocationAssigneeLabel(item);
  const periodLabel = allocationPeriodLabel(item.period_start, item.period_end);
  const budgetFormController = useBudgetFormController({ items: budgets, period, notify, refresh: refreshBudgetPlanning });
  const budgetLifecycleController = useBudgetLifecycleController({ notify, refresh: refreshBudgetPlanning, setForm: budgetFormController.setForm, setFormOpen: budgetFormController.setFormOpen });
  const openBudgetForm = () => budgetFormController.openBudgetForm({ envelope_rule_id: item.envelope_rule_id, scope: item.scope, owner_user_id: item.owner_user_id || "" });
  const editBudget = (budget) => budgetFormController.editBudget(budget, { envelope_rule_id: item.envelope_rule_id, scope: item.scope, owner_user_id: item.owner_user_id || "" });

  return <>
    <div className="allocation-planning-detail">
      <button type="button" className="allocation-detail-back" onClick={onBack}><FiArrowLeft aria-hidden="true" />Semua Kantong Dana</button>
      <Card className="allocation-detail-hero"><div><span>Kantong Dana</span><h2>{item.name}</h2><p>{sourceLabel} · {assigneeLabel} · {periodLabel}</p></div><div className="allocation-detail-hero__amount"><span>Sisa dana</span><Money value={item.remaining_amount} tone={Number(item.remaining_amount || 0) < 0 ? "negative" : "default"} /></div><div className="allocation-detail-hero__metrics"><div><span>Dana disiapkan</span><strong><Money value={usage.allocated} /></strong></div><div><span>Terpakai</span><strong><Money value={usage.used} /></strong></div><div><span>Dipesan</span><strong><Money value={usage.reserved} /></strong></div></div></Card>
      <div className="allocation-detail-grid">
        <Card className="allocation-detail-panel"><div className="allocation-detail-panel__header"><div><h3>Batas Pengeluaran</h3><p>Kategori dipakai di sini untuk mengontrol pengeluaran dari Kantong Dana ini.</p></div>{canManage ? <Button variant="primary" icon={FiPlus} onClick={openBudgetForm}>Tambah batas</Button> : null}</div>{linkedBudgets.length ? <div className="allocation-limit-list">{linkedBudgets.map((budget) => <BudgetLimitRow key={budget.budget_id} budget={budget} canManage={canManage} onEdit={editBudget} onLifecycle={budgetLifecycleController.openBudgetLifecycle} onReminder={onBudgetReminder} />)}</div> : <EmptyState variant="inline" title="Belum ada batas pengeluaran" description="Tambahkan batas untuk kategori yang ingin dijaga dari Kantong Dana ini." />}</Card>
        <Card className="allocation-detail-panel"><div className="allocation-detail-panel__header"><div><h3>Jadwal Terkait</h3><p>Jadwal pengeluaran dengan rekening dan kategori yang terhubung ke Kantong ini.</p></div><Button onClick={onOpenRecurring}>Lihat semua jadwal</Button></div>{relatedRecurring.length ? <div className="allocation-related-list">{relatedRecurring.map((entry) => <RecurringRelatedRow key={entry.occurrence_id} item={entry} />)}</div> : <EmptyState variant="inline" title="Belum ada jadwal terkait" description="Jadwal akan muncul setelah kategori batas ini dipakai pada Jadwal Rutin dengan rekening sumber yang sama." />}</Card>
      </div>
    </div>
    {(budgetFormController.formOpen || budgetLifecycleController.archiveTarget) ? <Suspense fallback={null}><BudgetDialogLayer canManage={canManage} canLifecycle={canLifecycle} sharedOnly={sharedOnly} categories={expenseCategories} users={users} usersStatus={usersStatus} formController={budgetFormController} lifecycleController={budgetLifecycleController} lockedEnvelope={item} /></Suspense> : null}
  </>;
};

export default AllocationPlanningDetail;
