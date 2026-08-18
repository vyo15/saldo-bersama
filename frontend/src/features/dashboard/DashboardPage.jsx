import "./DashboardPage.css";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useTransactionComposer } from "../../app/TransactionComposerContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { TRANSACTION_TYPES } from "../../domain/constants.js";
import { TRANSACTION_LABELS } from "../../shared/presentation/transaction.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { absoluteAmount } from "./dashboardPresentation.js";

const DesktopFinanceDashboard = lazy(() => import("./components/DesktopFinanceDashboard.jsx"));
const MobileFinanceDashboard = lazy(() => import("./components/MobileFinanceDashboard.jsx"));
const MobileTransactionDetail = lazy(() => import("./components/MobileTransactionDetail.jsx"));

const MOBILE_DASHBOARD_QUERY = "(max-width: 820px)";
const useMobileDashboardLayout = () => useMediaQuery(MOBILE_DASHBOARD_QUERY);

const buildLookups = (overview, bootstrap) => {
  const accountBalances = (overview.accountBalances || []).map((item) => ({ ...item, account_name: item.name, name: accountDisplayLabel(item) }));
  return {
    accountBalances,
    accountLookup: Object.fromEntries(accountBalances.map((item) => [item.account_id, item.name])),
    categoryLookup: Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item])),
    envelopeLookup: Object.fromEntries((overview.envelopes || []).map((item) => [item.envelope_period_id, item.name])),
  };
};

const matchesTransactionFilters = ({ item, accountFilter, categoryFilter, typeFilter }) => {
  const matchesAccount = accountFilter === "all" || item.source_account_id === accountFilter || item.destination_account_id === accountFilter;
  return matchesAccount && (categoryFilter === "all" || item.category_id === categoryFilter) && (typeFilter === "all" || item.transaction_type === typeFilter);
};

const transactionSearchText = (item, lookups) => [item.transaction_id, item.description, item.merchant, lookups.accountLookup[item.source_account_id], lookups.accountLookup[item.destination_account_id], lookups.categoryLookup[item.category_id]?.name, TRANSACTION_LABELS[item.transaction_type]].filter(Boolean).join(" ").toLocaleLowerCase("id-ID");
const filterTransactions = (items, filters, lookups) => { const query = filters.searchTerm.trim().toLocaleLowerCase("id-ID"); return items.filter((item) => matchesTransactionFilters({ item, ...filters }) && (!query || transactionSearchText(item, lookups).includes(query))); };

const buildDashboardMetrics = (overview, accountBalances) => {
  const expenseByCategory = overview.categoryExpenses || [];
  const envelopes = overview.envelopes || [];
  const allocationAllocated = envelopes.reduce((sum, item) => sum + Number(item.allocated_amount || 0), 0);
  const allocationCommitted = envelopes.reduce((sum, item) => sum + Number(item.used_amount || 0) + Number(item.reserved_amount || 0), 0);
  const allocationRemaining = envelopes.reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0);
  const allocationAttentionCount = (overview.alerts || []).filter((item) => item.type === "envelope_threshold").length;
  const allocationSummary = {
    count: envelopes.length,
    allocated: allocationAllocated,
    committed: allocationCommitted,
    remaining: allocationRemaining,
    attentionCount: allocationAttentionCount,
    percentage: allocationAllocated > 0 ? Math.round((allocationCommitted / allocationAllocated) * 100) : 0,
  };
  const accountBars = accountBalances.slice(0, 6); const expenseBars = expenseByCategory.slice(0, 7);
  return { expenseByCategory, allocationSummary, accountBars, maxAccountBalance: Math.max(1, ...accountBars.map((item) => absoluteAmount(item.balance))), expenseBars, maxCategoryExpense: Math.max(1, ...expenseBars.map((item) => absoluteAmount(item.amount))) };
};

const transactionAccountLabelFactory = (accountLookup) => (item) => {
  if (!item) return "Rekening tidak tersedia";
  if (item.transaction_type === "transfer") return `${accountLookup[item.source_account_id] || "Rekening asal"} → ${accountLookup[item.destination_account_id] || "Rekening tujuan"}`;
  return accountLookup[item.source_account_id] || accountLookup[item.destination_account_id] || "Rekening tidak tersedia";
};

