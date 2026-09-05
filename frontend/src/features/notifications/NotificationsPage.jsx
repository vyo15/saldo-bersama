import { useMemo, useState } from "react";
import { FiBell, FiCalendar, FiCheckCircle, FiChevronLeft, FiChevronRight, FiInfo, FiPieChart, FiRefreshCw, FiTarget } from "react-icons/fi";
import { useNavigate } from "react-router";
import { useFinance } from "../../app/FinanceContext.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { financialAlertGuidance } from "../../shared/workflows/financialAlerts.js";
import { financialNotificationCategory, financialNotificationTitle, notificationRequiresAction, useFinancialNotificationReadState } from "../../shared/workflows/financialNotifications.js";
import styles from "./NotificationsPage.module.css";

const FILTERS = Object.freeze([
  { id: "all", label: "Semua" },
  { id: "action", label: "Perlu tindakan" },
  { id: "reminder", label: "Pengingat" },
]);

const notificationIcon = (type) => {
  if (["reconciliation_stale", "reconciliation_difference"].includes(type)) return FiRefreshCw;
  if (["recurring_due", "recurring_overdue"].includes(type)) return FiCalendar;
  if (type === "goal_behind") return FiTarget;
  if (["budget_threshold", "envelope_threshold", "unallocated_expense", "unallocated_funds"].includes(type)) return FiPieChart;
  return FiInfo;
};

const notificationTone = (alert) => {
  if (alert.severity === "danger") return "danger";
  if (alert.severity === "warning") return "warning";
  return "info";
};

const matchesFilter = (alert, filter) => filter === "all" || (filter === "action" ? notificationRequiresAction(alert) : !notificationRequiresAction(alert));

const NotificationRow = ({ alert, read, onOpen }) => {
  const Icon = notificationIcon(alert.type);
  const tone = notificationTone(alert);
  return (
    <button type="button" className={styles.row} data-read={read ? "true" : "false"} data-tone={tone} onClick={() => onOpen(alert)}>
      <span className={styles.icon}><Icon aria-hidden="true" /></span>
      <span className={styles.copy}>
        <strong>{financialNotificationTitle(alert)}</strong>
        <span>{alert.message}</span>
        <small>{financialNotificationCategory(alert.type)}</small>
      </span>
      <span className={styles.trailing}>
        {!read ? <i aria-label="Belum dibaca" /> : null}
        <FiChevronRight aria-hidden="true" />
      </span>
    </button>
  );
};

const NotificationGroup = ({ title, alerts, isRead, onOpen }) => {
  if (!alerts.length) return null;
  return (
    <section className={styles.group} aria-labelledby={`notification-group-${title.replace(/\s+/g, "-").toLowerCase()}`}>
      <h2 id={`notification-group-${title.replace(/\s+/g, "-").toLowerCase()}`}>{title}</h2>
      <div className={styles.list}>{alerts.map((alert) => <NotificationRow key={alert.id} alert={alert} read={isRead(alert.id)} onOpen={onOpen} />)}</div>
    </section>
  );
};

const NotificationContent = ({ alerts, filter, isRead, onOpen }) => {
  const visible = useMemo(() => alerts.filter((alert) => matchesFilter(alert, filter)), [alerts, filter]);
  const actionAlerts = visible.filter(notificationRequiresAction);
  const reminders = visible.filter((alert) => !notificationRequiresAction(alert));
  if (!visible.length) return <EmptyState icon={FiCheckCircle} title="Tidak ada notifikasi di sini" description={filter === "all" ? "Belum ada pengingat atau tindakan aktif." : "Tidak ada item yang cocok dengan filter ini."} />;
  return <><NotificationGroup title="Perlu tindakan" alerts={actionAlerts} isRead={isRead} onOpen={onOpen} /><NotificationGroup title="Pengingat" alerts={reminders} isRead={isRead} onOpen={onOpen} /></>;
};

const NotificationsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { overview, status, error, refreshError, refreshOverview } = useFinance();
  const [filter, setFilter] = useState("all");
  const scope = user?.uid || user?.email || "anonymous";
  const notifications = useFinancialNotificationReadState({ alerts: overview?.alerts || [], scope });

  if (["idle", "loading"].includes(status) && !overview) return <LoadingScreen label="Memuat notifikasi..." />;
  if (status === "error" && !overview) return <ErrorState error={error} onRetry={refreshOverview} />;

  const openNotification = (alert) => {
    notifications.markRead(alert.id);
    const guidance = financialAlertGuidance(alert, { source: "notification-center" });
    navigate(guidance.to, { state: { ...guidance.state, notificationSource: "notification-center" } });
  };

  return (
    <div className={styles.page}>
      <RefreshWarning error={refreshError} onRetry={refreshOverview} />
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={() => navigate(-1)} aria-label="Kembali"><FiChevronLeft aria-hidden="true" /></button>
        <div className={styles.heading}><h1>Notifikasi</h1><p>{notifications.unreadCount ? `${notifications.unreadCount} belum dibaca` : "Semua sudah dibaca"}</p></div>
        <button type="button" className={styles.readAll} onClick={notifications.markAllRead} disabled={!notifications.unreadCount}>Tandai dibaca</button>
      </header>

      <div className={styles.filters} aria-label="Filter notifikasi">
        {FILTERS.map((item) => <button key={item.id} type="button" className={styles.filter} data-active={filter === item.id ? "true" : "false"} onClick={() => setFilter(item.id)}>{item.label}</button>)}
      </div>

      <main className={styles.content}>
        <NotificationContent alerts={notifications.alerts} filter={filter} isRead={notifications.isRead} onOpen={openNotification} />
        {notifications.alerts.length ? <p className={styles.note}><FiBell aria-hidden="true" />Notifikasi di sini berasal dari kondisi keuangan aktif. Setelah kondisinya selesai, item akan hilang otomatis dari daftar.</p> : null}
      </main>
    </div>
  );
};

export default NotificationsPage;
