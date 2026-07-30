import { NavLink } from "react-router";
import { PRIMARY_NAVIGATION } from "../../config/navigation.js";
import Brand from "../common/Brand.jsx";

const SideNavigation = () => (
  <aside className="side-navigation" aria-label="Navigasi utama">
    <Brand />
    <nav>
      {PRIMARY_NAVIGATION.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? "active" : undefined}>
          <Icon aria-hidden="true" /><span>{label}</span>
        </NavLink>
      ))}
    </nav>
  </aside>
);

export default SideNavigation;
