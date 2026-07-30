import { FiGrid, FiPlus } from "react-icons/fi";
import { NavLink } from "react-router";
import { MOBILE_PRIMARY_NAVIGATION } from "../../config/navigation.js";

const MobileNavigation = ({ onQuickAdd, onMore, moreOpen = false }) => (
  <nav className="mobile-navigation" aria-label="Navigasi mobile">
    {MOBILE_PRIMARY_NAVIGATION.slice(0, 2).map(({ to, label, icon: Icon, end }) => (
      <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? "active" : undefined}><Icon aria-hidden="true" /><span>{label}</span></NavLink>
    ))}
    <button type="button" className="mobile-navigation__add" onClick={onQuickAdd} aria-label="Tambah transaksi"><FiPlus aria-hidden="true" /></button>
    {MOBILE_PRIMARY_NAVIGATION.slice(2).map(({ to, label, icon: Icon, end }) => (
      <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? "active" : undefined}><Icon aria-hidden="true" /><span>{label}</span></NavLink>
    ))}
    <button type="button" className="mobile-navigation__more" onClick={onMore} aria-label="Buka menu lainnya" aria-expanded={moreOpen}><FiGrid aria-hidden="true" /><span>Lainnya</span></button>
  </nav>
);

export default MobileNavigation;
