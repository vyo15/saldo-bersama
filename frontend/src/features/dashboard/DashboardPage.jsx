import {
  FiActivity,
  FiAlertCircle,
  FiArrowDownLeft,
  FiArrowUpRight,
  FiBarChart2,
  FiCalendar,
  FiChevronDown,
  FiCreditCard,
  FiDollarSign,
  FiEdit3,
  FiEye,
  FiEyeOff,
  FiPieChart,
  FiRefreshCw,
  FiRepeat,
  FiRotateCcw,
  FiSearch,
  FiShield,
  FiSliders,
  FiTarget,
} from "react-icons/fi";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import Button from "../../components/common/Button.jsx";
import ThemeToggle from "../../components/common/ThemeToggle.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import TransactionForm from "../transactions/TransactionForm.jsx";

const QUICK_ACTIONS = Object.freeze([
  { to: "/transaksi", label: "Transaksi", icon: FiCreditCard },
  { to: "/rekening", label: "Rekening", icon: FiDollarSign },
  { to: "/alokasi", label: "Alokasi", icon: FiPieChart },
  { to: "/tagihan", label: "Tagihan", icon: FiCalendar },
  { to: "/target", label: "Target", icon: FiTarget },
  { to: "/laporan", label: "Laporan", icon: FiBarChart2 },
]);

const TRANSACTION_ICONS = Object.freeze({
  expense: FiArrowDownLeft,
  income: FiArrowUpRight,
  transfer: FiRepeat,
  refund: FiRotateCcw,
  adjustment: FiEdit3,
});

const TRANSACTION_LABELS = Object.freeze({
  expense: "Pengeluaran",
  income: "Pemasukan",
  transfer: "Transfer",
  refund: "Pengembalian",
  adjustment: "Penyesuaian",
});

const formatTransactionDate = (value) => {
  if (!value) return "Tanggal tidak tersedia";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(parsed);
};

const formatPeriod = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ""));
  if (!match) return String(value || "Periode aktif");
  const parsed = new Date(`${match[1]}-${match[2]}-01T00:00:00+07:00`);
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(parsed);
};

const transactionTone = (type) => type === "expense" ? "negative" : ["income", "refund"].includes(type) ? "positive" : "default";
const transactionSign = (type) => type === "expense" ? "−" : ["income", "refund"].includes(type) ? "+" : "";
const absoluteAmount = (value) => Math.abs(Number(value || 0));

