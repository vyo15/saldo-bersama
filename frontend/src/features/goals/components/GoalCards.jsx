import { FiArchive, FiBell, FiCheckCircle, FiEdit2, FiMoreHorizontal, FiPlus, FiRotateCcw, FiShield, FiTarget } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import ButtonLink from "../../../components/common/ButtonLink.jsx";
import Card from "../../../components/common/Card.jsx";
import Money from "../../../components/common/Money.jsx";
import ProgressBar from "../../../components/common/ProgressBar.jsx";
import EmptyState from "../../../components/feedback/EmptyState.jsx";
import styles from "./GoalCards.module.css";

const goalClass = (...values) => values.filter(Boolean).flatMap((value) => String(value).split(/\s+/)).map((name) => styles[name] || name).join(" ");

const GOAL_PACE_LABELS = Object.freeze({ completed: "Nominal tercapai", on_track: "Sesuai rencana", behind: "Tertinggal", overdue: "Melewati target", no_target_date: "Tanpa tanggal target" });
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
  return <Card className={goalClass("goal-summary")} aria-labelledby="goal-summary-title">
    <div className={goalClass("goal-summary__content")}>
      <p className={goalClass("goal-summary__eyebrow")} id="goal-summary-title">Progress target aktif</p>
      <div className={goalClass("goal-summary__amount")}><Money value={summary.current} /></div>
      <p className={goalClass("goal-summary__description")}>Nilai saat ini dari target <Money value={summary.target} />.</p>
      <div className={goalClass("goal-summary__progress")}><ProgressBar value={summary.current} max={summary.target} label="Progress seluruh target aktif" /></div>
      <div className={goalClass("goal-summary__meta")}>
        <span>Sisa <strong><Money value={summary.remaining} /></strong></span>
        <span>Estimasi/bulan <strong><Money value={summary.monthly} /></strong></span>
        <span>{summary.activeCount} target aktif{summary.attention ? <> · <strong>{summary.attention} perlu perhatian</strong></> : ""}</span>
      </div>
    </div>
    <img className={goalClass("goal-summary__art")} src={GOAL_HERO_ART} width="900" height="873" alt="" aria-hidden="true" draggable="false" decoding="async" />
  </Card>;
};

const FundingBreakdown = ({ goal }) => {
  const mode = String(goal.funding_mode || "cash");
  const showCash = ["cash", "mixed"].includes(mode);
  const showInvestment = ["investment", "mixed"].includes(mode);
  const retained = Math.max(0, Number(goal.investment_cash || 0));
  const result = Number(goal.investment_result || 0);
  if (!showCash && !showInvestment) return null;
  return <div className={goalClass("goal-card__funding")} aria-label="Sumber progress Target">
    {showCash ? <span>Tunai <strong><Money value={goal.cash_amount || 0} /></strong></span> : null}
    {showInvestment ? <span>Investasi <strong><Money value={goal.investment_market_value || 0} /></strong></span> : null}
    {retained > 0 ? <span>Hasil jual <strong><Money value={retained} /></strong></span> : null}
    {showInvestment && result !== 0 ? <span data-tone={result > 0 ? "positive" : "negative"}>Hasil <strong>{result > 0 ? "+" : ""}<Money value={result} /></strong></span> : null}
  </div>;
};

