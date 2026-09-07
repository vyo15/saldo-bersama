import { useEffect, useRef, useState } from "react";
import { FiBell, FiChevronDown, FiLogOut, FiPlus, FiRefreshCw, FiSettings } from "react-icons/fi";
import { NavLink, Outlet, useLocation, useNavigationType } from "react-router";
import { useAuth } from "../features/auth/AuthContext.jsx";
import SideNavigation from "../components/navigation/SideNavigation.jsx";
import MobileNavigation from "../components/navigation/MobileNavigation.jsx";
import Brand from "../components/common/Brand.jsx";
import Modal from "../components/common/Modal.jsx";
import Button from "../components/common/Button.jsx";
import ThemeToggle from "../components/common/ThemeToggle.jsx";
import UserAvatar from "../components/common/UserAvatar.jsx";
import { MOBILE_SECONDARY_GROUPS } from "../config/navigation.js";
import { useFinancialNotificationReadState } from "../shared/workflows/financialNotifications.js";
import { useFinance } from "../app/FinanceContext.jsx";
import { useTransactionComposer } from "../app/TransactionComposerContext.jsx";
import { useInstallPrompt } from "../hooks/useInstallPrompt.js";
import { useNetworkStatus } from "../hooks/useNetworkStatus.js";
import useMobileTabScrollRestoration from "../hooks/useMobileTabScrollRestoration.js";
import useRoutePrefetch from "../hooks/useRoutePrefetch.js";
import { useServiceWorkerUpdate } from "../hooks/useServiceWorkerUpdate.js";
import InstallAppCard from "../components/pwa/InstallAppCard.jsx";
import OfflineBanner from "../components/pwa/OfflineBanner.jsx";
import UpdateAvailableNotice from "../components/pwa/UpdateAvailableNotice.jsx";
import "../styles/app.css";
import "../styles/responsive.css";

const DESKTOP_LOCAL_CREATE_ROUTES = new Set([
  "/rekening",
  "/perencanaan",
  "/target",
  "/kategori",
  "/investasi",
]);

const desktopTransactionQuickAddAllowed = (pathname, role) => {
  const normalizedPath = pathname === "/" ? "/" : `/${String(pathname || "").replace(/^\/+|\/+$/g, "")}`;
  if (normalizedPath === "/404" || normalizedPath === "/anggota" || normalizedPath === "/pengaturan" || normalizedPath.startsWith("/pengaturan/")) return false;
  if (role === "owner" && (DESKTOP_LOCAL_CREATE_ROUTES.has(normalizedPath) || normalizedPath.startsWith("/perencanaan/"))) return false;
  return true;
};

const MobileMoreMenu = ({ open, user, initialFocusRef, onClose, onLogout }) => (
  <Modal open={open} onClose={onClose} title="Menu lainnya" size="sm" initialFocusRef={initialFocusRef} mobileSwipeToClose>
    <div className="mobile-menu-list">
      {MOBILE_SECONDARY_GROUPS
        .map((group) => ({ ...group, items: group.items.filter((item) => !item.ownerOnly || user?.role === "owner") }))
        .filter((group) => group.items.length)
        .map(({ id, label, items }, groupIndex) => (
          <section key={id} className="mobile-menu-section" aria-labelledby={`mobile-menu-${id}`}>
            <h3 id={`mobile-menu-${id}`}>{label}</h3>
            {items.map(({ to, label: itemLabel, icon: Icon }, itemIndex) => (
              <NavLink
                key={to}
                ref={groupIndex === 0 && itemIndex === 0 ? initialFocusRef : undefined}
                to={to}
                className={({ isActive }) => `mobile-menu-link${isActive ? " active" : ""}`}
                onClick={onClose}
              >
                <Icon aria-hidden="true" /><span>{itemLabel}</span>
              </NavLink>
            ))}
          </section>
        ))}
      <div className="mobile-menu-footer">
        <Button className="mobile-menu-logout" icon={FiLogOut} type="button" onClick={onLogout}>Keluar</Button>
      </div>
    </div>
  </Modal>
);

const DesktopAccountMenu = ({ user, onLogout }) => {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const accountMenuTriggerRef = useRef(null);
  const location = useLocation();

  useEffect(() => setAccountMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const dismiss = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false);
    };
    const keyboard = (event) => {
      if (event.key !== "Escape") return;
      setAccountMenuOpen(false);
      window.requestAnimationFrame(() => accountMenuTriggerRef.current?.focus());
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", keyboard);
    };
  }, [accountMenuOpen]);

  return (
    <div ref={accountMenuRef} className="desktop-account-menu">
      <button ref={accountMenuTriggerRef} type="button" className="desktop-account-trigger" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((current) => !current)}>
        <UserAvatar user={user} className="desktop-user-avatar" />
        <span className="desktop-account-copy"><strong>{user?.name || "Pengguna"}</strong><small>{user?.role === "owner" ? "Administrator" : "Anggota"}</small></span>
        <FiChevronDown aria-hidden="true" />
      </button>
      {accountMenuOpen ? <div className="desktop-account-popover" role="menu" aria-label="Menu akun">
        <NavLink role="menuitem" to="/pengaturan"><FiSettings aria-hidden="true" /><span>Pengaturan</span></NavLink>
        <button role="menuitem" type="button" onClick={onLogout}><FiLogOut aria-hidden="true" /><span>Keluar</span></button>
      </div> : null}
    </div>
  );
};

