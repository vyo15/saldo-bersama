import { useMemo, useState } from "react";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import TransactionForm from "../transactions/TransactionForm.jsx";
import { TRANSACTION_LABELS } from "../transactions/transactionPresentation.js";
import DesktopFinanceDashboard from "./components/DesktopFinanceDashboard.jsx";
import MobileFinanceDashboard from "./components/MobileFinanceDashboard.jsx";
import { absoluteAmount } from "./dashboardPresentation.js";

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

  const accountLookup = useMemo(
    () => Object.fromEntries((overview?.accountBalances || []).map((item) => [item.account_id, item.name])),
    [overview?.accountBalances],
  );
  const categoryLookup = useMemo(
    () => Object.fromEntries((bootstrap?.categories || []).map((item) => [item.category_id, item.name])),
    [bootstrap?.categories],
  );
  const envelopeLookup = useMemo(
    () => Object.fromEntries((overview?.envelopes || []).map((item) => [item.envelope_period_id, item.name])),
    [overview?.envelopes],
  );

  const recentTransactions = useMemo(() => overview?.recentTransactions || [], [overview?.recentTransactions]);
  const filteredTransactions = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase("id-ID");
    return recentTransactions.filter((item) => {
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
        categoryLookup[item.category_id],
        TRANSACTION_LABELS[item.transaction_type],
      ].filter(Boolean).join(" ").toLocaleLowerCase("id-ID");
      return searchable.includes(query);
    });
  }, [accountFilter, accountLookup, categoryFilter, categoryLookup, recentTransactions, searchTerm, typeFilter]);

  const selectedTransaction = useMemo(
    () => filteredTransactions.find((item) => item.transaction_id === selectedTransactionId)
      || filteredTransactions[0]
      || null,
    [filteredTransactions, selectedTransactionId],
  );

  if (status === "loading" || status === "idle") return <LoadingScreen />;
  if (status === "error") return <ErrorState error={error} onRetry={refreshAll} />;
  if (!overview) return null;

  const expenseByCategory = overview.categoryExpenses || [];
  const featuredEnvelope = overview.envelopes?.[0] || null;
  const featuredEnvelopeUsed = featuredEnvelope
    ? Number(featuredEnvelope.used_amount || 0) + Number(featuredEnvelope.reserved_amount || 0)
    : 0;
  const featuredEnvelopeMax = Number(featuredEnvelope?.allocated_amount || 0);
  const featuredEnvelopePercent = featuredEnvelopeMax > 0
    ? Math.min(100, Math.round((featuredEnvelopeUsed / featuredEnvelopeMax) * 100))
    : 0;
  const displayName = String(user?.name || user?.email || "").trim().split(/\s+/)[0] || "Kamu";
  const accountBars = overview.accountBalances.slice(0, 6);
  const maxAccountBalance = Math.max(1, ...accountBars.map((item) => absoluteAmount(item.balance)));
  const expenseBars = expenseByCategory.slice(0, 7);
  const maxCategoryExpense = Math.max(1, ...expenseBars.map((item) => absoluteAmount(item.amount)));
  const activeFilterCount = [accountFilter, categoryFilter, typeFilter].filter((value) => value !== "all").length + (searchTerm.trim() ? 1 : 0);

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
    || categoryLookup[selectedTransaction?.category_id]
    || "Transaksi";
  const selectedCategory = categoryLookup[selectedTransaction?.category_id] || "Belum dikategorikan";
  const selectedEnvelope = selectedTransaction?.envelope_period_id
    ? envelopeLookup[selectedTransaction.envelope_period_id] || "Alokasi tidak tersedia"
    : selectedTransaction?.transaction_type === "expense" ? "Belum dialokasikan" : "Tidak menggunakan alokasi";
  const selectedEnvelopeNote = selectedTransaction?.envelope_period_id
    ? "Terhubung ke kantong aktif"
    : selectedTransaction?.transaction_type === "expense" ? "Perlu ditinjau sebelum tutup periode" : "Jenis transaksi ini tidak memerlukan kantong";
  const lastSyncedAt = (() => {
    const parsed = new Date(overview.lastSyncedAt);
    return Number.isNaN(parsed.getTime())
      ? "Waktu sinkron tidak tersedia"
      : parsed.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  })();

  return (
    <div className="dashboard-page">
      <MobileFinanceDashboard
        overview={overview}
        displayName={displayName}
        balanceVisible={balanceVisible}
        onToggleBalance={() => setBalanceVisible((current) => !current)}
        onRefresh={refreshOverview}
        recentTransactions={recentTransactions}
        categoryLookup={categoryLookup}
        transactionAccountLabel={transactionAccountLabel}
        onOpenTransaction={() => setFormOpen(true)}
        featuredEnvelope={featuredEnvelope}
        featuredEnvelopeUsed={featuredEnvelopeUsed}
        featuredEnvelopeMax={featuredEnvelopeMax}
        featuredEnvelopePercent={featuredEnvelopePercent}
      />
      <DesktopFinanceDashboard
        overview={overview}
        bootstrap={bootstrap}
        expenseByCategory={expenseByCategory}
        accountBars={accountBars}
        maxAccountBalance={maxAccountBalance}
        expenseBars={expenseBars}
        maxCategoryExpense={maxCategoryExpense}
        accountFilter={accountFilter}
        setAccountFilter={setAccountFilter}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        activeFilterCount={activeFilterCount}
        filteredTransactions={filteredTransactions}
        selectedTransaction={selectedTransaction}
        setSelectedTransactionId={setSelectedTransactionId}
        categoryLookup={categoryLookup}
        transactionAccountLabel={transactionAccountLabel}
        selectedTitle={selectedTitle}
        selectedCategory={selectedCategory}
        selectedEnvelope={selectedEnvelope}
        selectedEnvelopeNote={selectedEnvelopeNote}
        lastSyncedAt={lastSyncedAt}
        onRefresh={refreshOverview}
        onOpenTransaction={() => setFormOpen(true)}
      />
      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
};

export default DashboardPage;
