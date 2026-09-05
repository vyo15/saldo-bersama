import overviewStyles from "./AllocationOverview.module.css";
import detailStyles from "./AllocationDetail.module.css";
import dialogStyles from "./AllocationDialogs.module.css";

const styleMaps = [overviewStyles, detailStyles, dialogStyles];
const mappedTokens = (value) => String(value || "")
  .split(/\s+/)
  .filter(Boolean)
  .flatMap((name) => styleMaps.map((styles) => styles[name]).filter(Boolean).length
    ? styleMaps.map((styles) => styles[name]).filter(Boolean)
    : [name]);

export const allocationClass = (...values) => values.filter(Boolean).flatMap(mappedTokens).join(" ");
