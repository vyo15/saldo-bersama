import { useState } from "react";
import {
  FiAlertTriangle,
  FiCalendar,
  FiChevronRight,
  FiEye,
  FiEyeOff,
  FiPieChart,
  FiRefreshCw,
  FiTarget,
} from "react-icons/fi";
import { Link } from "react-router";
import { AccountVisual } from "../../accounts/components/AccountFinancialCard.jsx";
import UserAvatar from "../../../components/common/UserAvatar.jsx";
import { MoneyInIcon, MoneyOutIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import Modal from "../../../components/common/Modal.jsx";
import ProgressBar from "../../../components/common/ProgressBar.jsx";
import ThemeToggle from "../../../components/common/ThemeToggle.jsx";
import EmptyState from "../../../components/feedback/EmptyState.jsx";
import { accountOwnershipLabel, accountProviderLabel } from "../../../shared/presentation/account.js";
import { formatTransactionDate, transactionCategoryIcon, transactionSign, transactionTone } from "../../../shared/presentation/transaction.js";
import { dashboardAlertGuidance, formatPeriod } from "../dashboardPresentation.js";
import FinancialAlertList from "./FinancialAlertList.jsx";
import SensitiveMoney from "./SensitiveMoney.jsx";

const FEATURE_QUICK_ACTIONS = Object.freeze([
  { to: "/perencanaan/kantong", label: "Alokasi Dana", icon: FiPieChart, tone: "allocation" },
  { to: "/perencanaan/jadwal", label: "Jadwal Rutin", icon: FiCalendar, tone: "recurring" },
  { to: "/target", label: "Target", icon: FiTarget, tone: "goal" },
]);

const compactSyncLabel = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sinkronisasi belum tersedia";
  const time = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(parsed);
  return `Diperbarui ${time}`;
};

const AttentionSheet = ({ alerts, open, onClose }) => <Modal open={open} onClose={onClose} title="Perlu perhatian" description="Periksa item berikut. Data baru berubah setelah Anda mengonfirmasi tindakan pada halaman tujuan." size="sm" mobileSwipeToClose>
  <FinancialAlertList alerts={alerts} variant="mobile" />
</Modal>;

