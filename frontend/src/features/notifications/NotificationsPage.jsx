import { useMemo, useState } from "react";
import { FiBell, FiCalendar, FiCheckCircle, FiChevronLeft, FiChevronRight, FiInfo, FiPieChart, FiRefreshCw, FiTarget } from "react-icons/fi";
import { useNavigate } from "react-router";
import { useFinance } from "../../app/FinanceContext.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import Button from "../../components/common/Button.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { financialAlertGuidance } from "../../shared/workflows/financialAlerts.js";
import {
  financialNotificationEntity,
  financialNotificationFact,
  financialNotificationTitle,
  mergeNotificationCenterItems,
  notificationRequiresAction,
  useFinancialNotificationReadState,
} from "../../shared/workflows/financialNotifications.js";
import styles from "./NotificationsPage.module.css";

const FILTERS = Object.freeze([
  { id: "all", label: "Semua" },
  { id: "action", label: "Tindakan" },
  { id: "reminder", label: "Pengingat" },
]);

const notificationIcon = (type) => {
  if (["reconciliation_stale", "reconciliation_difference", "investment_reconciliation_stale", "investment_reconciliation_difference"].includes(type)) return FiRefreshCw;
  if (["recurring_due", "recurring_overdue", "recurring_funding_shortage", "recurring_completed"].includes(type)) return FiCalendar;
  if (type === "goal_behind") return FiTarget;
  if (type === "manual_reminder") return FiBell;
  if (["budget_threshold", "envelope_threshold", "unallocated_expense", "unallocated_funds"].includes(type)) return FiPieChart;
  return FiInfo;
};

const notificationTone = (alert) => {
  if (alert.severity === "danger") return "danger";
  if (alert.severity === "warning" || alert.type === "recurring_funding_shortage") return "warning";
  return "info";
};

const matchesFilter = (alert, filter) => filter === "all" || (filter === "action" ? notificationRequiresAction(alert) : !notificationRequiresAction(alert));

const NotificationRow = ({ alert, read, onOpen }) => {
  const Icon = notificationIcon(alert.type);
  const tone = notificationTone(alert);
  const entity = financialNotificationEntity(alert);
  const fact = financialNotificationFact(alert);
  const guidanceAlert = alert.guidanceId ? { ...alert, id: alert.guidanceId } : alert;
  const actionLabel = notificationRequiresAction(alert) ? financialAlertGuidance(guidanceAlert, { source: "notification-center" }).actionLabel : "";
  return (
    <button type="button" data-native-enter className={styles.row} data-read={read ? "true" : "false"} data-tone={tone} onClick={() => onOpen(alert)}>
      <span className={styles.icon}><Icon aria-hidden="true" /></span>
      <span className={styles.copy}>
        <strong>{financialNotificationTitle(alert)}</strong>
        {entity ? <span className={styles.entity}>{entity}</span> : null}
        {fact ? <small>{fact}</small> : null}
        {actionLabel ? <span className={styles.actionLabel}>{actionLabel}</span> : null}
      </span>
      <span className={styles.trailing}><FiChevronRight aria-hidden="true" /></span>
    </button>
  );
};

const NotificationGroup = ({ title, accessibleLabel, alerts, isRead, onOpen }) => {
  if (!alerts.length) return null;
  const headingId = title ? `notification-group-${title.replace(/\s+/g, "-").toLowerCase()}` : undefined;
  return (
    <section className={styles.group} aria-labelledby={headingId} aria-label={title ? undefined : accessibleLabel}>
      {title ? <h2 id={headingId}>{title}</h2> : null}
      <div className={styles.list}>{alerts.map((alert) => <NotificationRow key={alert.id} alert={alert} read={isRead(alert)} onOpen={onOpen} />)}</div>
    </section>
  );
};

const NotificationEmptyState = ({ filter }) => (
  <div className={styles.empty} role="status">
    <span className={styles.emptyIcon}><FiCheckCircle aria-hidden="true" /></span>
    <h2>{filter === "all" ? "Semua beres" : "Tidak ada item di sini"}</h2>
    <p>{filter === "all" ? "Tidak ada hal yang perlu diperhatikan saat ini." : "Tidak ada notifikasi yang cocok dengan filter ini."}</p>
  </div>
);

