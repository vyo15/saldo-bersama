import { useMemo, useState } from "react";
import { FiCheckCircle } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router";
import { useFinance } from "../../app/FinanceContext.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import Button from "../../components/common/Button.jsx";
import ContextBack from "../../components/navigation/ContextBack.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { financialAlertGuidance } from "../../shared/workflows/financialAlerts.js";
import { contextualNavigationParent, navigationLabelForPath, safeInternalNavigationTarget } from "../../config/navigation.js";
import {
  mergeNotificationCenterItems,
  notificationRequiresAction,
  useFinancialNotificationReadState,
} from "../../shared/workflows/financialNotifications.js";
import NotificationRow from "./NotificationRow.jsx";
import styles from "./NotificationsPage.module.css";

const FILTERS = Object.freeze([
  { id: "action", label: "Perlu tindakan" },
  { id: "reminder", label: "Lainnya" },
]);

const matchesFilter = (alert, filter) => filter === "all" || (filter === "action" ? notificationRequiresAction(alert) : !notificationRequiresAction(alert));

const NotificationGroup = ({ title, accessibleLabel, alerts, isRead, onOpen, onDismiss }) => {
  if (!alerts.length) return null;
  const headingId = title ? `notification-group-${title.replace(/\s+/g, "-").toLowerCase()}` : undefined;
  return (
    <section className={styles.group} aria-labelledby={headingId} aria-label={title ? undefined : accessibleLabel}>
      {title ? <h2 id={headingId}>{title}</h2> : null}
      <div className={styles.list}>{alerts.map((alert) => <NotificationRow key={alert.id} alert={alert} read={isRead(alert)} onOpen={onOpen} onDismiss={onDismiss} />)}</div>
    </section>
  );
};

const NotificationEmptyState = ({ filter }) => (
  <div className={styles.empty} role="status">
    <span className={styles.emptyIcon}><FiCheckCircle aria-hidden="true" /></span>
    <h2>{filter === "action" ? "Tidak ada tindakan" : "Tidak ada item di sini"}</h2>
    <p>{filter === "action" ? "Tidak ada hal yang perlu ditindaklanjuti saat ini." : "Tidak ada notifikasi lain saat ini."}</p>
  </div>
);

const NotificationContent = ({ alerts, filter, isRead, onOpen, onDismiss }) => {
  const visible = useMemo(() => alerts.filter((alert) => matchesFilter(alert, filter)), [alerts, filter]);
  const actionAlerts = visible.filter(notificationRequiresAction);
  const reminders = visible.filter((alert) => !notificationRequiresAction(alert));
  if (!visible.length) return <NotificationEmptyState filter={filter} />;
  const splitGroups = filter === "all" && actionAlerts.length > 0 && reminders.length > 0;
  return <>
    <NotificationGroup title={splitGroups ? `Perlu dilakukan · ${actionAlerts.length}` : ""} accessibleLabel="Notifikasi yang perlu tindakan" alerts={actionAlerts} isRead={isRead} onOpen={onOpen} onDismiss={onDismiss} />
    <NotificationGroup title={splitGroups ? "Terbaru" : ""} accessibleLabel="Notifikasi terbaru" alerts={reminders} isRead={isRead} onOpen={onOpen} onDismiss={onDismiss} />
  </>;
};

const notificationResourceGate = ({ financeStatus, overview, error, refreshOverview, eventFeed }) => {
  if (["idle", "loading"].includes(financeStatus) && !overview) return <NativePageSkeleton kind="notifications" label="Memuat notifikasi…" />;
  if (financeStatus === "error" && !overview) return <ErrorState error={error} onRetry={refreshOverview} />;
  if (eventFeed.status === "loading" && !overview?.alerts?.length) return <NativePageSkeleton kind="notifications" label="Memuat notifikasi terbaru…" />;
  if (eventFeed.status === "error" && !overview?.alerts?.length) return <ErrorState error={eventFeed.error} onRetry={eventFeed.reload} />;
  return null;
};

const notificationUnreadCopy = (unreadCount) => ({
  desktop: unreadCount ? `${unreadCount} item belum dibaca.` : "Semua kondisi aktif sudah ditinjau.",
  mobile: unreadCount ? `${unreadCount} belum dibaca` : "Semua sudah dibaca",
});

const NotificationsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const notificationParent = contextualNavigationParent(location.pathname) || { to: "/", label: "Beranda" };
  const returnTo = safeInternalNavigationTarget(location.state?.returnTo, notificationParent.to);
  const returnLabel = String(location.state?.returnLabel || navigationLabelForPath(returnTo, notificationParent.label));
  const { overview, status, error, refreshError, refreshOverview } = useFinance();
  const eventFeed = useApiResource("notifications.center", { limit: 80 });
  const [filter, setFilter] = useState("action");
  const centerItems = useMemo(() => mergeNotificationCenterItems(overview?.alerts || [], eventFeed.data?.items || []), [eventFeed.data?.items, overview?.alerts]);
  const notifications = useFinancialNotificationReadState({ alerts: centerItems, readStates: eventFeed.data?.readStates || [] });

  const resourceGate = notificationResourceGate({ financeStatus: status, overview, error, refreshOverview, eventFeed });
  if (resourceGate) return resourceGate;

  const refreshCenter = async () => Promise.allSettled([refreshOverview(), eventFeed.reload()]);
  const openNotification = (alert) => {
    notifications.markRead(alert).catch(() => {});
    const guidanceAlert = alert.guidanceId ? { ...alert, id: alert.guidanceId } : alert;
    if (alert.source === "event" && !alert.guidanceId) {
      navigate(alert.targetPath || "/", { state: { returnTo: "/notifikasi", returnLabel: "Notifikasi" } });
      return;
    }
    const guidance = financialAlertGuidance(guidanceAlert, { source: "notification-center" });
    navigate(guidance.to, { state: { ...guidance.state, returnTo: "/notifikasi", returnLabel: "Notifikasi" } });
  };

  const dismissNotification = (alert) => {
    notifications.dismiss(alert).catch(() => eventFeed.reload().catch(() => {}));
  };

  const actionCount = notifications.alerts.filter(notificationRequiresAction).length;
  const reminderCount = notifications.alerts.length - actionCount;
  const filterCounts = { action: actionCount, reminder: reminderCount };
  const centerRefreshError = refreshError || eventFeed.error || eventFeed.refreshError;
  const unreadCopy = notificationUnreadCopy(notifications.unreadCount);

  return (
    <div className={styles.page}>
      <RefreshWarning error={centerRefreshError} onRetry={refreshCenter} />
      <div className={styles.desktopHeader}>
        <PageHeader
          eyebrow="Pusat perhatian"
          title="Notifikasi"
          description={unreadCopy.desktop}
          help="Pusat notifikasi menggabungkan kondisi keuangan aktif dan kejadian terbaru. Status dibaca tersinkron antarperangkat. Di mobile, geser notifikasi ke kanan untuk membersihkan kemunculan saat ini; kondisi yang berubah dapat muncul lagi sebagai notifikasi baru."
          actions={<Button variant="secondary" onClick={() => notifications.markAllRead().catch(() => {})} disabled={!notifications.unreadCount}>Tandai semua dibaca</Button>}
        />
      </div>

      <header className={styles.header}>
        <ContextBack className={styles.contextBack} to={returnTo} label={returnLabel} />
        <div className={styles.heading}><h1>Notifikasi</h1><p>{unreadCopy.mobile}</p></div>
        <button type="button" className={styles.readAll} onClick={() => notifications.markAllRead().catch(() => {})} disabled={!notifications.unreadCount} aria-label="Tandai semua dibaca" title="Tandai semua dibaca"><FiCheckCircle aria-hidden="true" /></button>
      </header>

      <div className={styles.filterBar}>
        <div className={styles.filters} aria-label="Filter notifikasi">
          {FILTERS.map((item) => <button key={item.id} type="button" className={styles.filter} data-active={filter === item.id ? "true" : "false"} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}><span className={styles.filterLabel}>{item.label}</span><span className={styles.filterCount}>{filterCounts[item.id]}</span></button>)}
        </div>
      </div>

      <div className={styles.content}>
        <NotificationContent alerts={notifications.alerts} filter={filter} isRead={notifications.isRead} onOpen={openNotification} onDismiss={dismissNotification} />
      </div>
    </div>
  );
};

export default NotificationsPage;
