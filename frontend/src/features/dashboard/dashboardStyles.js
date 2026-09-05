import styles from "./DashboardPage.module.css";

const tokens = (value) => String(value || "").trim().split(/\s+/).filter(Boolean);

// Dashboard-specific selectors are module-scoped. Shared primitives are deliberately
// passed through when this stylesheet does not own them.
export const dashboardClass = (...values) => values
  .flatMap(tokens)
  .map((name) => styles[name] || name)
  .join(" ");

export const dashboardStyle = (name) => styles[name] || name;