const NotificationContent = ({ alerts, filter, isRead, onOpen }) => {
  const visible = useMemo(() => alerts.filter((alert) => matchesFilter(alert, filter)), [alerts, filter]);
  const actionAlerts = visible.filter(notificationRequiresAction);
  const reminders = visible.filter((alert) => !notificationRequiresAction(alert));
  if (!visible.length) return <NotificationEmptyState filter={filter} />;
  const splitGroups = filter === "all" && actionAlerts.length > 0 && reminders.length > 0;
  return <>
    <NotificationGroup title={splitGroups ? `Perlu dilakukan · ${actionAlerts.length}` : ""} accessibleLabel="Notifikasi yang perlu tindakan" alerts={actionAlerts} isRead={isRead} onOpen={onOpen} />
    <NotificationGroup title={splitGroups ? "Terbaru" : ""} accessibleLabel="Notifikasi terbaru" alerts={reminders} isRead={isRead} onOpen={onOpen} />
  </>;
};

const NotificationsPage = () => {
  const navigate = useNavigate();
  const { overview, status, error, refreshError, refreshOverview } = useFinance();
  const eventFeed = useApiResource("notifications.center", { limit: 80 });
  const [filter, setFilter] = useState("all");
  const centerItems = useMemo(() => mergeNotificationCenterItems(overview?.alerts || [], eventFeed.data?.items || []), [eventFeed.data?.items, overview?.alerts]);
  const notifications = useFinancialNotificationReadState({ alerts: centerItems, readStates: eventFeed.data?.readStates || [] });

  if (["idle", "loading"].includes(status) && !overview) return <NativePageSkeleton kind="notifications" label="Memuat notifikasi…" />;
  if (status === "error" && !overview) return <ErrorState error={error} onRetry={refreshOverview} />;
  if (eventFeed.status === "error" && !overview?.alerts?.length) return <ErrorState error={eventFeed.error} onRetry={eventFeed.reload} />;

  const refreshCenter = async () => Promise.allSettled([refreshOverview(), eventFeed.reload()]);
  const openNotification = (alert) => {
    notifications.markRead(alert).catch(() => {});
    const guidanceAlert = alert.guidanceId ? { ...alert, id: alert.guidanceId } : alert;
    if (alert.source === "event" && !alert.guidanceId) {
      navigate(alert.targetPath || "/");
      return;
    }
    const guidance = financialAlertGuidance(guidanceAlert, { source: "notification-center" });
    navigate(guidance.to, { state: guidance.state });
  };

  const actionCount = notifications.alerts.filter(notificationRequiresAction).length;
  const reminderCount = notifications.alerts.length - actionCount;
  const filterCounts = { all: notifications.alerts.length, action: actionCount, reminder: reminderCount };
  const centerRefreshError = refreshError || eventFeed.refreshError;

  return (
    <div className={styles.page}>
      <RefreshWarning error={centerRefreshError} onRetry={refreshCenter} />
      <div className={styles.desktopHeader}>
        <PageHeader
          eyebrow="Pusat perhatian"
          title="Notifikasi"
          description={notifications.unreadCount ? `${notifications.unreadCount} item belum dibaca.` : "Semua kondisi aktif sudah ditinjau."}
          help="Pusat notifikasi menggabungkan kondisi keuangan aktif dan kejadian terbaru. Status dibaca tersinkron antarperangkat; kondisi aktif baru hilang setelah sumber masalahnya selesai."
          actions={<Button variant="secondary" onClick={() => notifications.markAllRead().catch(() => {})} disabled={!notifications.unreadCount}>Tandai semua dibaca</Button>}
        />
      </div>

      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)} aria-label="Kembali"><FiChevronLeft aria-hidden="true" /></button>
        <div className={styles.heading}><h1>Notifikasi</h1><p>{notifications.unreadCount ? `${notifications.unreadCount} belum dibaca` : "Semua sudah dibaca"}</p></div>
        <button type="button" className={styles.readAll} onClick={() => notifications.markAllRead().catch(() => {})} disabled={!notifications.unreadCount} aria-label="Tandai semua dibaca" title="Tandai semua dibaca"><FiCheckCircle aria-hidden="true" /></button>
      </header>

      <div className={styles.filterBar}>
        <div className={styles.filters} aria-label="Filter notifikasi">
          {FILTERS.map((item) => <button key={item.id} type="button" className={styles.filter} data-active={filter === item.id ? "true" : "false"} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}><span className={styles.filterLabel}>{item.label}</span><span className={styles.filterCount}>{filterCounts[item.id]}</span></button>)}
        </div>
      </div>

      <div className={styles.content}>
        <NotificationContent alerts={notifications.alerts} filter={filter} isRead={notifications.isRead} onOpen={openNotification} />
      </div>
    </div>
  );
};

export default NotificationsPage;
