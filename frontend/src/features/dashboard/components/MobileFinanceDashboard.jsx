import {
  FiAlertTriangle,
  FiBell,
  FiCalendar,
  FiChevronRight,
  FiEye,
  FiEyeOff,
  FiInfo,
  FiList,
  FiPieChart,
  FiTarget,
} from "react-icons/fi";
import { Link } from "react-router";
import { AccountIcon, InvestmentIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import UserAvatar from "../../../components/common/UserAvatar.jsx";
import ProgressBar from "../../../components/common/ProgressBar.jsx";
import ThemeToggle from "../../../components/common/ThemeToggle.jsx";
import { formatDateLongIndonesia } from "../../../domain/dates.js";
import { formatTransactionDate, transactionCategoryIcon, transactionSign, transactionTone } from "../../../shared/presentation/transaction.js";
import { financialAlertGuidance } from "../../../shared/workflows/financialAlerts.js";
import { financialNotificationTitle, useFinancialNotificationReadState } from "../../../shared/workflows/financialNotifications.js";
import { dashboardDueLabel, dashboardInsightState, formatPeriod } from "../dashboardPresentation.js";
import SensitiveMoney from "./SensitiveMoney.jsx";
import { dashboardClass } from "../dashboardStyles.js";

const FEATURE_QUICK_ACTIONS = Object.freeze([
  { to: "/perencanaan/kantong", label: "Alokasi Dana", icon: FiPieChart, tone: "allocation" },
  { to: "/perencanaan/jadwal", label: "Jadwal Rutin", icon: FiCalendar, tone: "recurring" },
  { to: "/target", label: "Target", icon: FiTarget, tone: "goal" },
  { to: "/rekening", label: "Rekening", icon: AccountIcon, tone: "account" },
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

const MobileFinanceHero = ({ overview, user, displayName, balanceVisible, onToggleBalance, notificationCount }) => {
  const operatingAccountCount = (overview.accountBalances || []).filter((account) => account.account_type !== "investment").length;
  return (
    <header className={dashboardClass("mobile-finance-hero")}>
      <div className={dashboardClass("mobile-finance-hero__bar")}>
        <div className={dashboardClass("mobile-finance-user")}>
          <UserAvatar user={user} className={dashboardClass("mobile-finance-user__avatar")} />
          <div className={dashboardClass("mobile-finance-user__copy")}>
            <strong>Hai, {displayName}</strong>
            <span>{formatPeriod(overview.periodKey)}</span>
          </div>
        </div>
        <div className={dashboardClass("mobile-finance-hero__actions")}>
          <ThemeToggle tone="hero" className={dashboardClass("mobile-hero-button")} />
          <Link to="/notifikasi" className={dashboardClass("mobile-hero-button mobile-notification-button")} aria-label={notificationCount ? `Buka notifikasi, ${notificationCount} belum dibaca` : "Buka notifikasi"} title="Notifikasi">
            <FiBell aria-hidden="true" />
            {notificationCount ? <span className={dashboardClass("mobile-notification-badge")}>{notificationCount > 9 ? "9+" : notificationCount}</span> : null}
          </Link>
        </div>
      </div>

      <div className={dashboardClass("mobile-finance-identity")}>
        <div className={dashboardClass("mobile-finance-balance-label")}>
          <span>Saldo rekening</span>
          <button type="button" className={dashboardClass("mobile-balance-visibility")} onClick={onToggleBalance} aria-label={balanceVisible ? "Sembunyikan seluruh nominal" : "Tampilkan seluruh nominal"}>
            {balanceVisible ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
          </button>
        </div>
        <div className={dashboardClass(`mobile-finance-balance${balanceVisible ? "" : " mobile-finance-balance--hidden"}`)} aria-live="polite">
          <SensitiveMoney visible={balanceVisible} value={overview.nonInvestmentBalance ?? overview.totalBalance} />
        </div>
        <div className={dashboardClass("mobile-finance-meta")}>
          <span>{operatingAccountCount} rekening aktif</span>
          <span aria-live="polite"><i aria-hidden="true" />{compactSyncLabel(overview.lastSyncedAt)}</span>
        </div>
      </div>

      <div className={dashboardClass("mobile-finance-summary")} aria-label="Ringkasan saldo aman">
        <div><span>Aman digunakan</span><SensitiveMoney visible={balanceVisible} value={overview.safeToSpend} /></div>
        <div><span>Batas aman per hari</span><SensitiveMoney visible={balanceVisible} value={overview.dailySafeToSpend || 0} /></div>
      </div>
    </header>
  );
};

const MobileQuickActions = () => (
  <nav className={dashboardClass("mobile-quick-grid")} aria-label="Akses cepat keuangan">
    {FEATURE_QUICK_ACTIONS.map(({ to, label, icon: Icon, tone }) => (
      <Link key={to} to={to} className={dashboardClass(`mobile-quick-action mobile-quick-action--${tone}`)} aria-label={`Buka ${label}`}>
        <span><Icon aria-hidden="true" /></span>
        <strong>{label}</strong>
      </Link>
    ))}
  </nav>
);

const MobileFinancialInsight = ({ overview, balanceVisible }) => {
  const insight = dashboardInsightState(overview);
  const copy = insight.kind === "safe"
    ? <><SensitiveMoney visible={balanceVisible} value={overview.safeToSpend || 0} /> masih aman digunakan setelah komitmen keuangan bulan ini.</>
    : insight.kind === "cashflow"
      ? <>Arus kas bersih bulan ini negatif. Jaga pengeluaran harian sekitar <SensitiveMoney visible={balanceVisible} value={overview.dailySafeToSpend || 0} /> agar tetap terkendali.</>
      : <>Dana aman digunakan sedang terbatas. Periksa Alokasi Dana dan Jadwal Rutin sebelum menambah pengeluaran baru.</>;

  return (
    <aside className={dashboardClass("mobile-financial-insight")} data-tone={insight.tone} aria-label="Insight keuangan">
      <span className={dashboardClass("mobile-financial-insight__icon")}><FiInfo aria-hidden="true" /></span>
      <span className={dashboardClass("mobile-financial-insight__copy")}><strong>{insight.title}</strong><small>{copy}</small></span>
    </aside>
  );
};

const priorityBudget = (overview) => (overview?.budgets || [])
  .filter((item) => item.status !== "archived")
  .sort((left, right) => {
    const leftRatio = Number(left.amount || 0) > 0 ? Number(left.used_amount || 0) / Number(left.amount) : 0;
    const rightRatio = Number(right.amount || 0) > 0 ? Number(right.used_amount || 0) / Number(right.amount) : 0;
    return rightRatio - leftRatio;
  })[0] || null;

const MobileBudgetPlan = ({ overview, balanceVisible }) => {
  const budget = priorityBudget(overview);
  if (!budget) return (
    <section className={dashboardClass("mobile-finance-section")} aria-labelledby="mobile-budget-plan-title">
      <div className={dashboardClass("mobile-section-heading")}><h2 id="mobile-budget-plan-title">Rencana Keuangan</h2><Link to="/anggaran">Lihat anggaran</Link></div>
      <Link className={dashboardClass("mobile-compact-empty")} to="/anggaran"><span><FiPieChart aria-hidden="true" /></span><span><strong>Belum ada kebutuhan aktif</strong><small>Siapkan anggaran agar pemakaian bulan ini lebih mudah dipantau.</small></span><FiChevronRight aria-hidden="true" /></Link>
    </section>
  );

  const used = Math.max(0, Number(budget.used_amount || 0));
  const amount = Math.max(0, Number(budget.amount || 0));
  const remaining = Math.max(0, amount - used);
  const percentage = amount > 0 ? Math.round((used / amount) * 100) : 0;
  const note = used <= 0 ? "Belum ada pemakaian bulan ini" : percentage >= 100 ? "Batas kebutuhan sudah tercapai" : "Masih tersedia untuk bulan ini";
  return (
    <section className={dashboardClass("mobile-finance-section")} aria-labelledby="mobile-budget-plan-title">
      <div className={dashboardClass("mobile-section-heading")}><h2 id="mobile-budget-plan-title">Rencana Keuangan</h2><Link to="/anggaran">Lihat anggaran</Link></div>
      <Link className={dashboardClass("mobile-budget-card")} to="/anggaran">
        <span className={dashboardClass("mobile-budget-card__icon")}><FiPieChart aria-hidden="true" /></span>
        <div className={dashboardClass("mobile-budget-card__copy")}>
          <strong>{budget.name || "Kebutuhan"}</strong>
          <small>Sisa <SensitiveMoney visible={balanceVisible} value={remaining} /></small>
          <ProgressBar value={used} max={amount} label={`Pemakaian ${budget.name || "kebutuhan"}`} />
          <em>{note}</em>
        </div>
      </Link>
    </section>
  );
};

const upcomingRecurring = (overview) => (overview?.recurring || [])
  .filter((item) => !["paid", "cancelled", "archived"].includes(item.occurrence_status || item.status))
  .sort((left, right) => String(left.due_date || "9999").localeCompare(String(right.due_date || "9999")))[0] || null;

const recurringDateLabel = (value) => formatDateLongIndonesia(value) || "Tanggal belum tersedia";

const MobileUpcomingSchedule = ({ overview, balanceVisible }) => {
  const item = upcomingRecurring(overview);
  return (
    <section className={dashboardClass("mobile-finance-section")} aria-labelledby="mobile-upcoming-schedule-title">
      <div className={dashboardClass("mobile-section-heading")}><h2 id="mobile-upcoming-schedule-title">Jadwal Terdekat</h2><Link to="/perencanaan/jadwal">Lihat semua</Link></div>
      {item ? <Link className={dashboardClass("mobile-schedule-card")} to="/perencanaan/jadwal">
        <span className={dashboardClass("mobile-schedule-card__icon")}><FiCalendar aria-hidden="true" /></span>
        <span className={dashboardClass("mobile-schedule-card__copy")}><strong>{item.name || "Jadwal rutin"}</strong><small>{recurringDateLabel(item.due_date)}</small></span>
        <span className={dashboardClass("mobile-schedule-card__meta")}><SensitiveMoney visible={balanceVisible} value={item.expected_amount || item.amount || 0} /><small>{dashboardDueLabel(item.due_date)}</small></span>
      </Link> : <Link className={dashboardClass("mobile-compact-empty")} to="/perencanaan/jadwal"><span><FiCalendar aria-hidden="true" /></span><span><strong>Belum ada jadwal mendatang</strong><small>Buat pemasukan atau pengeluaran rutin agar agenda berikutnya terlihat di sini.</small></span><FiChevronRight aria-hidden="true" /></Link>}
    </section>
  );
};

const MobileNextAction = ({ alerts }) => {
  if (!alerts?.length) return null;
  const alert = alerts[0];
  const guidance = financialAlertGuidance(alert);
  const Icon = alert.severity === "info" ? FiInfo : FiAlertTriangle;
  return <section className={dashboardClass("mobile-finance-section mobile-next-action-section")} aria-labelledby="mobile-next-action-title">
    <div className={dashboardClass("mobile-section-heading mobile-next-action-heading")}><h2 id="mobile-next-action-title">Perlu dilakukan</h2><span>{alerts.length > 1 ? `${alerts.length} notifikasi aktif` : "1 tugas"}</span></div>
    <Link className={dashboardClass("mobile-next-action")} data-severity={alert.severity} to={guidance.to} state={guidance.state} aria-label={`${financialNotificationTitle(alert)}. ${alert.message}`}>
      <span className={dashboardClass("mobile-next-action__icon")}><Icon aria-hidden="true" /></span>
      <span className={dashboardClass("mobile-next-action__copy")}><strong>{financialNotificationTitle(alert)}</strong><small>{alert.message}</small></span>
      <FiChevronRight className={dashboardClass("mobile-next-action__chevron")} aria-hidden="true" />
    </Link>
  </section>;
};

const MobileTransactionItem = ({ item, categoryLookup, transactionAccountLabel, balanceVisible, onOpenTransactionDetail }) => {
  const category = categoryLookup[item.category_id];
  const Icon = transactionCategoryIcon(category, item.transaction_type);
  const title = item.description || item.merchant || category?.name || "Transaksi";
  const sign = balanceVisible ? transactionSign(item.transaction_type) : "";
  const contextLabel = category?.name || transactionAccountLabel(item);
  return <button type="button" className={dashboardClass("mobile-transaction-item")} onClick={() => onOpenTransactionDetail(item.transaction_id)} aria-label={`Buka detail ${title}`}>
    <span className={dashboardClass(`mobile-transaction-icon mobile-transaction-icon--${item.transaction_type || "default"}`)}><Icon aria-hidden="true" /></span>
    <span className={dashboardClass("mobile-transaction-copy")}><strong>{title}</strong><small>{formatTransactionDate(item.transaction_date)} · {contextLabel}</small></span>
    <span className={dashboardClass(`mobile-transaction-amount money--${transactionTone(item.transaction_type)}`)}>{sign}{sign ? " " : ""}<SensitiveMoney visible={balanceVisible} value={item.amount} tone={transactionTone(item.transaction_type)} /></span>
  </button>;
};

const MobileTransactions = ({ recentTransactions, categoryLookup, transactionAccountLabel, balanceVisible, onOpenTransactionDetail }) => (
  <section className={dashboardClass("mobile-finance-section")} aria-labelledby="recent-transactions-title">
    <div className={dashboardClass("mobile-section-heading")}><h2 id="recent-transactions-title">Aktivitas Terbaru</h2><Link to="/transaksi">Lihat semua</Link></div>
    {recentTransactions.length ? <div className={dashboardClass("mobile-transaction-list")}>{recentTransactions.slice(0, 3).map((item) => <MobileTransactionItem key={item.transaction_id} item={item} categoryLookup={categoryLookup} transactionAccountLabel={transactionAccountLabel} balanceVisible={balanceVisible} onOpenTransactionDetail={onOpenTransactionDetail} />)}</div> : <Link className={dashboardClass("mobile-compact-empty")} to="/transaksi"><span><FiList aria-hidden="true" /></span><span><strong>Belum ada aktivitas bulan ini</strong><small>Gunakan tombol + di navigasi bawah untuk mencatat transaksi pertama.</small></span><FiChevronRight aria-hidden="true" /></Link>}
  </section>
);

const investmentReturnPercent = (summary) => {
  const profit = Number(summary?.unrealized_pl || 0);
  const basis = Number(summary?.cost_basis || 0);
  if (!Number.isFinite(profit) || !Number.isFinite(basis) || basis <= 0) return null;
  return (profit / basis) * 100;
};

const percentageLabel = (value) => value == null ? "" : `${value >= 0 ? "+" : ""}${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;

const MobileInvestment = ({ summary, balanceVisible }) => {
  if (!summary) return null;
  const profit = Number(summary.unrealized_pl || 0);
  const tone = profit < 0 ? "negative" : profit > 0 ? "positive" : "default";
  const returnPercent = investmentReturnPercent(summary);
  const hasInvestedAssets = Number(summary.market_value || 0) !== 0 || Number(summary.cost_basis || 0) > 0 || Number(summary.holding_count || 0) > 0;
  return <section className={dashboardClass("mobile-finance-section")} aria-labelledby="mobile-investment-title">
    <div className={dashboardClass("mobile-section-heading")}><h2 id="mobile-investment-title">Investasi</h2><Link to="/investasi">Buka catatan</Link></div>
    <Link className={dashboardClass("mobile-investment-card")} to="/investasi">
      <span className={dashboardClass("mobile-investment-card__icon")}><InvestmentIcon aria-hidden="true" /></span>
      <span className={dashboardClass("mobile-investment-card__copy")}><small>Total investasi tercatat</small><strong><SensitiveMoney visible={balanceVisible} value={summary.portfolio_value || 0} /></strong><em data-tone={tone}>{hasInvestedAssets ? <>{balanceVisible && profit > 0 ? "+" : ""}<SensitiveMoney visible={balanceVisible} value={profit} tone={tone} />{balanceVisible && returnPercent != null ? ` (${percentageLabel(returnPercent)})` : ""}</> : <>Nilai aset <SensitiveMoney visible={balanceVisible} value={summary.market_value || 0} /> · Cash RDN <SensitiveMoney visible={balanceVisible} value={summary.rdn_cash || 0} /></>}</em></span>
      <FiChevronRight className={dashboardClass("mobile-investment-card__chevron")} aria-hidden="true" />
    </Link>
  </section>;
};

const MobileFinanceDashboard = ({ overview, viewModel, investmentSummary, user, displayName, balanceVisible, onToggleBalance, onOpenTransactionDetail, setupContent }) => {
  const { recentTransactions, categoryLookup, transactionAccountLabel } = viewModel;
  const notificationState = useFinancialNotificationReadState({ alerts: overview.alerts || [], scope: user?.uid || user?.email || "anonymous" });
  return <section className={dashboardClass("mobile-finance-dashboard")} aria-label="Ringkasan keuangan mobile">
    <h1 className={dashboardClass("sr-only")}>Ringkasan Keuangan</h1>
    <MobileFinanceHero overview={overview} user={user} displayName={displayName} balanceVisible={balanceVisible} onToggleBalance={onToggleBalance} notificationCount={notificationState.unreadCount} />
    <div className={dashboardClass("mobile-finance-content")}>
      <MobileNextAction alerts={overview.alerts} />
      {setupContent}
      <MobileQuickActions />
      <MobileInvestment summary={investmentSummary} balanceVisible={balanceVisible} />
      <MobileFinancialInsight overview={overview} balanceVisible={balanceVisible} />
      <MobileBudgetPlan overview={overview} balanceVisible={balanceVisible} />
      <MobileUpcomingSchedule overview={overview} balanceVisible={balanceVisible} />
      <MobileTransactions recentTransactions={recentTransactions} categoryLookup={categoryLookup} transactionAccountLabel={transactionAccountLabel} balanceVisible={balanceVisible} onOpenTransactionDetail={onOpenTransactionDetail} />
    </div>
  </section>;
};

export default MobileFinanceDashboard;
