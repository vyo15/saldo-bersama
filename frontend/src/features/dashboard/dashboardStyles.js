import baseStyles from "./DashboardPage.module.css";
import mobileStyles from "./DashboardMobile.module.css";
import desktopStyles from "./DashboardDesktop.module.css";

const tokens = (value) => String(value || "").trim().split(/\s+/).filter(Boolean);
const styleModules = [baseStyles, mobileStyles, desktopStyles];

// A semantic Dashboard token may have base and desktop declarations. Emit both scoped
// class names so extracting CSS by ownership preserves the original cascade/order.
const scopedClasses = (name) => {
  const matches = styleModules.map((styles) => styles[name]).filter(Boolean);
  return matches.length ? matches : [name];
};

export const dashboardClass = (...values) => values
  .flatMap(tokens)
  .flatMap(scopedClasses)
  .join(" ");
