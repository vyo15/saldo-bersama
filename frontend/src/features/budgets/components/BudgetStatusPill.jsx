import { FiAlertTriangle, FiCheck, FiClock, FiTrendingUp } from "react-icons/fi";
import styles from "./BudgetInsightCard.module.css";

const ICONS = Object.freeze({
  safe: FiCheck,
  pace: FiClock,
  warning: FiTrendingUp,
  danger: FiAlertTriangle,
});

const BudgetStatusPill = ({ state }) => {
  const Icon = ICONS[state.key] || FiCheck;
  return (
    <span className={`${styles.statusPill} ${styles[`statusPill_${state.key}`] || ""}`}>
      <Icon aria-hidden="true" />
      <span>{state.label}</span>
    </span>
  );
};

export default BudgetStatusPill;
