import { dashboardClass } from "../dashboardStyles.js";
import { buildDesktopModel } from "./desktopDashboardModel.js";
import { DashboardAttention, DashboardHeader, AccountSelector, PrimaryMetrics } from "./DesktopDashboardSummary.jsx";
import { AccountTransactions } from "./DesktopDashboardTransactions.jsx";
import { InvestmentWidget } from "./DesktopDashboardInsights.jsx";
import { DashboardPlanning } from "./DesktopDashboardPlanning.jsx";
import DashboardQuickActions from "./DashboardQuickActions.jsx";
import { dashboardUrgentAlerts } from "../dashboardPresentation.js";

const DesktopFinanceDashboard = ({
  overview,
  viewModel,
  investmentSummary,
  displayName,
  selectedAccountId,
  onSelectAccount,
  balanceVisible,
  onToggleBalance,
  onOpenQuickRecord,
  setupContent,
}) => {
  const model = buildDesktopModel({
    overview,
    viewModel,
    selectedAccountId,
    categoryFilter: "all",
    typeFilter: "all",
    searchTerm: "",
    selectedTransactionId: "",
  });
  const urgentAlerts = dashboardUrgentAlerts(model.alerts);

  return (
    <div className={dashboardClass("dashboard-desktop shared-dashboard")}>
      <DashboardHeader
        overview={overview}
        displayName={displayName}
        balanceVisible={balanceVisible}
        onToggleBalance={onToggleBalance}
        onOpenQuickRecord={onOpenQuickRecord}
      />

      <div className={dashboardClass(`desktop-overview-grid${urgentAlerts.length ? "" : " desktop-overview-grid--single"}`)}>
        <PrimaryMetrics overview={overview} model={model} balanceVisible={balanceVisible} />
        {urgentAlerts.length ? <DashboardAttention alerts={urgentAlerts} /> : null}
      </div>

      {setupContent}

      <AccountSelector
        accountBalances={model.accountBalances}
        selectedAccount={model.selectedAccount}
        onSelectAccount={onSelectAccount}
        balanceVisible={balanceVisible}
      />

      <DashboardQuickActions variant="desktop" />

      <div className={dashboardClass("desktop-lower-grid")}>
        <AccountTransactions model={model} balanceVisible={balanceVisible} />
        <aside className={dashboardClass("desktop-side-widgets")} aria-label="Ringkasan tambahan">
          <DashboardPlanning model={model} />
          <InvestmentWidget summary={investmentSummary} balanceVisible={balanceVisible} />
        </aside>
      </div>
    </div>
  );
};

export default DesktopFinanceDashboard;
