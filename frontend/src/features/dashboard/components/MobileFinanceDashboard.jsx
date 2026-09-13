import {
  FiAlertTriangle,
  FiArrowDownLeft,
  FiArrowUpRight,
  FiBell,
  FiCalendar,
  FiChevronRight,
  FiEye,
  FiEyeOff,
  FiPieChart,
  FiPlus,
} from "react-icons/fi";
import { Link } from "react-router";
import { AccountIcon, InvestmentIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import UserAvatar from "../../../components/common/UserAvatar.jsx";
import { formatDateLongIndonesia } from "../../../domain/dates.js";
import { formatTransactionDate, transactionCategoryIcon, transactionSign, transactionTone } from "../../../shared/presentation/transaction.js";
import { financialAlertGuidance } from "../../../shared/workflows/financialAlerts.js";
import { financialNotificationTitle, mergeNotificationCenterItems, useFinancialNotificationReadState } from "../../../shared/workflows/financialNotifications.js";
import { dashboardDueLabel, dashboardNeedEmptyAction, dashboardRecurringEmptyAction, formatPeriod, dashboardSyncLabel } from "../dashboardPresentation.js";
import { useApiResource } from "../../../hooks/useApiResource.js";
import DashboardQuickActions from "./DashboardQuickActions.jsx";
import SensitiveMoney from "./SensitiveMoney.jsx";
import { dashboardClass } from "../dashboardStyles.js";

const MobileFinanceHero = ({ overview, user, displayName, balanceVisible, onToggleBalance, notificationCount }) => (
  <header className={dashboardClass("mobile-finance-hero")}>
    <div className={dashboardClass("mobile-finance-hero__bar")}>
      <div className={dashboardClass("mobile-finance-user")}>
        <UserAvatar user={user} className={dashboardClass("mobile-finance-user__avatar")} />
        <div className={dashboardClass("mobile-finance-user__copy")}>
          <strong>Hai, {displayName}</strong>
          <span>Keuangan keluarga · {formatPeriod(overview.periodKey)}</span>
        </div>
      </div>
      <div className={dashboardClass("mobile-finance-hero__actions")}>
        <Link to="/notifikasi" className={dashboardClass("mobile-hero-button mobile-notification-button")} aria-label={notificationCount ? `Buka notifikasi, ${notificationCount} belum dibaca` : "Buka notifikasi"} title="Notifikasi">
          <FiBell aria-hidden="true" />
          {notificationCount ? <span className={dashboardClass("mobile-notification-badge")}>{notificationCount > 9 ? "9+" : notificationCount}</span> : null}
        </Link>
      </div>
    </div>

    <div className={dashboardClass("mobile-finance-identity")}>
      <div className={dashboardClass("mobile-finance-balance-label")}>
        <span>Dana Tersedia</span>
        <button type="button" className={dashboardClass("mobile-balance-visibility")} onClick={onToggleBalance} aria-label={balanceVisible ? "Sembunyikan seluruh nominal" : "Tampilkan seluruh nominal"}>
          {balanceVisible ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
        </button>
      </div>
      <div className={dashboardClass(`mobile-finance-balance${balanceVisible ? "" : " mobile-finance-balance--hidden"}`)} aria-live="polite">
        <SensitiveMoney visible={balanceVisible} value={overview.safeToSpend || 0} />
      </div>
      <div className={dashboardClass("mobile-finance-meta")}>
        <span>Sisa uang yang aman dipakai setelah kebutuhan dan tagihan.</span>
        <span aria-live="polite"><i aria-hidden="true" />{dashboardSyncLabel(overview.lastSyncedAt)}</span>
      </div>
    </div>

    <div className={dashboardClass("mobile-finance-summary")} aria-label="Ringkasan dana tersedia">
      <div><span>Saldo rekening</span><SensitiveMoney visible={balanceVisible} value={overview.nonInvestmentBalance ?? overview.totalBalance} /></div>
      <div><span>Aman dipakai / hari</span><SensitiveMoney visible={balanceVisible} value={overview.dailySafeToSpend || 0} /></div>
    </div>
  </header>
);

const MobileCashFlow = ({ overview, balanceVisible }) => {
  const cashFlow = overview?.cashFlow || {};
  const cashIn = Number(cashFlow.income || 0) + Number(cashFlow.refund || 0);
  const cashOut = Number(cashFlow.expense || 0);
  const net = cashIn - cashOut;
  const netTone = net < 0 ? "negative" : net > 0 ? "positive" : "default";
  return (
    <section className={dashboardClass("mobile-cash-flow")} aria-labelledby="mobile-cash-flow-title">
      <div className={dashboardClass("mobile-cash-flow__heading")}>
        <h2 id="mobile-cash-flow-title">Bulan ini</h2>
        <span>{formatPeriod(overview.periodKey)}</span>
      </div>
      <div className={dashboardClass("mobile-cash-flow__values")}>
        <div>
          <span><FiArrowDownLeft aria-hidden="true" />Masuk</span>
          <SensitiveMoney visible={balanceVisible} value={cashIn} tone="positive" />
        </div>
        <div>
          <span><FiArrowUpRight aria-hidden="true" />Keluar</span>
          <SensitiveMoney visible={balanceVisible} value={cashOut} tone="negative" />
        </div>
      </div>
      <div className={dashboardClass("mobile-cash-flow__net")}>
        <span>Selisih</span>
        <span className={dashboardClass(`mobile-cash-flow__net-value money--${netTone}`)}>
          {balanceVisible && net > 0 ? "+" : ""}<SensitiveMoney visible={balanceVisible} value={net} tone={netTone} />
        </span>
      </div>
    </section>
  );
};

const MobileEmptyAction = ({ action, onClick }) => {
  const ActionIcon = action.to === "/rekening" ? AccountIcon : FiPlus;
  const hint = action.to === "/rekening" ? "Buka" : "Tambah";
  const content = <>
    <span className={dashboardClass("mobile-empty-action__icon")}><ActionIcon aria-hidden="true" /></span>
    <span className={dashboardClass("mobile-empty-action__copy")}><strong>{action.label}</strong><small>{action.description}</small></span>
    <span className={dashboardClass("mobile-empty-action__hint")}>{hint}</span>
  </>;
  if (onClick) return <button type="button" className={dashboardClass("mobile-empty-action")} onClick={onClick}>{content}</button>;
  return <Link className={dashboardClass("mobile-empty-action")} to={action.to} state={action.state || undefined}>{content}</Link>;
};

const priorityBudget = (overview) => (overview?.budgets || [])
  .filter((item) => item.status !== "archived")
  .sort((left, right) => {
    const leftRatio = Number(left.amount || 0) > 0 ? Number(left.used_amount || 0) / Number(left.amount) : 0;
    const rightRatio = Number(right.amount || 0) > 0 ? Number(right.used_amount || 0) / Number(right.amount) : 0;
    return rightRatio - leftRatio;
  })[0] || null;

const upcomingRecurring = (overview) => (overview?.recurring || [])
  .filter((item) => !["paid", "received", "cancelled", "archived"].includes(item.occurrence_status || item.status))
  .sort((left, right) => String(left.due_date || "9999").localeCompare(String(right.due_date || "9999")))[0] || null;

const recurringDateLabel = (value) => formatDateLongIndonesia(value) || "Tanggal belum tersedia";

const MobileBudgetPlanItem = ({ budget, balanceVisible }) => {
  const used = Math.max(0, Number(budget.used_amount || 0));
  const amount = Math.max(0, Number(budget.amount || 0));
  const remaining = Math.max(0, amount - used);
  const percentage = amount > 0 ? Math.round((used / amount) * 100) : 0;
  const usageLabel = used <= 0 ? "Belum terpakai" : `${percentage}% terpakai`;
  return (
    <Link className={dashboardClass("mobile-plan-item")} to="/perencanaan/kantong" state={{ attentionBudgetId: budget.budget_id }}>
      <span className={dashboardClass("mobile-plan-item__icon")}><FiPieChart aria-hidden="true" /></span>
      <span className={dashboardClass("mobile-plan-item__copy")}>
        <strong>{budget.name || "Kebutuhan"}</strong>
        <small>Sisa <SensitiveMoney visible={balanceVisible} value={remaining} /> · {usageLabel}</small>
      </span>
      <FiChevronRight className={dashboardClass("mobile-plan-item__chevron")} aria-hidden="true" />
    </Link>
  );
};

const MobileSchedulePlanItem = ({ item, balanceVisible }) => (
  <Link className={dashboardClass("mobile-plan-item")} to="/perencanaan/jadwal" state={{ attentionOccurrenceId: item.occurrence_id }}>
    <span className={dashboardClass("mobile-plan-item__icon mobile-plan-item__icon--schedule")}><FiCalendar aria-hidden="true" /></span>
    <span className={dashboardClass("mobile-plan-item__copy")}>
      <strong>{item.name || "Jadwal rutin"}</strong>
      <small>{recurringDateLabel(item.due_date)} · <SensitiveMoney visible={balanceVisible} value={item.expected_amount || item.amount || 0} /></small>
    </span>
    <span className={dashboardClass("mobile-plan-item__aside")}>{dashboardDueLabel(item.due_date)}</span>
  </Link>
);

const MobileUpcomingPlan = ({ overview, balanceVisible }) => {
  const budget = priorityBudget(overview);
  const recurring = upcomingRecurring(overview);
  const needAction = budget ? null : dashboardNeedEmptyAction(overview);
  const recurringAction = recurring ? null : dashboardRecurringEmptyAction(overview);
  if (!budget && !recurring) {
    const operable = (overview.accountBalances || []).some((item) => item.account_type !== "investment" && item.can_transact !== false);
    const action = operable
      ? { label: "Mulai atur dana", description: "Siapkan kebutuhan dan pembayaran rutin agar uang lebih mudah dipantau.", to: "/perencanaan" }
      : { label: "Siapkan rekening", description: "Aktifkan rekening sebelum mulai mengatur dana.", to: "/rekening" };
    return (
      <section className={dashboardClass("mobile-finance-section")} aria-labelledby="mobile-upcoming-plan-title">
        <div className={dashboardClass("mobile-section-heading")}><h2 id="mobile-upcoming-plan-title">Rencana terdekat</h2></div>
        <MobileEmptyAction action={action} />
      </section>
    );
  }

  return (
    <section className={dashboardClass("mobile-finance-section")} aria-labelledby="mobile-upcoming-plan-title">
      <div className={dashboardClass("mobile-section-heading")}><h2 id="mobile-upcoming-plan-title">Rencana terdekat</h2><Link to="/perencanaan">Lihat semua</Link></div>
      <div className={dashboardClass("mobile-plan-list")}>
        {budget ? <MobileBudgetPlanItem budget={budget} balanceVisible={balanceVisible} /> : null}
        {recurring ? <MobileSchedulePlanItem item={recurring} balanceVisible={balanceVisible} /> : null}
      </div>
      {!budget && needAction ? <Link className={dashboardClass("mobile-plan-add-link")} to={needAction.to} state={needAction.state || undefined}>+ {needAction.label}</Link> : null}
      {!recurring && recurringAction ? <Link className={dashboardClass("mobile-plan-add-link")} to={recurringAction.to} state={recurringAction.state || undefined}>+ {recurringAction.label}</Link> : null}
    </section>
  );
};

const MobileNextAction = ({ alerts }) => {
  if (!alerts?.length) return null;
  const alert = alerts[0];
  const guidance = financialAlertGuidance(alert);
  const Icon = alert.severity === "info" ? FiBell : FiAlertTriangle;
  return <section className={dashboardClass("mobile-finance-section mobile-next-action-section")} aria-labelledby="mobile-next-action-title">
    <div className={dashboardClass("mobile-section-heading mobile-next-action-heading")}><h2 id="mobile-next-action-title">Perlu dilakukan</h2><span>{alerts.length > 1 ? `${alerts.length} perhatian aktif` : "1 tugas"}</span></div>
    <Link className={dashboardClass("mobile-next-action")} data-severity={alert.severity} to={guidance.to} state={guidance.state} aria-label={`${financialNotificationTitle(alert)}. ${alert.message}`}>
      <span className={dashboardClass("mobile-next-action__icon")}><Icon aria-hidden="true" /></span>
      <span className={dashboardClass("mobile-next-action__copy")}><strong>{financialNotificationTitle(alert)}</strong><small>{alert.message}</small><em>{guidance.actionLabel}</em></span>
      <FiChevronRight className={dashboardClass("mobile-next-action__chevron")} aria-hidden="true" />
    </Link>
  </section>;
};

const MobileTransactionItem = ({ item, categoryLookup, transactionAccountLabel, transactionCreatorLabel, balanceVisible, onOpenTransactionDetail }) => {
  const category = categoryLookup[item.category_id];
  const Icon = transactionCategoryIcon(category, item.transaction_type);
  const title = item.description || item.merchant || category?.name || "Transaksi";
  const sign = balanceVisible ? transactionSign(item.transaction_type) : "";
  const contextLabel = category?.name || transactionAccountLabel(item);
  return <button type="button" className={dashboardClass("mobile-transaction-item")} onClick={() => onOpenTransactionDetail(item.transaction_id)} aria-label={`Buka detail ${title}`}>
    <span className={dashboardClass(`mobile-transaction-icon mobile-transaction-icon--${item.transaction_type || "default"}`)}><Icon aria-hidden="true" /></span>
    <span className={dashboardClass("mobile-transaction-copy")}><strong>{title}</strong><small>{formatTransactionDate(item.transaction_date)} · {contextLabel} · dicatat {transactionCreatorLabel(item)}</small></span>
    <span className={dashboardClass(`mobile-transaction-amount money--${transactionTone(item.transaction_type)}`)}>{sign}{sign ? " " : ""}<SensitiveMoney visible={balanceVisible} value={item.amount} tone={transactionTone(item.transaction_type)} /></span>
  </button>;
};

const MobileTransactions = ({ recentTransactions, categoryLookup, transactionAccountLabel, transactionCreatorLabel, balanceVisible, onOpenTransactionDetail, onOpenTransaction }) => (
  <section className={dashboardClass("mobile-finance-section")} aria-labelledby="recent-transactions-title">
    <div className={dashboardClass("mobile-section-heading")}><h2 id="recent-transactions-title">Aktivitas terbaru</h2>{recentTransactions.length ? <Link to="/transaksi">Lihat semua</Link> : null}</div>
    {recentTransactions.length ? <div className={dashboardClass("mobile-transaction-list")}>{recentTransactions.slice(0, 3).map((item) => <MobileTransactionItem key={item.transaction_id} item={item} categoryLookup={categoryLookup} transactionAccountLabel={transactionAccountLabel} transactionCreatorLabel={transactionCreatorLabel} balanceVisible={balanceVisible} onOpenTransactionDetail={onOpenTransactionDetail} />)}</div> : <MobileEmptyAction action={{ label: "Catat transaksi", description: "Tambah aktivitas pertama" }} onClick={onOpenTransaction} />}
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
  const hasInvestedAssets = Number(summary.market_value || 0) !== 0 || Number(summary.cost_basis || 0) > 0 || Number(summary.holding_count || 0) > 0;
  if (!hasInvestedAssets) return null;
  const profit = Number(summary.unrealized_pl || 0);
  const tone = profit < 0 ? "negative" : profit > 0 ? "positive" : "default";
  const returnPercent = investmentReturnPercent(summary);
  return <section className={dashboardClass("mobile-finance-section")} aria-labelledby="mobile-investment-title">
    <div className={dashboardClass("mobile-section-heading")}><h2 id="mobile-investment-title">Investasi</h2><Link to="/investasi">Lihat</Link></div>
    <Link className={dashboardClass("mobile-investment-card")} to="/investasi">
      <span className={dashboardClass("mobile-investment-card__icon")}><InvestmentIcon aria-hidden="true" /></span>
      <span className={dashboardClass("mobile-investment-card__copy")}><small>Total investasi tercatat</small><strong><SensitiveMoney visible={balanceVisible} value={summary.market_value || 0} /></strong><em data-tone={tone}>{balanceVisible && profit > 0 ? "+" : ""}<SensitiveMoney visible={balanceVisible} value={profit} tone={tone} />{balanceVisible && returnPercent != null ? ` (${percentageLabel(returnPercent)})` : ""}</em></span>
      <FiChevronRight className={dashboardClass("mobile-investment-card__chevron")} aria-hidden="true" />
    </Link>
  </section>;
};

const MobileFinanceDashboard = ({ overview, viewModel, investmentSummary, user, displayName, balanceVisible, onToggleBalance, onOpenTransactionDetail, onOpenTransaction, setupContent }) => {
  const { recentTransactions, categoryLookup, transactionAccountLabel, transactionCreatorLabel } = viewModel;
  const notificationEvents = useApiResource("notifications.center", { limit: 80 }, { enabled: Boolean(user) });
  const notificationState = useFinancialNotificationReadState({ alerts: mergeNotificationCenterItems(overview.alerts || [], notificationEvents.data?.items || []), readStates: notificationEvents.data?.readStates || [] });
  return <section className={dashboardClass("mobile-finance-dashboard")} aria-label="Ringkasan keuangan mobile">
    <h1 className={dashboardClass("sr-only")}>Ringkasan Keuangan</h1>
    <MobileFinanceHero overview={overview} user={user} displayName={displayName} balanceVisible={balanceVisible} onToggleBalance={onToggleBalance} notificationCount={notificationState.unreadCount} />
    <div className={dashboardClass("mobile-finance-content")}>
      <MobileCashFlow overview={overview} balanceVisible={balanceVisible} />
      <MobileNextAction alerts={overview.alerts} />
      {setupContent}
      <DashboardQuickActions />
      <MobileUpcomingPlan overview={overview} balanceVisible={balanceVisible} />
      <MobileTransactions recentTransactions={recentTransactions} categoryLookup={categoryLookup} transactionAccountLabel={transactionAccountLabel} transactionCreatorLabel={transactionCreatorLabel} balanceVisible={balanceVisible} onOpenTransactionDetail={onOpenTransactionDetail} onOpenTransaction={onOpenTransaction} />
      <MobileInvestment summary={investmentSummary} balanceVisible={balanceVisible} />
    </div>
  </section>;
};

export default MobileFinanceDashboard;
