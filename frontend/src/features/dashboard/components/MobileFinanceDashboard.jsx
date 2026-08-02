import { FiEye, FiEyeOff, FiPieChart, FiRefreshCw } from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../../components/common/Button.jsx";
import ProgressBar from "../../../components/common/ProgressBar.jsx";
import ThemeToggle from "../../../components/common/ThemeToggle.jsx";
import EmptyState from "../../../components/feedback/EmptyState.jsx";
import { formatTransactionDate, transactionIcon, transactionSign, transactionTone } from "../../transactions/transactionPresentation.js";
import { formatPeriod, QUICK_ACTIONS } from "../dashboardPresentation.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

const MobileFinanceDashboard = ({
  overview,
  displayName,
  balanceVisible,
  onToggleBalance,
  onRefresh,
  recentTransactions,
  categoryLookup,
  transactionAccountLabel,
  onOpenTransaction,
  featuredEnvelope,
  featuredEnvelopeUsed,
  featuredEnvelopeMax,
  featuredEnvelopePercent,
}) => (
  <section className="mobile-finance-dashboard" aria-label="Ringkasan keuangan mobile">
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

      <div className="mobile-finance-summary">
        <div><span>Aman digunakan</span><SensitiveMoney visible={balanceVisible} value={overview.safeToSpend} /></div>
        <div><span>Pengeluaran bulan ini</span><SensitiveMoney visible={balanceVisible} value={overview.cashFlow.expense} /></div>
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
              const Icon = transactionIcon(item.transaction_type);
              const title = item.description || item.merchant || categoryLookup[item.category_id] || "Transaksi";
              const sign = balanceVisible ? transactionSign(item.transaction_type) : "";
              return (
                <article className="mobile-transaction-item" key={item.transaction_id}>
                  <span className={`mobile-transaction-icon mobile-transaction-icon--${item.transaction_type || "default"}`}><Icon aria-hidden="true" /></span>
                  <div>
                    <strong>{title}</strong>
                    <small>{transactionAccountLabel(item)} · {formatTransactionDate(item.transaction_date)}</small>
                  </div>
                  <span className={`mobile-transaction-amount money--${transactionTone(item.transaction_type)}`}>
                    {sign}{sign ? " " : ""}<SensitiveMoney visible={balanceVisible} value={item.amount} tone={transactionTone(item.transaction_type)} />
                  </span>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Belum ada transaksi" description="Transaksi aktif pada periode ini akan tampil di sini." action={<Button variant="primary" onClick={onOpenTransaction}>Tambah transaksi</Button>} />
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

export default MobileFinanceDashboard;