const DesktopAppHeader = ({ isRefreshing, notificationState, user, onLogout }) => (
  <header className="desktop-app-header">
    <Brand />
    <div className="desktop-app-header__actions">
      <div className={`sync-indicator${isRefreshing ? " is-active" : ""}`} role="status" aria-live="polite">
        {isRefreshing ? <><FiRefreshCw aria-hidden="true" /><span>Memperbarui</span></> : <span className="sr-only">Data siap</span>}
      </div>
      <NavLink className="desktop-header-action desktop-notification-button" to="/notifikasi" aria-label={notificationState.unreadCount ? `Buka notifikasi, ${notificationState.unreadCount} belum dibaca` : "Buka notifikasi"} title="Notifikasi">
        <FiBell aria-hidden="true" />
        {notificationState.unreadCount ? <span className="desktop-notification-badge" aria-hidden="true">{Math.min(notificationState.unreadCount, 99)}</span> : null}
      </NavLink>
      <ThemeToggle />
      <DesktopAccountMenu user={user} onLogout={onLogout} />
    </div>
  </header>
);

const DesktopFloatingTransactionAdd = ({ visible, offline, onClick }) => visible ? (
  <button type="button" className="floating-add" disabled={offline} onClick={onClick} aria-label="Tambah transaksi"><FiPlus aria-hidden="true" /></button>
) : null;

const AppShell = () => {
  const { user, logout } = useAuth();
  const { isRefreshing, refreshError, refreshAll, overview } = useFinance();
  const { openTransactionComposer } = useTransactionComposer();
  const location = useLocation();
  const navigationType = useNavigationType();
  const [mobileMenuRoute, setMobileMenuRoute] = useState("");
  const [logoutError, setLogoutError] = useState("");
  const mobileMenuInitialFocusRef = useRef(null);
  const mobileMenuOpen = mobileMenuRoute === location.pathname;
  const dashboardRoute = location.pathname === "/";
  const accountsRoute = location.pathname === "/rekening";
  const transactionsRoute = location.pathname === "/transaksi";
  const wideContentRoute = dashboardRoute || location.pathname === "/laporan" || location.pathname === "/investasi";
  const desktopTransactionQuickAddVisible = desktopTransactionQuickAddAllowed(location.pathname, user?.role);
  const { offline } = useNetworkStatus();
  const installPrompt = useInstallPrompt();
  const serviceWorkerUpdate = useServiceWorkerUpdate();
  const notificationState = useFinancialNotificationReadState({ alerts: overview?.alerts || [], scope: user?.uid || user?.email || "anonymous" });
  useMobileTabScrollRestoration(location, navigationType);
  useRoutePrefetch();

  const handleLogout = async () => {
    setLogoutError("");
    try { await logout(); }
    catch (error) { setLogoutError(error.message || "Logout belum berhasil."); }
  };

  const handleMobileLogout = async () => {
    setMobileMenuRoute("");
    await handleLogout();
  };

  return (
    <>
      <SideNavigation />

      <div className={`app-shell${dashboardRoute ? " app-shell--dashboard" : ""}${accountsRoute ? " app-shell--accounts" : ""}`}>
        <DesktopAppHeader isRefreshing={isRefreshing} notificationState={notificationState} user={user} onLogout={handleLogout} />

        <div className="app-shell__main">
          <header className="topbar">
            <Brand compact />
            <div className="topbar__actions">
              <ThemeToggle />
            </div>
          </header>

          <main className={`app-content ${wideContentRoute ? "app-content--wide" : "app-content--standard"}`}>
            {offline ? <OfflineBanner /> : null}
            {serviceWorkerUpdate.updateAvailable ? <UpdateAvailableNotice onUpdate={serviceWorkerUpdate.applyUpdate} /> : null}
            {dashboardRoute ? <InstallAppCard {...installPrompt} onInstall={installPrompt.install} onDismiss={installPrompt.dismiss} /> : null}
            {logoutError ? <div className="notice notice--danger" role="alert">{logoutError}</div> : null}
            {refreshError ? <div className="notice notice--warning refresh-notice" role="status"><span>Data lama tetap ditampilkan. Pembaruan terakhir belum berhasil.</span><Button icon={FiRefreshCw} onClick={refreshAll}>Coba lagi</Button></div> : null}
            <Outlet />
          </main>
        </div>
      </div>

      <DesktopFloatingTransactionAdd visible={desktopTransactionQuickAddVisible && !dashboardRoute && !transactionsRoute} offline={offline} onClick={openTransactionComposer} />
      <MobileNavigation onQuickAdd={openTransactionComposer} onMore={() => setMobileMenuRoute(location.pathname)} moreOpen={mobileMenuOpen} quickAddDisabled={offline} />

      <MobileMoreMenu
        key={`mobile-more-${location.pathname}`}
        open={mobileMenuOpen}
        user={user}
        initialFocusRef={mobileMenuInitialFocusRef}
        onClose={() => setMobileMenuRoute("")}
        onLogout={handleMobileLogout}
      />
    </>
  );
};

export default AppShell;
