import { FiGrid, FiPlus } from "react-icons/fi";
import { NavLink, useLocation } from "react-router";
import { isMobileSecondaryNavigationPath, MOBILE_PRIMARY_NAVIGATION } from "../../config/navigation.js";

const MobileNavigation = ({ onQuickAdd, onMore, moreOpen = false, quickAddDisabled = false, quickAddVisible = true }) => {
  const location = useLocation();
  const secondaryRouteActive = isMobileSecondaryNavigationPath(location.pathname);
  const moreActive = moreOpen || secondaryRouteActive;

  return (
    <nav className={`mobile-navigation${quickAddVisible ? "" : " mobile-navigation--without-add"}`} aria-label="Navigasi mobile">
      {MOBILE_PRIMARY_NAVIGATION.slice(0, 2).map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? "active" : undefined}><Icon aria-hidden="true" /><span>{label}</span></NavLink>
      ))}
      {quickAddVisible ? <button type="button" className="mobile-navigation__add" onClick={onQuickAdd} aria-label="Tambah transaksi" disabled={quickAddDisabled}><FiPlus aria-hidden="true" /></button> : null}
      {MOBILE_PRIMARY_NAVIGATION.slice(2).map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? "active" : undefined}><Icon aria-hidden="true" /><span>{label}</span></NavLink>
      ))}
      <button
        type="button"
        className={`mobile-navigation__more${moreActive ? " active" : ""}`}
        onClick={onMore}
        aria-label="Buka menu lainnya"
        aria-expanded={moreOpen}
        aria-current={secondaryRouteActive ? "page" : undefined}
      >
        <FiGrid aria-hidden="true" /><span>Lainnya</span>
      </button>
    </nav>
  );
};

export default MobileNavigation;
