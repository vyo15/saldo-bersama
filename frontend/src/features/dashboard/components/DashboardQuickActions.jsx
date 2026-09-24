import { FiEdit3, FiPieChart, FiRepeat, FiTarget } from "react-icons/fi";
import { Link } from "react-router";
import { AccountIcon, InvestmentIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import { dashboardClass } from "../dashboardStyles.js";

const MOBILE_LINK_ACTIONS = Object.freeze([
  { to: "/perencanaan/kantong", label: "Atur Dana", icon: FiPieChart, tone: "planning" },
  { to: "/rekening", label: "Rekening", icon: AccountIcon, tone: "account" },
]);

const DESKTOP_LINK_ACTIONS = Object.freeze([
  { to: "/perencanaan/kantong", label: "Atur Dana", description: "Kelola alokasi", icon: FiPieChart, tone: "planning" },
  { to: "/target", label: "Target", description: "Atur tujuan", icon: FiTarget, tone: "goal" },
  { to: "/rekening", label: "Rekening", description: "Kelola rekening", icon: AccountIcon, tone: "account" },
  { to: "/investasi", label: "Investasi", description: "Pantau aset", icon: InvestmentIcon, tone: "investment" },
]);

const DesktopActionContent = ({ icon: Icon, label, description }) => <>
  <span><Icon aria-hidden="true" /></span>
  <span><strong>{label}</strong><small>{description}</small></span>
</>;

const DashboardQuickActions = ({ variant = "mobile", onOpenQuickRecord, onOpenTransfer }) => {
  const desktop = variant === "desktop";
  if (!desktop) {
    return (
      <nav className={dashboardClass("mobile-quick-grid")} aria-label="Akses cepat keuangan">
        <button type="button" className={dashboardClass("mobile-quick-action mobile-quick-action--record")} onClick={onOpenQuickRecord}>
          <span><FiEdit3 aria-hidden="true" /></span>
          <strong>Catat</strong>
        </button>
        <button type="button" className={dashboardClass("mobile-quick-action mobile-quick-action--transfer")} onClick={onOpenTransfer}>
          <span><FiRepeat aria-hidden="true" /></span>
          <strong>Transfer</strong>
        </button>
        {MOBILE_LINK_ACTIONS.map(({ to, label, icon: Icon, tone }) => (
          <Link key={to} to={to} className={dashboardClass(`mobile-quick-action mobile-quick-action--${tone}`)} aria-label={`Buka ${label}`}>
            <span><Icon aria-hidden="true" /></span>
            <strong>{label}</strong>
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className={dashboardClass("desktop-quick-actions")} aria-label="Aksi cepat">
      <button type="button" className={dashboardClass("desktop-quick-action desktop-quick-action--record")} onClick={onOpenQuickRecord}>
        <DesktopActionContent icon={FiEdit3} label="Catat" description="Tambah transaksi" />
      </button>
      <button type="button" className={dashboardClass("desktop-quick-action desktop-quick-action--transfer")} onClick={onOpenTransfer}>
        <DesktopActionContent icon={FiRepeat} label="Transfer" description="Kirim dana" />
      </button>
      {DESKTOP_LINK_ACTIONS.map(({ to, label, description, icon, tone }) => (
        <Link key={to} to={to} className={dashboardClass(`desktop-quick-action desktop-quick-action--${tone}`)} aria-label={`Buka ${label}`}>
          <DesktopActionContent icon={icon} label={label} description={description} />
        </Link>
      ))}
    </nav>
  );
};

export default DashboardQuickActions;
