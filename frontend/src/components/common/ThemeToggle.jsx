import { FiMoon, FiSun } from "react-icons/fi";
import { useTheme } from "../../app/ThemeContext.jsx";
import styles from "./ThemeToggle.module.css";

const ThemeToggle = ({ className = "", showLabel = false, tone = "surface" }) => {
  const { theme, toggleTheme } = useTheme();
  const darkMode = theme === "dark";
  const Icon = darkMode ? FiSun : FiMoon;
  const nextLabel = darkMode ? "Aktifkan light mode" : "Aktifkan dark mode";
  const classes = [
    styles.toggle,
    showLabel ? styles.labeled : "",
    tone === "hero" ? styles.hero : "",
    "theme-toggle",
    `theme-toggle--${tone}`,
    showLabel ? "theme-toggle--labeled" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={classes}
      onClick={toggleTheme}
      aria-label={nextLabel}
      aria-pressed={darkMode}
      title={nextLabel}
      data-ui="theme-toggle"
    >
      <Icon aria-hidden="true" />
      {showLabel ? <span>{darkMode ? "Light mode" : "Dark mode"}</span> : null}
    </button>
  );
};

export default ThemeToggle;
