import { useRef, useState } from "react";
import { FiLogOut, FiPlus, FiRefreshCw, FiSettings } from "react-icons/fi";
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
import { useFinance } from "../app/FinanceContext.jsx";
import { useTransactionComposer } from "../app/TransactionComposerContext.jsx";
import { useInstallPrompt } from "../hooks/useInstallPrompt.js";
import { useNetworkStatus } from "../hooks/useNetworkStatus.js";
import useMobileTabScrollRestoration from "../hooks/useMobileTabScrollRestoration.js";
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

const AppShell = () => {
  const { user, logout } = useAuth();
  const { isRefreshing, refreshError, refreshAll } = useFinance();
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
  const wideContentRoute = dashboardRoute || location.pathname === "/laporan";
  const desktopTransactionQuickAddVisible = desktopTransactionQuickAddAllowed(location.pathname, user?.role);
  const { offline } = useNetworkStatus();
  const installPrompt = useInstallPrompt();
  const serviceWorkerUpdate = useServiceWorkerUpdate();
  useMobileTabScrollRestoration(location, navigationType);

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
        <header className="desktop-app-header">
          <Brand />
          <div className="desktop-app-header__actions">
            <div className={`sync-indicator${isRefreshing ? " is-active" : ""}`} role="status" aria-live="polite">
              {isRefreshing ? <><FiRefreshCw aria-hidden="true" /><span>Memperbarui</span></> : <span className="sr-only">Data siap</span>}
            </div>
            <ThemeToggle />
            <NavLink className="desktop-settings-button" to="/pengaturan" aria-label="Buka pengaturan" title="Pengaturan">
              <FiSettings aria-hidden="true" />
            </NavLink>
            <UserAvatar user={user} className="desktop-user-avatar" />
            <button type="button" className="icon-button desktop-logout-button" aria-label="Keluar" onClick={handleLogout}><FiLogOut aria-hidden="true" /></button>
          </div>
        </header>

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
            <InstallAppCard {...installPrompt} onInstall={installPrompt.install} />
            {logoutError ? <div className="notice notice--danger" role="alert">{logoutError}</div> : null}
            {refreshError ? <div className="notice notice--warning refresh-notice" role="status"><span>Data lama tetap ditampilkan. Pembaruan terakhir belum berhasil.</span><Button icon={FiRefreshCw} onClick={refreshAll}>Coba lagi</Button></div> : null}
            <Outlet />
          </main>
        </div>
      </div>

      {desktopTransactionQuickAddVisible && !dashboardRoute && !transactionsRoute ? <button type="button" className="floating-add" disabled={offline} onClick={openTransactionComposer} aria-label="Tambah transaksi"><FiPlus aria-hidden="true" /></button> : null}
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