const DashboardPage = () => {
  const { overview, bootstrap, status, error, refresh } = useFinance();
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
  if (status === "error") return <ErrorState error={error} onRetry={refresh} />;
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
      <section className="mobile-finance-dashboard" aria-label="Ringkasan keuangan mobile">
        <header className="mobile-finance-hero">
          <div className="mobile-finance-hero__top">
            <div className="mobile-finance-identity">
              <p>Hai, {displayName}</p>
              <span>Total saldo aktual</span>
              <div className={`mobile-finance-balance${balanceVisible ? "" : " mobile-finance-balance--hidden"}`} aria-live="polite">
                {balanceVisible ? <Money value={overview.totalBalance} /> : <span aria-label="Saldo disembunyikan">Rp •••••••••</span>}
              </div>
              <small>{overview.accountBalances.length} rekening aktif · periode {overview.periodKey}</small>
            </div>
            <div className="mobile-finance-hero__actions">
              <button type="button" className="mobile-hero-button" onClick={refresh} aria-label="Sinkronkan data" title="Sinkronkan data"><FiRefreshCw aria-hidden="true" /></button>
              <ThemeToggle tone="hero" />
              <button
                type="button"
                className="mobile-hero-button"
                onClick={() => setBalanceVisible((current) => !current)}
                aria-label={balanceVisible ? "Sembunyikan saldo" : "Tampilkan saldo"}
                aria-pressed={!balanceVisible}
              >
                {balanceVisible ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div className="mobile-finance-summary">
            <div><span>Aman digunakan</span><Money value={overview.safeToSpend} /></div>
            <div><span>Pengeluaran bulan ini</span><Money value={overview.cashFlow.expense} /></div>
          </div>
        </header>

        <div className="mobile-finance-content">
          <nav className="mobile-quick-grid" aria-label="Menu keuangan cepat">
            {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="mobile-quick-action">
                <span><Icon aria-hidden="true" /></span>
                <strong>{label}</strong>
              </Link>
            ))}
          </nav>

          <section className="mobile-finance-section" aria-labelledby="recent-transactions-title">
            <div className="mobile-section-heading">
              <h2 id="recent-transactions-title">Transaksi terakhir</h2>
              <Link to="/transaksi">Lihat semua</Link>
            </div>
            {recentTransactions.length ? (
              <div className="mobile-transaction-list">
                {recentTransactions.slice(0, 3).map((item) => {
                  const Icon = TRANSACTION_ICONS[item.transaction_type] || FiCreditCard;
                  const title = item.description || item.merchant || categoryLookup[item.category_id] || "Transaksi";
                  return (
                    <article className="mobile-transaction-item" key={item.transaction_id}>
                      <span className={`mobile-transaction-icon mobile-transaction-icon--${item.transaction_type || "default"}`}><Icon aria-hidden="true" /></span>
                      <div>
                        <strong>{title}</strong>
                        <small>{transactionAccountLabel(item)} · {formatTransactionDate(item.transaction_date)}</small>
                      </div>
                      <span className={`mobile-transaction-amount money--${transactionTone(item.transaction_type)}`}>
                        {transactionSign(item.transaction_type)}{transactionSign(item.transaction_type) ? " " : ""}<Money value={item.amount} tone={transactionTone(item.transaction_type)} />
                      </span>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="Belum ada transaksi" description="Transaksi aktif pada periode ini akan tampil di sini." action={<Button variant="primary" onClick={() => setFormOpen(true)}>Tambah transaksi</Button>} />
            )}
          </section>

          {featuredEnvelope ? (
            <section className="mobile-allocation-card" aria-label={`Ringkasan alokasi ${featuredEnvelope.name}`}>
              <div className="mobile-allocation-card__header">
                <span className="mobile-allocation-card__icon"><FiPieChart aria-hidden="true" /></span>
                <div>
                  <h2>{featuredEnvelope.name}</h2>
                  <p><Money value={featuredEnvelopeUsed} /> terpakai dari <Money value={featuredEnvelopeMax} /></p>
                </div>
                <strong>{featuredEnvelopePercent}%</strong>
              </div>
              <ProgressBar value={featuredEnvelopeUsed} max={featuredEnvelopeMax} label={`Pemakaian ${featuredEnvelope.name}`} />
              <div className="mobile-allocation-card__footer">
                <span>Sisa <Money value={featuredEnvelope.remaining_amount || 0} /></span>
                <Link to="/alokasi">Kelola alokasi</Link>
              </div>
            </section>
          ) : null}
        </div>
      </section>

      <div className="dashboard-desktop premium-dashboard">
        <header className="premium-dashboard__header">
          <div>
            <p className="premium-dashboard__eyebrow">Periode {formatPeriod(overview.periodKey)}</p>
            <h1>Ringkasan Keuangan</h1>
            <p>Pantau saldo, arus kas, alokasi, dan transaksi dari satu sumber data.</p>
          </div>
          <div className="premium-dashboard__actions">
            <button type="button" className="button button--secondary" onClick={refresh}><FiRefreshCw aria-hidden="true" /><span>Sinkronkan</span></button>
            <button type="button" className="button button--primary" onClick={() => setFormOpen(true)}><FiCreditCard aria-hidden="true" /><span>Tambah transaksi</span></button>
          </div>
        </header>

        <section className="premium-metric-grid" aria-label="Ringkasan saldo">
          <article className="premium-metric-card premium-metric-card--balance">
            <div className="premium-metric-card__label"><span>Total saldo aktual</span><FiActivity aria-hidden="true" /></div>
            <Money value={overview.totalBalance} />
            <small>{overview.accountBalances.length} rekening aktif</small>
            <div className="premium-balance-illustration" aria-hidden="true">
              <span className="premium-plant" />
              <span className="premium-laptop" />
              <span className="premium-lamp" />
            </div>
          </article>

          <article className="premium-metric-card">
            <div className="premium-metric-card__label"><span>Saldo aman digunakan</span><FiShield aria-hidden="true" /></div>
            <Money value={overview.safeToSpend} />
            <small>Batas aman per hari <Money value={overview.dailySafeToSpend || 0} /></small>
            <div className="premium-mini-bars" aria-label="Perbandingan saldo rekening aktif">
              {accountBars.length ? accountBars.map((item) => (
                <span key={item.account_id} style={{ height: `${Math.max(12, Math.round((absoluteAmount(item.balance) / maxAccountBalance) * 62))}px` }} title={`${item.name}: ${item.balance}`} />
              )) : <span className="premium-mini-bars__empty" />}
            </div>
          </article>

          <article className="premium-metric-card">
            <div className="premium-metric-card__label"><span>Pengeluaran bulan ini</span><FiBarChart2 aria-hidden="true" /></div>
            <Money value={overview.cashFlow.expense} tone="negative" />
            <small>{expenseByCategory.length} kategori tercatat</small>
            <div className="premium-category-chart" aria-label="Proporsi pengeluaran per kategori">
              {expenseBars.length ? expenseBars.map((item, index) => (
                <span key={`${item.name}-${index}`} style={{ height: `${Math.max(10, Math.round((absoluteAmount(item.amount) / maxCategoryExpense) * 58))}px` }} title={`${item.name}: ${item.amount}`} />
              )) : <span className="premium-category-chart__empty" />}
            </div>
          </article>

          <article className="premium-metric-card premium-metric-card--accounts">
            <div className="premium-metric-card__label"><span>Dana belum dialokasikan</span><FiPieChart aria-hidden="true" /></div>
            <Money value={overview.unallocatedFunds || 0} />
            <small>{overview.unallocatedCount || 0} transaksi belum dialokasikan</small>
            <div className="premium-account-strip" aria-label="Filter rekening cepat">
              {overview.accountBalances.slice(0, 3).map((item) => (
                <button
                  key={item.account_id}
                  type="button"
                  className={accountFilter === item.account_id ? "active" : ""}
                  onClick={() => setAccountFilter((current) => current === item.account_id ? "all" : item.account_id)}
                  aria-pressed={accountFilter === item.account_id}
                >
                  <strong>{item.name}</strong>
                  <Money value={item.balance} />
                </button>
              ))}
            </div>
          </article>
        </section>

        <section className="premium-filterbar" aria-label="Filter transaksi terbaru">
          <div className="premium-filterbar__label"><FiSliders aria-hidden="true" /><span>Filter aktif</span><strong>{activeFilterCount}</strong></div>
          <label className="premium-select">
            <span className="sr-only">Filter rekening</span>
            <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
              <option value="all">Semua rekening</option>
              {overview.accountBalances.map((item) => <option key={item.account_id} value={item.account_id}>{item.name}</option>)}
            </select>
            <FiChevronDown aria-hidden="true" />
          </label>
          <label className="premium-select">
            <span className="sr-only">Filter kategori</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">Semua kategori</option>
              {(bootstrap?.categories || []).filter((item) => item.status === "active").map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}
            </select>
            <FiChevronDown aria-hidden="true" />
          </label>
          <label className="premium-select">
            <span className="sr-only">Filter jenis transaksi</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">Semua jenis</option>
              {Object.entries(TRANSACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <FiChevronDown aria-hidden="true" />
          </label>
          <div className="premium-period-filter"><FiCalendar aria-hidden="true" /><span>{formatPeriod(overview.periodKey)}</span></div>
          <label className="premium-search">
            <span className="sr-only">Cari transaksi terbaru</span>
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} type="search" placeholder="Cari transaksi..." />
            <FiSearch aria-hidden="true" />
          </label>
        </section>

        <section className="premium-transaction-workspace" aria-label="Transaksi terbaru dan detail">
          <div className="premium-transaction-panel">
            <div className="premium-transaction-tabs">
              <h2>Transaksi terbaru</h2>
              <button type="button" className={typeFilter === "all" ? "active" : ""} onClick={() => setTypeFilter("all")}>Semua</button>
              <button type="button" className={typeFilter === "income" ? "active" : ""} onClick={() => setTypeFilter("income")}>Pemasukan</button>
              <button type="button" className={typeFilter === "expense" ? "active premium" : ""} onClick={() => setTypeFilter("expense")}>Pengeluaran</button>
            </div>

            <div className="premium-transaction-list">
              {filteredTransactions.length ? filteredTransactions.map((item) => {
                const Icon = TRANSACTION_ICONS[item.transaction_type] || FiCreditCard;
                const title = item.description || item.merchant || categoryLookup[item.category_id] || "Transaksi";
                const active = selectedTransaction?.transaction_id === item.transaction_id;
                return (
                  <button
                    type="button"
                    className={`premium-transaction-row${active ? " active" : ""}`}
                    key={item.transaction_id}
                    onClick={() => setSelectedTransactionId(item.transaction_id)}
                    aria-pressed={active}
                  >
                    <span className={`premium-transaction-avatar premium-transaction-avatar--${item.transaction_type || "default"}`}><Icon aria-hidden="true" /></span>
                    <span className="premium-transaction-copy">
                      <strong>{title}</strong>
                      <small>{formatTransactionDate(item.transaction_date)} · {transactionAccountLabel(item)}</small>
                    </span>
                    <span className="premium-transaction-status">{item.status || "active"}</span>
                    <span className={`premium-transaction-amount money--${transactionTone(item.transaction_type)}`}>
                      {transactionSign(item.transaction_type)}{transactionSign(item.transaction_type) ? " " : ""}<Money value={item.amount} tone={transactionTone(item.transaction_type)} />
                    </span>
                  </button>
                );
              }) : (
                <div className="premium-transaction-empty">
                  <FiSearch aria-hidden="true" />
                  <strong>Tidak ada transaksi yang cocok</strong>
                  <span>Ubah filter atau kata pencarian untuk menampilkan transaksi lain.</span>
                </div>
              )}
            </div>
          </div>

          <article className="premium-transaction-detail">
            {selectedTransaction ? (
              <>
                <div className="premium-detail-heading">
                  <div><span>Detail transaksi</span><strong>#{selectedTransaction.transaction_id}</strong></div>
                  <div><span>Kategori</span><strong>{selectedCategory}</strong></div>
                  <div><span>Status data</span><strong><FiShield aria-hidden="true" /> {selectedTransaction.status || "active"}</strong></div>
                </div>

                <div className="premium-detail-grid">
                  <div><span>Nominal</span><Money value={selectedTransaction.amount} tone={transactionTone(selectedTransaction.transaction_type)} /><small>{TRANSACTION_LABELS[selectedTransaction.transaction_type] || selectedTransaction.transaction_type}</small></div>
                  <div><span>Rekening</span><strong>{transactionAccountLabel(selectedTransaction)}</strong><small>Sumber rekening tervalidasi</small></div>
                  <div><span>Alokasi</span><strong>{selectedEnvelope}</strong><small>{selectedEnvelopeNote}</small></div>
                  <div><span>Tanggal transaksi</span><strong>{formatTransactionDate(selectedTransaction.transaction_date)}</strong><small>Zona waktu Asia/Jakarta</small></div>
                </div>

                <div className="premium-detail-footer">
                  <div><span>Deskripsi</span><strong>{selectedTitle}</strong></div>
                  <div><span>Sinkron terakhir</span><strong>{lastSyncedAt}</strong></div>
                  <div className="premium-detail-actions">
                    <Link className="premium-detail-button" to="/transaksi">Lihat semua transaksi</Link>
                    <button type="button" className="premium-detail-button premium-detail-button--primary" onClick={() => setFormOpen(true)}>Tambah transaksi</button>
                  </div>
                </div>
              </>
            ) : (
              <div className="premium-detail-empty"><FiAlertCircle aria-hidden="true" /><strong>Belum ada transaksi untuk ditampilkan</strong><span>Tambahkan transaksi aktif agar detailnya muncul di sini.</span></div>
            )}
          </article>
        </section>
      </div>

      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
};

export default DashboardPage;
