import { FiCheckCircle, FiTarget } from "react-icons/fi";
import { Link } from "react-router";
import { AccountIcon, InvestmentIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import { dashboardClass } from "../dashboardStyles.js";

const DASHBOARD_QUICK_ACTIONS = Object.freeze([
  { to: "/rekening", label: "Rekening", description: "Lihat saldo fisik", icon: AccountIcon, tone: "account" },
  { to: "/target", label: "Target", description: "Pantau tujuan keuangan", icon: FiTarget, tone: "goal" },
  { to: "/investasi", label: "Investasi", description: "Pantau aset investasi", icon: InvestmentIcon, tone: "investment" },
  { to: "/rekonsiliasi", label: "Cocokkan", description: "Samakan saldo aktual", icon: FiCheckCircle, tone: "reconciliation" },
]);

const DashboardQuickActions = ({ variant = "mobile" }) => {
  const desktop = variant === "desktop";
  return (
    <nav
      className={dashboardClass(desktop ? "desktop-quick-actions" : "mobile-quick-grid")}
      aria-label="Akses cepat keuangan"
    >
      {DASHBOARD_QUICK_ACTIONS.map(({ to, label, description, icon: Icon, tone }) => (
        <Link
          key={to}
          to={to}
          className={dashboardClass(desktop ? `desktop-quick-action desktop-quick-action--${tone}` : `mobile-quick-action mobile-quick-action--${tone}`)}
          aria-label={`Buka ${label}`}
        >
          <span><Icon aria-hidden="true" /></span>
          {desktop ? <span><strong>{label}</strong><small>{description}</small></span> : <strong>{label}</strong>}
        </Link>
      ))}
    </nav>
  );
};

export default DashboardQuickActions;
