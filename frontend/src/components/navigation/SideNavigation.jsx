import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { useTheme } from "../../app/ThemeContext.jsx";
import sidebarRailMask from "../../assets/layout/sidebar-rail-mask.svg";
import sidebarRailMaskDark from "../../assets/layout/sidebar-rail-mask-dark.svg";
import { DESKTOP_NAVIGATION, matchesNavigationPath } from "../../config/navigation.js";

const DirectNavigationLink = ({ item }) => {
  const { to, label, icon: Icon, end } = item;
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `desktop-module-dock__link${isActive ? " is-active" : ""}`}
      aria-label={`Buka ${label}`}
      data-label={label}
      title={label}
    >
      <Icon aria-hidden="true" />
    </NavLink>
  );
};

const NavigationGroup = ({ item, pathname, openGroupId, setOpenGroupId, triggerRefs }) => {
  const { id, label, icon: Icon, items } = item;
  const open = openGroupId === id;
  const active = items.some((child) => matchesNavigationPath(pathname, child));
  const panelId = `desktop-navigation-${id}`;
  return (
    <div className="desktop-module-dock__group">
      <button
        ref={(node) => {
          if (node) triggerRefs.current.set(id, node);
          else triggerRefs.current.delete(id);
        }}
        type="button"
        className={`desktop-module-dock__link desktop-module-dock__group-trigger${active ? " is-active" : ""}${open ? " is-menu-open" : ""}`}
        aria-label={`Buka menu ${label}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        data-label={label}
        title={label}
        onClick={() => setOpenGroupId((current) => current === id ? "" : id)}
      >
        <Icon aria-hidden="true" />
      </button>

      {open ? (
        <div id={panelId} className="desktop-module-dock__flyout" aria-labelledby={`${panelId}-title`}>
          <div className="desktop-module-dock__flyout-heading"><h2 id={`${panelId}-title`}>{label}</h2></div>
          <div className="desktop-module-dock__flyout-links">
            {items.map(({ to, label: childLabel, icon: ChildIcon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `desktop-module-dock__flyout-link${isActive ? " is-active" : ""}`}>
                <span className="desktop-module-dock__flyout-icon"><ChildIcon aria-hidden="true" /></span>
                <strong>{childLabel}</strong>
                <span className="desktop-module-dock__flyout-chevron" aria-hidden="true">›</span>
              </NavLink>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const NavigationItem = (props) => props.item.items
  ? <NavigationGroup {...props} />
  : <DirectNavigationLink item={props.item} />;

const useNavigationDismiss = (openGroupId, setOpenGroupId, dockRef, triggerRefs) => {
  useEffect(() => {
    if (!openGroupId) return undefined;
    const closeFromOutside = (event) => {
      if (!dockRef.current?.contains(event.target)) setOpenGroupId("");
    };
    const closeFromKeyboard = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const trigger = triggerRefs.current.get(openGroupId);
      setOpenGroupId("");
      window.requestAnimationFrame(() => trigger?.focus());
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [dockRef, openGroupId, setOpenGroupId, triggerRefs]);
};

const SideNavigation = () => {
  const { theme } = useTheme();
  const location = useLocation();
  const [openGroupId, setOpenGroupId] = useState("");
  const dockRef = useRef(null);
  const triggerRefs = useRef(new Map());

  useEffect(() => setOpenGroupId(""), [location.pathname]);
  useNavigationDismiss(openGroupId, setOpenGroupId, dockRef, triggerRefs);

  return (
    <aside ref={dockRef} className="desktop-module-dock" aria-label="Navigasi utama Saldo Bersama">
      <img className="desktop-module-dock__shape" src={theme === "dark" ? sidebarRailMaskDark : sidebarRailMask} alt="" aria-hidden="true" />
      <nav className="desktop-module-dock__navigation" aria-label="Menu utama">
        {DESKTOP_NAVIGATION.map((item) => (
          <NavigationItem
            key={item.to || item.id}
            item={item}
            pathname={location.pathname}
            openGroupId={openGroupId}
            setOpenGroupId={setOpenGroupId}
            triggerRefs={triggerRefs}
          />
        ))}
      </nav>
    </aside>
  );
};

export default SideNavigation;
