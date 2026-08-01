import { NavLink } from "react-router";
import { useTheme } from "../../app/ThemeContext.jsx";
import sidebarRailMask from "../../assets/layout/sidebar-rail-mask.svg";
import sidebarRailMaskDark from "../../assets/layout/sidebar-rail-mask-dark.svg";
import { PRIMARY_NAVIGATION } from "../../config/navigation.js";

const SideNavigation = () => {
  const { theme } = useTheme();

  return (
    <aside className="desktop-module-dock" aria-label="Navigasi utama Saldo Bersama">
      <img
        className="desktop-module-dock__shape"
        src={theme === "dark" ? sidebarRailMaskDark : sidebarRailMask}
        alt=""
        aria-hidden="true"
      />

      <nav className="desktop-module-dock__navigation" aria-label="Menu utama">
        {PRIMARY_NAVIGATION.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `desktop-module-dock__link${isActive ? " is-active" : ""}`}
            aria-label={`Buka ${label}`}
            data-label={label}
            title={label}
          >
            <Icon aria-hidden="true" />
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default SideNavigation;
