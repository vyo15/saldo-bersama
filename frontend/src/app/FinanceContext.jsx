import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../services/api/client.js";
import { useAuth } from "../features/auth/AuthContext.jsx";
import { createIdempotencyKey } from "../domain/security.js";

const FinanceContext = createContext(null);

export const FinanceProvider = ({ children }) => {
  const { status, user } = useAuth();
  const [bootstrap, setBootstrap] = useState(null);
  const [overview, setOverview] = useState(null);
  const [state, setState] = useState({ status: "idle", error: null });
  const requestSequence = useRef(0);

  const clearFinanceState = useCallback(() => {
    requestSequence.current += 1;
    setBootstrap(null);
    setOverview(null);
    setState({ status: "idle", error: null });
  }, []);

  const refresh = useCallback(async () => {
    if (status !== "authenticated" || !user) return;
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setState({ status: "loading", error: null });
    try {
      let nextBootstrap;
      try {
        nextBootstrap = await apiClient.request("bootstrap.get");
      } catch (bootstrapError) {
        if (user.role !== "owner" || !["ACCOUNT_NOT_ALLOWED", "SCHEMA_MISSING"].includes(bootstrapError.code)) throw bootstrapError;
        await apiClient.request("system.initialize", {}, { idempotencyKey: createIdempotencyKey() });
        nextBootstrap = await apiClient.request("bootstrap.get");
      }
      const nextOverview = await apiClient.request("dashboard.overview");
      if (requestSequence.current !== sequence) return;
      setBootstrap(nextBootstrap);
      setOverview(nextOverview);
      setState({ status: "ready", error: null });
    } catch (error) {
      if (requestSequence.current !== sequence) return;
      setBootstrap(null);
      setOverview(null);
      setState({ status: "error", error });
    }
  }, [status, user]);

  useEffect(() => {
    if (status !== "authenticated" || !user) {
      clearFinanceState();
      return;
    }
    refresh();
  }, [clearFinanceState, refresh, status, user]);

  const value = useMemo(
    () => ({ bootstrap, overview, ...state, refresh, clearFinanceState }),
    [bootstrap, clearFinanceState, overview, refresh, state],
  );
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};

export const useFinance = () => {
  const value = useContext(FinanceContext);
  if (!value) throw new Error("useFinance harus digunakan di dalam FinanceProvider.");
  return value;
};
