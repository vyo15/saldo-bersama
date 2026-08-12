import { useState } from "react";
import { FiArchive, FiChevronRight, FiEdit2 } from "react-icons/fi";
import Button from "../../../components/common/Button.jsx";
import Money from "../../../components/common/Money.jsx";
import { categoryIcon } from "../../../shared/presentation/transaction.js";
import { userRoleLabel } from "../../../shared/presentation/user.js";
import { budgetSafeDailyAmount, budgetVisualState } from "../budgetPresentation.js";
import BudgetPacingBar from "./BudgetPacingBar.jsx";
import BudgetStatusPill from "./BudgetStatusPill.jsx";
import styles from "../BudgetsPage.module.css";

const BudgetInsightCard = ({ item, category, periodMeta, canManage, editBudget, openBudgetLifecycle, attention = false }) => {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const state = budgetVisualState(item, periodMeta);
  const Icon = categoryIcon(category?.icon, "expense");
  const safeDaily = budgetSafeDailyAmount(state.remaining, periodMeta);
  const name = item.name || category?.name || item.category_id;
  const remainingLabel = periodMeta.isCurrent ? `untuk ${periodMeta.daysLeft} hari` : "periode selesai";
  const ownershipLabel = item.scope === "personal"
    ? `${item.owner_name || "Pribadi"} · ${userRoleLabel(item.owner_role)}`
    : "Bersama";

  return (
    <article className={`${styles.budgetCard} ${styles[`budgetCard_${state.key}`] || ""}${attention ? ` ${styles.budgetCardAttention}` : ""}`} data-budget-status={state.key} data-budget-id={item.budget_id}>
      <header className={styles.cardHeader}>
        <span className={styles.categoryIcon}><Icon aria-hidden="true" /></span>
        <div className={styles.cardTitle}><strong>{name}</strong><small>{periodMeta.rangeLabel} · {ownershipLabel}</small></div>
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
        <div className={styles.detailMetric}><span>Batas aman / hari</span><strong>{periodMeta.isCurrent ? <Money value={safeDaily} /> : "—"}</strong></div>
        <div className={styles.detailMetric}><span>Ambang peringatan</span><strong>{state.warningThreshold}%</strong></div>
        {canManage ? <div className={styles.detailActions}>
          <Button type="button" icon={FiEdit2} onClick={() => editBudget(item)}>Edit</Button>
          <Button type="button" variant="danger" icon={FiArchive} onClick={() => openBudgetLifecycle(item)}>Hapus / Arsipkan</Button>
        </div> : null}
      </div> : null}
    </article>
  );
};

export default BudgetInsightCard;
