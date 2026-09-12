import { dashboardClass } from "../dashboardStyles.js";
import { buildDesktopModel } from "./desktopDashboardModel.js";
import { DashboardAttention, DashboardHeader, AccountSelector, PrimaryMetrics } from "./DesktopDashboardSummary.jsx";
import { AccountTransactions } from "./DesktopDashboardTransactions.jsx";
import { InvestmentWidget, StatisticsPanel } from "./DesktopDashboardInsights.jsx";
import { DashboardPlanning } from "./DesktopDashboardPlanning.jsx";

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
  onOpenTransaction,
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
        onOpenTransaction={onOpenTransaction}
      />
      <div className={dashboardClass("desktop-overview-grid")}>
        <PrimaryMetrics overview={overview} model={model} balanceVisible={balanceVisible} />
        <DashboardAttention alerts={model.alerts} />
      </div>
      {setupContent}
      <AccountSelector
        accountBalances={model.accountBalances}
        selectedAccount={model.selectedAccount}
        onSelectAccount={onSelectAccount}
        balanceVisible={balanceVisible}
      />
      <div className={dashboardClass("shared-dashboard__layout")}>
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
        <aside className={dashboardClass("shared-dashboard__side")} aria-label="Investasi dan statistik dashboard">
          <InvestmentWidget summary={investmentSummary} balanceVisible={balanceVisible} />
          <StatisticsPanel overview={overview} model={model} balanceVisible={balanceVisible} />
        </aside>
      </div>
      <DashboardPlanning model={model} balanceVisible={balanceVisible} />
    </div>
  );
};

export default DesktopFinanceDashboard;
