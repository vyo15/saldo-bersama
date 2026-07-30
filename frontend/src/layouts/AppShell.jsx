import { useState } from "react";
import { FiLogOut, FiMenu, FiPlus } from "react-icons/fi";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext.jsx";
import SideNavigation from "../components/navigation/SideNavigation.jsx";
import MobileNavigation from "../components/navigation/MobileNavigation.jsx";
import TransactionForm from "../features/transactions/TransactionForm.jsx";
import Brand from "../components/common/Brand.jsx";
import Modal from "../components/common/Modal.jsx";
import Button from "../components/common/Button.jsx";
import { MOBILE_SECONDARY_NAVIGATION } from "../config/navigation.js";

const AppShell = () => {
  const { user, logout } = useAuth();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const secondaryNavigation = MOBILE_SECONDARY_NAVIGATION;
  const handleLogout = async () => {
    setLogoutError("");
    try { await logout(); }
    catch (error) { setLogoutError(error.message || "Logout belum berhasil."); }
  };

  return (
    <div className="app-shell">
      <SideNavigation />
      <div className="app-shell__main">
        <header className="topbar">
          <button type="button" className="icon-button topbar__menu" aria-label="Buka menu lainnya" onClick={() => setMobileMenuOpen(true)}><FiMenu /></button>
          <Brand compact />
          <div className="topbar__actions">
            <div className="user-chip"><span>{user?.name || user?.email}</span><small>{user?.role}</small></div>
            <button type="button" className="icon-button" aria-label="Keluar" onClick={handleLogout}><FiLogOut /></button>
          </div>
        </header>

        <main className="app-content">{logoutError ? <div className="notice notice--danger" role="alert">{logoutError}</div> : null}<Outlet /></main>
      </div>
      <button type="button" className="floating-add" onClick={() => setQuickAddOpen(true)} aria-label="Tambah transaksi"><FiPlus /></button>
      <MobileNavigation onQuickAdd={() => setQuickAddOpen(true)} onMore={() => setMobileMenuOpen(true)} moreOpen={mobileMenuOpen} />
      <TransactionForm open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />

      <Modal
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="Menu lainnya"
        description="Buka tagihan, target, laporan, rekening, atau pengaturan."
        size="sm"
      >
        <div className="mobile-menu-list">
          <Button variant="primary" icon={FiPlus} type="button" onClick={() => { setMobileMenuOpen(false); setQuickAddOpen(true); }}>Tambah transaksi</Button>
          {secondaryNavigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `mobile-menu-link${isActive ? " active" : ""}`} onClick={() => setMobileMenuOpen(false)}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </div>
      </Modal>
    </div>
  );
};

export default AppShell;
