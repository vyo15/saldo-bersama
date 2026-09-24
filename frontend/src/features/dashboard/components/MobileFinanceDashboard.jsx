import {
  FiAlertTriangle,
  FiBell,
  FiChevronRight,
  FiEye,
  FiEyeOff,
  FiPlus,
} from "react-icons/fi";
import { Link } from "react-router";
import UserAvatar from "../../../components/common/UserAvatar.jsx";
import { formatTransactionDate, transactionCategoryIcon, transactionSign, transactionTone } from "../../../shared/presentation/transaction.js";
import { financialAlertGuidance } from "../../../shared/workflows/financialAlerts.js";
import { financialNotificationFact, financialNotificationTitle, mergeNotificationCenterItems, useFinancialNotificationReadState } from "../../../shared/workflows/financialNotifications.js";
import { dashboardOwnershipBreakdown, dashboardSyncLabel, dashboardUrgentAlerts } from "../dashboardPresentation.js";
import { useApiResource } from "../../../hooks/useApiResource.js";
import DashboardQuickActions from "./DashboardQuickActions.jsx";
import SensitiveMoney from "./SensitiveMoney.jsx";
import { dashboardClass } from "../dashboardStyles.js";

const MobileFinanceHero = ({ overview, user, displayName, balanceVisible, onToggleBalance, notificationCount }) => {
  const ownershipItems = dashboardOwnershipBreakdown(overview.familyBalanceBreakdown);
  return (
    <header className={dashboardClass("mobile-finance-hero")}>
      <div className={dashboardClass("mobile-finance-hero__bar")}>
        <div className={dashboardClass("mobile-finance-user")}>
          <UserAvatar user={user} className={dashboardClass("mobile-finance-user__avatar")} />
          <div className={dashboardClass("mobile-finance-user__copy")}>
            <strong>Hai, {displayName}</strong>
            <span aria-live="polite">{dashboardSyncLabel(overview.lastSyncedAt)}</span>
          </div>
        </div>
        <div className={dashboardClass("mobile-finance-hero__actions")}>
          <Link to="/notifikasi" state={{ returnTo: "/" }} className={dashboardClass("mobile-hero-button mobile-notification-button")} aria-label={notificationCount ? `Buka notifikasi, ${notificationCount} belum dibaca` : "Buka notifikasi"} title="Notifikasi">
            <FiBell aria-hidden="true" />
            {notificationCount ? <span className={dashboardClass("mobile-notification-badge")}>{notificationCount > 9 ? "9+" : notificationCount}</span> : null}
          </Link>
        </div>
      </div>

      <div className={dashboardClass("mobile-finance-card")}>
        <div className={dashboardClass("mobile-finance-identity")}>
          <div className={dashboardClass("mobile-finance-balance-label")}>
            <span>Saldo Keluarga</span>
            <button type="button" className={dashboardClass("mobile-balance-visibility")} onClick={onToggleBalance} aria-label={balanceVisible ? "Sembunyikan seluruh nominal" : "Tampilkan seluruh nominal"}>
              {balanceVisible ? <FiEye aria-hidden="true" /> : <FiEyeOff aria-hidden="true" />}
            </button>
          </div>
          <div className={dashboardClass(`mobile-finance-balance${balanceVisible ? "" : " mobile-finance-balance--hidden"}`)} aria-live="polite">
            <SensitiveMoney visible={balanceVisible} value={overview.familyBalance ?? overview.nonInvestmentBalance ?? 0} />
          </div>
          <div className={dashboardClass("mobile-usable-funds")}>
            <span>Dana yang bisa kamu gunakan</span>
            <strong><SensitiveMoney visible={balanceVisible} value={overview.usableFunds ?? overview.safeToSpend ?? 0} /></strong>
          </div>
        </div>
      </div>

      <nav className={dashboardClass("mobile-ownership-summary")} aria-label="Rincian Saldo Keluarga">
        {ownershipItems.map((item) => (
          <Link key={item.key} to="/rekening" state={{ ownershipFilter: item.key }} aria-label={`${item.label}, buka rekening ${item.label.toLocaleLowerCase("id-ID")}`}>
            <span>{item.label}</span>
            <strong><SensitiveMoney visible={balanceVisible} value={item.amount} compact /></strong>
            <small>{item.helper}</small>
          </Link>
        ))}
      </nav>

      <div className={dashboardClass("mobile-finance-summary")} aria-label="Ringkasan dana harian">
        <div><span>Aman dipakai / hari</span><SensitiveMoney visible={balanceVisible} value={overview.dailySafeToSpend || 0} /></div>
        <div><span>Sisa di Alokasi</span><SensitiveMoney visible={balanceVisible} value={overview.allocatedRemaining || 0} /></div>
      </div>
    </header>
  );
};

