import { NavLink } from "react-router";
import { PRIMARY_NAVIGATION } from "../../config/navigation.js";

const SideNavigation = () => (
  <nav className="desktop-primary-navigation" aria-label="Navigasi utama">
    {PRIMARY_NAVIGATION.map(({ to, label, icon: Icon, end }) => (
      <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? "active" : undefined}>
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </NavLink>
    ))}
  </nav>
);

export default SideNavigation;
