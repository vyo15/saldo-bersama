import {
  FiAlertTriangle,
  FiBell,
  FiChevronRight,
  FiEye,
  FiEyeOff,
  FiHeart,
  FiPlus,
  FiUser,
  FiUsers,
} from "react-icons/fi";
import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router";
import familyHero from "../../../assets/dashboard/family-hero.webp";
import foliageLeft from "../../../assets/dashboard/foliage-left.webp";
import foliageRight from "../../../assets/dashboard/foliage-right.webp";
import { formatTransactionDate, transactionCategoryIcon, transactionSign, transactionTone } from "../../../shared/presentation/transaction.js";
import { financialAlertGuidance } from "../../../shared/workflows/financialAlerts.js";
import { financialNotificationFact, financialNotificationTitle, mergeNotificationCenterItems, useFinancialNotificationReadState } from "../../../shared/workflows/financialNotifications.js";
import { dashboardOwnershipBreakdown, dashboardSyncLabel, dashboardUrgentAlerts } from "../dashboardPresentation.js";
import { useApiResource } from "../../../hooks/useApiResource.js";
import { prefersReducedMotion, semanticMotionDurationMs, semanticMotionEasing } from "../../../shared/motion.js";
import DashboardQuickActions from "./DashboardQuickActions.jsx";
import SensitiveMoney from "./SensitiveMoney.jsx";
import { dashboardClass } from "../dashboardStyles.js";

const ownershipIcon = (key) => {
  if (key === "self") return FiUser;
  if (key === "partner") return FiHeart;
  return FiUsers;
};