const selectedTransactionPresentation = ({ selectedTransaction, categoryLookup, envelopeLookup }) => {
  const selectedTitle = selectedTransaction?.description || selectedTransaction?.merchant || categoryLookup[selectedTransaction?.category_id]?.name || "Transaksi";
  const selectedCategory = categoryLookup[selectedTransaction?.category_id]?.name || "Belum dikategorikan";
  const hasEnvelope = Boolean(selectedTransaction?.envelope_period_id); const expense = selectedTransaction?.transaction_type === "expense";
  return {
    selectedTitle,
    selectedCategory,
    selectedEnvelope: hasEnvelope ? envelopeLookup[selectedTransaction.envelope_period_id] || "Alokasi tidak tersedia" : expense ? "Belum dialokasikan" : "Tidak menggunakan alokasi",
    selectedEnvelopeNote: hasEnvelope ? "Terhubung ke kantong aktif" : expense ? "Perlu ditinjau sebelum tutup periode" : "Jenis transaksi ini tidak memerlukan kantong",
  };
};

const syncLabel = (value) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "Waktu sinkron tidak tersedia" : parsed.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }); };

const createDashboardViewModel = ({ overview, bootstrap, filters }) => {
  if (!overview) return null;
  const lookups = buildLookups(overview, bootstrap); const recentTransactions = overview.recentTransactions || [];
  const filteredTransactions = filterTransactions(recentTransactions, filters, lookups);
  const selectedTransaction = filteredTransactions.find((item) => item.transaction_id === filters.selectedTransactionId) || filteredTransactions[0] || null;
  const mobileSelectedTransaction = recentTransactions.find((item) => item.transaction_id === filters.selectedTransactionId) || recentTransactions[0] || null;
  const metrics = buildDashboardMetrics(overview, lookups.accountBalances);
  const selected = selectedTransactionPresentation({ selectedTransaction, categoryLookup: lookups.categoryLookup, envelopeLookup: lookups.envelopeLookup });
  const mobileSelected = selectedTransactionPresentation({ selectedTransaction: mobileSelectedTransaction, categoryLookup: lookups.categoryLookup, envelopeLookup: lookups.envelopeLookup });
  const activeFilterCount = [filters.accountFilter, filters.categoryFilter, filters.typeFilter].filter((value) => value !== "all").length + (filters.searchTerm.trim() ? 1 : 0);
  return { ...lookups, recentTransactions, filteredTransactions, selectedTransaction, mobileSelectedTransaction, ...metrics, activeFilterCount, transactionAccountLabel: transactionAccountLabelFactory(lookups.accountLookup), ...selected, mobileSelectedTitle: mobileSelected.selectedTitle, mobileSelectedCategory: mobileSelected.selectedCategory, mobileSelectedEnvelope: mobileSelected.selectedEnvelope, mobileSelectedEnvelopeNote: mobileSelected.selectedEnvelopeNote, lastSyncedAt: syncLabel(overview.lastSyncedAt) };
};

const useDesktopAccountSelection = (overview) => {
  const [desktopAccountId, setDesktopAccountId] = useState("");
  useEffect(() => { const accounts = overview?.accountBalances || []; if (!accounts.length) { setDesktopAccountId(""); return; } setDesktopAccountId((current) => accounts.some((item) => item.account_id === current) ? current : accounts[0].account_id); }, [overview]);
  return [desktopAccountId, setDesktopAccountId];
};

const MobileDashboardOverlays = ({ mobileTransactionDetailOpen, setMobileTransactionDetailOpen, dashboardViewModel, balanceVisible, openTransactionComposer }) => <>{mobileTransactionDetailOpen ? (<Suspense fallback={null}><MobileTransactionDetail open onClose={() => setMobileTransactionDetailOpen(false)} transaction={dashboardViewModel.mobileSelectedTransaction} title={dashboardViewModel.mobileSelectedTitle} category={dashboardViewModel.mobileSelectedCategory} accountLabel={dashboardViewModel.transactionAccountLabel(dashboardViewModel.mobileSelectedTransaction)} envelope={dashboardViewModel.mobileSelectedEnvelope} envelopeNote={dashboardViewModel.mobileSelectedEnvelopeNote} lastSyncedAt={dashboardViewModel.lastSyncedAt} balanceVisible={balanceVisible} onOpenTransaction={() => { setMobileTransactionDetailOpen(false); openTransactionComposer(); }} /></Suspense>) : null}</>;

