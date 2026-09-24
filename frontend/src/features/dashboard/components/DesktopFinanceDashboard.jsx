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
  const urgentAlerts = dashboardUrgentAlerts(overview.alerts);

  return (
    <div className={dashboardClass("dashboard-desktop shared-dashboard desktop-reference-dashboard")}>
      <DashboardHeader overview={overview} displayName={displayName} onOpenQuickRecord={onOpenQuickRecord} />

      <PrimaryMetrics
        overview={overview}
        model={model}
        balanceVisible={balanceVisible}
        onToggleBalance={onToggleBalance}
      />

      <section className={dashboardClass("desktop-reference-actions-section")} aria-labelledby="dashboard-quick-actions-title">
        <h2 id="dashboard-quick-actions-title">Aksi Cepat</h2>
        <DashboardQuickActions variant="desktop" />
      </section>

      <div className={dashboardClass(`desktop-reference-primary-grid${urgentAlerts.length ? "" : " desktop-reference-primary-grid--single"}`)}>
        <DashboardAttention alerts={urgentAlerts} />
        <AccountTransactions model={model} balanceVisible={balanceVisible} />
      </div>

      {setupContent}

      <section className={dashboardClass("desktop-reference-secondary")} aria-label="Ringkasan lanjutan">
        <AccountSelector
          accountBalances={model.accountBalances}
          selectedAccount={model.selectedAccount}
          onSelectAccount={onSelectAccount}
          balanceVisible={balanceVisible}
        />
        <aside className={dashboardClass("desktop-side-widgets")} aria-label="Ringkasan tambahan">
          <DashboardPlanning model={model} />
          <InvestmentWidget summary={investmentSummary} balanceVisible={balanceVisible} />
        </aside>
      </section>
    </div>
  );
};

export default DesktopFinanceDashboard;
