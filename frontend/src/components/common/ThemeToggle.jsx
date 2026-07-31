import { FiMoon, FiSun } from "react-icons/fi";
import { useTheme } from "../../app/ThemeContext.jsx";

const ThemeToggle = ({ className = "", showLabel = false, tone = "surface" }) => {
  const { theme, toggleTheme } = useTheme();
  const darkMode = theme === "dark";
  const Icon = darkMode ? FiSun : FiMoon;
  const nextLabel = darkMode ? "Aktifkan light mode" : "Aktifkan dark mode";

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle--${tone}${showLabel ? " theme-toggle--labeled" : ""}${className ? ` ${className}` : ""}`}
      onClick={toggleTheme}
      aria-label={nextLabel}
      aria-pressed={darkMode}
      title={nextLabel}
    >
      <Icon aria-hidden="true" />
      {showLabel ? <span>{darkMode ? "Light mode" : "Dark mode"}</span> : null}
    </button>
  );
};

export default ThemeToggle;
