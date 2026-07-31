import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../services/api/client.js";
import { useAuth } from "../features/auth/AuthContext.jsx";
import { createIdempotencyKey } from "../domain/security.js";

const FinanceContext = createContext(null);
const INITIAL_ACTIONS = ["app.initialState", "bootstrap.get", "dashboard.overview"];

export const FinanceProvider = ({ children }) => {
  const { status: authStatus, user } = useAuth();
  const [bootstrap, setBootstrap] = useState(null);
  const [overview, setOverview] = useState(null);
  const [state, setState] = useState({ status: "idle", error: null, refreshError: null });
  const requestSequence = useRef(0);
  const bootstrapRef = useRef(null);
  const overviewRef = useRef(null);

  const clearFinanceState = useCallback(() => {
    requestSequence.current += 1;
    apiClient.invalidate(INITIAL_ACTIONS);
    bootstrapRef.current = null;
    overviewRef.current = null;
    setBootstrap(null);
    setOverview(null);
    setState({ status: "idle", error: null, refreshError: null });
  }, []);

  const loadInitialState = useCallback(async ({ force = false } = {}) => {
    if (authStatus !== "authenticated" || !user) return null;
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setState({
      status: bootstrapRef.current && overviewRef.current ? "refreshing" : "loading",
      error: null,
      refreshError: null,
    });
    try {
      let initial;
      try {
        initial = await apiClient.request("app.initialState", {}, { force });
      } catch (initialError) {
        if (user.role !== "owner" || !["ACCOUNT_NOT_ALLOWED", "SCHEMA_MISSING"].includes(initialError.code)) throw initialError;
        await apiClient.request("system.initialize", {}, { idempotencyKey: createIdempotencyKey() });
        apiClient.invalidate(INITIAL_ACTIONS);
        initial = await apiClient.request("app.initialState", {}, { force: true });
      }
      if (requestSequence.current !== sequence) return initial;
      bootstrapRef.current = initial.bootstrap;
      overviewRef.current = initial.overview;
      setBootstrap(initial.bootstrap);
      setOverview(initial.overview);
      setState({ status: "ready", error: null, refreshError: null });
      return initial;
    } catch (error) {
      if (requestSequence.current !== sequence) return null;
      if (bootstrapRef.current && overviewRef.current) {
        setState({ status: "ready", error: null, refreshError: error });
      } else {
        setBootstrap(null);
        setOverview(null);
        setState({ status: "error", error, refreshError: null });
      }
      throw error;
    }
  }, [authStatus, user]);

  const refreshOverview = useCallback(async () => {
    if (authStatus !== "authenticated" || !user) return null;
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    apiClient.invalidate(["dashboard.overview", "app.initialState"]);
    setState((current) => ({ ...current, status: overviewRef.current ? "refreshing" : "loading", error: null, refreshError: null }));
    try {
      const nextOverview = await apiClient.request("dashboard.overview", {}, { force: true });
      if (requestSequence.current !== sequence) return nextOverview;
      overviewRef.current = nextOverview;
      setOverview(nextOverview);
      setState({ status: "ready", error: null, refreshError: null });
      return nextOverview;
    } catch (error) {
      if (requestSequence.current !== sequence) return null;
      setState(overviewRef.current
        ? { status: "ready", error: null, refreshError: error }
        : { status: "error", error, refreshError: null });
      throw error;
    }
  }, [authStatus, user]);

  const refreshBootstrap = useCallback(async () => {
    if (authStatus !== "authenticated" || !user) return null;
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    apiClient.invalidate(["bootstrap.get", "accounts.list", "categories.list", "app.initialState"]);
    setState((current) => ({ ...current, status: bootstrapRef.current ? "refreshing" : "loading", error: null, refreshError: null }));
    try {
      const nextBootstrap = await apiClient.request("bootstrap.get", {}, { force: true });
      if (requestSequence.current !== sequence) return nextBootstrap;
      bootstrapRef.current = nextBootstrap;
      setBootstrap(nextBootstrap);
      setState({ status: "ready", error: null, refreshError: null });
      return nextBootstrap;
    } catch (error) {
      if (requestSequence.current !== sequence) return null;
      setState(bootstrapRef.current
        ? { status: "ready", error: null, refreshError: error }
        : { status: "error", error, refreshError: null });
      throw error;
    }
  }, [authStatus, user]);

  const refreshAll = useCallback(() => {
    apiClient.invalidate(INITIAL_ACTIONS);
    return loadInitialState({ force: true });
  }, [loadInitialState]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !user) {
      clearFinanceState();
      return;
    }
    loadInitialState({ force: false }).catch(() => {});
  }, [authStatus, clearFinanceState, loadInitialState, user]);

  const value = useMemo(() => ({
    bootstrap,
    overview,
    ...state,
    isRefreshing: state.status === "refreshing",
    refresh: refreshAll,
    refreshAll,
    refreshOverview,
    refreshBootstrap,
    invalidate: apiClient.invalidate,
    clearFinanceState,
  }), [bootstrap, clearFinanceState, overview, refreshAll, refreshBootstrap, refreshOverview, state]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};

export const useFinance = () => {
  const value = useContext(FinanceContext);
  if (!value) throw new Error("useFinance harus digunakan di dalam FinanceProvider.");
  return value;
};
