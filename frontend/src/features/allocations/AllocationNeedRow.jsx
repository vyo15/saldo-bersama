import { FiArrowRight, FiCalendar, FiCheck, FiCheckCircle, FiEdit2, FiInfo, FiMoreHorizontal, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Money from "../../components/common/Money.jsx";
import Modal from "../../components/common/Modal.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import { formatDateTimeJakarta } from "../../domain/dates.js";
import { budgetRemainingAmount, budgetVisualState } from "../../shared/presentation/budget.js";
import { categoryIcon } from "../../shared/presentation/transaction.js";
import { allocationClass } from "./allocationStyles.js";

const COMPLETED_RECURRING_STATUSES = new Set(["paid", "received"]);

const closeNeedMenu = (event) => event.currentTarget.closest("details")?.removeAttribute("open");

const budgetRecordingLabel = (recordingMode, { long = false } = {}) => {
  if (recordingMode === "fixed_once") return "Sekali bayar";
  if (recordingMode === "recurring") return "Rutin";
  return long ? "Bisa dipakai beberapa kali" : "Fleksibel";
};

const budgetStatusTone = (status) => {
  if (status.key === "danger") return "is-danger";
  if (["warning", "pace", "empty"].includes(status.key)) return "is-warning";
  if (status.key === "completed") return "is-completed";
  return "";
};

const budgetProgressTone = (status) => {
  if (status.key === "danger") return "danger";
  if (status.key === "empty") return "warning";
  return "default";
};

const BudgetNeedPrimaryAction = ({ budget, schedule, onRecord, onOpenSchedule }) => {
  if (!schedule && !onRecord) return null;
  const isScheduleAction = Boolean(schedule);
  const primaryLabel = isScheduleAction ? (schedule.canPay ? "Bayar" : "Lihat jadwal") : "Catat pengeluaran";
  const visibleLabel = isScheduleAction ? (schedule.canPay ? "Bayar" : "Jadwal") : "Catat";
  const PrimaryIcon = isScheduleAction ? FiArrowRight : FiPlus;
  const handleClick = isScheduleAction
    ? () => onOpenSchedule(schedule.item, schedule.canPay)
    : () => onRecord?.(budget);
  return <button
    type="button"
    className={allocationClass("allocation-limit-row__quick-action")}
    aria-label={`${primaryLabel} ${budget.name}`}
    title={primaryLabel}
    onClick={handleClick}
  ><span className={allocationClass("allocation-limit-row__quick-action-icon")}><PrimaryIcon aria-hidden="true" /></span><span>{visibleLabel}</span></button>;
};

const BudgetNeedOverflowMenu = ({ budget, schedule, blockedByLimit, canManage, onOpenSchedule, onEdit, onOpenDetail }) => {
  const showSchedule = blockedByLimit && Boolean(schedule);
  const hasMenu = Boolean(onOpenDetail || canManage || showSchedule);
  if (!hasMenu) return null;
  return <details className={allocationClass("allocation-limit-row__menu")}>
    <summary aria-label={`Pilihan kebutuhan ${budget.name}`} title="Pilihan kebutuhan"><FiMoreHorizontal aria-hidden="true" /></summary>
    <div className={allocationClass("allocation-limit-row__menu-items")}>
      {onOpenDetail ? <Button icon={FiInfo} onClick={(event) => { closeNeedMenu(event); onOpenDetail(); }}>Detail kebutuhan</Button> : null}
      {showSchedule ? <Button icon={FiCalendar} onClick={(event) => { closeNeedMenu(event); onOpenSchedule(schedule.item, false); }}>Lihat jadwal</Button> : null}
      {canManage ? <Button icon={FiEdit2} onClick={(event) => { closeNeedMenu(event); onEdit(budget); }}>Edit kebutuhan</Button> : null}
    </div>
  </details>;
};

const BudgetLimitActions = ({ budget, schedule, status, canManage, onRecord, onOpenSchedule, onEdit, onOpenDetail }) => {
  const blockedByLimit = ["completed", "empty", "danger"].includes(status.key);
  const depleted = status.key === "empty";
  const primarySchedule = blockedByLimit ? null : schedule;
  const primaryRecord = blockedByLimit ? null : onRecord;
  const hasPrimaryAction = Boolean(primarySchedule || primaryRecord);
  const hasOverflowAction = Boolean(onOpenDetail || canManage || (blockedByLimit && schedule));
  if (!hasPrimaryAction && !hasOverflowAction && !depleted) return null;
  return <div className={allocationClass(`allocation-limit-row__actions ${hasPrimaryAction ? "has-primary" : ""}`)}>
    <BudgetNeedPrimaryAction budget={budget} schedule={primarySchedule} onRecord={primaryRecord} onOpenSchedule={onOpenSchedule} />
    {depleted ? <span className={allocationClass("allocation-limit-row__depleted-stamp")} aria-label="Dana habis">Habis</span> : null}
    <BudgetNeedOverflowMenu budget={budget} schedule={schedule} blockedByLimit={blockedByLimit} canManage={canManage} onOpenSchedule={onOpenSchedule} onEdit={onEdit} onOpenDetail={onOpenDetail} />
  </div>;
};

const BudgetCompletedMeta = ({ amount }) => <span className={allocationClass("allocation-limit-row__completed-meta")}>
  <FiCheckCircle aria-hidden="true" /><strong>Selesai</strong><span aria-hidden="true">·</span><Money value={amount} /><span>terpenuhi</span>
</span>;

const BudgetLimitUsage = ({ budget, status, schedule, amount, used, remaining }) => {
  const depleted = status.key === "empty";
  if (depleted) return <div className={allocationClass("allocation-limit-row__content")}>
    <p className={allocationClass("allocation-limit-row__depleted-meta")}><strong><Money value={used} /> sudah terpakai</strong><span>Tidak ada dana tersedia</span></p>
  </div>;
  const usedPercent = Math.max(0, Math.round(status.usedPercent));
  return <div className={allocationClass("allocation-limit-row__content")}>
    <p className={allocationClass("allocation-limit-row__balance")}><strong><Money value={remaining} /> <span>sisa</span></strong><span>dari <Money value={amount} /></span></p>
    <div className={allocationClass("allocation-limit-row__progress")}>
      <ProgressBar value={used} max={amount} tone={budgetProgressTone(status)} label={`Pemakaian ${budget.name} ${usedPercent}%`} />
      {schedule?.label ? <span className={allocationClass("allocation-limit-row__usage")}>{schedule.label}</span> : null}
    </div>
  </div>;
};

export const BudgetLimitRow = ({ budget, category, periodMeta, schedule, canManage, onRecord, onOpenSchedule, onEdit, onOpenDetail }) => {
  const amount = Math.max(0, Number(budget.amount || 0));
  const used = Math.max(0, Number(budget.used_amount || 0));
  const status = budgetVisualState(budget, periodMeta);
  const completed = status.key === "completed";
  const depleted = status.key === "empty";
  const tone = budgetStatusTone(status);
  const CategoryIcon = categoryIcon(category?.icon, "expense");
  const remaining = budgetRemainingAmount(budget);
  const patternLabel = budgetRecordingLabel(budget.recording_mode);
  const recordAction = remaining <= 0 ? null : onRecord;
  return <div className={allocationClass(`allocation-limit-row ${completed ? "is-completed" : ""} ${depleted ? "is-depleted" : ""}`)} data-budget-id={budget.budget_id}>
    <div className={allocationClass("allocation-limit-row__header")}>
      <span className={allocationClass("allocation-limit-row__icon")}><CategoryIcon aria-hidden="true" />{completed ? <i className={allocationClass("allocation-limit-row__icon-check")}><FiCheck aria-hidden="true" /></i> : null}</span>
      <div className={allocationClass(`allocation-limit-row__title ${completed ? "is-completed" : ""}`)}>
        <strong>{budget.name}</strong>
        {completed ? <BudgetCompletedMeta amount={amount} /> : <span className={allocationClass(`allocation-limit-row__pattern ${status.attention && !depleted ? tone : ""}`)}>{depleted ? patternLabel : status.attention ? status.label : patternLabel}</span>}
      </div>
      <BudgetLimitActions budget={budget} schedule={schedule} status={status} canManage={canManage} onRecord={recordAction} onOpenSchedule={onOpenSchedule} onEdit={onEdit} onOpenDetail={onOpenDetail} />
    </div>
    {completed ? null : <BudgetLimitUsage budget={budget} status={status} schedule={schedule} amount={amount} used={used} remaining={remaining} />}
  </div>;
};

export const BudgetNeedDetailModal = ({ target, onClose }) => {
  if (!target) return null;
  const { budget, category, schedule, periodMeta } = target;
  const status = budgetVisualState(budget, periodMeta);
  const amount = Math.max(0, Number(budget.amount || 0));
  const used = Math.max(0, Number(budget.used_amount || 0));
  const remaining = budgetRemainingAmount(budget);
  const patternLabel = budgetRecordingLabel(budget.recording_mode, { long: true });
  const completedAt = schedule && COMPLETED_RECURRING_STATUSES.has(schedule.item?.status)
    ? formatDateTimeJakarta(schedule.item?.updated_at, { fallback: "" })
    : "";
  const statusLabel = status.key === "safe" ? "Aktif" : status.label;
  return <Modal open title="Detail kebutuhan" description={budget.name} onClose={onClose} size="sm">
    <article className={allocationClass("allocation-need-detail")}>
      <header className={allocationClass("allocation-need-detail__summary")}>
        <span className={allocationClass(`allocation-need-detail__status is-${status.key}`)}>{status.key === "completed" ? <FiCheckCircle aria-hidden="true" /> : null}{statusLabel}</span>
        {category?.name ? <span>{category.name}</span> : null}
      </header>
      <dl className={allocationClass("allocation-need-detail__facts")}>
        <div><dt>Rencana</dt><dd><Money value={amount} /></dd></div>
        <div><dt>Terpakai</dt><dd><Money value={used} /></dd></div>
        <div><dt>Sisa</dt><dd><Money value={remaining} /></dd></div>
        <div><dt>Pola</dt><dd>{patternLabel}</dd></div>
        {completedAt ? <div><dt>Selesai pada</dt><dd>{completedAt}</dd></div> : null}
        {schedule?.label ? <div><dt>Jadwal</dt><dd>{schedule.label}</dd></div> : null}
      </dl>
    </article>
  </Modal>;
};
