import { abortError } from "./errors.js";
import { gatewayFetch } from "./transport.js";
import { stableStringify } from "./serialization.js";

export const READ_CACHE_TTL_MS = Object.freeze({
  "app.initialState": 30_000,
  "bootstrap.get": 120_000,
  "dashboard.overview": 30_000,
  "system.health": 5_000,
  "accounts.list": 120_000,
  "accounts.previewLifecycle": 0,
  "categories.list": 120_000,
  "categories.previewArchive": 0,
  "archive.list": 30_000,
  "transactions.list": 30_000,
  "envelopes.list": 30_000,
  "envelopes.previewRuleLifecycle": 0,
  "recurring.list": 30_000,
  "recurring.previewRuleLifecycle": 0,
  "budgets.list": 30_000,
  "budgets.previewLifecycle": 0,
  "goals.list": 30_000,
  "goals.previewLifecycle": 0,
  "reports.monthly": 60_000,
  "periods.list": 60_000,
  "periods.previewClose": 0,
  "reconciliations.list": 60_000,
  "users.list": 30_000,
  "audit.list": 5_000,
  "notifications.status": 0,
  "notifications.preferences": 0,
  "integrations.status": 0,
  "reset.preview": 0,
  "reset.status": 0,
});

const ABORT_GRACE_MS = 40;
const readCache = new Map();
const inFlightReads = new Map();
const actionVersions = new Map();
const invalidationListeners = new Map();
let sessionScope = "anonymous";

export const stableQueryKey = (action, payload = {}, scope = sessionScope) => {
  const version = actionVersions.get(action) || 0;
  return `${scope}:${action}:v${version}:${stableStringify(payload)}`;
};

export const isReadAction = (action) => Object.prototype.hasOwnProperty.call(READ_CACHE_TTL_MS, action);

export const subscribeToInvalidation = (action, listener) => {
  if (!action || typeof listener !== "function") return () => {};
  const listeners = invalidationListeners.get(action) || new Set();
  listeners.add(listener);
  invalidationListeners.set(action, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) invalidationListeners.delete(action);
  };
};

const notifyInvalidation = (actions) => {
  for (const action of actions) {
    for (const listener of [...(invalidationListeners.get(action) || [])]) {
      try { listener(action); } catch { /* listener failures must not break cache invalidation */ }
    }
  }
};

const subscribeToRead = (entry, signal) => {
  entry.subscribers += 1;
  if (entry.abortTimer) {
    clearTimeout(entry.abortTimer);
    entry.abortTimer = null;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const release = () => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      entry.subscribers = Math.max(0, entry.subscribers - 1);
      if (!entry.settled && entry.subscribers === 0) {
        entry.abortTimer = setTimeout(() => {
          if (!entry.settled && entry.subscribers === 0) entry.controller.abort();
        }, ABORT_GRACE_MS);
      }
    };
    const onAbort = () => {
      release();
      reject(abortError());
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    entry.promise.then(
      (value) => { if (!settled) { release(); resolve(value); } },
      (error) => { if (!settled) { release(); reject(error); } },
    );
  });
};

export const readRequest = (action, payload, options) => {
  if (options.signal?.aborted) return Promise.reject(abortError());
  const ttl = READ_CACHE_TTL_MS[action];
  const key = stableQueryKey(action, payload);
  const cached = readCache.get(key);
  if (!options.force && ttl > 0 && cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);

  let entry = inFlightReads.get(key);
  if (!entry) {
    const controller = new AbortController();
    entry = {
      action,
      key,
      controller,
      subscribers: 0,
      abortTimer: null,
      settled: false,
      promise: null,
    };
    entry.promise = gatewayFetch(action, payload, options, controller.signal)
      .then((data) => {
        if (ttl > 0) readCache.set(key, { action, data, expiresAt: Date.now() + ttl });
        return data;
      })
      .finally(() => {
        entry.settled = true;
        if (entry.abortTimer) clearTimeout(entry.abortTimer);
        if (inFlightReads.get(key) === entry) inFlightReads.delete(key);
      });
    inFlightReads.set(key, entry);
  }
  return subscribeToRead(entry, options.signal);
};

export const invalidateActions = (actions = []) => {
  const targets = new Set(actions);
  targets.forEach((action) => actionVersions.set(action, (actionVersions.get(action) || 0) + 1));
  for (const [key, cached] of readCache.entries()) {
    if (targets.has(cached.action)) readCache.delete(key);
  }
  notifyInvalidation(targets);
};

export const seedRead = (action, payload = {}, data, { ttl } = {}) => {
  if (!isReadAction(action) || data === undefined) return;
  const effectiveTtl = Number.isFinite(ttl) ? Math.max(0, Number(ttl)) : READ_CACHE_TTL_MS[action];
  if (effectiveTtl <= 0) return;
  readCache.set(stableQueryKey(action, payload), { action, data, expiresAt: Date.now() + effectiveTtl });
};

export const clearReadState = () => {
  readCache.clear();
  actionVersions.clear();
  for (const entry of inFlightReads.values()) entry.controller.abort();
  inFlightReads.clear();
};

export const setReadSessionScope = (nextScope) => {
  const normalized = String(nextScope || "anonymous");
  if (normalized === sessionScope) return false;
  sessionScope = normalized;
  clearReadState();
  return true;
};
