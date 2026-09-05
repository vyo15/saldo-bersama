import { useState } from "react";
import { Link } from "react-router";
import { FiArrowRight, FiChevronRight } from "react-icons/fi";
import Money from "../../../components/common/Money.jsx";
import { categoryIcon } from "../../../shared/presentation/transaction.js";
import { userRoleLabel } from "../../../shared/presentation/user.js";
import { budgetSafeDailyAmount, budgetVisualState } from "../budgetPresentation.js";
import BudgetPacingBar from "./BudgetPacingBar.jsx";
import BudgetStatusPill from "./BudgetStatusPill.jsx";
import styles from "./BudgetInsightCard.module.css";

const BudgetInsightCard = ({ item, category, periodMeta }) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const state = budgetVisualState(item, periodMeta);
  const Icon = categoryIcon(category?.icon, "expense");
  const safeDaily = budgetSafeDailyAmount(state.remaining, periodMeta);
  const name = item.name || category?.name || item.category_id;
  const remainingLabel = periodMeta.isCurrent ? `untuk ${periodMeta.daysLeft} hari` : "periode selesai";
  const ownershipLabel = item.scope === "personal"
    ? `${item.owner_name || "Pribadi"} · ${userRoleLabel(item.owner_role)}`
    : "Bersama";
  const allocationLabel = item.envelope_name ? `Alokasi: ${item.envelope_name}` : "Belum terhubung ke Alokasi Dana";
  const manageState = { attentionSource: "dashboard", attentionBudgetId: item.budget_id };

  return (
    <article className={`${styles.budgetCard} ${styles[`budgetCard_${state.key}`] || ""}`} data-budget-status={state.key} data-budget-id={item.budget_id}>
      <header className={styles.cardHeader}>
        <span className={styles.categoryIcon}><Icon aria-hidden="true" /></span>
        <div className={styles.cardTitle}><strong>{name}</strong><small>{periodMeta.rangeLabel} · {ownershipLabel}</small><small>{allocationLabel}</small></div>
        <BudgetStatusPill state={state} />
      </header>

      <div className={styles.cardMain}>
        <div className={styles.remainingBlock}>
          <strong><Money value={state.remaining} tone={state.remaining < 0 ? "negative" : "default"} /></strong>
          <span>sisa</span>
          <small>{remainingLabel}</small>
        </div>
        <BudgetPacingBar
          usedPercent={state.usedPercent}
          elapsedPercent={periodMeta.elapsedPercent}
          isCurrent={periodMeta.isCurrent}
          state={state}
          label={`Pemakaian ${name}`}
        />
      </div>

      <div className={styles.cardStats}>
        <div><span>Terpakai</span><strong><Money value={item.used_amount} /></strong></div>
        <div><span>Anggaran</span><strong><Money value={item.amount} /></strong></div>
        <button
          type="button"
          className={`${styles.detailButton}${detailsOpen ? ` ${styles.detailButtonOpen}` : ""}`}
          onClick={() => setDetailsOpen((current) => !current)}
          aria-expanded={detailsOpen}
        >
          <span>{detailsOpen ? "Tutup" : "Detail"}</span><FiChevronRight aria-hidden="true" />
        </button>
      </div>

      {detailsOpen ? <div className={styles.cardDetails}>
        <div className={styles.detailMetric}><span>Aman / hari</span><strong>{periodMeta.isCurrent ? <Money value={safeDaily} /> : "—"}</strong></div>
        <div className={styles.detailMetric}><span>Peringatan</span><strong>{state.warningThreshold}%</strong></div>
        {periodMeta.isCurrent ? <div className={styles.detailActions}><Link className="button button--secondary" to="/perencanaan/kantong" state={manageState}>Kelola di Alokasi Dana <FiArrowRight aria-hidden="true" /></Link></div> : null}
      </div> : null}
    </article>
  );
};

export default BudgetInsightCard;
