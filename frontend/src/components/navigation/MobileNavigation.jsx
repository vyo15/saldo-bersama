import { FiGrid, FiPlus } from "react-icons/fi";
import { NavLink, useLocation } from "react-router";
import { MOBILE_PRIMARY_NAVIGATION, mobileNavigationArea } from "../../config/navigation.js";

const areaForPrimaryPath = (to) => {
  if (to === "/") return "home";
  if (to === "/perencanaan") return "planning";
  if (to === "/transaksi") return "transactions";
  return "";
};

const MobileNavigation = ({ onQuickAdd, onMore, moreOpen = false, quickAddDisabled = false }) => {
  const location = useLocation();
  const activeArea = mobileNavigationArea(location.pathname);
  const moreActive = moreOpen || activeArea === "more";
  const primaryLinks = MOBILE_PRIMARY_NAVIGATION.map((item) => ({ ...item, area: areaForPrimaryPath(item.to) }));

  const renderPrimaryLink = ({ to, label, icon: Icon, end, area }) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      className={({ isActive }) => isActive || activeArea === area ? "active" : undefined}
      aria-current={activeArea === area ? "page" : undefined}
    >
      <Icon aria-hidden="true" /><span>{label}</span>
    </NavLink>
  );

  return (
    <nav className="mobile-navigation" aria-label="Navigasi mobile">
      {primaryLinks.slice(0, 2).map(renderPrimaryLink)}
      <button type="button" className="mobile-navigation__add" data-preload-action="transaction" onClick={onQuickAdd} aria-label="Catat aktivitas" title="Catat aktivitas" disabled={quickAddDisabled}><FiPlus aria-hidden="true" /></button>
      {primaryLinks.slice(2).map(renderPrimaryLink)}
      <button
        type="button"
        className={`mobile-navigation__more${moreActive ? " active" : ""}`}
        onClick={onMore}
        aria-label="Buka menu lainnya"
        aria-expanded={moreOpen}
        aria-current={activeArea === "more" ? "page" : undefined}
      >
        <FiGrid aria-hidden="true" /><span>Lainnya</span>
      </button>
    </nav>
  );
};

export default MobileNavigation;