const MobileNextAction = ({ alerts }) => {
  if (!alerts?.length) return null;
  const alert = alerts[0];
  const guidance = financialAlertGuidance(alert);
  const title = financialNotificationTitle(alert);
  const fact = financialNotificationFact(alert);
  const Icon = alert.severity === "info" ? FiBell : FiAlertTriangle;
  return <section className={dashboardClass("mobile-finance-section mobile-next-action-section")} aria-labelledby="mobile-next-action-title">
    <div className={dashboardClass("mobile-section-heading mobile-next-action-heading")}><h2 id="mobile-next-action-title">Perlu dilakukan</h2><span>{alerts.length > 1 ? `${alerts.length} perhatian aktif` : "1 tugas"}</span></div>
    <Link className={dashboardClass("mobile-next-action")} data-severity={alert.severity} to={guidance.to} state={guidance.state} aria-label={`${title}. ${fact}`}>
      <span className={dashboardClass("mobile-next-action__icon")}><Icon aria-hidden="true" /></span>
      <span className={dashboardClass("mobile-next-action__copy")}><strong>{title}</strong><small>{fact}</small><em>{guidance.actionLabel}</em></span>
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

const MobileTransactions = ({ recentTransactions, categoryLookup, transactionAccountLabel, transactionCreatorLabel, balanceVisible, onOpenTransactionDetail }) => (
  <section className={dashboardClass("mobile-finance-section mobile-activity-section")} aria-labelledby="recent-transactions-title">
    <div className={dashboardClass("mobile-section-heading")}><h2 id="recent-transactions-title">Aktivitas terbaru</h2>{recentTransactions.length ? <Link to="/transaksi">Lihat semua</Link> : null}</div>
    {recentTransactions.length ? <div className={dashboardClass("mobile-transaction-list")}>{recentTransactions.slice(0, 3).map((item) => <MobileTransactionItem key={item.transaction_id} item={item} categoryLookup={categoryLookup} transactionAccountLabel={transactionAccountLabel} transactionCreatorLabel={transactionCreatorLabel} balanceVisible={balanceVisible} onOpenTransactionDetail={onOpenTransactionDetail} />)}</div> : <div className={dashboardClass("mobile-empty-guidance")}><span className={dashboardClass("mobile-empty-guidance__icon")}><FiPlus aria-hidden="true" /></span><span><strong>Belum ada aktivitas</strong><small>Gunakan tombol Catat di navigasi bawah untuk mencatat aktivitas pertama.</small></span></div>}
  </section>
);

const MobileFinanceDashboard = ({ overview, viewModel, user, displayName, balanceVisible, onToggleBalance, onOpenTransactionDetail, setupContent }) => {
  const { recentTransactions, categoryLookup, transactionAccountLabel, transactionCreatorLabel } = viewModel;
  const notificationEvents = useApiResource("notifications.center", { limit: 80 }, { enabled: Boolean(user) });
  const notificationState = useFinancialNotificationReadState({ alerts: mergeNotificationCenterItems(overview.alerts || [], notificationEvents.data?.items || []), readStates: notificationEvents.data?.readStates || [] });
  const urgentAlerts = dashboardUrgentAlerts(overview.alerts);
  return <section className={dashboardClass("mobile-finance-dashboard")} aria-label="Ringkasan keuangan mobile">
    <h1 className={dashboardClass("sr-only")}>Ringkasan Keuangan</h1>
    <MobileFinanceHero overview={overview} user={user} displayName={displayName} balanceVisible={balanceVisible} onToggleBalance={onToggleBalance} notificationCount={notificationState.unreadCount} />
    <div className={dashboardClass("mobile-finance-content")}>
      <MobileNextAction alerts={urgentAlerts} />
      {setupContent}
      <DashboardQuickActions />
      <MobileTransactions recentTransactions={recentTransactions} categoryLookup={categoryLookup} transactionAccountLabel={transactionAccountLabel} transactionCreatorLabel={transactionCreatorLabel} balanceVisible={balanceVisible} onOpenTransactionDetail={onOpenTransactionDetail} />
    </div>
  </section>;
};

export default MobileFinanceDashboard;
