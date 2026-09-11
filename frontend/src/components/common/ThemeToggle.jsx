import { FiMoon, FiSun } from "react-icons/fi";
import { useTheme } from "../../app/ThemeContext.jsx";
import styles from "./ThemeToggle.module.css";

const ThemeToggle = ({ className = "", showLabel = false, tone = "surface" }) => {
  const { theme, toggleTheme } = useTheme();
  const darkMode = theme === "dark";
  const Icon = darkMode ? FiMoon : FiSun;
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
      <span className={styles.labelIcon} aria-hidden="true"><Icon /></span>
      {showLabel ? <span className={styles.labelCopy}><strong>Mode gelap</strong><small>{darkMode ? "Aktif" : "Nonaktif"}</small></span> : null}
      {showLabel ? <span className={styles.switchTrack} aria-hidden="true"><span className={styles.switchThumb} /></span> : null}
    </button>
  );
};

export default ThemeToggle;