// Primary and lifecycle actions are deliberately resolved in one place so every card follows the same policy.
// eslint-disable-next-line complexity
const GoalActions = ({ goal, openEdit, openArchive, openStatusChange, openReminder, openFunding }) => {
  const canAdd = goal.status === "active" && (goal.can_deposit || goal.can_invest) && Number(goal.remaining_amount || 0) > 0;
  const primaryAction = canAdd
    ? <Button className={goalClass("goal-card__primary-action")} variant="primary" onClick={() => openFunding(goal)}>Tambah dana</Button>
    : goal.status === "active" && goal.can_complete
      ? <Button className={goalClass("goal-card__primary-action")} variant="primary" icon={FiCheckCircle} onClick={() => openStatusChange(goal, "completed")}>Tandai selesai</Button>
      : goal.can_reopen
        ? <Button className={goalClass("goal-card__primary-action")} variant="primary" icon={FiRotateCcw} onClick={() => openStatusChange(goal, "active")}>Buka kembali</Button>
        : null;
  const canRemind = goal.status === "active";
  const hasSecondaryActions = goal.can_complete || goal.can_update || goal.can_archive;
  if (!primaryAction && !hasSecondaryActions && !canRemind) return null;
  return <div className={goalClass("goal-card__actions")}>
    {primaryAction}
    {(hasSecondaryActions || canRemind) ? <details className={goalClass("goal-action-menu")}><summary aria-label={`Kelola target ${goal.name}`} title="Aksi lainnya"><FiMoreHorizontal aria-hidden="true" /><span>Kelola</span></summary><div className={goalClass("goal-action-menu__items")}>{canRemind ? <Button icon={FiBell} onClick={() => openReminder(goal)}>Pengingat</Button> : null}{goal.can_complete && canAdd ? <Button icon={FiCheckCircle} onClick={() => openStatusChange(goal, "completed")}>Selesaikan target</Button> : null}{goal.can_update ? <Button icon={FiEdit2} onClick={() => openEdit(goal)}>Edit</Button> : null}{goal.can_archive ? <Button icon={FiArchive} onClick={() => openArchive(goal)}>Hapus dari daftar</Button> : null}</div></details> : null}
  </div>;
};

const GoalCard = ({ goal, actions }) => {
  const target = Math.max(0, Number(goal.target_amount || 0));
  const current = Math.max(0, Number(goal.current_amount || 0));
  const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return <Card className={goalClass("goal-card")} data-native-enter>
    <div className={goalClass("goal-card__heading")}><div className={goalClass("goal-card__icon")}>{goal.goal_type === "emergency_fund" ? <FiShield /> : <FiTarget />}</div><div><p className="eyebrow">{goalTypeLabel(goal.goal_type)}</p><h2>{goal.name}</h2></div></div>
    <div className={goalClass("goal-card__amount-line")}><strong><Money value={current} /> <span>/ <Money value={target} /></span></strong><em>{percent}%</em></div>
    <ProgressBar value={current} max={target} label={goal.name} />
    <FundingBreakdown goal={goal} />
    <div className={goalClass("goal-card__meta")}><span>Kurang <strong><Money value={goal.remaining_amount || 0} /></strong></span><span>{goal.target_date || "Tanpa tanggal"}</span><span data-pace={goal.pace_status}>{GOAL_PACE_LABELS[goal.pace_status] || goal.pace_status}</span></div>
    {goal.status === "active" && !goal.can_complete && goal.pace_status !== "no_target_date" ? <p className={goalClass("goal-card__monthly")}>Estimasi/bulan <strong><Money value={goal.required_monthly_amount || 0} /></strong></p> : null}
    {goal.status === "active" && goal.can_complete ? <p className={goalClass("goal-card__completion")}>Nilai Target sudah mencapai tujuan. Tandai selesai saat dananya benar-benar siap direalisasikan; nilai investasi tetap dapat berubah.</p> : null}
    <GoalActions goal={goal} {...actions} />
  </Card>;
};

const GoalGrid = ({ items, actions, canCreate, openCreate }) => <section className={goalClass("goal-grid")}>
  {items.length ? items.map((goal) => <GoalCard key={goal.goal_id} goal={goal} actions={actions} />) : <EmptyState className={goalClass("goal-grid__empty")} icon={FiTarget} title={canCreate ? "Belum ada target keuangan" : "Belum ada sumber dana Target"} description={canCreate ? "Buat satu tujuan lalu pilih menabung lewat rekening, investasi, atau campuran." : "Siapkan rekening Bersama aktif atau portfolio investasi Bersama terlebih dahulu."} action={canCreate ? <Button variant="primary" icon={FiPlus} onClick={openCreate}>Buat target pertama</Button> : <ButtonLink variant="primary" to="/rekening">Lihat sumber dana</ButtonLink>} />}
</section>;

export { GoalGrid, GoalSummary };
