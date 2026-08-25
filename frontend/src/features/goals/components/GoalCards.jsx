import { Link } from "react-router";
import { FiArchive, FiArrowDown, FiArrowUp, FiBell, FiCheckCircle, FiEdit2, FiMoreHorizontal, FiPlus, FiRotateCcw, FiShield, FiTarget } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import CompactNotice from "../../../components/common/CompactNotice.jsx";
import Card from "../../../components/common/Card.jsx";
import Money from "../../../components/common/Money.jsx";
import ProgressBar from "../../../components/common/ProgressBar.jsx";
import EmptyState from "../../../components/feedback/EmptyState.jsx";

const GOAL_PACE_LABELS = Object.freeze({ completed: "Tercapai", on_track: "Sesuai rencana", behind: "Tertinggal", overdue: "Melewati target", no_target_date: "Tanpa tanggal target" });
const goalTypeLabel = (type) => ({ emergency_fund: "Dana darurat", sinking_fund: "Dana berkala" }[type] || "Tujuan tabungan");
const GOAL_HERO_ART = "/login/assets/mobile/piggy-bank.webp";

const summarizeGoals = (items) => {
  const active = items.filter((item) => item.status === "active");
  const totals = active.reduce((sum, item) => ({
    current: sum.current + Math.max(0, Number(item.current_amount || 0)),
    target: sum.target + Math.max(0, Number(item.target_amount || 0)),
    remaining: sum.remaining + Math.max(0, Number(item.remaining_amount || 0)),
    monthly: sum.monthly + Math.max(0, Number(item.required_monthly_amount || 0)),
    attention: sum.attention + (["behind", "overdue"].includes(item.pace_status) ? 1 : 0),
  }), { current: 0, target: 0, remaining: 0, monthly: 0, attention: 0 });
  return { ...totals, activeCount: active.length };
};

const GoalSummary = ({ items }) => {
  const summary = summarizeGoals(items);
  return (
    <Card className="goal-summary" aria-labelledby="goal-summary-title">
      <div className="goal-summary__content">
        <p className="goal-summary__eyebrow" id="goal-summary-title">Progress target aktif</p>
        <div className="goal-summary__amount"><Money value={summary.current} /></div>
        <p className="goal-summary__description">Terkumpul dari target <Money value={summary.target} />.</p>
        <div className="goal-summary__progress"><ProgressBar value={summary.current} max={summary.target} label="Progress seluruh target aktif" /></div>
        <div className="goal-summary__meta">
          <span>Sisa <strong><Money value={summary.remaining} /></strong></span>
          <span>Estimasi/bulan <strong><Money value={summary.monthly} /></strong></span>
          <span>{summary.activeCount} target aktif{summary.attention ? <> · <strong>{summary.attention} perlu perhatian</strong></> : ""}</span>
        </div>
      </div>
      <img className="goal-summary__art" src={GOAL_HERO_ART} width="900" height="873" alt="" aria-hidden="true" draggable="false" decoding="async" />
    </Card>
  );
};

