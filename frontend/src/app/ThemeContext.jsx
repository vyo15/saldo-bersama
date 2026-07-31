import { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);
const STORAGE_KEY = "saldo-bersama-theme";
const THEMES = new Set(["light", "dark"]);

const systemTheme = () => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const storedTheme = () => {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return THEMES.has(value) ? value : null;
  } catch {
    return null;
  }
};

const preferredTheme = () => storedTheme() || systemTheme();

const applyTheme = (theme) => {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute("content", theme === "dark" ? "#0b1015" : "#f4f7f8");
};

export const initializeTheme = () => {
  const theme = preferredTheme();
  applyTheme(theme);
  return theme;
};

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(preferredTheme);

  useEffect(() => {
    applyTheme(theme);
    try { window.localStorage.setItem(STORAGE_KEY, theme); }
    catch { /* Preferensi tetap aktif untuk sesi berjalan bila storage tidak tersedia. */ }
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    setTheme: (nextTheme) => {
      if (THEMES.has(nextTheme)) setThemeState(nextTheme);
    },
    toggleTheme: () => setThemeState((current) => current === "dark" ? "light" : "dark"),
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme harus digunakan di dalam ThemeProvider.");
  return value;
};
