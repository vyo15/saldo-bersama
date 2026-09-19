import { FiArrowDownLeft, FiArrowUpRight, FiCopy, FiRepeat } from "react-icons/fi";
import Money from "../../../components/common/Money.jsx";
import { formatCompactRupiah } from "../../../domain/money.js";
import { transactionCategoryIcon, transactionDisplayTitle, transactionTone } from "../../../shared/presentation/transaction.js";
import styles from "../TransactionsPage.module.css";

const periodLabel = (period) => {
  const [year, month] = String(period || "").split("-").map(Number);
  if (!Number.isInteger(year) || month < 1 || month > 12) return "Periode";
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(Date.UTC(year, month - 1, 1)));
};

const reportCashFlow = (report) => {
  const cashFlow = report.data?.overview?.cashFlow || {};
  const income = Number(cashFlow.income || 0);
  const refund = Number(cashFlow.refund || 0);
  const expense = Number(cashFlow.expense || 0);
  const net = Number(cashFlow.net ?? (income + refund - expense));
  return { income: income + refund, expense, net };
};

const repeatableTransactions = (items) => items
  .filter((item) => item.status === "active" && ["expense", "income", "transfer"].includes(item.transaction_type))
  .slice(0, 3);

const categoryPercentage = (amount, total) => total > 0 ? Math.max(0, Math.min(100, Math.round((Number(amount || 0) / total) * 100))) : 0;

const ActivityReportState = ({ report }) => {
  if (report.status === "loading") return <p className={styles.activityState}>Menyiapkan ringkasan aktivitas…</p>;
  if (report.status === "error") return <div className={styles.activityState} role="status"><span>Ringkasan aktivitas belum tersedia.</span><button type="button" onClick={report.reload}>Coba lagi</button></div>;
  return null;
};

const DesktopActivityPanel = ({ report, period, total, categoryLookup, onQuickCreate }) => {
  const cashFlow = reportCashFlow(report);
  const categories = (report.data?.categoryExpenses || []).slice(0, 4);
  const netTone = cashFlow.net > 0 ? "positive" : cashFlow.net < 0 ? "negative" : "default";
  return <aside className={styles.activityPanel} aria-label="Aktivitas transaksi bulan ini">
    <header className={styles.activityHeading}>
      <div><span className={styles.activityEyebrow}>Aktivitas bulan ini</span><h2>{periodLabel(period)}</h2></div>
      <span className={styles.activityCount}>{Number(total || 0).toLocaleString("id-ID")} transaksi</span>
    </header>

    <section className={styles.cashFlowHero} aria-label="Ringkasan arus kas">
      <span>Arus kas bersih</span>
      <strong className={`money--${netTone}`}>{cashFlow.net > 0 ? "+" : ""}<Money value={cashFlow.net} tone={netTone} /></strong>
      <small>{cashFlow.net >= 0 ? "Pemasukan masih lebih besar dari pengeluaran." : "Pengeluaran lebih besar dari pemasukan pada periode ini."}</small>
      <div className={styles.cashFlowMiniGrid}>
        <div><span>Masuk</span><strong><Money value={cashFlow.income} tone="positive" /></strong></div>
        <div><span>Keluar</span><strong><Money value={cashFlow.expense} tone="negative" /></strong></div>
      </div>
    </section>

    <ActivityReportState report={report} />

    <section className={styles.quickSection} aria-labelledby="desktop-transaction-quick-title">
      <div className={styles.sideSectionHeading}><h3 id="desktop-transaction-quick-title">Transaksi cepat</h3><span>Satu composer, langsung terarah</span></div>
      <div className={styles.quickActions}>
        <button type="button" onClick={() => onQuickCreate("expense")}><span data-type="expense"><FiArrowUpRight aria-hidden="true" /></span><strong>Pengeluaran</strong></button>
        <button type="button" onClick={() => onQuickCreate("income")}><span data-type="income"><FiArrowDownLeft aria-hidden="true" /></span><strong>Pemasukan</strong></button>
        <button type="button" onClick={() => onQuickCreate("transfer")}><span data-type="transfer"><FiRepeat aria-hidden="true" /></span><strong>Transfer</strong></button>
      </div>
    </section>

    <section className={styles.categorySection} aria-labelledby="desktop-transaction-category-title">
      <div className={styles.sideSectionHeading}><h3 id="desktop-transaction-category-title">Pengeluaran terbesar</h3><span>Dari seluruh transaksi periode ini</span></div>
      {categories.length ? <div className={styles.categoryBreakdown}>{categories.map((item) => {
        const Icon = transactionCategoryIcon(categoryLookup[item.category_id] || item, "expense");
        const percentage = categoryPercentage(item.amount, cashFlow.expense);
        return <div className={styles.categoryBreakdownRow} key={item.category_id || item.label}>
          <span className={styles.categoryBreakdownIcon}><Icon aria-hidden="true" /></span>
          <div className={styles.categoryBreakdownCopy}><div><strong>{item.label || item.name || "Kategori"}</strong><b>{percentage}%</b></div><small>{formatCompactRupiah(item.amount)}</small><i><span style={{ width: `${percentage}%` }} /></i></div>
        </div>;
      })}</div> : <p className={styles.sideEmpty}>Belum ada pengeluaran pada periode ini.</p>}
    </section>
  </aside>;
};

