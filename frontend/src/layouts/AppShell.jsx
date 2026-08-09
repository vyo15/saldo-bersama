import { useState } from "react";
import { FiLogOut, FiPlus, FiRefreshCw, FiSettings } from "react-icons/fi";
import { NavLink, Outlet, useLocation } from "react-router";
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
import { useServiceWorkerUpdate } from "../hooks/useServiceWorkerUpdate.js";
import InstallAppCard from "../components/pwa/InstallAppCard.jsx";
import OfflineBanner from "../components/pwa/OfflineBanner.jsx";
import UpdateAvailableNotice from "../components/pwa/UpdateAvailableNotice.jsx";

const AppShell = () => {
  const { user, logout } = useAuth();
  const { isRefreshing, refreshError, refreshAll } = useFinance();
  const { openTransactionComposer } = useTransactionComposer();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const dashboardRoute = location.pathname === "/";
  const accountsRoute = location.pathname === "/rekening";
  const transactionsRoute = location.pathname === "/transaksi";
  const { offline } = useNetworkStatus();
  const installPrompt = useInstallPrompt();
  const serviceWorkerUpdate = useServiceWorkerUpdate();

  const handleLogout = async () => {
    setLogoutError("");
    try { await logout(); }
    catch (error) { setLogoutError(error.message || "Logout belum berhasil."); }
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

          <main className="app-content">
            {offline ? <OfflineBanner /> : null}
            {serviceWorkerUpdate.updateAvailable ? <UpdateAvailableNotice onUpdate={serviceWorkerUpdate.applyUpdate} /> : null}
            <InstallAppCard {...installPrompt} onInstall={installPrompt.install} />
            {logoutError ? <div className="notice notice--danger" role="alert">{logoutError}</div> : null}
            {refreshError ? <div className="notice notice--warning refresh-notice" role="status"><span>Data lama tetap ditampilkan. Pembaruan terakhir belum berhasil.</span><Button icon={FiRefreshCw} onClick={refreshAll}>Coba lagi</Button></div> : null}
            <Outlet />
          </main>
        </div>
      </div>

      {!dashboardRoute && !transactionsRoute ? <button type="button" className="floating-add" disabled={offline} onClick={openTransactionComposer} aria-label="Tambah transaksi"><FiPlus aria-hidden="true" /></button> : null}
      <MobileNavigation onQuickAdd={openTransactionComposer} onMore={() => setMobileMenuOpen(true)} moreOpen={mobileMenuOpen} quickAddDisabled={offline} />

      <Modal
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="Menu lainnya"
        description="Akses perencanaan, data keuangan, kontrol saldo, dan pengaturan aplikasi."
        size="sm"
      >
        <div className="mobile-menu-list">
          {MOBILE_SECONDARY_GROUPS.map(({ id, label, items }) => (
            <section key={id} className="mobile-menu-section" aria-labelledby={`mobile-menu-${id}`}>
              <h3 id={`mobile-menu-${id}`}>{label}</h3>
              {items.map(({ to, label: itemLabel, icon: Icon }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `mobile-menu-link${isActive ? " active" : ""}`} onClick={() => setMobileMenuOpen(false)}>
                  <Icon aria-hidden="true" /><span>{itemLabel}</span>
                </NavLink>
              ))}
            </section>
          ))}
          <div className="mobile-menu-footer">
            <Button className="mobile-menu-logout" icon={FiLogOut} type="button" onClick={handleLogout}>Keluar</Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default AppShell;
