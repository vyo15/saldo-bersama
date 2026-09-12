/**
 * Shared read-state orchestrator. Server responses remain financial authority; this store
 * only coordinates snapshots, refreshes, cache seeding, and stale-request protection.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiClient, getMutationActivitySnapshot, subscribedReadActions } from "../services/api/client.js";
import { subscribeToServerStateChanged } from "../services/sync/syncSignals.js";
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
  const syncBaselineRef = useRef(null);

  const clearFinanceState = useCallback(() => {
    invalidateFinanceSession(requestEpoch.current);
    apiClient.invalidate(INITIAL_ACTIONS);
    bootstrapRef.current = null;
    overviewRef.current = null;
    syncBaselineRef.current = null;
    setBootstrap(null);
    setOverview(null);
    setState({ status: "idle", error: null, refreshError: null });
  }, []);

  const controls = useMemo(() => ({
    setBootstrap, setOverview, setState, requestEpoch, bootstrapRef, overviewRef, syncBaselineRef,
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
  if (initial?.sync) controls.syncBaselineRef.current = initial.sync;
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
  const refreshOverview = useCallback(async ({ invalidate = true } = {}) => {
    if (!authenticated(authStatus, user)) return null;
    const token = beginFinanceRequest(controls.requestEpoch.current, ["overview"]);
    if (invalidate) apiClient.invalidate(["dashboard.overview", "app.initialState", "notifications.center"]);
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

  const refreshBootstrap = useCallback(async ({ invalidate = true } = {}) => {
    if (!authenticated(authStatus, user)) return null;
    const token = beginFinanceRequest(controls.requestEpoch.current, ["bootstrap"]);
    if (invalidate) apiClient.invalidate(["bootstrap.get", "accounts.list", "categories.list", "app.initialState"]);
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
    apiClient.invalidate([...INITIAL_ACTIONS, "notifications.center"]);
    return loadInitialState({ force: true });
  }, [loadInitialState]);

  return useMemo(() => ({ refreshOverview, refreshBootstrap, refreshAll }), [refreshAll, refreshBootstrap, refreshOverview]);
};

const changedSyncResources = (previous, current) => {
  if (!previous || !current) return [];
  const keys = new Set([...Object.keys(previous.resources || {}), ...Object.keys(current.resources || {})]);
  return [...keys].filter((key) => Number(previous.resources?.[key] || 0) !== Number(current.resources?.[key] || 0));
};

const useGlobalFinanceSync = ({ authStatus, user, controls, refreshers }) => {
  const [syncState, setSyncState] = useState({ status: "idle", error: null, lastSyncedAt: null });
  const inFlightSyncRef = useRef(null);
  const lastCheckAtRef = useRef(0);
  const backgroundedAtRef = useRef(0);

  const syncNow = useCallback(async ({ manual = false, reason = "automatic" } = {}) => {
    if (!authenticated(authStatus, user)) return { changed: false, resources: [] };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const error = Object.assign(new Error("Perangkat sedang offline."), { code: "OFFLINE" });
      if (manual) setSyncState((current) => ({ ...current, status: "error", error }));
      throw error;
    }
    if (getMutationActivitySnapshot().activeCount > 0) return { changed: false, resources: [], skipped: "mutation-active" };
    if (inFlightSyncRef.current) return inFlightSyncRef.current;

    const promise = (async () => {
      if (manual) setSyncState((current) => ({ ...current, status: "syncing", error: null }));
      const current = await apiClient.request("sync.state", {}, { force: true });
      const previous = controls.syncBaselineRef.current;
      lastCheckAtRef.current = Date.now();

      const revisionChanged = previous && Number(previous.globalRevision || 0) !== Number(current.globalRevision || 0);
      const changed = revisionChanged ? changedSyncResources(previous, current) : [];
      const manualTargets = manual ? subscribedReadActions().filter((action) => action !== "sync.state") : [];
      const targets = [...new Set([...changed, ...manualTargets])];
      const bootstrapChanged = manual || targets.includes("bootstrap.get");
      const overviewChanged = manual || targets.includes("dashboard.overview");
      const passiveTargets = targets.filter((action) => !["bootstrap.get", "dashboard.overview"].includes(action));

      const passiveResults = passiveTargets.length ? await apiClient.invalidateAndWait(passiveTargets) : [];
      const refreshTasks = [];
      if (bootstrapChanged) refreshTasks.push(refreshers.refreshBootstrap({ invalidate: false }));
      if (overviewChanged) refreshTasks.push(refreshers.refreshOverview({ invalidate: false }));
      const coreResults = refreshTasks.length ? await Promise.allSettled(refreshTasks) : [];
      const failedRefresh = [...passiveResults, ...coreResults].some((result) => result.status === "rejected");
      if (failedRefresh) throw new Error("Sebagian data belum berhasil diperbarui.");

      controls.syncBaselineRef.current = current;
      setSyncState({ status: "idle", error: null, lastSyncedAt: new Date().toISOString() });
      return { changed: Boolean(changed.length), resources: changed, reason };
    })().catch((error) => {
      if (manual) setSyncState((current) => ({ ...current, status: "error", error }));
      throw error;
    }).finally(() => {
      inFlightSyncRef.current = null;
    });

    inFlightSyncRef.current = promise;
    return promise;
  }, [authStatus, controls, refreshers, user]);

  useEffect(() => {
    if (!authenticated(authStatus, user)) return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheckAtRef.current < 14_000) return;
      syncNow({ reason: "visible-poll" }).catch(() => {});
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [authStatus, syncNow, user]);

  useEffect(() => {
    if (!authenticated(authStatus, user)) return undefined;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        backgroundedAtRef.current = Date.now();
        return;
      }
      const hiddenFor = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : 0;
      backgroundedAtRef.current = 0;
      syncNow({ reason: "foreground" }).then(() => {
        if (hiddenFor >= 2 * 60_000 && getMutationActivitySnapshot().activeCount === 0) {
          refreshers.refreshOverview().catch(() => {});
        }
      }).catch(() => {});
    };
    const onPageShow = (event) => {
      if (event.persisted) syncNow({ reason: "pageshow" }).catch(() => {});
    };
    const onOnline = () => syncNow({ manual: true, reason: "reconnect" }).catch(() => {});
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
    };
  }, [authStatus, refreshers, syncNow, user]);

  useEffect(() => {
    if (!authenticated(authStatus, user)) return undefined;
    return subscribeToServerStateChanged(() => {
      if (document.visibilityState !== "visible") return;
      window.setTimeout(() => syncNow({ reason: "mutation-signal" }).catch(() => {}), 0);
    });
  }, [authStatus, syncNow, user]);

  const manualRefresh = useCallback(() => syncNow({ manual: true, reason: "pull-to-refresh" }), [syncNow]);

  return {
    syncNow,
    manualRefresh,
    isSyncing: syncState.status === "syncing",
    syncError: syncState.error,
    lastSyncedAt: syncState.lastSyncedAt,
  };
};

export const FinanceProvider = ({ children }) => {
  const { status: authStatus, user } = useAuth();
  const { bootstrap, overview, state, controls, clearFinanceState } = useFinanceStore();
  const loadInitialState = useInitialFinanceLoad(authStatus, user, controls);
  const refreshers = useFinanceRefreshers(authStatus, user, controls, loadInitialState);
  const globalSync = useGlobalFinanceSync({ authStatus, user, controls, refreshers });

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
    isRefreshing: state.status === "refreshing" || globalSync.isSyncing,
    refresh: globalSync.manualRefresh,
    ...refreshers,
    ...globalSync,
    invalidate: apiClient.invalidate,
    clearFinanceState,
  }), [bootstrap, clearFinanceState, globalSync, overview, refreshers, state]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};

export const useFinance = () => {
  const value = useContext(FinanceContext);
  if (!value) throw new Error("useFinance harus digunakan di dalam FinanceProvider.");
  return value;
};
