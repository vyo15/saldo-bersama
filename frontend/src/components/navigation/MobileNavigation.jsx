import { FiGrid, FiPlus } from "react-icons/fi";
import { NavLink } from "react-router-dom";
import { MOBILE_NAVIGATION } from "../../config/navigation.js";

const MobileNavigation = ({ onQuickAdd, onMore, moreOpen = false }) => (
  <nav className="mobile-navigation" aria-label="Navigasi mobile">
    {MOBILE_NAVIGATION.slice(0, 2).map(({ to, label, icon: Icon, end }) => (
      <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? "active" : undefined}><Icon /><span>{label}</span></NavLink>
    ))}
    <button type="button" className="mobile-navigation__add" onClick={onQuickAdd} aria-label="Tambah transaksi"><FiPlus /></button>
    {MOBILE_NAVIGATION.slice(2, 3).map(({ to, label, icon: Icon }) => (
      <NavLink key={to} to={to} className={({ isActive }) => isActive ? "active" : undefined}><Icon /><span>{label}</span></NavLink>
    ))}
    <button type="button" className="mobile-navigation__more" onClick={onMore} aria-label="Buka menu lainnya" aria-expanded={moreOpen}><FiGrid /><span>Lainnya</span></button>
  </nav>
);

export default MobileNavigation;
