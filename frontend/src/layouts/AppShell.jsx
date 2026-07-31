import { useMemo, useState } from "react";
import { FiLogOut, FiMenu, FiPlus, FiSettings } from "react-icons/fi";
import { NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "../features/auth/AuthContext.jsx";
import SideNavigation from "../components/navigation/SideNavigation.jsx";
import MobileNavigation from "../components/navigation/MobileNavigation.jsx";
import TransactionForm from "../features/transactions/TransactionForm.jsx";
import Brand from "../components/common/Brand.jsx";
import Modal from "../components/common/Modal.jsx";
import Button from "../components/common/Button.jsx";
import ThemeToggle from "../components/common/ThemeToggle.jsx";
import { MOBILE_SECONDARY_NAVIGATION } from "../config/navigation.js";

const initialsFor = (user) => {
  const source = String(user?.name || user?.email || "SB").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

const AppShell = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const dashboardRoute = location.pathname === "/";
  const userInitials = useMemo(() => initialsFor(user), [user]);

  const handleLogout = async () => {
    setLogoutError("");
    try { await logout(); }
    catch (error) { setLogoutError(error.message || "Logout belum berhasil."); }
  };

  return (
    <div className={`app-shell${dashboardRoute ? " app-shell--dashboard" : ""}`}>
      <header className="desktop-app-header">
        <Brand />
        <SideNavigation />
        <div className="desktop-app-header__actions">
          <ThemeToggle />
          <NavLink className="desktop-settings-button" to="/pengaturan" aria-label="Buka pengaturan" title="Pengaturan">
            <FiSettings aria-hidden="true" />
          </NavLink>
          <div className="desktop-user-avatar" aria-label={user?.name || user?.email || "Pengguna"} title={user?.name || user?.email || "Pengguna"}>
            {userInitials}
          </div>
          <button type="button" className="icon-button desktop-logout-button" aria-label="Keluar" onClick={handleLogout}><FiLogOut aria-hidden="true" /></button>
        </div>
      </header>

      <div className="app-shell__main">
        <header className="topbar">
          <button type="button" className="icon-button topbar__menu" aria-label="Buka menu lainnya" onClick={() => setMobileMenuOpen(true)}><FiMenu aria-hidden="true" /></button>
          <Brand compact />
          <div className="topbar__actions">
            <div className="user-chip"><span>{user?.name || user?.email}</span><small>{user?.role}</small></div>
            <ThemeToggle />
            <button type="button" className="icon-button topbar__logout" aria-label="Keluar" onClick={handleLogout}><FiLogOut aria-hidden="true" /></button>
          </div>
        </header>

        <main className="app-content">
          {logoutError ? <div className="notice notice--danger" role="alert">{logoutError}</div> : null}
          <Outlet />
        </main>
      </div>

      {!dashboardRoute ? <button type="button" className="floating-add" onClick={() => setQuickAddOpen(true)} aria-label="Tambah transaksi"><FiPlus aria-hidden="true" /></button> : null}
      <MobileNavigation onQuickAdd={() => setQuickAddOpen(true)} onMore={() => setMobileMenuOpen(true)} moreOpen={mobileMenuOpen} />
      <TransactionForm open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />

      <Modal
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="Menu lainnya"
        description="Akses fitur tambahan, tampilan aplikasi, dan sesi akun."
        size="sm"
      >
        <div className="mobile-menu-list">
          <Button variant="primary" icon={FiPlus} type="button" onClick={() => { setMobileMenuOpen(false); setQuickAddOpen(true); }}>Tambah transaksi</Button>
          {MOBILE_SECONDARY_NAVIGATION.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `mobile-menu-link${isActive ? " active" : ""}`} onClick={() => setMobileMenuOpen(false)}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
          <ThemeToggle showLabel className="mobile-menu-theme" />
          <Button icon={FiLogOut} type="button" onClick={handleLogout}>Keluar</Button>
        </div>
      </Modal>
    </div>
  );
};

export default AppShell;
