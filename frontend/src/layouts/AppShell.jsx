import { useState } from "react";
import { FiBell, FiLogOut, FiMenu, FiPlus } from "react-icons/fi";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext.jsx";
import SideNavigation from "../components/navigation/SideNavigation.jsx";
import MobileNavigation from "../components/navigation/MobileNavigation.jsx";
import TransactionForm from "../features/transactions/TransactionForm.jsx";
import Brand from "../components/common/Brand.jsx";
import Modal from "../components/common/Modal.jsx";
import Button from "../components/common/Button.jsx";
import { PRIMARY_NAVIGATION } from "../config/navigation.js";

const AppShell = () => {
  const { user, logout, demoMode } = useAuth();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const secondaryNavigation = PRIMARY_NAVIGATION.slice(3);

  return (
    <div className="app-shell">
      <SideNavigation />
      <div className="app-shell__main">
        <header className="topbar">
          <button type="button" className="icon-button topbar__menu" aria-label="Buka menu lainnya" onClick={() => setMobileMenuOpen(true)}><FiMenu /></button>
          <Brand compact />
          <div className="topbar__actions">
            {demoMode ? <span className="demo-badge">Demo</span> : null}
            <button type="button" className="icon-button" aria-label="Notifikasi"><FiBell /></button>
            <div className="user-chip"><span>{user?.name || user?.email}</span><small>{user?.role}</small></div>
            <button type="button" className="icon-button" aria-label="Keluar" onClick={logout}><FiLogOut /></button>
          </div>
        </header>

        <main className="app-content"><Outlet /></main>
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
