import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getPublicConfigErrors } from "../../config/env.js";
import { apiClient } from "../../services/api/client.js";

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
      setUser(session);
      setStatus(session ? "authenticated" : "anonymous");
      setError(null);
    } catch (sessionError) {
      setUser(null);
      setStatus("error");
      setError(sessionError);
    }
  }, [configErrors]);

  useEffect(() => { refreshSession(); }, [refreshSession]);
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setStatus("anonymous");
      setError(new Error("Sesi sudah berakhir. Silakan login kembali."));
    };
    window.addEventListener("saldo-bersama:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("saldo-bersama:unauthorized", handleUnauthorized);
  }, []);

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