const MobileFinanceHero = ({ overview, displayName, balanceVisible, onToggleBalance, notificationCount }) => {
  const ownershipItems = dashboardOwnershipBreakdown(overview.familyBalanceBreakdown);
  return (
    <header className={dashboardClass("mobile-finance-hero mobile-reference-hero")}>
      <div className={dashboardClass("mobile-reference-topbar")}>
        <div className={dashboardClass("mobile-reference-greeting")}>
          <strong>Halo, {displayName}!</strong>
          <small>{dashboardSyncLabel(overview.lastSyncedAt)}</small>
        </div>
        <div className={dashboardClass("mobile-reference-actions")}>
          <Link to="/notifikasi" state={{ returnTo: "/" }} className={dashboardClass("mobile-reference-icon-button mobile-notification-button")} aria-label={notificationCount ? `Buka notifikasi, ${notificationCount} belum dibaca` : "Buka notifikasi"} title="Notifikasi">
            <FiBell aria-hidden="true" />
            {notificationCount ? <span className={dashboardClass("mobile-notification-badge")}>{notificationCount > 9 ? "9+" : notificationCount}</span> : null}
          </Link>
        </div>
      </div>

      <section className={dashboardClass("mobile-family-hero")} aria-label="Saldo Keluarga">
        <div className={dashboardClass("mobile-family-hero__copy")}>
          <div className={dashboardClass("mobile-family-hero__label")}>
            <span>Saldo Keluarga</span>
            <button type="button" className={dashboardClass("mobile-balance-visibility")} onClick={onToggleBalance} aria-label={balanceVisible ? "Sembunyikan seluruh nominal" : "Tampilkan seluruh nominal"} aria-pressed={!balanceVisible}>
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

        <div className={dashboardClass("mobile-family-hero__art")} aria-hidden="true">
          <img className={dashboardClass("mobile-family-hero__foliage mobile-family-hero__foliage--left")} src={foliageLeft} width="900" height="675" decoding="async" alt="" />
          <img className={dashboardClass("mobile-family-hero__foliage mobile-family-hero__foliage--right")} src={foliageRight} width="900" height="675" decoding="async" alt="" />
          <img className={dashboardClass("mobile-family-hero__people")} src={familyHero} width="980" height="735" decoding="async" alt="" />
        </div>
      </section>

      <nav className={dashboardClass("mobile-ownership-summary mobile-reference-ownership")} aria-label="Rincian Saldo Keluarga">
        {ownershipItems.map((item) => {
          const Icon = ownershipIcon(item.key);
          return (
            <Link key={item.key} className={dashboardClass(`mobile-owner-card mobile-owner-card--${item.key}`)} to="/rekening" state={{ ownershipFilter: item.key }} aria-label={`${item.label}, buka rekening ${item.label.toLocaleLowerCase("id-ID")}`}>
              <span className={dashboardClass("mobile-owner-card__icon")}><Icon aria-hidden="true" /></span>
              <span className={dashboardClass("mobile-owner-card__copy")}>
                <small>{item.label}</small>
                <strong><SensitiveMoney visible={balanceVisible} value={item.amount} compact /></strong>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className={dashboardClass("mobile-finance-summary mobile-reference-summary")} aria-label="Ringkasan dana harian">
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
  return (
    <section className={dashboardClass("mobile-finance-section mobile-reference-panel mobile-next-action-section")} aria-labelledby="mobile-next-action-title">
      <div className={dashboardClass("mobile-section-heading mobile-reference-panel__heading mobile-next-action-heading")}>
        <h2 id="mobile-next-action-title">Perlu dilakukan</h2>
        <Link to="/notifikasi" state={{ returnTo: "/" }}>Lihat semua</Link>
      </div>
      <Link className={dashboardClass("mobile-next-action")} data-severity={alert.severity} to={guidance.to} state={guidance.state} aria-label={`${title}. ${fact}`}>
        <span className={dashboardClass("mobile-next-action__icon")}><Icon aria-hidden="true" /></span>
        <span className={dashboardClass("mobile-next-action__copy")}><strong>{title}</strong><small>{fact}</small><em>{guidance.actionLabel}</em></span>
        <FiChevronRight className={dashboardClass("mobile-next-action__chevron")} aria-hidden="true" />
      </Link>
    </section>
  );
};

const MobileTransactionItem = ({ item, categoryLookup, transactionAccountLabel, transactionCreatorLabel, balanceVisible, onOpenTransactionDetail }) => {
  const category = categoryLookup[item.category_id];
  const Icon = transactionCategoryIcon(category, item.transaction_type);
  const title = item.description || item.merchant || category?.name || "Transaksi";
  const sign = balanceVisible ? transactionSign(item.transaction_type) : "";
  const contextLabel = category?.name || transactionAccountLabel(item);
  return <button type="button" data-native-enter data-transaction-id={item.transaction_id} className={dashboardClass("mobile-transaction-item")} onClick={() => onOpenTransactionDetail(item.transaction_id)} aria-label={`Buka detail ${title}`}>
    <span className={dashboardClass(`mobile-transaction-icon mobile-transaction-icon--${item.transaction_type || "default"}`)}><Icon aria-hidden="true" /></span>
    <span className={dashboardClass("mobile-transaction-copy")}><strong>{title}</strong><small>{formatTransactionDate(item.transaction_date)} · {contextLabel} · dicatat {transactionCreatorLabel(item)}</small></span>
    <span className={dashboardClass(`mobile-transaction-amount money--${transactionTone(item.transaction_type)}`)}>{sign}{sign ? " " : ""}<SensitiveMoney visible={balanceVisible} value={item.amount} tone={transactionTone(item.transaction_type)} /></span>
    <FiChevronRight className={dashboardClass("mobile-transaction-chevron")} aria-hidden="true" />
  </button>;
};

const MobileTransactions = ({ recentTransactions, categoryLookup, transactionAccountLabel, transactionCreatorLabel, balanceVisible, onOpenTransactionDetail }) => {
  const listRef = useRef(null);
  const positionsRef = useRef(new Map());

  useLayoutEffect(() => {
    const container = listRef.current;
    if (!container) { positionsRef.current = new Map(); return; }
    const rows = [...container.querySelectorAll("[data-transaction-id]")];
    const nextPositions = new Map(rows.map((row) => [row.dataset.transactionId, row.offsetTop]));

    if (!prefersReducedMotion()) {
      const duration = semanticMotionDurationMs("emphasized");
      rows.forEach((row) => {
        const previousTop = positionsRef.current.get(row.dataset.transactionId);
        const currentTop = nextPositions.get(row.dataset.transactionId);
        if (!Number.isFinite(previousTop) || !Number.isFinite(currentTop)) return;
        const delta = previousTop - currentTop;
        if (Math.abs(delta) < 1) return;
        row.animate?.([
          { transform: `translateY(${delta}px)` },
          { transform: "translateY(0)" },
        ], { duration, easing: semanticMotionEasing("enter") });
      });
    }

    positionsRef.current = nextPositions;
  }, [recentTransactions]);

  return (
    <section className={dashboardClass("mobile-finance-section mobile-reference-panel mobile-activity-section")} aria-labelledby="recent-transactions-title">
      <div className={dashboardClass("mobile-section-heading mobile-reference-panel__heading")}><h2 id="recent-transactions-title">Aktivitas terbaru</h2>{recentTransactions.length ? <Link to="/transaksi">Lihat semua</Link> : null}</div>
      {recentTransactions.length ? <div ref={listRef} className={dashboardClass("mobile-transaction-list")}>{recentTransactions.slice(0, 3).map((item) => <MobileTransactionItem key={item.transaction_id} item={item} categoryLookup={categoryLookup} transactionAccountLabel={transactionAccountLabel} transactionCreatorLabel={transactionCreatorLabel} balanceVisible={balanceVisible} onOpenTransactionDetail={onOpenTransactionDetail} />)}</div> : <div className={dashboardClass("mobile-empty-guidance")}><span className={dashboardClass("mobile-empty-guidance__icon")}><FiPlus aria-hidden="true" /></span><span><strong>Belum ada aktivitas</strong><small>Gunakan tombol Catat di navigasi bawah untuk mencatat aktivitas pertama.</small></span></div>}
    </section>
  );
};

const MobileFinanceDashboard = ({ overview, viewModel, user, displayName, balanceVisible, onToggleBalance, onOpenTransactionDetail, setupContent }) => {
  const { recentTransactions, categoryLookup, transactionAccountLabel, transactionCreatorLabel } = viewModel;
  const notificationEvents = useApiResource("notifications.center", { limit: 80 }, { enabled: Boolean(user) });
  const notificationState = useFinancialNotificationReadState({ alerts: mergeNotificationCenterItems(overview.alerts || [], notificationEvents.data?.items || []), readStates: notificationEvents.data?.readStates || [] });
  const urgentAlerts = dashboardUrgentAlerts(overview.alerts);
  return <section className={dashboardClass("mobile-finance-dashboard mobile-reference-dashboard")} aria-label="Ringkasan keuangan mobile">
    <h1 className={dashboardClass("sr-only")}>Ringkasan Keuangan</h1>
    <MobileFinanceHero overview={overview} displayName={displayName} balanceVisible={balanceVisible} onToggleBalance={onToggleBalance} notificationCount={notificationState.unreadCount} />
    <div className={dashboardClass("mobile-finance-content mobile-reference-content")}>
      <MobileNextAction alerts={urgentAlerts} />
      <section className={dashboardClass("mobile-quick-section")} aria-labelledby="mobile-quick-title">
        <h2 id="mobile-quick-title">Aksi Cepat</h2>
        <DashboardQuickActions />
      </section>
      <MobileTransactions recentTransactions={recentTransactions} categoryLookup={categoryLookup} transactionAccountLabel={transactionAccountLabel} transactionCreatorLabel={transactionCreatorLabel} balanceVisible={balanceVisible} onOpenTransactionDetail={onOpenTransactionDetail} />
      <div className={dashboardClass("mobile-reference-setup")}>{setupContent}</div>
    </div>
  </section>;
};

export default MobileFinanceDashboard;
