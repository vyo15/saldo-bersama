import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiClient } from "../services/api/client.js";
import { useAuth } from "../features/auth/AuthContext.jsx";

const FinanceContext = createContext(null);

export const FinanceProvider = ({ children }) => {
  const { status, user } = useAuth();
  const [bootstrap, setBootstrap] = useState(null);
  const [overview, setOverview] = useState(null);
  const [state, setState] = useState({ status: "idle", error: null });

  const refresh = useCallback(async () => {
    if (status !== "authenticated") return;
    setState({ status: "loading", error: null });
    try {
      let nextBootstrap;
      try {
        nextBootstrap = await apiClient.request("bootstrap.get");
      } catch (bootstrapError) {
        if (user?.role !== "owner" || !["ACCOUNT_NOT_ALLOWED", "SCHEMA_MISSING"].includes(bootstrapError.code)) throw bootstrapError;
        await apiClient.request("system.initialize", {}, { idempotencyKey: crypto.randomUUID() });
        nextBootstrap = await apiClient.request("bootstrap.get");
      }
      const nextOverview = await apiClient.request("dashboard.overview");
      setBootstrap(nextBootstrap);
      setOverview(nextOverview);
      setState({ status: "ready", error: null });
    } catch (error) {
      setState({ status: "error", error });
    }
  }, [status, user?.role]);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo(() => ({ bootstrap, overview, ...state, refresh }), [bootstrap, overview, refresh, state]);
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};

export const useFinance = () => {
  const value = useContext(FinanceContext);
  if (!value) throw new Error("useFinance harus digunakan di dalam FinanceProvider.");
  return value;
};
