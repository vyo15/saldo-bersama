import { dashboardClass } from "../dashboardStyles.js";
import { buildDesktopModel } from "./desktopDashboardModel.js";
import { DashboardAttention, DashboardHeader, AccountSelector, PrimaryMetrics } from "./DesktopDashboardSummary.jsx";
import { AccountTransactions } from "./DesktopDashboardTransactions.jsx";
import { InvestmentWidget, StatisticsPanel } from "./DesktopDashboardInsights.jsx";
import { DashboardPlanning } from "./DesktopDashboardPlanning.jsx";
import DashboardQuickActions from "./DashboardQuickActions.jsx";

const DesktopFinanceDashboard = ({
  overview,
  bootstrap,
  viewModel,
  investmentSummary,
  displayName,
  selectedAccountId,
  onSelectAccount,
  categoryFilter,
  setCategoryFilter,
  typeFilter,
  setTypeFilter,
  searchTerm,
  setSearchTerm,
  selectedTransactionId,
  setSelectedTransactionId,
  balanceVisible,
  onToggleBalance,
  onOpenQuickRecord,
  setupContent,
}) => {
  const model = buildDesktopModel({
    overview,
    viewModel,
    selectedAccountId,
    categoryFilter,
    typeFilter,
    searchTerm,
    selectedTransactionId,
  });

  return (
    <div className={dashboardClass("dashboard-desktop shared-dashboard")}>
      <DashboardHeader
        overview={overview}
        displayName={displayName}
        balanceVisible={balanceVisible}
        onToggleBalance={onToggleBalance}
        onOpenQuickRecord={onOpenQuickRecord}
      />

      <div className={dashboardClass("desktop-overview-grid")}>
        <PrimaryMetrics overview={overview} model={model} balanceVisible={balanceVisible} />
        <DashboardAttention alerts={model.alerts} />
      </div>

      {setupContent}
      <DashboardQuickActions variant="desktop" />

      <section className={dashboardClass("desktop-analysis-section")} aria-labelledby="desktop-analysis-title">
        <div className={dashboardClass("desktop-analysis-section__heading")}>
          <div>
            <h2 id="desktop-analysis-title">Apa yang paling memengaruhi kondisi keuangan?</h2>
          </div>
        </div>
        <div className={dashboardClass(`desktop-analysis-grid${investmentSummary ? "" : " desktop-analysis-grid--single"}`)}>
          <StatisticsPanel overview={overview} model={model} balanceVisible={balanceVisible} />
          <InvestmentWidget summary={investmentSummary} balanceVisible={balanceVisible} />
        </div>
      </section>

      <AccountSelector
        accountBalances={model.accountBalances}
        selectedAccount={model.selectedAccount}
        onSelectAccount={onSelectAccount}
        balanceVisible={balanceVisible}
      />

      <AccountTransactions
        model={model}
        bootstrap={bootstrap}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        setSelectedTransactionId={setSelectedTransactionId}
        balanceVisible={balanceVisible}
      />

      <DashboardPlanning model={model} balanceVisible={balanceVisible} />
    </div>
  );
};

export default DesktopFinanceDashboard;
