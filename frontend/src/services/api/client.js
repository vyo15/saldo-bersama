import {
  clearReadState, invalidateActions, isReadAction, readRequest, seedRead, setReadSessionScope,
} from "./cache.js";
import { createSecureRandomId } from "../../domain/security.js";
import { ApiError, isOutcomeUnknownError } from "./errors.js";
import { createServerSession, destroyServerSession, downloadExcel, gatewayFetch, readSession } from "./transport.js";
import { stableValue } from "./serialization.js";

export { ApiError, isAbortError, isOutcomeUnknownError, parseResponse, shouldInvalidateSession } from "./errors.js";
export { stableQueryKey } from "./cache.js";

const SESSION_CACHE_TTL_MS = 2_000;
let sessionCache = { expiresAt: 0, value: null, promise: null };
const inFlightMutations = new Map();
const memoryMutationIntents = new Map();

const fnv1a64 = (value) => {
  let hash = 0xcbf29ce484222325n;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
};

export const mutationIntentFingerprint = (action, payload = {}, rowVersion = null) => fnv1a64(JSON.stringify([
  String(action || ""),
  stableValue(payload || {}),
  rowVersion ?? null,
]));

const readPersistedIntent = (fingerprint) => memoryMutationIntents.get(fingerprint) || null;

const persistIntent = (fingerprint, idempotencyKey) => {
  memoryMutationIntents.set(fingerprint, { idempotencyKey });
};

const clearIntent = (fingerprint) => {
  memoryMutationIntents.delete(fingerprint);
};

const clearMutationState = () => {
  inFlightMutations.clear();
  memoryMutationIntents.clear();
};

const clearClientState = () => {
  clearReadState();
  clearMutationState();
  sessionCache = { expiresAt: 0, value: null, promise: null };
};

const guardedMutationRequest = (action, payload, options = {}) => {
  const fingerprint = mutationIntentFingerprint(action, payload, options.rowVersion ?? null);
  if (!options.newIntent) {
    const existingFlight = inFlightMutations.get(fingerprint);
    if (existingFlight) return existingFlight;
  } else {
    clearIntent(fingerprint);
  }
  const persisted = readPersistedIntent(fingerprint);
  const idempotencyKey = persisted?.idempotencyKey || options.idempotencyKey || createSecureRandomId();
  const requestOptions = { ...options, idempotencyKey, outcomeSensitive: true };
  const promise = gatewayFetch(action, payload, requestOptions, options.signal)
    .then((result) => {
      clearIntent(fingerprint);
      return result;
    })
    .catch((error) => {
      if (isOutcomeUnknownError(error)) persistIntent(fingerprint, idempotencyKey);
      else clearIntent(fingerprint);
      throw error;
    })
    .finally(() => {
      if (inFlightMutations.get(fingerprint) === promise) inFlightMutations.delete(fingerprint);
    });
  inFlightMutations.set(fingerprint, promise);
  return promise;
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
    if (setReadSessionScope(nextScope)) {
      clearMutationState();
      sessionCache = { expiresAt: 0, value: null, promise: null };
    }
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

  startNewMutationIntent(action, payload = {}, rowVersion = null) {
    clearIntent(mutationIntentFingerprint(action, payload, rowVersion));
  },

  async request(action, payload = {}, options = {}) {
    const isRead = isReadAction(action) && !options.idempotencyKey;
    if (!isRead && typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new ApiError("Perubahan tidak dapat disimpan saat perangkat offline.", { code: "OFFLINE", status: 503 });
    }
    return isRead ? readRequest(action, payload, options) : guardedMutationRequest(action, payload, options);
  },

  downloadExcel,
};
