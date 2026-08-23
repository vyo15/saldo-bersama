/**
 * Frontend auth state mirrors the backend session; it is never an authorization boundary.
 * Role/allowlist enforcement remains server-side for every protected action.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getPublicConfigErrors } from "../../config/env.js";
import { apiClient } from "../../services/api/client.js";
import { disablePushNotifications } from "../../services/notifications.js";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const configErrors = useMemo(() => getPublicConfigErrors(), []);

  const refreshSession = useCallback(async () => {
    if (configErrors.length) {
      setStatus("config-error");
      return;
    }
    setStatus("loading");
    try {
      const session = await apiClient.session();
      apiClient.setSessionScope(session?.uid || session?.email || "anonymous");
      setUser(session);
      setStatus(session ? "authenticated" : "anonymous");
      setError(null);
      if (!session) await disablePushNotifications({ bestEffort: true, localOnly: true });
    } catch (sessionError) {
      apiClient.setSessionScope("anonymous");
      setUser(null);
      setStatus("error");
      setError(sessionError);
    }
  }, [configErrors]);

  useEffect(() => { refreshSession(); }, [refreshSession]);
  useEffect(() => {
    const handleUnauthorized = (event) => {
      const detail = event?.detail || {};
      apiClient.setSessionScope("anonymous");
      setUser(null);
      setStatus("anonymous");
      setError(new Error(detail.message || "Sesi sudah berakhir. Silakan login kembali."));
      disablePushNotifications({ bestEffort: true, localOnly: true }).catch(() => {});
      if (detail.actorFatal) apiClient.logout().catch(() => { apiClient.setSessionScope("anonymous"); });
    };
    window.addEventListener("saldo-bersama:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("saldo-bersama:unauthorized", handleUnauthorized);
  }, []);

  // Firebase proves identity to the backend; only the returned server session becomes
  // application auth state after backend allowlist/role validation.
  const loginWithFirebaseToken = useCallback(async (firebaseIdToken) => {
    setStatus("loading");
    try {
      const session = await apiClient.createSession(firebaseIdToken);
      setUser(session);
      setStatus("authenticated");
      setError(null);
    } catch (loginError) {
      setStatus("anonymous");
      setError(loginError);
      throw loginError;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await disablePushNotifications({ bestEffort: true });
      await apiClient.logout();
      setUser(null);
      setStatus("anonymous");
      setError(null);
    } catch (logoutError) {
      setError(logoutError);
      setStatus("authenticated");
      throw logoutError;
    }
  }, []);

  const value = useMemo(() => ({
    user,
    status,
    error,
    configErrors,
    loginWithFirebaseToken,
    logout,
    refreshSession,
  }), [configErrors, error, loginWithFirebaseToken, logout, refreshSession, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth harus digunakan di dalam AuthProvider.");
  return value;
};
