import { useEffect, useMemo, useRef, useState } from "react";
import { FiCheckCircle, FiSearch, FiX } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router";
import { useFinance } from "../../app/FinanceContext.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
import ContextBack from "../../components/navigation/ContextBack.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { financialAlertSelectionGuard } from "../../shared/workflows/financialAlerts.js";
import { contextualNavigationParent, navigationLabelForPath, safeInternalNavigationTarget } from "../../config/navigation.js";
import {
  mergeNotificationCenterItems,
  financialNotificationTitle,
  notificationRequiresAction,
  useFinancialNotificationReadState,
} from "../../shared/workflows/financialNotifications.js";
import NotificationRow from "./NotificationRow.jsx";
import { filterNotificationItems } from "./notificationListFilters.js";
import styles from "./NotificationsPage.module.css";

const FILTERS = Object.freeze([
  { id: "action", label: "Perlu tindakan" },
  { id: "reminder", label: "Pengingat" },
]);

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

const NotificationEmptyState = ({ filter, searching = false }) => (
  <div className={styles.empty} role="status">
    <span className={styles.emptyIcon}><FiCheckCircle aria-hidden="true" /></span>
    <h2>{searching ? "Tidak ditemukan" : filter === "action" ? "Semua aman" : "Belum ada pengingat baru"}</h2>
    <p>{searching ? "Coba kata lain atau tampilkan seluruh notifikasi." : filter === "action" ? "Belum ada hal yang perlu ditindaklanjuti." : "Pengingat dan informasi terbaru akan muncul di sini."}</p>
  </div>
);

const NotificationContent = ({ alerts, filter, isRead, query, unreadOnly, onOpen, onDismiss }) => {
  const visible = useMemo(() => filterNotificationItems(alerts, { filter, query, unreadOnly, isRead }), [alerts, filter, query, unreadOnly, isRead]);
  if (!visible.length) return <NotificationEmptyState filter={filter} searching={Boolean(query.trim() || unreadOnly)} />;
  return <NotificationGroup title="" accessibleLabel={filter === "action" ? "Notifikasi yang perlu tindakan" : "Pengingat dan informasi terbaru"} alerts={visible} isRead={isRead} onOpen={onOpen} onDismiss={onDismiss} />;
};

const notificationResourceGate = ({ financeStatus, overview, error, refreshOverview, eventFeed }) => {
  if (["idle", "loading"].includes(financeStatus) && !overview) return <NativePageSkeleton kind="notifications" label="Memuat notifikasi…" />;
  if (financeStatus === "error" && !overview) return <ErrorState error={error} onRetry={refreshOverview} />;
  if (eventFeed.status === "loading" && !overview?.alerts?.length) return <NativePageSkeleton kind="notifications" label="Memuat notifikasi terbaru…" />;
  if (eventFeed.status === "error" && !overview?.alerts?.length) return <ErrorState error={eventFeed.error} onRetry={eventFeed.reload} />;
  return null;
};

const notificationUnreadCopy = (unreadCount) => ({
  desktop: unreadCount ? `${unreadCount} notifikasi belum dibaca total.` : "Semua kondisi aktif sudah ditinjau.",
  mobile: unreadCount ? `${unreadCount} belum dibaca total` : "Semua sudah dibaca",
});

