import styles from "./ReportsDesktop.module.css";

const mappedTokens = (value) => String(value || "").split(/\s+/).filter(Boolean).map((name) => styles[name] || name);

export const reportClass = (...values) => values.filter(Boolean).flatMap(mappedTokens).join(" ");
