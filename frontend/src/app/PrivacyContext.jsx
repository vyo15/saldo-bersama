import { createContext, useCallback, useContext, useMemo, useState } from "react";

const PrivacyContext = createContext(null);

const SESSION_KEY = "saldo-bersama:privacy-mode";

const initialPrivacyState = () => {
  if (typeof window === "undefined") return false;
  try { return window.sessionStorage.getItem(SESSION_KEY) === "hidden"; }
  catch { return false; }
};

export const PrivacyProvider = ({ children }) => {
  const [privacyEnabled, setPrivacyEnabledState] = useState(initialPrivacyState);
  const setPrivacyEnabled = useCallback((next) => {
    setPrivacyEnabledState((current) => {
      const value = typeof next === "function" ? Boolean(next(current)) : Boolean(next);
      try { window.sessionStorage.setItem(SESSION_KEY, value ? "hidden" : "visible"); }
      catch { /* Session storage may be unavailable in hardened browsers. */ }
      return value;
    });
  }, []);
  const value = useMemo(() => ({ privacyEnabled, setPrivacyEnabled, balanceVisible: !privacyEnabled }), [privacyEnabled, setPrivacyEnabled]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
};

export const usePrivacy = () => {
  const value = useContext(PrivacyContext);
  if (!value) throw new Error("usePrivacy harus digunakan di dalam PrivacyProvider.");
  return value;
};