const RepeatCard = ({ item, categoryLookup, accountLabel, onRepeat }) => {
  const Icon = transactionCategoryIcon(categoryLookup[item.category_id], item.transaction_type);
  return <button type="button" className={styles.repeatCard} onClick={() => onRepeat(item)}>
    <span className={styles.repeatIcon} data-type={item.transaction_type}><Icon aria-hidden="true" /></span>
    <span className={styles.repeatCopy}><strong>{transactionDisplayTitle(item, categoryLookup[item.category_id])}</strong><small>{accountLabel(item)} · <Money value={item.amount} tone={transactionTone(item.transaction_type)} /></small></span>
    <span className={styles.repeatAction} aria-hidden="true"><FiCopy /></span>
  </button>;
};

const RepeatStrip = ({ items, categoryLookup, accountLabel, onRepeat }) => {
  const repeatItems = repeatableTransactions(items);
  if (!repeatItems.length) return null;
  return <section className={styles.repeatSection} aria-labelledby="desktop-repeat-transaction-title">
    <div className={styles.repeatHeading}><div><h2 id="desktop-repeat-transaction-title">Transaksi yang baru digunakan</h2></div><span>Pilih untuk membuat draft baru</span></div>
    <div className={styles.repeatGrid}>{repeatItems.map((item) => <RepeatCard key={item.transaction_id} item={item} categoryLookup={categoryLookup} accountLabel={accountLabel} onRepeat={onRepeat} />)}</div>
  </section>;
};

const DesktopTransactionWorkspace = ({ report, period, total, items, categoryLookup, accountLabel, onQuickCreate, onRepeat, attentionNotice, filters, resourceStates, results }) => (
  <div className={styles.desktopWorkspace}>
    <DesktopActivityPanel report={report} period={period} total={total} categoryLookup={categoryLookup} onQuickCreate={onQuickCreate} />
    <section className={styles.historyPanel} aria-labelledby="desktop-transaction-history-title">
      <RepeatStrip items={items} categoryLookup={categoryLookup} accountLabel={accountLabel} onRepeat={onRepeat} />
      {attentionNotice}
      <div className={styles.historyHeading}><div><h2 id="desktop-transaction-history-title">Semua pergerakan uang</h2></div><span>Gunakan pencarian dan filter untuk mempersempit ledger.</span></div>
      {filters}
      {resourceStates}
      {results}
    </section>
  </div>
);

export default DesktopTransactionWorkspace;
