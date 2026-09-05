import baseStyles from "./LoginPage.module.css";
import mobileStyles from "./LoginMobile.module.css";

const styleMaps = Object.freeze([baseStyles, mobileStyles]);
const tokens = (value) => String(value || "").trim().split(/\s+/).filter(Boolean);
const mappedTokens = (name) => {
  const owned = styleMaps.map((styles) => styles[name]).filter(Boolean);
  return owned.length ? owned : [name];
};

// A logical login class may participate in selectors owned by both the base/desktop
// and mobile modules. Emit every owning hash so cross-module compound selectors remain valid.
export const loginClass = (...values) => values
  .flatMap(tokens)
  .flatMap(mappedTokens)
  .join(" ");

export const loginStyle = (name) => mappedTokens(name).join(" ");