const DashboardSurfaces = ({ mobileLayout, displayOverview, bootstrap, dashboardViewModel, user, displayName, balanceVisible, setBalanceVisible, refreshOverview, isRefreshing, openTransactionComposer, openMobileTransactionDetail, desktopAccountId, setDesktopAccountId, filters, setters }) => {
  const openMobileTransaction = (initialType) => openTransactionComposer({
    initialType,
    presentation: initialType === TRANSACTION_TYPES.TRANSFER ? "mobile-transfer" : "default",
  });

  return (
    <Suspense fallback={<LoadingScreen />}>
      {mobileLayout
        ? <MobileFinanceDashboard overview={displayOverview} viewModel={dashboardViewModel} user={user} displayName={displayName} balanceVisible={balanceVisible} onToggleBalance={() => setBalanceVisible((current) => !current)} onRefresh={refreshOverview} isRefreshing={isRefreshing} onOpenTransaction={openMobileTransaction} onOpenTransactionDetail={openMobileTransactionDetail} />
        : <DesktopFinanceDashboard overview={displayOverview} bootstrap={bootstrap} viewModel={dashboardViewModel} displayName={displayName} selectedAccountId={desktopAccountId} onSelectAccount={(accountId) => { setDesktopAccountId(accountId); setters.setSelectedTransactionId(""); }} categoryFilter={filters.categoryFilter} setCategoryFilter={setters.setCategoryFilter} typeFilter={filters.typeFilter} setTypeFilter={setters.setTypeFilter} searchTerm={filters.searchTerm} setSearchTerm={setters.setSearchTerm} selectedTransactionId={filters.selectedTransactionId} setSelectedTransactionId={setters.setSelectedTransactionId} balanceVisible={balanceVisible} onToggleBalance={() => setBalanceVisible((current) => !current)} onRefresh={refreshOverview} onOpenTransaction={() => openTransactionComposer()} />}
    </Suspense>
  );
};

const DashboardPage = () => {
  const { overview, bootstrap, status, error, isRefreshing, refreshOverview, refreshAll } = useFinance(); const { openTransactionComposer } = useTransactionComposer(); const { user } = useAuth(); const mobileLayout = useMobileDashboardLayout();
  const [balanceVisible, setBalanceVisible] = useState(true); const [searchTerm, setSearchTerm] = useState(""); const [accountFilter, setAccountFilter] = useState("all"); const [categoryFilter, setCategoryFilter] = useState("all"); const [typeFilter, setTypeFilter] = useState("all"); const [selectedTransactionId, setSelectedTransactionId] = useState(""); const [desktopAccountId, setDesktopAccountId] = useDesktopAccountSelection(overview); const [mobileTransactionDetailOpen, setMobileTransactionDetailOpen] = useState(false);
  const filters = { searchTerm, accountFilter, categoryFilter, typeFilter, selectedTransactionId }; const setters = { setSearchTerm, setAccountFilter, setCategoryFilter, setTypeFilter, setSelectedTransactionId };
  const dashboardViewModel = useMemo(() => createDashboardViewModel({ overview, bootstrap, filters: { searchTerm, accountFilter, categoryFilter, typeFilter, selectedTransactionId } }), [accountFilter, bootstrap, categoryFilter, overview, searchTerm, selectedTransactionId, typeFilter]);
  if (status === "loading" || status === "idle") return <LoadingScreen />; if (status === "error") return <ErrorState error={error} onRetry={refreshAll} />; if (!overview || !dashboardViewModel) return null;
  const displayOverview = { ...overview, accountBalances: dashboardViewModel.accountBalances }; const displayName = String(user?.name || user?.email || "").trim().split(/\s+/)[0] || "Kamu";
  const openMobileTransactionDetail = (transactionId) => { setSelectedTransactionId(transactionId); setMobileTransactionDetailOpen(true); };
  const surfaces = { mobileLayout, displayOverview, bootstrap, dashboardViewModel, user, displayName, balanceVisible, setBalanceVisible, refreshOverview, isRefreshing, openTransactionComposer, openMobileTransactionDetail, desktopAccountId, setDesktopAccountId, filters, setters };
  const overlays = { mobileTransactionDetailOpen, setMobileTransactionDetailOpen, dashboardViewModel, balanceVisible, openTransactionComposer };
  return <div className="dashboard-page"><DashboardSurfaces {...surfaces} />{mobileLayout ? <MobileDashboardOverlays {...overlays} /> : null}</div>;
};

export default DashboardPage;
