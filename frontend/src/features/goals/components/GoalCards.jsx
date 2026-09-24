import { useRef, useState } from "react";
import { FiArchive, FiBell, FiCheckCircle, FiEdit2, FiInfo, FiMoreHorizontal, FiPlus, FiRotateCcw, FiShield, FiTarget } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import ButtonLink from "../../../components/common/ButtonLink.jsx";
import Card from "../../../components/common/Card.jsx";
import Money from "../../../components/common/Money.jsx";
import ProgressBar from "../../../components/common/ProgressBar.jsx";
import EmptyState from "../../../components/feedback/EmptyState.jsx";
import { summarizeGoals } from "../goalPresentation.js";
import styles from "./GoalCards.module.css";

const goalClass = (...values) => values.filter(Boolean).flatMap((value) => String(value).split(/\s+/)).map((name) => styles[name] || name).join(" ");

const GOAL_PACE_LABELS = Object.freeze({ completed: "Nominal tercapai", on_track: "Sesuai rencana", behind: "Tertinggal", overdue: "Melewati target", no_target_date: "Tanpa tanggal target" });
const goalTypeLabel = (type) => ({ emergency_fund: "Dana darurat", sinking_fund: "Dana berkala" }[type] || "Tujuan tabungan");
const GOAL_HERO_ART = "/login/assets/mobile/piggy-bank.webp";

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
const GoalActions = ({ goal, detailId, detailsOpen, toggleDetails, openEdit, openArchive, openStatusChange, openReminder, openFunding }) => {
  const menuRef = useRef(null);
  const closeMenuThen = (action) => {
    menuRef.current?.removeAttribute("open");
    action();
  };
  const canAdd = goal.status === "active" && (goal.can_deposit || goal.can_invest) && Number(goal.remaining_amount || 0) > 0;
  const primaryAction = canAdd
    ? <Button className={goalClass("goal-card__primary-action")} variant="primary" onClick={() => openFunding(goal)}>Tambah dana</Button>
    : goal.status === "active" && goal.can_complete
      ? <Button className={goalClass("goal-card__primary-action")} variant="primary" icon={FiCheckCircle} onClick={() => openStatusChange(goal, "completed")}>Tandai selesai</Button>
      : goal.can_reopen
        ? <Button className={goalClass("goal-card__primary-action")} variant="primary" icon={FiRotateCcw} onClick={() => openStatusChange(goal, "active")}>Buka kembali</Button>
        : null;
  const canRemind = goal.status === "active";
  return <div className={goalClass("goal-card__actions")}>
    {primaryAction}
    <details className={goalClass("goal-action-menu")} ref={menuRef}>
      <summary aria-label={`Aksi target ${goal.name}`} title="Aksi lainnya"><FiMoreHorizontal aria-hidden="true" /><span>Kelola</span></summary>
      <div className={goalClass("goal-action-menu__items")}>
        <Button icon={FiInfo} aria-expanded={detailsOpen} aria-controls={detailId} onClick={() => closeMenuThen(toggleDetails)}>{detailsOpen ? "Sembunyikan rincian" : "Lihat rincian"}</Button>
        {canRemind ? <Button icon={FiBell} onClick={() => closeMenuThen(() => openReminder(goal))}>Pengingat</Button> : null}
        {goal.can_complete && canAdd ? <Button icon={FiCheckCircle} onClick={() => closeMenuThen(() => openStatusChange(goal, "completed"))}>Selesaikan target</Button> : null}
        {goal.can_update ? <Button icon={FiEdit2} onClick={() => closeMenuThen(() => openEdit(goal))}>Edit</Button> : null}
        {goal.can_archive ? <Button icon={FiArchive} onClick={() => closeMenuThen(() => openArchive(goal))}>Hapus dari daftar</Button> : null}
      </div>
    </details>
  </div>;
};

const GoalDetails = ({ goal, detailId }) => {
  const monthlyVisible = goal.status === "active" && !goal.can_complete && goal.pace_status !== "no_target_date";
  return <div className={goalClass("goal-card__details")} id={detailId} aria-label={`Rincian target ${goal.name}`}>
    <dl>
      <div><dt>Tanggal target</dt><dd>{goal.target_date || "Tanpa tanggal target"}</dd></div>
      {monthlyVisible ? <div><dt>Estimasi / bulan</dt><dd><Money value={goal.required_monthly_amount || 0} /></dd></div> : null}
    </dl>
    <FundingBreakdown goal={goal} />
    {goal.status === "active" && goal.can_complete ? <p className={goalClass("goal-card__completion")}>Nominal target sudah tercapai. Tandai selesai saat dananya benar-benar siap direalisasikan; nilai investasi tetap dapat berubah.</p> : null}
  </div>;
};

const GoalCard = ({ goal, actions }) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const target = Math.max(0, Number(goal.target_amount || 0));
  const current = Math.max(0, Number(goal.current_amount || 0));
  const detailId = `goal-${goal.goal_id}-details`;
  return <Card className={goalClass("goal-card")} data-native-enter>
    <div className={goalClass("goal-card__heading")}><div className={goalClass("goal-card__icon")}>{goal.goal_type === "emergency_fund" ? <FiShield /> : <FiTarget />}</div><div><p className="eyebrow">{goalTypeLabel(goal.goal_type)}</p><h2>{goal.name}</h2></div></div>
    <div className={goalClass("goal-card__amount-line")}><strong><Money value={current} /> <span>/ <Money value={target} /></span></strong></div>
    <ProgressBar value={current} max={target} label={goal.name} />
    <div className={goalClass("goal-card__meta")}><span>Kurang <strong><Money value={goal.remaining_amount || 0} /></strong></span><span data-pace={goal.pace_status}>{GOAL_PACE_LABELS[goal.pace_status] || goal.pace_status}</span></div>
    <GoalActions goal={goal} detailId={detailId} detailsOpen={detailsOpen} toggleDetails={() => setDetailsOpen((value) => !value)} {...actions} />
    {detailsOpen ? <GoalDetails goal={goal} detailId={detailId} /> : null}
  </Card>;
};

const GoalGrid = ({ items, actions, canCreate, sourceLoadFailed = false, openCreate }) => <section className={goalClass("goal-grid")}>
  {items.length ? items.map((goal) => <GoalCard key={goal.goal_id} goal={goal} actions={actions} />) : <EmptyState
    className={goalClass("goal-grid__empty")}
    icon={FiTarget}
    title={sourceLoadFailed ? "Sumber dana Target belum dapat diperiksa" : canCreate ? "Belum ada target keuangan" : "Belum ada sumber dana Target"}
    description={sourceLoadFailed ? "Data investasi belum berhasil dimuat. Coba lagi dari peringatan di atas sebelum menyimpulkan belum ada sumber dana." : canCreate ? "Buat satu tujuan lalu pilih menabung lewat rekening, investasi, atau campuran." : "Siapkan rekening Bersama aktif atau portfolio investasi Bersama terlebih dahulu."}
    action={sourceLoadFailed ? null : canCreate ? <Button variant="primary" icon={FiPlus} onClick={openCreate}>Buat target pertama</Button> : <ButtonLink variant="primary" to="/rekening">Lihat sumber dana</ButtonLink>}
  />}
</section>;

export { GoalGrid, GoalSummary };
