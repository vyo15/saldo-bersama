import { createSecureRandomId } from "../../domain/security.js";

export class ApiError extends Error {
  constructor(message, { code = "UNKNOWN", status = 500, details, requestId } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId || details?.requestId || "";
  }
}

export const shouldInvalidateSession = (responseStatus, errorCode) => (
  responseStatus === 401 && errorCode === "UNAUTHENTICATED"
);

export const parseResponse = async (response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    const errorCode = body.error?.code || "UNKNOWN";
    if (shouldInvalidateSession(response.status, errorCode) && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("saldo-bersama:unauthorized"));
    }
    throw new ApiError(body.error?.message || "Permintaan tidak dapat diproses.", {
      code: errorCode,
      status: body.error?.status || response.status,
      details: body.error?.details,
      requestId: response.headers?.get?.("x-request-id") || body.error?.details?.requestId,
    });
  }
  return body.data;
};

const READ_CACHE_TTL_MS = Object.freeze({
  "app.initialState": 30_000,
  "bootstrap.get": 120_000,
  "dashboard.overview": 30_000,
  "system.health": 5_000,
  "accounts.list": 120_000,
  "categories.list": 120_000,
  "transactions.list": 30_000,
  "envelopes.list": 30_000,
  "recurring.list": 30_000,
  "budgets.list": 30_000,
  "goals.list": 30_000,
  "reports.monthly": 60_000,
  "periods.list": 60_000,
  "reconciliations.list": 60_000,
  "users.list": 30_000,
  "audit.list": 5_000,
  "restore.preview": 0,
  "import.preview": 0,
});

const SESSION_CACHE_TTL_MS = 2_000;
const ABORT_GRACE_MS = 40;
const readCache = new Map();
const inFlightReads = new Map();
const actionVersions = new Map();
let sessionScope = "anonymous";
let sessionCache = { expiresAt: 0, value: null, promise: null };

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
};

export const stableQueryKey = (action, payload = {}, scope = sessionScope) => {
  const version = actionVersions.get(action) || 0;
  return `${scope}:${action}:v${version}:${JSON.stringify(stableValue(payload))}`;
};

const abortError = () => Object.assign(new Error("Permintaan dibatalkan."), { name: "AbortError", code: "ABORTED" });
export const isAbortError = (error) => error?.name === "AbortError" || error?.code === "ABORTED";

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


const fileNameFromDisposition = (value, fallback) => {
  const match = String(value || "").match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/^"|"$/g, "")) : fallback;
};

const gatewayFetch = async (action, payload, options, signal) => parseResponse(await fetch("/api/gateway", {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    "X-Request-ID": options.requestId || createSecureRandomId(),
  },
  body: JSON.stringify({
    action,
    payload,
    idempotencyKey: options.idempotencyKey,
    rowVersion: options.rowVersion,
  }),
  signal,
}));

const readRequest = (action, payload, options) => {
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

const invalidateActions = (actions = []) => {
  const targets = new Set(actions);
  targets.forEach((action) => actionVersions.set(action, (actionVersions.get(action) || 0) + 1));
  for (const [key, cached] of readCache.entries()) {
    if (targets.has(cached.action)) readCache.delete(key);
  }
};

const clearReadState = () => {
  readCache.clear();
  actionVersions.clear();
  for (const entry of inFlightReads.values()) entry.controller.abort();
  inFlightReads.clear();
  sessionCache = { expiresAt: 0, value: null, promise: null };
};

export const apiClient = {
  async session({ force = false } = {}) {
    if (!force && sessionCache.expiresAt > Date.now()) return sessionCache.value;
    if (!force && sessionCache.promise) return sessionCache.promise;
    const promise = (async () => {
      const response = await fetch("/api/session", { credentials: "include" });
      const value = response.status === 401 ? null : await parseResponse(response);
      sessionCache = { expiresAt: Date.now() + SESSION_CACHE_TTL_MS, value, promise: null };
      return value;
    })();
    sessionCache.promise = promise;
    try { return await promise; }
    catch (error) {
      sessionCache = { expiresAt: 0, value: null, promise: null };
      throw error;
    }
  },

  async createSession(firebaseIdToken) {
    const session = await parseResponse(await fetch("/api/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", firebaseIdToken }),
    }));
    this.setSessionScope(session?.uid || session?.email || "authenticated");
    sessionCache = { expiresAt: Date.now() + SESSION_CACHE_TTL_MS, value: session, promise: null };
    return session;
  },

  async logout() {
    const result = await parseResponse(await fetch("/api/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }));
    this.setSessionScope("anonymous");
    return result;
  },

  setSessionScope(nextScope) {
    const normalized = String(nextScope || "anonymous");
    if (normalized === sessionScope) return;
    sessionScope = normalized;
    clearReadState();
  },

  invalidate(actions) {
    invalidateActions(Array.isArray(actions) ? actions : [actions]);
  },

  seed(action, payload = {}, data, { ttl } = {}) {
    if (!Object.prototype.hasOwnProperty.call(READ_CACHE_TTL_MS, action) || data === undefined) return;
    const effectiveTtl = Number.isFinite(ttl) ? Math.max(0, Number(ttl)) : READ_CACHE_TTL_MS[action];
    if (effectiveTtl <= 0) return;
    readCache.set(stableQueryKey(action, payload), { action, data, expiresAt: Date.now() + effectiveTtl });
  },

  clearCache() {
    clearReadState();
  },

  async request(action, payload = {}, options = {}) {
    const isRead = Object.prototype.hasOwnProperty.call(READ_CACHE_TTL_MS, action) && !options.idempotencyKey;
    if (!isRead && typeof navigator !== "undefined" && navigator.onLine === false) throw new ApiError("Perubahan tidak dapat disimpan saat perangkat offline.", { code: "OFFLINE", status: 503 });
    if (isRead) {
      return readRequest(action, payload, options);
    }
    return gatewayFetch(action, payload, options, options.signal);
  },

  async downloadExcel() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ApiError("Export membutuhkan koneksi internet.", { code: "OFFLINE", status: 503 });
    const response = await fetch("/api/export", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Request-ID": createSecureRandomId() }, body: "{}" });
    if (!response.ok) return parseResponse(response);
    const blob = await response.blob();
    const fileName = fileNameFromDisposition(response.headers.get("content-disposition"), "saldo-bersama.xlsx");
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    return { downloaded: true, fileName, size: blob.size };
  },
};
