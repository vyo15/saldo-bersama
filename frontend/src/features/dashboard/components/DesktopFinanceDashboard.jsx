import {
  FiAlertCircle,
  FiArrowDownLeft,
  FiArrowUpRight,
  FiCalendar,
  FiCheckCircle,
  FiChevronDown,
  FiCreditCard,
  FiEye,
  FiEyeOff,
  FiFileText,
  FiFlag,
  FiPlus,
  FiRefreshCw,
  FiRepeat,
  FiSearch,
  FiShield,
  FiTarget,
  FiTrendingDown,
  FiTrendingUp,
} from "react-icons/fi";
import { Link } from "react-router";
import ProgressBar from "../../../components/common/ProgressBar.jsx";
import { AccountVisual } from "../../accounts/components/AccountFinancialCard.jsx";
import { accountOwnershipLabel } from "../../../shared/presentation/account.js";
import {
  formatTransactionDate,
  transactionCategoryIcon,
  TRANSACTION_LABELS,
  transactionTone,
} from "../../../shared/presentation/transaction.js";
import { formatPeriod } from "../dashboardPresentation.js";
import SensitiveMoney from "./SensitiveMoney.jsx";

const CHART_COLORS = [
  "var(--dashboard-chart-1)",
  "var(--dashboard-chart-2)",
  "var(--dashboard-chart-3)",
  "var(--dashboard-chart-4)",
  "var(--dashboard-chart-5)",
];

const percentage = (value, maximum) => maximum > 0
  ? Math.max(0, Math.round((Number(value || 0) / Number(maximum)) * 100))
  : 0;

const accountTransactionDelta = (transaction, accountId) => {
  if (transaction.status && transaction.status !== "active") return 0;
  const amount = Number(transaction.amount || 0);
  if (transaction.transaction_type === "transfer") {
    if (transaction.destination_account_id === accountId) return amount;
    if (transaction.source_account_id === accountId) return -amount;
    return 0;
  }
  if (["income", "refund"].includes(transaction.transaction_type)) {
    return transaction.destination_account_id === accountId ? amount : 0;
  }
  if (transaction.transaction_type === "expense") {
    return transaction.source_account_id === accountId ? -amount : 0;
  }
  if (transaction.transaction_type === "adjustment") {
    return transaction.source_account_id === accountId ? amount : 0;
  }
  if (transaction.destination_account_id === accountId) return amount;
  if (transaction.source_account_id === accountId) return -amount;
  return 0;
};

const matchesAccount = (transaction, accountId) => transaction.source_account_id === accountId
  || transaction.destination_account_id === accountId;

