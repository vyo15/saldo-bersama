/**
 * Shared read-state orchestrator. Server responses remain financial authority; this store
 * only coordinates snapshots, refreshes, cache seeding, and stale-request protection.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../services/api/client.js";
import { useAuth } from "../features/auth/AuthContext.jsx";
import { beginFinanceRequest, createFinanceRequestEpoch, finishFinanceResource, hasPendingFinanceRequest, invalidateFinanceSession, requestOwnsAnyFinanceResource, requestOwnsFinanceResource } from "./financeRequestEpoch.js";

const FinanceContext = createContext(null);
const INITIAL_ACTIONS = ["app.initialState", "bootstrap.get", "dashboard.overview"];

const authenticated = (authStatus, user) => authStatus === "authenticated" && Boolean(user);
const snapshotReady = (bootstrapRef, overviewRef) => Boolean(bootstrapRef.current && overviewRef.current);

const seedOverviewCollections = (overview, { includePeriod = false } = {}) => {
  const envelopes = { items: overview?.envelopes || [] };
  const recurring = { items: overview?.recurring || [] };
  const goals = { items: overview?.goals || [] };
  const budgets = { items: overview?.budgets || [] };
  apiClient.seed("envelopes.list", {}, envelopes);
  apiClient.seed("recurring.list", {}, recurring);
  apiClient.seed("goals.list", {}, goals);
  if (!includePeriod) return;
  const period = overview?.periodKey || "current";
  apiClient.seed("envelopes.list", { period }, envelopes);
  apiClient.seed("recurring.list", { period }, recurring);
  apiClient.seed("budgets.list", { period }, budgets);
};

const nextLoadState = (hasCurrentData) => ({
  status: hasCurrentData ? "refreshing" : "loading",
  error: null,
  refreshError: null,
});

const loadFailureState = (hasCurrentData, error) => (
  hasCurrentData
    ? { status: "ready", error: null, refreshError: error }
    : { status: "error", error, refreshError: null }
);

const useFinanceStore = () => {
  const [bootstrap, setBootstrap] = useState(null);
  const [overview, setOverview] = useState(null);
  const [state, setState] = useState({ status: "idle", error: null, refreshError: null });
  const requestEpoch = useRef(createFinanceRequestEpoch());
  const bootstrapRef = useRef(null);
  const overviewRef = useRef(null);

  const clearFinanceState = useCallback(() => {
    invalidateFinanceSession(requestEpoch.current);
    apiClient.invalidate(INITIAL_ACTIONS);
    bootstrapRef.current = null;
    overviewRef.current = null;
    setBootstrap(null);
    setOverview(null);
    setState({ status: "idle", error: null, refreshError: null });
  }, []);

  const controls = useMemo(() => ({
    setBootstrap, setOverview, setState, requestEpoch, bootstrapRef, overviewRef,
  }), []);
  return { bootstrap, overview, state, controls, clearFinanceState };
};

const useInitialFinanceLoad = (authStatus, user, controls) => useCallback(async ({ force = false } = {}) => {
  if (!authenticated(authStatus, user)) return null;
  const token = beginFinanceRequest(controls.requestEpoch.current, ["bootstrap", "overview"]);
  setInitialLoadingState(controls);
  try {
    const initial = await apiClient.request("app.initialState", {}, { force });
    const ownsBootstrap = requestOwnsFinanceResource(controls.requestEpoch.current, token, "bootstrap");
    const ownsOverview = requestOwnsFinanceResource(controls.requestEpoch.current, token, "overview");
    if (!ownsBootstrap && !ownsOverview) return initial;
    applyInitialFinanceState(controls, initial, { ownsBootstrap, ownsOverview });
    if (ownsBootstrap) finishFinanceResource(controls.requestEpoch.current, token, "bootstrap");
    if (ownsOverview) finishFinanceResource(controls.requestEpoch.current, token, "overview");
    settleFinanceLoadState(controls);
    return initial;
  } catch (error) {
    if (!requestOwnsAnyFinanceResource(controls.requestEpoch.current, token)) return null;
    if (requestOwnsFinanceResource(controls.requestEpoch.current, token, "bootstrap")) finishFinanceResource(controls.requestEpoch.current, token, "bootstrap");
    if (requestOwnsFinanceResource(controls.requestEpoch.current, token, "overview")) finishFinanceResource(controls.requestEpoch.current, token, "overview");
    applyFinanceLoadError(controls, error);
    throw error;
  }
}, [authStatus, controls, user]);

const setInitialLoadingState = (controls) => {
  controls.setState(nextLoadState(snapshotReady(controls.bootstrapRef, controls.overviewRef)));
};

const applyInitialFinanceState = (controls, initial, { ownsBootstrap, ownsOverview }) => {
  if (ownsBootstrap) {
    apiClient.seed("bootstrap.get", {}, initial.bootstrap);
    controls.bootstrapRef.current = initial.bootstrap;
    controls.setBootstrap(initial.bootstrap);
  }
  if (ownsOverview) {
    apiClient.seed("dashboard.overview", {}, initial.overview);
    seedOverviewCollections(initial.overview, { includePeriod: true });
    controls.overviewRef.current = initial.overview;
    controls.setOverview(initial.overview);
  }
};

const settleFinanceLoadState = (controls) => {
  if (hasPendingFinanceRequest(controls.requestEpoch.current)) {
    controls.setState(nextLoadState(snapshotReady(controls.bootstrapRef, controls.overviewRef)));
    return;
  }
  controls.setState({ status: "ready", error: null, refreshError: null });
};

const applyFinanceLoadError = (controls, error) => {
  const hasCurrentData = snapshotReady(controls.bootstrapRef, controls.overviewRef);
  if (hasPendingFinanceRequest(controls.requestEpoch.current)) {
    controls.setState({
      ...nextLoadState(Boolean(controls.bootstrapRef.current || controls.overviewRef.current)),
      refreshError: error,
    });
    return;
  }
  controls.setState(loadFailureState(hasCurrentData, error));
};

const useFinanceRefreshers = (authStatus, user, controls, loadInitialState) => {
  const refreshOverview = useCallback(async () => {
    if (!authenticated(authStatus, user)) return null;
    const token = beginFinanceRequest(controls.requestEpoch.current, ["overview"]);
    apiClient.invalidate(["dashboard.overview", "app.initialState"]);
    controls.setState(nextLoadState(Boolean(controls.overviewRef.current)));
    try {
      const nextOverview = await apiClient.request("dashboard.overview", {}, { force: true });
      if (!requestOwnsFinanceResource(controls.requestEpoch.current, token, "overview")) return nextOverview;
      apiClient.seed("dashboard.overview", {}, nextOverview);
      seedOverviewCollections(nextOverview, { includePeriod: true });
      controls.overviewRef.current = nextOverview;
      controls.setOverview(nextOverview);
      finishFinanceResource(controls.requestEpoch.current, token, "overview");
      settleFinanceLoadState(controls);
      return nextOverview;
    } catch (error) {
      if (!requestOwnsFinanceResource(controls.requestEpoch.current, token, "overview")) return null;
      finishFinanceResource(controls.requestEpoch.current, token, "overview");
      applyFinanceLoadError(controls, error);
      throw error;
    }
  }, [authStatus, controls, user]);

  const refreshBootstrap = useCallback(async () => {
    if (!authenticated(authStatus, user)) return null;
    const token = beginFinanceRequest(controls.requestEpoch.current, ["bootstrap"]);
    apiClient.invalidate(["bootstrap.get", "accounts.list", "categories.list", "app.initialState"]);
    controls.setState(nextLoadState(Boolean(controls.bootstrapRef.current)));
    try {
      const nextBootstrap = await apiClient.request("bootstrap.get", {}, { force: true });
      if (!requestOwnsFinanceResource(controls.requestEpoch.current, token, "bootstrap")) return nextBootstrap;
      apiClient.seed("bootstrap.get", {}, nextBootstrap);
      controls.bootstrapRef.current = nextBootstrap;
      controls.setBootstrap(nextBootstrap);
      finishFinanceResource(controls.requestEpoch.current, token, "bootstrap");
      settleFinanceLoadState(controls);
      return nextBootstrap;
    } catch (error) {
      if (!requestOwnsFinanceResource(controls.requestEpoch.current, token, "bootstrap")) return null;
      finishFinanceResource(controls.requestEpoch.current, token, "bootstrap");
      applyFinanceLoadError(controls, error);
      throw error;
    }
  }, [authStatus, controls, user]);

  const refreshAll = useCallback(() => {
    apiClient.invalidate(INITIAL_ACTIONS);
    return loadInitialState({ force: true });
  }, [loadInitialState]);

  return { refreshOverview, refreshBootstrap, refreshAll };
};

export const FinanceProvider = ({ children }) => {
  const { status: authStatus, user } = useAuth();
  const { bootstrap, overview, state, controls, clearFinanceState } = useFinanceStore();
  const loadInitialState = useInitialFinanceLoad(authStatus, user, controls);
  const refreshers = useFinanceRefreshers(authStatus, user, controls, loadInitialState);

  useEffect(() => {
    if (!authenticated(authStatus, user)) {
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
    refresh: refreshers.refreshAll,
    ...refreshers,
    invalidate: apiClient.invalidate,
    clearFinanceState,
  }), [bootstrap, clearFinanceState, overview, refreshers, state]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};

export const useFinance = () => {
  const value = useContext(FinanceContext);
  if (!value) throw new Error("useFinance harus digunakan di dalam FinanceProvider.");
  return value;
};