const NotificationFilterControls = ({ filter, setFilter, filterCounts, searchOpen, setSearchOpen, query, setQuery, searchRef, unreadOnly, setUnreadOnly }) => (
  <>
    <div className={styles.filterBar}>
        <div className={styles.filters} data-active-index={FILTERS.findIndex((item) => item.id === filter)} role="group" aria-label="Filter notifikasi">
          {FILTERS.map((item) => <button key={item.id} type="button" className={styles.filter} data-active={filter === item.id ? "true" : "false"} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} data-notification-filter="true"><span className={styles.filterLabel}>{item.label}</span><span className={styles.filterCount}>{filterCounts[item.id]}</span></button>)}
        </div>
    </div>

    {searchOpen ? <div className={styles.searchBox} id="notification-search">
        <FiSearch aria-hidden="true" />
        <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari notifikasi…" aria-label="Cari berdasarkan judul, rekening, atau informasi" autoComplete="off" />
        {query ? <button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Hapus kata pencarian"><FiX aria-hidden="true" /></button> : null}
    </div> : null}
    <div className={styles.listToolbar}>
        <span>{filter === "action" ? "Perlu perhatian" : "Pengingat terbaru"}</span>
        <div className={styles.listActions}>
        <button type="button" className={styles.searchToggle} aria-expanded={searchOpen} aria-controls={searchOpen ? "notification-search" : undefined} aria-label={searchOpen ? "Tutup pencarian notifikasi" : "Cari notifikasi"} onClick={() => { setSearchOpen((current) => !current); setQuery(""); }}>
          {searchOpen ? <FiX aria-hidden="true" /> : <FiSearch aria-hidden="true" />}
        </button>
        <button type="button" className={styles.unreadOnly} data-active={unreadOnly ? "true" : "false"} aria-pressed={unreadOnly} onClick={() => setUnreadOnly((current) => !current)}>Belum dibaca</button>
        </div>
    </div>
  </>
);

const NotificationsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const notificationParent = contextualNavigationParent(location.pathname) || { to: "/", label: "Beranda" };
  const returnTo = safeInternalNavigationTarget(location.state?.returnTo, notificationParent.to);
  const returnLabel = String(location.state?.returnLabel || navigationLabelForPath(returnTo, notificationParent.label));
  const { overview, status, error, refreshError, refreshOverview } = useFinance();
  const eventFeed = useApiResource("notifications.center", { limit: 80 });
  const [filter, setFilter] = useState("action");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const searchRef = useRef(null);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
  const [pendingAction, setPendingAction] = useState(null);
  const [dismissAnnouncement, setDismissAnnouncement] = useState("");
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
    const { guidance, missingSelection } = financialAlertSelectionGuard(guidanceAlert, { source: "notification-center" });
    if (missingSelection) {
      setPendingAction({ guidance });
      return;
    }
    navigate(guidance.to, { state: { ...guidance.state, returnTo: "/notifikasi", returnLabel: "Notifikasi" } });
  };

  const dismissNotification = (alert) => notifications.dismiss(alert)
      .then(() => setDismissAnnouncement(`${financialNotificationTitle(alert)} dibersihkan dari daftar saat ini.`))
      .catch(() => {
        setDismissAnnouncement("Notifikasi belum berhasil dibersihkan. Daftar akan diperbarui.");
        eventFeed.reload().catch(() => {});
        throw new Error("Gagal membersihkan notifikasi");
      });

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

      <NotificationFilterControls filter={filter} setFilter={setFilter} filterCounts={filterCounts} searchOpen={searchOpen} setSearchOpen={setSearchOpen} query={query} setQuery={setQuery} searchRef={searchRef} unreadOnly={unreadOnly} setUnreadOnly={setUnreadOnly} />
      <span className="sr-only" role="status" aria-live="polite">{dismissAnnouncement}</span>
      <div className={styles.content}>
        <NotificationContent alerts={notifications.alerts} filter={filter} isRead={notifications.isRead} query={query} unreadOnly={unreadOnly} onOpen={openNotification} onDismiss={dismissNotification} />
      </div>

      <Modal
        open={Boolean(pendingAction)}
        title="Pilih data untuk melanjutkan"
        description="Notifikasi ini belum memiliki data spesifik yang bisa dipilih otomatis."
        onClose={() => setPendingAction(null)}
        size="sm"
        mobileSwipeToClose
        footer={<>
          <Button type="button" onClick={() => setPendingAction(null)}>Batal</Button>
          <Button type="button" variant="primary" onClick={() => {
            const guidance = pendingAction?.guidance;
            setPendingAction(null);
            if (guidance) navigate(guidance.to, { state: { ...guidance.state, returnTo: "/notifikasi", returnLabel: "Notifikasi" } });
          }}>Buka halaman terkait</Button>
        </>}
      >
        <p>Data yang terkait dengan notifikasi ini belum dipilih atau sudah tidak tersedia. Buka halaman terkait, lalu pilih data yang ingin diperiksa sebelum melanjutkan tindakan.</p>
      </Modal>
    </div>
  );
};

export default NotificationsPage;