const dueLabel = (value) => {
  if (!value) return "Jadwal belum tersedia";
  const due = new Date(`${String(value).slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(due.getTime())) return "Jadwal belum tersedia";
  const today = new Date();
  const jakartaToday = new Date(today.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  jakartaToday.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - jakartaToday.getTime()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} hari terlambat`;
  if (days === 0) return "Hari ini";
  if (days === 1) return "Besok";
  return `${days} hari lagi`;
};

const compactDate = (value) => {
  if (!value) return "Tanggal belum tersedia";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(parsed);
};

const DesktopFinanceDashboard = ({
  overview,
  bootstrap,
  viewModel,
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
  onRefresh,
  onOpenTransaction,
}) => {
  const { accountBalances, categoryLookup, recentTransactions, expenseByCategory } = viewModel;
  const selectedAccount = accountBalances.find((item) => item.account_id === selectedAccountId)
    || accountBalances[0]
    || null;
  const query = searchTerm.trim().toLocaleLowerCase("id-ID");
  const selectedAccountTransactions = selectedAccount
    ? recentTransactions.filter((item) => matchesAccount(item, selectedAccount.account_id))
    : [];
  const accountTransactions = selectedAccountTransactions.filter((item) => {
    if (categoryFilter !== "all" && item.category_id !== categoryFilter) return false;
    if (typeFilter !== "all" && item.transaction_type !== typeFilter) return false;
    if (!query) return true;
    const searchable = [
      item.description,
      item.merchant,
      categoryLookup[item.category_id]?.name,
      TRANSACTION_LABELS[item.transaction_type],
    ].filter(Boolean).join(" ").toLocaleLowerCase("id-ID");
    return searchable.includes(query);
  });

  let runningBalance = Number(selectedAccount?.balance || 0);
  const runningBalanceLookup = new Map();
  for (const item of selectedAccountTransactions) {
    runningBalanceLookup.set(item.transaction_id, runningBalance);
    runningBalance -= accountTransactionDelta(item, selectedAccount?.account_id);
  }
  const transactionRows = accountTransactions.map((item) => ({
    item,
    delta: accountTransactionDelta(item, selectedAccount?.account_id),
    balanceAfter: runningBalanceLookup.get(item.transaction_id) ?? Number(selectedAccount?.balance || 0),
  }));
  const selectedTransaction = accountTransactions.find((item) => item.transaction_id === selectedTransactionId)
    || accountTransactions[0]
    || null;

  const categoryTotal = expenseByCategory.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const categories = expenseByCategory.length > 5
    ? [
      ...expenseByCategory.slice(0, 4),
      {
        category_id: "other-categories",
        name: "Lainnya",
        amount: expenseByCategory.slice(4).reduce((sum, item) => sum + Number(item.amount || 0), 0),
      },
    ]
    : expenseByCategory.slice(0, 5);
  let cursor = 0;
  const donutSegments = categories.map((item, index) => {
    const share = categoryTotal > 0 ? (Number(item.amount || 0) / categoryTotal) * 100 : 0;
    const start = cursor;
    cursor += share;
    return `${CHART_COLORS[index]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  const donutStyle = { background: donutSegments.length ? `conic-gradient(${donutSegments.join(",")})` : "var(--surface-soft)" };

  const budgets = (overview.budgets || []).filter((item) => item.status !== "archived");
  const totalBudget = budgets.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const usedBudget = budgets.reduce((sum, item) => sum + Number(item.used_amount || 0), 0);
  const remainingBudget = Math.max(0, totalBudget - usedBudget);
  const biggestExpense = expenseByCategory.reduce((largest, item) => Number(item.amount || 0) > Number(largest?.amount || 0) ? item : largest, null);
  const recurringItems = (overview.recurring || [])
    .filter((item) => !["paid", "cancelled", "archived"].includes(item.occurrence_status || item.status))
    .sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")))
    .slice(0, 3);
  const goals = (overview.goals || []).filter((item) => item.status === "active").slice(0, 3);
  const alerts = overview.alerts || [];

  return (
    <div className="dashboard-desktop shared-dashboard">
      <header className="shared-dashboard__header">
        <div>
          <p className="shared-dashboard__eyebrow">Keuangan pribadi dan bersama</p>
          <h1>Dashboard</h1>
          <p>Selamat datang, <strong>{displayName}</strong>. Pantau rekening, transaksi, anggaran, tagihan, dan target dari satu tempat.</p>
        </div>
        <div className="shared-dashboard__actions">
          <span className="shared-period-pill"><FiCalendar aria-hidden="true" />{formatPeriod(overview.periodKey)}</span>
          <button type="button" className="shared-icon-action" onClick={onToggleBalance} aria-label={balanceVisible ? "Sembunyikan seluruh nominal" : "Tampilkan seluruh nominal"} aria-pressed={!balanceVisible}>
            {balanceVisible ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
          </button>
          <button type="button" className="shared-icon-action" onClick={onRefresh} aria-label="Sinkronkan data"><FiRefreshCw aria-hidden="true" /></button>
          <button type="button" className="button button--primary" onClick={onOpenTransaction}><FiPlus aria-hidden="true" /><span>Tambah transaksi</span></button>
        </div>
      </header>

      <div className="shared-dashboard__layout">
        <main className="shared-dashboard__main">
          <section className="shared-panel shared-account-panel" aria-labelledby="dashboard-accounts-title">
            <div className="shared-section-heading">
              <div><p>Rekening saya</p><h2 id="dashboard-accounts-title">Pilih rekening untuk melihat aktivitasnya</h2></div>
              <Link to="/rekening">Kelola rekening</Link>
            </div>
            {accountBalances.length ? (
              <>
                <div className="shared-account-carousel" aria-label="Pilih rekening dashboard">
                  {accountBalances.map((account) => {
                    const selected = account.account_id === selectedAccount?.account_id;
                    const cleanAccount = { ...account, name: account.account_name || account.name };
                    return (
                      <button
                        key={account.account_id}
                        type="button"
                        className={`shared-account-card${selected ? " is-selected" : ""}`}
                        onClick={() => onSelectAccount(account.account_id)}
                        aria-pressed={selected}
                        aria-label={`Pilih ${cleanAccount.name}`}
                        data-dashboard-account={account.account_id}
                      >
                        <AccountVisual account={cleanAccount} carousel />
                        <span className="shared-account-card__summary">
                          <span><small>Saldo</small><SensitiveMoney visible={balanceVisible} value={account.balance} /></span>
                          <span><small>Kepemilikan</small><strong>{accountOwnershipLabel(account)}</strong></span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="shared-account-pagination" aria-label="Posisi rekening terpilih">
                  {accountBalances.map((account) => <button key={account.account_id} type="button" className={account.account_id === selectedAccount?.account_id ? "is-active" : ""} onClick={() => onSelectAccount(account.account_id)} aria-label={`Pilih ${account.account_name || account.name}`} />)}
                </div>
              </>
            ) : <div className="shared-empty-state"><FiCreditCard aria-hidden="true" /><strong>Belum ada rekening aktif</strong><Link to="/rekening">Tambah rekening</Link></div>}
          </section>

          <section className="shared-panel shared-transactions" aria-labelledby="selected-account-transactions-title">
            <div className="shared-transactions__header">
              <div>
                <p>Aktivitas rekening</p>
                <h2 id="selected-account-transactions-title">Transaksi rekening terpilih</h2>
                <span>{selectedAccount ? (selectedAccount.account_name || selectedAccount.name) : "Belum ada rekening"}</span>
              </div>
              <div className="shared-transaction-tools">
                <label><span className="sr-only">Cari transaksi rekening terpilih</span><FiSearch aria-hidden="true" /><input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari transaksi" /></label>
                <label><span className="sr-only">Filter kategori</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Semua kategori</option>{(bootstrap?.categories || []).filter((item) => item.status === "active").map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}</select><FiChevronDown aria-hidden="true" /></label>
                <label><span className="sr-only">Filter jenis transaksi</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">Semua jenis</option>{Object.entries(TRANSACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><FiChevronDown aria-hidden="true" /></label>
                <Link to="/transaksi">Lihat semua</Link>
              </div>
            </div>

            {transactionRows.length ? (
              <div className="shared-transaction-table-wrap">
                <table className="shared-transaction-table">
                  <thead><tr><th>Tanggal</th><th>Deskripsi</th><th>Kategori</th><th>Debit</th><th>Kredit</th><th>Saldo</th></tr></thead>
                  <tbody>
                    {transactionRows.slice(0, 8).map(({ item, delta, balanceAfter }) => {
                      const category = categoryLookup[item.category_id];
                      const Icon = transactionCategoryIcon(category, item.transaction_type);
                      const title = item.description || item.merchant || category?.name || "Transaksi";
                      const active = selectedTransaction?.transaction_id === item.transaction_id;
                      return (
                        <tr key={item.transaction_id} className={active ? "is-selected" : ""}>
                          <td><strong>{formatTransactionDate(item.transaction_date)}</strong><small>{item.status || "active"}</small></td>
                          <td>
                            <button type="button" className="shared-transaction-select" onClick={() => setSelectedTransactionId(item.transaction_id)} aria-pressed={active}>
                              <span className={`shared-transaction-icon shared-transaction-icon--${item.transaction_type || "default"}`}><Icon aria-hidden="true" /></span>
                              <span><strong>{title}</strong><small>{item.merchant || TRANSACTION_LABELS[item.transaction_type] || "Transaksi"}</small></span>
                            </button>
                          </td>
                          <td><span className={`shared-category-chip shared-category-chip--${transactionTone(item.transaction_type)}`}>{category?.name || TRANSACTION_LABELS[item.transaction_type] || "Lainnya"}</span></td>
                          <td>{delta < 0 ? <SensitiveMoney visible={balanceVisible} value={Math.abs(delta)} tone="negative" /> : <span>—</span>}</td>
                          <td>{delta > 0 ? <SensitiveMoney visible={balanceVisible} value={delta} tone="positive" /> : <span>—</span>}</td>
                          <td><SensitiveMoney visible={balanceVisible} value={balanceAfter} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <div className="shared-empty-state"><FiSearch aria-hidden="true" /><strong>Tidak ada transaksi yang cocok</strong><span>Ubah rekening atau filter untuk melihat aktivitas lain.</span></div>}
            {selectedTransaction ? <div className="shared-selected-transaction"><span>Transaksi dipilih</span><strong>{selectedTransaction.description || selectedTransaction.merchant || "Transaksi"}</strong><small>{categoryLookup[selectedTransaction.category_id]?.name || TRANSACTION_LABELS[selectedTransaction.transaction_type]} · {formatTransactionDate(selectedTransaction.transaction_date)}</small></div> : null}
          </section>
        </main>

        <aside className="shared-dashboard__side" aria-label="Statistik dan ringkasan dashboard">
          <section className="shared-panel shared-statistics" aria-labelledby="dashboard-statistics-title">
            <div className="shared-section-heading"><div><p>Semua rekening</p><h2 id="dashboard-statistics-title">Statistik pengeluaran</h2></div><Link to="/laporan">Laporan</Link></div>
            <div className="shared-statistics__summary"><span>Total pengeluaran bulan ini</span><SensitiveMoney visible={balanceVisible} value={overview.cashFlow.expense} tone="negative" /><small>{expenseByCategory.length} kategori tercatat</small></div>
            <div className="shared-statistics__content">
              <div className="shared-donut" style={donutStyle} role="img" aria-label={`Distribusi pengeluaran ${formatPeriod(overview.periodKey)}`}><span><small>{formatPeriod(overview.periodKey)}</small><strong>{categoryTotal ? "100%" : "0%"}</strong></span></div>
              <ul className="shared-stat-legend">
                {categories.length ? categories.map((item, index) => <li key={`${item.name}-${index}`}><i data-index={index} /><span><strong>{item.name}</strong><small><SensitiveMoney visible={balanceVisible} value={item.amount} /> · {percentage(item.amount, categoryTotal)}%</small></span></li>) : <li><span>Belum ada pengeluaran kategori.</span></li>}
              </ul>
            </div>
          </section>

          <div className="shared-kpi-grid" aria-label="Ringkasan arus kas dan anggaran">
            <article><span><FiTrendingDown aria-hidden="true" />Pengeluaran</span><SensitiveMoney visible={balanceVisible} value={overview.cashFlow.expense} tone="negative" /><ProgressBar value={overview.cashFlow.expense} max={Math.max(overview.cashFlow.income, overview.cashFlow.expense, 1)} label="Proporsi pengeluaran" /></article>
            <article><span><FiTrendingUp aria-hidden="true" />Pemasukan</span><SensitiveMoney visible={balanceVisible} value={overview.cashFlow.income} tone="positive" /><ProgressBar value={overview.cashFlow.income} max={Math.max(overview.cashFlow.income, overview.cashFlow.expense, 1)} label="Proporsi pemasukan" /></article>
            <article><span><FiShield aria-hidden="true" />Sisa anggaran</span><SensitiveMoney visible={balanceVisible} value={remainingBudget} /><ProgressBar value={remainingBudget} max={Math.max(totalBudget, 1)} label="Sisa anggaran" /></article>
          </div>

          <section className="shared-largest-expense">
            <span>Pengeluaran terbesar</span>
            <strong>{biggestExpense?.name || "Belum tersedia"}</strong>
            <SensitiveMoney visible={balanceVisible} value={biggestExpense?.amount || 0} tone="negative" />
          </section>
        </aside>
      </div>

      <section className="shared-dashboard-widgets" aria-label="Perencanaan dan aksi cepat">
        <article className="shared-panel shared-widget shared-quick-actions">
          <div className="shared-widget__heading"><h2>Aksi cepat</h2></div>
          <div>
            <Link to="/transaksi"><span><FiRepeat aria-hidden="true" /></span><strong>Buka transaksi</strong></Link>
            <Link to="/anggaran"><span><FiFileText aria-hidden="true" /></span><strong>Buka anggaran</strong></Link>
            <Link to="/tagihan"><span><FiCalendar aria-hidden="true" /></span><strong>Buka jadwal rutin</strong></Link>
            <Link to="/rekonsiliasi"><span><FiCheckCircle aria-hidden="true" /></span><strong>Rekonsiliasi</strong></Link>
          </div>
        </article>

        <article className="shared-panel shared-widget">
          <div className="shared-widget__heading"><div><h2>Anggaran bulan ini</h2><span>{budgets.length} anggaran aktif</span></div><Link to="/anggaran">Lihat semua</Link></div>
          <ul className="shared-progress-list">
            {budgets.length ? budgets.slice(0, 3).map((item) => <li key={item.budget_id}><div><strong>{item.name || item.display_name || "Anggaran"}</strong><span><SensitiveMoney visible={balanceVisible} value={item.used_amount || 0} /> / <SensitiveMoney visible={balanceVisible} value={item.amount || 0} /></span></div><ProgressBar value={item.used_amount || 0} max={item.amount || 0} label={`Pemakaian ${item.name || "anggaran"}`} /></li>) : <li className="shared-widget-empty">Belum ada anggaran aktif.</li>}
          </ul>
        </article>

        <article className="shared-panel shared-widget">
          <div className="shared-widget__heading"><div><h2>Tagihan terdekat</h2><span>{recurringItems.length} perlu dipantau</span></div><Link to="/tagihan">Lihat semua</Link></div>
          <ul className="shared-due-list">
            {recurringItems.length ? recurringItems.map((item) => <li key={item.occurrence_id || item.recurring_rule_id}><span className="shared-due-icon"><FiCalendar aria-hidden="true" /></span><span><strong>{item.name}</strong><small>{compactDate(item.due_date)} · <SensitiveMoney visible={balanceVisible} value={item.expected_amount || item.amount || 0} /></small></span><em>{dueLabel(item.due_date)}</em></li>) : <li className="shared-widget-empty">Belum ada tagihan mendatang.</li>}
          </ul>
        </article>

        <article className="shared-panel shared-widget">
          <div className="shared-widget__heading"><div><h2>Target tabungan</h2><span>{goals.length} target aktif</span></div><Link to="/target">Lihat semua</Link></div>
          <ul className="shared-progress-list shared-goal-list">
            {goals.length ? goals.map((item) => <li key={item.goal_id}><div><strong><FiTarget aria-hidden="true" />{item.name}</strong><span><SensitiveMoney visible={balanceVisible} value={item.current_amount || 0} /> / <SensitiveMoney visible={balanceVisible} value={item.target_amount || 0} /></span></div><ProgressBar value={item.current_amount || 0} max={item.target_amount || 0} label={`Kemajuan ${item.name}`} /></li>) : <li className="shared-widget-empty">Belum ada target tabungan aktif.</li>}
          </ul>
        </article>

        <article className="shared-panel shared-widget shared-insight-widget">
          <div className="shared-widget__heading"><h2>Ringkasan singkat</h2><FiAlertCircle aria-hidden="true" /></div>
          <dl>
            <div><dt><FiCreditCard aria-hidden="true" />Rekening aktif</dt><dd>{accountBalances.length}</dd></div>
            <div><dt><FiArrowDownLeft aria-hidden="true" />Transaksi rekening</dt><dd>{selectedAccountTransactions.length}</dd></div>
            <div><dt><FiFlag aria-hidden="true" />Dana belum dialokasikan</dt><dd><SensitiveMoney visible={balanceVisible} value={overview.unallocatedFunds || 0} /></dd></div>
            <div><dt><FiArrowUpRight aria-hidden="true" />Peringatan aktif</dt><dd>{alerts.length}</dd></div>
          </dl>
          <Link to="/laporan">Lihat insight detail</Link>
        </article>
      </section>
    </div>
  );
};

export default DesktopFinanceDashboard;