const MobileFinanceHero = ({ overview, user, displayName, balanceVisible, onToggleBalance, onRefresh, isRefreshing }) => (
  <header className="mobile-finance-hero">
    <div className="mobile-finance-hero__bar">
      <div className="mobile-finance-user">
        <UserAvatar user={user} className="mobile-finance-user__avatar" />
        <div className="mobile-finance-user__copy">
          <strong>Hai, {displayName}</strong>
          <span>{formatPeriod(overview.periodKey)}</span>
        </div>
      </div>
      <div className="mobile-finance-hero__actions">
        <ThemeToggle tone="hero" className="mobile-hero-button" />
        <button type="button" className={`mobile-hero-button${isRefreshing ? " is-refreshing" : ""}`} onClick={onRefresh} disabled={isRefreshing} aria-label={isRefreshing ? "Sedang menyinkronkan data" : "Sinkronkan data"} title="Sinkronkan data">
          <FiRefreshCw aria-hidden="true" />
        </button>
      </div>
    </div>

    <div className="mobile-finance-identity">
      <div className="mobile-finance-balance-label">
        <span>Total saldo</span>
        <button type="button" className="mobile-balance-visibility" onClick={onToggleBalance} aria-label={balanceVisible ? "Sembunyikan seluruh nominal" : "Tampilkan seluruh nominal"}>
          {balanceVisible ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
        </button>
      </div>
      <div className={`mobile-finance-balance${balanceVisible ? "" : " mobile-finance-balance--hidden"}`} aria-live="polite">
        <SensitiveMoney visible={balanceVisible} value={overview.totalBalance} />
      </div>
      <div className="mobile-finance-meta">
        <span>{overview.accountBalances.length} rekening aktif</span>
        <span aria-live="polite"><i aria-hidden="true" />{compactSyncLabel(overview.lastSyncedAt)}</span>
      </div>
    </div>

    <div className="mobile-finance-summary" aria-label="Ringkasan saldo aman">
      <div><span>Aman digunakan</span><SensitiveMoney visible={balanceVisible} value={overview.safeToSpend} /></div>
      <div><span>Batas aman per hari</span><SensitiveMoney visible={balanceVisible} value={overview.dailySafeToSpend || 0} /></div>
    </div>
  </header>
);

const MobileQuickActions = () => (
  <nav className="mobile-quick-grid" aria-label="Akses cepat keuangan">
    {FEATURE_QUICK_ACTIONS.map(({ to, label, icon: Icon, tone }) => (
      <Link key={to} to={to} className={`mobile-quick-action mobile-quick-action--${tone}`} aria-label={`Buka ${label}`}>
        <span><Icon aria-hidden="true" /></span>
        <strong>{label}</strong>
      </Link>
    ))}
  </nav>
);

const activeSharedGoals = (overview) => (overview?.goals || []).filter((item) => item.status === "active").slice(0, 2);
const priorityBudgets = (overview) => (overview?.budgets || []).filter((item) => item.status !== "archived")
  .sort((left, right) => {
    const leftRatio = Number(left.amount || 0) > 0 ? Number(left.used_amount || 0) / Number(left.amount) : 0;
    const rightRatio = Number(right.amount || 0) > 0 ? Number(right.used_amount || 0) / Number(right.amount) : 0;
    return rightRatio - leftRatio;
  }).slice(0, 1);
const upcomingRecurring = (overview) => (overview?.recurring || []).filter((item) => !["paid", "cancelled", "archived"].includes(item.occurrence_status || item.status))
  .sort((left, right) => String(left.due_date || "9999").localeCompare(String(right.due_date || "9999"))).slice(0, 1);

const MobileSharedPlan = ({ overview, balanceVisible }) => {
  const goals = activeSharedGoals(overview);
  const budgets = priorityBudgets(overview);
  const recurring = upcomingRecurring(overview);
  if (!goals.length && !budgets.length && !recurring.length) return null;
  return <section className="mobile-finance-section mobile-shared-plan" aria-labelledby="mobile-shared-plan-title">
    <div className="mobile-section-heading"><h2 id="mobile-shared-plan-title">Rencana Bersama</h2><Link to="/target">Lihat Target</Link></div>
    <div className="mobile-shared-plan__grid">
      {goals.map((goal) => <Link className="mobile-plan-card mobile-plan-card--goal" to="/target" key={goal.goal_id}><span className="mobile-plan-card__icon"><FiTarget aria-hidden="true" /></span><span className="mobile-plan-card__copy"><strong>{goal.name}</strong><small><SensitiveMoney visible={balanceVisible} value={goal.current_amount || 0} /> dari <SensitiveMoney visible={balanceVisible} value={goal.target_amount || 0} /></small><ProgressBar value={goal.current_amount || 0} max={goal.target_amount || 0} label={`Kemajuan ${goal.name}`} /></span></Link>)}
      {budgets.map((budget) => <Link className="mobile-plan-card" to="/perencanaan/kebutuhan" key={budget.budget_id}><span className="mobile-plan-card__icon"><FiPieChart aria-hidden="true" /></span><span className="mobile-plan-card__copy"><strong>{budget.name || "Kebutuhan"}</strong><small>Terpakai <SensitiveMoney visible={balanceVisible} value={budget.used_amount || 0} /> dari <SensitiveMoney visible={balanceVisible} value={budget.amount || 0} /></small><ProgressBar value={budget.used_amount || 0} max={budget.amount || 0} label={`Pemakaian ${budget.name || "kebutuhan"}`} /></span></Link>)}
      {recurring.map((item) => <Link className="mobile-plan-card" to="/perencanaan/jadwal" key={item.occurrence_id || item.recurring_rule_id}><span className="mobile-plan-card__icon"><FiCalendar aria-hidden="true" /></span><span className="mobile-plan-card__copy"><strong>{item.name}</strong><small>{item.due_date ? formatTransactionDate(item.due_date) : "Jadwal terdekat"} · <SensitiveMoney visible={balanceVisible} value={item.expected_amount || item.amount || 0} /></small></span></Link>)}
    </div>
  </section>;
};

const MobileAlerts = ({ alerts }) => {
  const [open, setOpen] = useState(false);
  if (!alerts?.length) return null;
  const counts = alerts.reduce((result, alert) => ({ ...result, [alert.severity]: (result[alert.severity] || 0) + 1 }), {});
  const summary = [counts.danger ? `${counts.danger} penting` : "", counts.warning ? `${counts.warning} peringatan` : "", counts.info ? `${counts.info} pengingat` : ""].filter(Boolean).join(" · ");
  return <section className="mobile-finance-section mobile-alert-section" aria-labelledby="mobile-alerts-title">
    <button type="button" className="mobile-attention-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Perlu perhatian, ${alerts.length} item. ${summary}`}>
      <span className="mobile-attention-trigger__icon"><FiAlertTriangle aria-hidden="true" /></span>
      <span className="mobile-attention-trigger__copy"><strong id="mobile-alerts-title">Perlu perhatian <em>{alerts.length}</em></strong><small>{summary}</small></span>
      <FiChevronRight className="mobile-attention-trigger__chevron" aria-hidden="true" />
    </button>
    <AttentionSheet alerts={alerts} open={open} onClose={() => setOpen(false)} />
  </section>;
};

const MobileAccountCard = ({ account, balanceVisible }) => {
  const visualAccount = { ...account, name: account.account_name || account.name, account_number: "" };
  return (
    <article className="mobile-account-preview" aria-label={`Rekening ${visualAccount.name || "tanpa nama"}`}>
      <AccountVisual account={visualAccount} />
      <div className="mobile-account-preview__metrics">
        <div><span>Saldo rekening</span><SensitiveMoney visible={balanceVisible} value={account.balance || 0} /></div>
        <div><span>Dana tersedia</span><SensitiveMoney visible={balanceVisible} value={account.available_balance ?? account.balance ?? 0} /></div>
      </div>
      <div className="mobile-account-preview__footer">
        <span>{accountOwnershipLabel(visualAccount)}</span>
        <span>{accountProviderLabel(visualAccount)}</span>
      </div>
    </article>
  );
};

const MobileAccounts = ({ accounts, balanceVisible }) => (
  <section className="mobile-finance-section mobile-accounts-section" aria-labelledby="mobile-accounts-title">
    <div className="mobile-section-heading"><h2 id="mobile-accounts-title">Rekening</h2><Link to="/rekening">Lihat semua</Link></div>
    {accounts.length ? (
      <>
        <div className="mobile-account-scroller" aria-label="Daftar rekening aktif">
          {accounts.map((account) => <MobileAccountCard key={account.account_id} account={account} balanceVisible={balanceVisible} />)}
        </div>
        {accounts.length > 1 ? <p className="mobile-account-scroll-hint">Geser untuk melihat rekening lain</p> : null}
      </>
    ) : <div className="mobile-account-empty"><p>Belum ada rekening aktif.</p><Link to="/rekening">Tambah rekening</Link></div>}
  </section>
);

const MobileCashFlow = ({ cashFlow, balanceVisible }) => {
  const incoming = Number(cashFlow?.income || 0) + Number(cashFlow?.refund || 0);
  return (
    <section className="mobile-finance-section" aria-labelledby="mobile-cash-flow-title">
      <div className="mobile-section-heading"><h2 id="mobile-cash-flow-title">Arus kas bulan ini</h2><Link to="/laporan">Laporan</Link></div>
      <div className="mobile-cash-flow">
        <div className="mobile-cash-flow__row"><span className="mobile-cash-flow__icon mobile-cash-flow__icon--income"><MoneyInIcon aria-hidden="true" /></span><span>Dana masuk</span><SensitiveMoney visible={balanceVisible} value={incoming} /></div>
        <div className="mobile-cash-flow__row"><span className="mobile-cash-flow__icon mobile-cash-flow__icon--expense"><MoneyOutIcon aria-hidden="true" /></span><span>Pengeluaran</span><SensitiveMoney visible={balanceVisible} value={cashFlow?.expense || 0} tone="negative" /></div>
        <div className="mobile-cash-flow__net"><span>Arus kas bersih</span><SensitiveMoney visible={balanceVisible} value={cashFlow?.net || 0} tone={Number(cashFlow?.net || 0) < 0 ? "negative" : "positive"} /></div>
      </div>
    </section>
  );
};

const MobileTransactionItem = ({ item, categoryLookup, transactionAccountLabel, balanceVisible, onOpenTransactionDetail }) => {
  const category = categoryLookup[item.category_id]; const Icon = transactionCategoryIcon(category, item.transaction_type); const title = item.description || item.merchant || category?.name || "Transaksi"; const sign = balanceVisible ? transactionSign(item.transaction_type) : "";
  return <button type="button" className="mobile-transaction-item" onClick={() => onOpenTransactionDetail(item.transaction_id)} aria-label={`Buka detail ${title}`}><span className={`mobile-transaction-icon mobile-transaction-icon--${item.transaction_type || "default"}`}><Icon aria-hidden="true" /></span><span className="mobile-transaction-copy"><strong>{title}</strong><small>{transactionAccountLabel(item)} · {formatTransactionDate(item.transaction_date)}</small></span><span className={`mobile-transaction-amount money--${transactionTone(item.transaction_type)}`}>{sign}{sign ? " " : ""}<SensitiveMoney visible={balanceVisible} value={item.amount} tone={transactionTone(item.transaction_type)} /></span></button>;
};

const MobileTransactions = ({ recentTransactions, categoryLookup, transactionAccountLabel, balanceVisible, onOpenTransactionDetail }) => (
  <section className="mobile-finance-section" aria-labelledby="recent-transactions-title">
    <div className="mobile-section-heading"><h2 id="recent-transactions-title">Transaksi terakhir</h2><Link to="/transaksi">Lihat semua</Link></div>
    {recentTransactions.length ? <div className="mobile-transaction-list">{recentTransactions.slice(0, 5).map((item) => <MobileTransactionItem key={item.transaction_id} item={item} categoryLookup={categoryLookup} transactionAccountLabel={transactionAccountLabel} balanceVisible={balanceVisible} onOpenTransactionDetail={onOpenTransactionDetail} />)}</div> : <EmptyState title="Belum ada transaksi" description="Gunakan tombol tambah transaksi pada navigasi bawah untuk mencatat transaksi pertama." />}
  </section>
);

const MobileAllocation = ({ allocationSummary, balanceVisible, unallocatedFunds, unallocatedCount, unallocatedExpenseAmount, periodKey }) => {
  const freeFunds = Math.max(0, Number(unallocatedFunds || 0));
  const unassignedExpenses = Math.max(0, Number(unallocatedCount || 0));
  if (!allocationSummary.count && !freeFunds && !unassignedExpenses) return null;
  const attentionLabel = allocationSummary.attentionCount ? `${allocationSummary.attentionCount} perlu perhatian` : "Semua masih aman";
  const freeFundsGuidance = dashboardAlertGuidance({ type: "unallocated_funds", id: `unallocated-funds:${periodKey}`, targetPath: "/perencanaan/kantong" });
  return (
    <section className="mobile-finance-section" aria-labelledby="mobile-allocation-title">
      <div className="mobile-section-heading"><h2 id="mobile-allocation-title">Alokasi bulan ini</h2></div>
      {allocationSummary.count ? <div className="mobile-allocation-card" aria-label="Ringkasan Alokasi Dana bulan ini"><div className="mobile-allocation-card__header"><span className="mobile-allocation-card__icon"><FiPieChart aria-hidden="true" /></span><div><h3>{allocationSummary.count} alokasi aktif</h3><p><SensitiveMoney visible={balanceVisible} value={allocationSummary.committed} /> terpakai + dipesan dari <SensitiveMoney visible={balanceVisible} value={allocationSummary.allocated} /></p></div><strong>{allocationSummary.percentage}%</strong></div><ProgressBar value={allocationSummary.committed} max={allocationSummary.allocated} label="Pemakaian dan dana dipesan seluruh Alokasi Dana" /><div className="mobile-allocation-card__footer"><span>Sisa <SensitiveMoney visible={balanceVisible} value={allocationSummary.remaining} /> · {attentionLabel}</span><Link to="/perencanaan/kantong">Kelola Alokasi Dana</Link></div></div> : null}
      {freeFunds ? <Link className="mobile-unallocated-note" to={freeFundsGuidance.to} state={freeFundsGuidance.state} aria-label="Atur dana tersedia ke Alokasi Dana"><span>Dana tersedia belum dibagi</span><strong><SensitiveMoney visible={balanceVisible} value={freeFunds} /></strong><small>Atur Alokasi Dana</small></Link> : null}
      {unassignedExpenses ? <Link className="mobile-unallocated-note" to="/transaksi" aria-label="Lihat pengeluaran yang belum punya Alokasi Dana"><span>Pengeluaran tanpa Alokasi Dana</span><strong><SensitiveMoney visible={balanceVisible} value={unallocatedExpenseAmount || 0} /></strong><small>{unassignedExpenses} transaksi</small></Link> : null}
    </section>
  );
};

const MobileFinanceDashboard = ({ overview, viewModel, user, displayName, balanceVisible, onToggleBalance, onRefresh, isRefreshing, onOpenTransactionDetail, setupContent }) => {
  const { recentTransactions, categoryLookup, transactionAccountLabel, allocationSummary } = viewModel;
  return <section className="mobile-finance-dashboard" aria-label="Ringkasan keuangan mobile"><h1 className="sr-only">Ringkasan Keuangan</h1><MobileFinanceHero overview={overview} user={user} displayName={displayName} balanceVisible={balanceVisible} onToggleBalance={onToggleBalance} onRefresh={onRefresh} isRefreshing={isRefreshing} /><div className="mobile-finance-content"><MobileAlerts alerts={overview.alerts} /><MobileQuickActions />{setupContent}<MobileSharedPlan overview={overview} balanceVisible={balanceVisible} /><MobileTransactions recentTransactions={recentTransactions} categoryLookup={categoryLookup} transactionAccountLabel={transactionAccountLabel} balanceVisible={balanceVisible} onOpenTransactionDetail={onOpenTransactionDetail} /><MobileAllocation allocationSummary={allocationSummary} balanceVisible={balanceVisible} unallocatedFunds={overview.unallocatedFunds} unallocatedCount={overview.unallocatedCount} unallocatedExpenseAmount={overview.unallocatedExpenseAmount} periodKey={overview.periodKey} /><MobileCashFlow cashFlow={overview.cashFlow} balanceVisible={balanceVisible} /><MobileAccounts accounts={overview.accountBalances} balanceVisible={balanceVisible} /></div></section>;
};

export default MobileFinanceDashboard;