const GoalActions = ({ goal, openMovement, openReverse, openEdit, openArchive, openStatusChange, openReminder }) => {
  const primaryAction = goal.can_deposit
    ? <Button className="goal-card__primary-action" variant="primary" icon={FiArrowUp} onClick={() => openMovement(goal, "deposit")}>Tambah dana</Button>
    : goal.can_complete
      ? <Button className="goal-card__primary-action" variant="primary" icon={FiCheckCircle} onClick={() => openStatusChange(goal, "completed")}>Selesaikan target</Button>
      : goal.can_reopen
        ? <Button className="goal-card__primary-action" variant="primary" icon={FiRotateCcw} onClick={() => openStatusChange(goal, "active")}>Buka kembali</Button>
        : null;
  const canRemind = goal.status === "active";
  const hasSecondaryActions = goal.can_withdraw || (goal.can_complete && goal.can_deposit) || goal.can_reverse || goal.can_update || goal.can_archive;
  if (!primaryAction && !hasSecondaryActions && !canRemind) return null;
  return (
    <div className="goal-card__actions">
      <div className="goal-card__quick-actions">{primaryAction}{canRemind ? <Button icon={FiBell} onClick={() => openReminder(goal)}>Pengingat</Button> : null}</div>
      {hasSecondaryActions ? <details className="goal-action-menu"><summary aria-label={`Kelola target ${goal.name}`}><FiMoreHorizontal aria-hidden="true" /><span>Kelola</span></summary><div className="goal-action-menu__items">{goal.can_withdraw ? <Button icon={FiArrowDown} onClick={() => openMovement(goal, "withdrawal")}>Tarik dana</Button> : null}{goal.can_complete && goal.can_deposit ? <Button icon={FiCheckCircle} onClick={() => openStatusChange(goal, "completed")}>Selesaikan target</Button> : null}{goal.can_reverse ? <Button icon={FiRotateCcw} onClick={() => openReverse(goal)}>Batalkan terakhir</Button> : null}{goal.can_update ? <Button icon={FiEdit2} onClick={() => openEdit(goal)}>Edit</Button> : null}{goal.can_archive ? <Button icon={FiArchive} onClick={() => openArchive(goal)}>Kelola data</Button> : null}</div></details> : null}
    </div>
  );
};

const GoalCard = ({ goal, actions }) => (
  <Card className="goal-card">
    <div className="goal-card__icon">{goal.goal_type === "emergency_fund" ? <FiShield /> : <FiTarget />}</div>
    <div><p className="eyebrow">{goalTypeLabel(goal.goal_type)}</p><h2>{goal.name}</h2></div>
    <Money value={goal.current_amount} />
    <ProgressBar value={goal.current_amount} max={goal.target_amount} label={goal.name} />
    <div className="goal-card__footer"><span>Target <Money value={goal.target_amount} /></span><span>{goal.target_date || "Tanpa tanggal"}</span></div>
    <dl className="goal-card__projection">
      <div><dt>Sisa</dt><dd><Money value={goal.remaining_amount || 0} /></dd></div>
      <div><dt>Estimasi/bulan</dt><dd>{goal.pace_status === "no_target_date" ? "Tetapkan tanggal" : <Money value={goal.required_monthly_amount || 0} />}</dd></div>
      <div><dt>Proyeksi</dt><dd data-pace={goal.pace_status}>{GOAL_PACE_LABELS[goal.pace_status] || goal.pace_status}</dd></div>
    </dl>
    {goal.status === "active" && goal.pace_status === "completed" ? <p className="goal-card__completion">Target tercapai. Selesaikan target untuk mengunci mutasi.</p> : null}
    {goal.deposit_blocked_reason ? <CompactNotice tone="info" title="Setoran belum tersedia">{goal.deposit_blocked_reason}</CompactNotice> : null}
    {goal.withdraw_blocked_reason ? <CompactNotice tone="info" title="Penarikan belum tersedia">{goal.withdraw_blocked_reason}</CompactNotice> : null}
    <GoalActions goal={goal} {...actions} />
  </Card>
);

const GoalGrid = ({ items, actions, canCreate, openCreate }) => (
  <section className="goal-grid">
    {items.length ? items.map((goal) => <GoalCard key={goal.goal_id} goal={goal} actions={actions} />) : (
      <EmptyState className="goal-grid__empty" icon={FiTarget} title={canCreate ? "Belum ada target keuangan" : "Belum ada rekening Bersama yang dapat digunakan"} description={canCreate ? "Buat target untuk memantau progres dana dan kebutuhan bulanan." : "Buat atau aktifkan rekening Bersama terlebih dahulu sebelum membuat Target."} action={canCreate ? <Button variant="primary" icon={FiPlus} onClick={openCreate}>Buat target pertama</Button> : <Link className="button button--primary" to="/rekening">Lihat Rekening</Link>} />
    )}
  </section>
);


export { GoalGrid, GoalSummary };
