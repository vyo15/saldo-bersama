import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { TRANSACTION_LABELS } from "../transactions/transactionPresentation.js";
import { accountDisplayLabel } from "../accounts/accountPresentation.js";
import DesktopFinanceDashboard from "./components/DesktopFinanceDashboard.jsx";
import MobileFinanceDashboard from "./components/MobileFinanceDashboard.jsx";
import MobileDashboardFilters from "./components/MobileDashboardFilters.jsx";
import MobileTransactionDetail from "./components/MobileTransactionDetail.jsx";
import { absoluteAmount } from "./dashboardPresentation.js";

const TransactionForm = lazy(() => import("../transactions/TransactionForm.jsx"));

const DashboardPage = () => {
  const { overview, bootstrap, status, error, refreshOverview, refreshAll } = useFinance();
  const { user } = useAuth();
  const [formOpen, setFormOpen] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedTransactionId, setSelectedTransactionId] = useState("");
  const [desktopAccountId, setDesktopAccountId] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileTransactionDetailOpen, setMobileTransactionDetailOpen] = useState(false);

  const dashboardViewModel = useMemo(() => {
    if (!overview) return null;

    const accountBalances = (overview.accountBalances || []).map((item) => ({
      ...item,
      account_name: item.name,
      name: accountDisplayLabel(item),
    }));
    const accountLookup = Object.fromEntries(accountBalances.map((item) => [item.account_id, item.name]));
    const categoryLookup = Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item]));
    const envelopeLookup = Object.fromEntries((overview.envelopes || []).map((item) => [item.envelope_period_id, item.name]));
    const recentTransactions = overview.recentTransactions || [];
    const query = searchTerm.trim().toLocaleLowerCase("id-ID");
    const filteredTransactions = recentTransactions.filter((item) => {
      const matchesAccount = accountFilter === "all"
        || item.source_account_id === accountFilter
        || item.destination_account_id === accountFilter;
      const matchesCategory = categoryFilter === "all" || item.category_id === categoryFilter;
      const matchesType = typeFilter === "all" || item.transaction_type === typeFilter;
      if (!matchesAccount || !matchesCategory || !matchesType) return false;
      if (!query) return true;
      const searchable = [
        item.transaction_id,
        item.description,
        item.merchant,
        accountLookup[item.source_account_id],
        accountLookup[item.destination_account_id],
        categoryLookup[item.category_id]?.name,
        TRANSACTION_LABELS[item.transaction_type],
      ].filter(Boolean).join(" ").toLocaleLowerCase("id-ID");
      return searchable.includes(query);
    });
    const selectedTransaction = filteredTransactions.find((item) => item.transaction_id === selectedTransactionId)
      || filteredTransactions[0]
      || null;
    const expenseByCategory = overview.categoryExpenses || [];
    const featuredEnvelope = overview.envelopes?.[0] || null;
    const featuredEnvelopeUsed = featuredEnvelope
      ? Number(featuredEnvelope.used_amount || 0) + Number(featuredEnvelope.reserved_amount || 0)
      : 0;
    const featuredEnvelopeMax = Number(featuredEnvelope?.allocated_amount || 0);
    const featuredEnvelopePercent = featuredEnvelopeMax > 0
      ? Math.min(100, Math.round((featuredEnvelopeUsed / featuredEnvelopeMax) * 100))
      : 0;
    const accountBars = accountBalances.slice(0, 6);
    const maxAccountBalance = Math.max(1, ...accountBars.map((item) => absoluteAmount(item.balance)));
    const expenseBars = expenseByCategory.slice(0, 7);
    const maxCategoryExpense = Math.max(1, ...expenseBars.map((item) => absoluteAmount(item.amount)));
    const activeFilterCount = [accountFilter, categoryFilter, typeFilter].filter((value) => value !== "all").length
      + (searchTerm.trim() ? 1 : 0);

    const transactionAccountLabel = (item) => {
      if (!item) return "Rekening tidak tersedia";
      if (item.transaction_type === "transfer") {
        const source = accountLookup[item.source_account_id] || "Rekening asal";
        const destination = accountLookup[item.destination_account_id] || "Rekening tujuan";
        return `${source} → ${destination}`;
      }
      return accountLookup[item.source_account_id]
        || accountLookup[item.destination_account_id]
        || "Rekening tidak tersedia";
    };

    const selectedTitle = selectedTransaction?.description
      || selectedTransaction?.merchant
      || categoryLookup[selectedTransaction?.category_id]?.name
      || "Transaksi";
    const selectedCategory = categoryLookup[selectedTransaction?.category_id]?.name || "Belum dikategorikan";
    const selectedEnvelope = selectedTransaction?.envelope_period_id
      ? envelopeLookup[selectedTransaction.envelope_period_id] || "Alokasi tidak tersedia"
      : selectedTransaction?.transaction_type === "expense" ? "Belum dialokasikan" : "Tidak menggunakan alokasi";
    const selectedEnvelopeNote = selectedTransaction?.envelope_period_id
      ? "Terhubung ke kantong aktif"
      : selectedTransaction?.transaction_type === "expense" ? "Perlu ditinjau sebelum tutup periode" : "Jenis transaksi ini tidak memerlukan kantong";
    const parsedSyncTime = new Date(overview.lastSyncedAt);
    const lastSyncedAt = Number.isNaN(parsedSyncTime.getTime())
      ? "Waktu sinkron tidak tersedia"
      : parsedSyncTime.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

    return {
      accountLookup,
      accountBalances,
      categoryLookup,
      recentTransactions,
      filteredTransactions,
      selectedTransaction,
      expenseByCategory,
      featuredEnvelope,
      featuredEnvelopeUsed,
      featuredEnvelopeMax,
      featuredEnvelopePercent,
      accountBars,
      maxAccountBalance,
      expenseBars,
      maxCategoryExpense,
      activeFilterCount,
      transactionAccountLabel,
      selectedTitle,
      selectedCategory,
      selectedEnvelope,
      selectedEnvelopeNote,
      lastSyncedAt,
    };
  }, [accountFilter, bootstrap?.categories, categoryFilter, overview, searchTerm, selectedTransactionId, typeFilter]);


  useEffect(() => {
    const accounts = overview?.accountBalances || [];
    if (!accounts.length) {
      setDesktopAccountId("");
      return;
    }
    setDesktopAccountId((current) => accounts.some((item) => item.account_id === current) ? current : accounts[0].account_id);
  }, [overview]);

  if (status === "loading" || status === "idle") return <LoadingScreen />;
  if (status === "error") return <ErrorState error={error} onRetry={refreshAll} />;
  if (!overview || !dashboardViewModel) return null;
  const displayOverview = { ...overview, accountBalances: dashboardViewModel.accountBalances };

  const displayName = String(user?.name || user?.email || "").trim().split(/\s+/)[0] || "Kamu";
  const openMobileTransactionDetail = (transactionId) => {
    setSelectedTransactionId(transactionId);
    setMobileTransactionDetailOpen(true);
  };
  const resetDashboardFilters = () => {
    setSearchTerm("");
    setAccountFilter("all");
    setCategoryFilter("all");
    setTypeFilter("all");
  };

  return (
    <div className="dashboard-page">
      <MobileFinanceDashboard
        overview={displayOverview}
        bootstrap={bootstrap}
        viewModel={dashboardViewModel}
        displayName={displayName}
        balanceVisible={balanceVisible}
        onToggleBalance={() => setBalanceVisible((current) => !current)}
        onRefresh={refreshOverview}
        onOpenTransaction={() => setFormOpen(true)}
        onOpenFilters={() => setMobileFiltersOpen(true)}
        onOpenTransactionDetail={openMobileTransactionDetail}
      />
      <DesktopFinanceDashboard
        overview={displayOverview}
        bootstrap={bootstrap}
        viewModel={dashboardViewModel}
        displayName={displayName}
        selectedAccountId={desktopAccountId}
        onSelectAccount={(accountId) => {
          setDesktopAccountId(accountId);
          setSelectedTransactionId("");
        }}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedTransactionId={selectedTransactionId}
        setSelectedTransactionId={setSelectedTransactionId}
        balanceVisible={balanceVisible}
        onToggleBalance={() => setBalanceVisible((current) => !current)}
        onRefresh={refreshOverview}
        onOpenTransaction={() => setFormOpen(true)}
      />
      <MobileDashboardFilters
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        accounts={dashboardViewModel.accountBalances}
        categories={(bootstrap?.categories || []).filter((item) => item.status === "active")}
        accountFilter={accountFilter}
        onAccountFilterChange={setAccountFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        activeFilterCount={dashboardViewModel.activeFilterCount}
        onReset={resetDashboardFilters}
      />
      <MobileTransactionDetail
        open={mobileTransactionDetailOpen}
        onClose={() => setMobileTransactionDetailOpen(false)}
        transaction={dashboardViewModel.selectedTransaction}
        title={dashboardViewModel.selectedTitle}
        category={dashboardViewModel.selectedCategory}
        accountLabel={dashboardViewModel.transactionAccountLabel(dashboardViewModel.selectedTransaction)}
        envelope={dashboardViewModel.selectedEnvelope}
        envelopeNote={dashboardViewModel.selectedEnvelopeNote}
        lastSyncedAt={dashboardViewModel.lastSyncedAt}
        balanceVisible={balanceVisible}
        onOpenTransaction={() => {
          setMobileTransactionDetailOpen(false);
          setFormOpen(true);
        }}
      />
      {formOpen ? (
        <Suspense fallback={null}>
          <TransactionForm open onClose={() => setFormOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
};

export default DashboardPage;
