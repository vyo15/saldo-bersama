import { FiChevronDown, FiEye, FiEyeOff, FiPieChart, FiRefreshCw, FiSliders } from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../../components/common/Button.jsx";
import ProgressBar from "../../../components/common/ProgressBar.jsx";
import ThemeToggle from "../../../components/common/ThemeToggle.jsx";
import EmptyState from "../../../components/feedback/EmptyState.jsx";
import { formatTransactionDate, transactionCategoryIcon, transactionSign, transactionTone } from "../../transactions/transactionPresentation.js";
import { formatPeriod, QUICK_ACTIONS } from "../dashboardPresentation.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

const MobileFinanceDashboard = ({
  overview,
  viewModel,
  displayName,
  balanceVisible,
  onToggleBalance,
  onRefresh,
  onOpenTransaction,
  onOpenFilters,
  onOpenTransactionDetail,
}) => {
  const {
    accountBars,
    expenseBars,
    filteredTransactions,
    activeFilterCount,
    categoryLookup,
    transactionAccountLabel,
    featuredEnvelope,
    featuredEnvelopeUsed,
    featuredEnvelopeMax,
    featuredEnvelopePercent,
  } = viewModel;
  const visibleAlerts = overview.alerts?.slice(0, 4) || [];
  const additionalAlerts = overview.alerts?.slice(4) || [];

  return (
    <section className="mobile-finance-dashboard" aria-label="Ringkasan keuangan mobile">
      <h1 className="sr-only">Ringkasan Keuangan</h1>
      <header className="mobile-finance-hero">
        <div className="mobile-finance-hero__bar">
          <div className="mobile-finance-brand">
            <strong>Saldo Bersama</strong>
            <span>{formatPeriod(overview.periodKey)}</span>
          </div>
          <div className="mobile-finance-hero__actions">
            <ThemeToggle tone="hero" className="mobile-hero-button" />
            <button type="button" className="mobile-hero-button" onClick={onRefresh} aria-label="Sinkronkan data" title="Sinkronkan data"><FiRefreshCw aria-hidden="true" /></button>
            <button
              type="button"
              className="mobile-hero-button"
              onClick={onToggleBalance}
              aria-label={balanceVisible ? "Sembunyikan seluruh nominal" : "Tampilkan seluruh nominal"}
              aria-pressed={!balanceVisible}
            >
              {balanceVisible ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div className="mobile-finance-identity">
          <p>Hai, {displayName}</p>
          <span>Total saldo aktual</span>
          <div className={`mobile-finance-balance${balanceVisible ? "" : " mobile-finance-balance--hidden"}`} aria-live="polite">
            <SensitiveMoney visible={balanceVisible} value={overview.totalBalance} />
          </div>
          <small>{overview.accountBalances.length} rekening aktif</small>
        </div>

        <div className="mobile-finance-summary" aria-label="Ringkasan saldo dan alokasi">
          <div><span>Aman digunakan akun ini</span><SensitiveMoney visible={balanceVisible} value={overview.safeToSpend} /></div>
          <div><span>Pengeluaran bulan ini</span><SensitiveMoney visible={balanceVisible} value={overview.cashFlow.expense} /></div>
          <div><span>Batas aman per hari</span><SensitiveMoney visible={balanceVisible} value={overview.dailySafeToSpend || 0} /></div>
          <div><span>Dana belum dialokasikan akun ini</span><SensitiveMoney visible={balanceVisible} value={overview.unallocatedFunds || 0} /><small>{overview.unallocatedCount || 0} transaksi</small></div>
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

        <details className="mobile-finance-insights">
          <summary>
            <span>Rincian rekening dan kategori</span>
            <FiChevronDown aria-hidden="true" />
          </summary>
          <div className="mobile-finance-insights__grid">
            <section aria-labelledby="mobile-account-insights-title">
              <h2 id="mobile-account-insights-title">Saldo per rekening</h2>
              {accountBars.length ? (
                <ul>
                  {accountBars.map((item) => <li key={item.account_id}><span>{item.name}</span><SensitiveMoney visible={balanceVisible} value={item.balance} /></li>)}
                </ul>
              ) : <p>Belum ada rekening aktif.</p>}
              <Link to="/rekening">Kelola rekening</Link>
            </section>
            <section aria-labelledby="mobile-category-insights-title">
              <h2 id="mobile-category-insights-title">Pengeluaran per kategori</h2>
              {expenseBars.length ? (
                <ul>
                  {expenseBars.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name}</span><SensitiveMoney visible={balanceVisible} value={item.amount} tone="negative" /></li>)}
                </ul>
              ) : <p>Belum ada pengeluaran kategori.</p>}
              <Link to="/laporan">Buka laporan</Link>
            </section>
          </div>
        </details>

        {overview.alerts?.length ? (
          <section className="mobile-finance-section mobile-alert-section" aria-labelledby="mobile-alerts-title">
            <div className="mobile-section-heading">
              <h2 id="mobile-alerts-title">Perlu perhatian</h2>
              <span>{overview.alerts.length} item</span>
            </div>
            <ul className="financial-alert-list financial-alert-list--mobile">
              {visibleAlerts.map((alert) => (
                <li key={alert.id} data-severity={alert.severity}>
                  <div><strong>{alert.title}</strong><span>{alert.message}</span></div>
                  <Link to={alert.targetPath || "/"}>Tinjau</Link>
                </li>
              ))}
            </ul>
            {additionalAlerts.length ? (
              <details className="mobile-alert-more">
                <summary>Lihat {additionalAlerts.length} peringatan lainnya</summary>
                <ul className="financial-alert-list financial-alert-list--mobile">
                  {additionalAlerts.map((alert) => (
                    <li key={alert.id} data-severity={alert.severity}>
                      <div><strong>{alert.title}</strong><span>{alert.message}</span></div>
                      <Link to={alert.targetPath || "/"}>Tinjau</Link>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}

        <section className="mobile-finance-section" aria-labelledby="recent-transactions-title">
          <div className="mobile-section-heading mobile-section-heading--transactions">
            <div>
              <h2 id="recent-transactions-title">Transaksi terakhir</h2>
              {activeFilterCount ? <span>{activeFilterCount} filter aktif</span> : null}
            </div>
            <div className="mobile-section-heading__actions">
              <button type="button" className="mobile-dashboard-filter-button" onClick={onOpenFilters} aria-label={`Filter transaksi${activeFilterCount ? `, ${activeFilterCount} aktif` : ""}`}><FiSliders aria-hidden="true" /><span>Filter</span></button>
              <Link to="/transaksi">Lihat semua</Link>
            </div>
          </div>
          {filteredTransactions.length ? (
            <div className="mobile-transaction-list">
              {filteredTransactions.slice(0, 5).map((item) => {
                const category = categoryLookup[item.category_id];
                const Icon = transactionCategoryIcon(category, item.transaction_type);
                const title = item.description || item.merchant || category?.name || "Transaksi";
                const sign = balanceVisible ? transactionSign(item.transaction_type) : "";
                return (
                  <button type="button" className="mobile-transaction-item" key={item.transaction_id} onClick={() => onOpenTransactionDetail(item.transaction_id)} aria-label={`Buka detail ${title}`}>
                    <span className={`mobile-transaction-icon mobile-transaction-icon--${item.transaction_type || "default"}`}><Icon aria-hidden="true" /></span>
                    <span className="mobile-transaction-copy">
                      <strong>{title}</strong>
                      <small>{transactionAccountLabel(item)} · {formatTransactionDate(item.transaction_date)}</small>
                    </span>
                    <span className={`mobile-transaction-amount money--${transactionTone(item.transaction_type)}`}>
                      {sign}{sign ? " " : ""}<SensitiveMoney visible={balanceVisible} value={item.amount} tone={transactionTone(item.transaction_type)} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title={activeFilterCount ? "Tidak ada transaksi yang cocok" : "Belum ada transaksi"}
              description={activeFilterCount ? "Ubah filter dashboard untuk menampilkan transaksi lain." : "Transaksi aktif pada periode ini akan tampil di sini."}
              action={activeFilterCount ? <Button onClick={onOpenFilters}>Ubah filter</Button> : <Button variant="primary" onClick={onOpenTransaction}>Tambah transaksi</Button>}
            />
          )}
        </section>

        {featuredEnvelope ? (
          <section className="mobile-allocation-card" aria-label={`Ringkasan alokasi ${featuredEnvelope.name}`}>
            <div className="mobile-allocation-card__header">
              <span className="mobile-allocation-card__icon"><FiPieChart aria-hidden="true" /></span>
              <div>
                <h2>{featuredEnvelope.name}</h2>
                <p><SensitiveMoney visible={balanceVisible} value={featuredEnvelopeUsed} /> terpakai dari <SensitiveMoney visible={balanceVisible} value={featuredEnvelopeMax} /></p>
              </div>
              <strong>{featuredEnvelopePercent}%</strong>
            </div>
            <ProgressBar value={featuredEnvelopeUsed} max={featuredEnvelopeMax} label={`Pemakaian ${featuredEnvelope.name}`} />
            <div className="mobile-allocation-card__footer">
              <span>Sisa <SensitiveMoney visible={balanceVisible} value={featuredEnvelope.remaining_amount || 0} /></span>
              <Link to="/alokasi">Kelola alokasi</Link>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
};

export default MobileFinanceDashboard;
