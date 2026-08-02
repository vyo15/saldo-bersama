import {
  clearReadState, invalidateActions, isReadAction, readRequest, seedRead, setReadSessionScope,
} from "./cache.js";
import { ApiError } from "./errors.js";
import { createServerSession, destroyServerSession, downloadExcel, gatewayFetch, readSession } from "./transport.js";

export { ApiError, isAbortError, parseResponse, shouldInvalidateSession } from "./errors.js";
export { stableQueryKey } from "./cache.js";

const SESSION_CACHE_TTL_MS = 2_000;
let sessionCache = { expiresAt: 0, value: null, promise: null };

const clearClientState = () => {
  clearReadState();
  sessionCache = { expiresAt: 0, value: null, promise: null };
};

export const apiClient = {
  async session({ force = false } = {}) {
    if (!force && sessionCache.expiresAt > Date.now()) return sessionCache.value;
    if (!force && sessionCache.promise) return sessionCache.promise;
    const promise = readSession().then((value) => {
      sessionCache = { expiresAt: Date.now() + SESSION_CACHE_TTL_MS, value, promise: null };
      return value;
    });
    sessionCache.promise = promise;
    try {
      return await promise;
    } catch (error) {
      sessionCache = { expiresAt: 0, value: null, promise: null };
      throw error;
    }
  },

  async createSession(firebaseIdToken) {
    const session = await createServerSession(firebaseIdToken);
    this.setSessionScope(session?.uid || session?.email || "authenticated");
    sessionCache = { expiresAt: Date.now() + SESSION_CACHE_TTL_MS, value: session, promise: null };
    return session;
  },

  async logout() {
    const result = await destroyServerSession();
    this.setSessionScope("anonymous");
    return result;
  },

  setSessionScope(nextScope) {
    if (setReadSessionScope(nextScope)) sessionCache = { expiresAt: 0, value: null, promise: null };
  },

  invalidate(actions) {
    invalidateActions(Array.isArray(actions) ? actions : [actions]);
  },

  seed(action, payload = {}, data, options = {}) {
    seedRead(action, payload, data, options);
  },

  clearCache() {
    clearClientState();
  },

  async request(action, payload = {}, options = {}) {
    const isRead = isReadAction(action) && !options.idempotencyKey;
    if (!isRead && typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new ApiError("Perubahan tidak dapat disimpan saat perangkat offline.", { code: "OFFLINE", status: 503 });
    }
    return isRead ? readRequest(action, payload, options) : gatewayFetch(action, payload, options, options.signal);
  },

  downloadExcel,
};
