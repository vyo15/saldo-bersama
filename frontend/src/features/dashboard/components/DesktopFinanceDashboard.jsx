import {
  FiActivity,
  FiAlertCircle,
  FiBarChart2,
  FiCalendar,
  FiChevronDown,
  FiCreditCard,
  FiPieChart,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiSliders,
} from "react-icons/fi";
import { Link } from "react-router";
import Money from "../../../components/common/Money.jsx";
import { formatTransactionDate, transactionIcon, TRANSACTION_LABELS, transactionSign, transactionTone } from "../../transactions/transactionPresentation.js";
import { absoluteAmount, formatPeriod } from "../dashboardPresentation.js";

const DesktopFinanceDashboard = ({
  overview,
  bootstrap,
  expenseByCategory,
  accountBars,
  maxAccountBalance,
  expenseBars,
  maxCategoryExpense,
  accountFilter,
  setAccountFilter,
  categoryFilter,
  setCategoryFilter,
  typeFilter,
  setTypeFilter,
  searchTerm,
  setSearchTerm,
  activeFilterCount,
  filteredTransactions,
  selectedTransaction,
  setSelectedTransactionId,
  categoryLookup,
  transactionAccountLabel,
  selectedTitle,
  selectedCategory,
  selectedEnvelope,
  selectedEnvelopeNote,
  lastSyncedAt,
  onRefresh,
  onOpenTransaction,
}) => (
  <div className="dashboard-desktop premium-dashboard">
    <header className="premium-dashboard__header">
      <div>
        <p className="premium-dashboard__eyebrow">Periode {formatPeriod(overview.periodKey)}</p>
        <h1>Ringkasan Keuangan</h1>
        <p>Pantau saldo, arus kas, alokasi, dan transaksi dari satu sumber data.</p>
      </div>
      <div className="premium-dashboard__actions">
        <button type="button" className="button button--secondary" onClick={onRefresh}><FiRefreshCw aria-hidden="true" /><span>Sinkronkan</span></button>
        <button type="button" className="button button--primary" onClick={onOpenTransaction}><FiCreditCard aria-hidden="true" /><span>Tambah transaksi</span></button>
      </div>
    </header>

    <section className="premium-metric-grid" aria-label="Ringkasan saldo">
      <article className="premium-metric-card premium-metric-card--balance">
        <div className="premium-metric-card__label"><span>Total saldo aktual</span><FiActivity aria-hidden="true" /></div>
        <Money value={overview.totalBalance} />
        <small>{overview.accountBalances.length} rekening aktif</small>
        <div className="premium-balance-illustration" aria-hidden="true"><span className="premium-plant" /><span className="premium-laptop" /><span className="premium-lamp" /></div>
      </article>

      <article className="premium-metric-card">
        <div className="premium-metric-card__label"><span>Saldo aman digunakan</span><FiShield aria-hidden="true" /></div>
        <Money value={overview.safeToSpend} />
        <small>Batas aman per hari <Money value={overview.dailySafeToSpend || 0} /></small>
        <div className="premium-mini-bars" aria-label="Perbandingan saldo rekening aktif">
          {accountBars.length ? accountBars.map((item) => <span key={item.account_id} style={{ height: `${Math.max(12, Math.round((absoluteAmount(item.balance) / maxAccountBalance) * 62))}px` }} title={`${item.name}: ${item.balance}`} />) : <span className="premium-mini-bars__empty" />}
        </div>
      </article>

      <article className="premium-metric-card">
        <div className="premium-metric-card__label"><span>Pengeluaran bulan ini</span><FiBarChart2 aria-hidden="true" /></div>
        <Money value={overview.cashFlow.expense} tone="negative" />
        <small>{expenseByCategory.length} kategori tercatat</small>
        <div className="premium-category-chart" aria-label="Proporsi pengeluaran per kategori">
          {expenseBars.length ? expenseBars.map((item, index) => <span key={`${item.name}-${index}`} style={{ height: `${Math.max(10, Math.round((absoluteAmount(item.amount) / maxCategoryExpense) * 58))}px` }} title={`${item.name}: ${item.amount}`} />) : <span className="premium-category-chart__empty" />}
        </div>
      </article>

      <article className="premium-metric-card premium-metric-card--accounts">
        <div className="premium-metric-card__label"><span>Dana belum dialokasikan</span><FiPieChart aria-hidden="true" /></div>
        <Money value={overview.unallocatedFunds || 0} />
        <small>{overview.unallocatedCount || 0} transaksi belum dialokasikan</small>
        <div className="premium-account-strip" aria-label="Filter rekening cepat">
          {overview.accountBalances.slice(0, 3).map((item) => (
            <button key={item.account_id} type="button" className={accountFilter === item.account_id ? "active" : ""} onClick={() => setAccountFilter((current) => current === item.account_id ? "all" : item.account_id)} aria-pressed={accountFilter === item.account_id}>
              <strong>{item.name}</strong><Money value={item.balance} />
            </button>
          ))}
        </div>
      </article>
    </section>

    {overview.alerts?.length ? (
      <section className="premium-alert-panel" aria-labelledby="dashboard-alerts-title">
        <div className="premium-alert-panel__heading">
          <div><p className="premium-dashboard__eyebrow">Perlu perhatian</p><h2 id="dashboard-alerts-title">Peringatan keuangan</h2></div>
          <Link to="/laporan">Lihat laporan</Link>
        </div>
        <ul className="financial-alert-list financial-alert-list--dashboard">
          {overview.alerts.slice(0, 5).map((alert) => (
            <li key={alert.id} data-severity={alert.severity}>
              <div><strong>{alert.title}</strong><span>{alert.message}</span></div>
              <Link to={alert.targetPath || "/"}>Tinjau</Link>
            </li>
          ))}
        </ul>
      </section>
    ) : null}

    <section className="premium-filterbar" aria-label="Filter transaksi terbaru">
      <div className="premium-filterbar__label"><FiSliders aria-hidden="true" /><span>Filter aktif</span><strong>{activeFilterCount}</strong></div>
      <label className="premium-select"><span className="sr-only">Filter rekening</span><select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}><option value="all">Semua rekening</option>{overview.accountBalances.map((item) => <option key={item.account_id} value={item.account_id}>{item.name}</option>)}</select><FiChevronDown aria-hidden="true" /></label>
      <label className="premium-select"><span className="sr-only">Filter kategori</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Semua kategori</option>{(bootstrap?.categories || []).filter((item) => item.status === "active").map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select><FiChevronDown aria-hidden="true" /></label>
      <label className="premium-select"><span className="sr-only">Filter jenis transaksi</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Semua jenis</option>{Object.entries(TRANSACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><FiChevronDown aria-hidden="true" /></label>
      <div className="premium-period-filter"><FiCalendar aria-hidden="true" /><span>{formatPeriod(overview.periodKey)}</span></div>
      <label className="premium-search"><span className="sr-only">Cari transaksi terbaru</span><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} type="search" placeholder="Cari transaksi..." /><FiSearch aria-hidden="true" /></label>
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
            const Icon = transactionIcon(item.transaction_type);
            const title = item.description || item.merchant || categoryLookup[item.category_id] || "Transaksi";
            const active = selectedTransaction?.transaction_id === item.transaction_id;
            const sign = transactionSign(item.transaction_type);
            return (
              <button type="button" className={`premium-transaction-row${active ? " active" : ""}`} key={item.transaction_id} onClick={() => setSelectedTransactionId(item.transaction_id)} aria-pressed={active}>
                <span className={`premium-transaction-avatar premium-transaction-avatar--${item.transaction_type || "default"}`}><Icon aria-hidden="true" /></span>
                <span className="premium-transaction-copy"><strong>{title}</strong><small>{formatTransactionDate(item.transaction_date)} · {transactionAccountLabel(item)}</small></span>
                <span className="premium-transaction-status">{item.status || "active"}</span>
                <span className={`premium-transaction-amount money--${transactionTone(item.transaction_type)}`}>{sign}{sign ? " " : ""}<Money value={item.amount} tone={transactionTone(item.transaction_type)} /></span>
              </button>
            );
          }) : <div className="premium-transaction-empty"><FiSearch aria-hidden="true" /><strong>Tidak ada transaksi yang cocok</strong><span>Ubah filter atau kata pencarian untuk menampilkan transaksi lain.</span></div>}
        </div>
      </div>

      <article className="premium-transaction-detail">
        {selectedTransaction ? (
          <>
            <div className="premium-detail-heading"><div><span>Detail transaksi</span><strong>#{selectedTransaction.transaction_id}</strong></div><div><span>Kategori</span><strong>{selectedCategory}</strong></div><div><span>Status data</span><strong><FiShield aria-hidden="true" /> {selectedTransaction.status || "active"}</strong></div></div>
            <div className="premium-detail-grid"><div><span>Nominal</span><Money value={selectedTransaction.amount} tone={transactionTone(selectedTransaction.transaction_type)} /><small>{TRANSACTION_LABELS[selectedTransaction.transaction_type] || selectedTransaction.transaction_type}</small></div><div><span>Rekening</span><strong>{transactionAccountLabel(selectedTransaction)}</strong><small>Sumber rekening tervalidasi</small></div><div><span>Alokasi</span><strong>{selectedEnvelope}</strong><small>{selectedEnvelopeNote}</small></div><div><span>Tanggal transaksi</span><strong>{formatTransactionDate(selectedTransaction.transaction_date)}</strong><small>Zona waktu Asia/Jakarta</small></div></div>
            <div className="premium-detail-footer"><div><span>Deskripsi</span><strong>{selectedTitle}</strong></div><div><span>Sinkron terakhir</span><strong>{lastSyncedAt}</strong></div><div className="premium-detail-actions"><Link className="premium-detail-button" to="/transaksi">Lihat semua transaksi</Link><button type="button" className="premium-detail-button premium-detail-button--primary" onClick={onOpenTransaction}>Tambah transaksi</button></div></div>
          </>
        ) : <div className="premium-detail-empty"><FiAlertCircle aria-hidden="true" /><strong>Belum ada transaksi untuk ditampilkan</strong><span>Tambahkan transaksi aktif agar detailnya muncul di sini.</span></div>}
      </article>
    </section>
  </div>
);

export default DesktopFinanceDashboard;
