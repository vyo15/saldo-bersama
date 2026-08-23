/**
 * Canonical browser API client. Mutations are guarded by one intent fingerprint and
 * idempotency path; feature components must not implement a second write/retry stack.
 */
import {
  clearReadState, invalidateActions, isReadAction, readRequest, seedRead, setReadSessionScope,
} from "./cache.js";
import { createSecureRandomId } from "../../domain/security.js";
import { ApiError, isOutcomeUnknownError } from "./errors.js";
import { createServerSession, destroyServerSession, downloadExcel, gatewayFetch, readSession } from "./transport.js";
import { stableValue } from "./serialization.js";

export { ApiError, isAbortError, isOutcomeUnknownError, parseResponse, shouldInvalidateSession } from "./errors.js";
export { stableQueryKey, subscribeToInvalidation } from "./cache.js";

const SESSION_CACHE_TTL_MS = 2_000;
let sessionCache = { expiresAt: 0, value: null, promise: null };
const inFlightMutations = new Map();
const memoryMutationIntents = new Map();
const unresolvedMutationIntents = new Map();
const MUTATION_INTENT_STORAGE_PREFIX = "saldo-bersama:mutation-intents:v1:";
const MUTATION_INTENT_MAX_AGE_MS = 30 * 24 * 60 * 60_000;
const MUTATION_INTENT_MAX_ENTRIES = 50;
let mutationSessionScope = "anonymous";
const mutationActivityListeners = new Set();
const activeMutationActions = new Map();
let activeMutationCount = 0;
let mutationActivityEpoch = 0;
let mutationActivitySnapshot = Object.freeze({ status: "idle", activeCount: 0, action: "", revision: 0 });

const visibleActiveMutationAction = () => activeMutationCount === 1 ? activeMutationActions.keys().next().value || "" : "";

const publishMutationActivity = (status, action = "") => {
  mutationActivitySnapshot = Object.freeze({
    status,
    activeCount: activeMutationCount,
    action: String(action || ""),
    revision: mutationActivitySnapshot.revision + 1,
  });
  for (const listener of [...mutationActivityListeners]) {
    try { listener(); } catch { /* UI activity listeners must never affect request completion */ }
  }
};

const beginMutationActivity = (action) => {
  const normalizedAction = String(action || "");
  activeMutationCount += 1;
  activeMutationActions.set(normalizedAction, Number(activeMutationActions.get(normalizedAction) || 0) + 1);
  publishMutationActivity("submitting", visibleActiveMutationAction());
  return { epoch: mutationActivityEpoch, action: normalizedAction };
};

const settleMutationActivity = ({ epoch, action }, status) => {
  if (epoch !== mutationActivityEpoch) return;
  const remainingForAction = Math.max(0, Number(activeMutationActions.get(action) || 0) - 1);
  if (remainingForAction) activeMutationActions.set(action, remainingForAction);
  else activeMutationActions.delete(action);
  activeMutationCount = Math.max(0, activeMutationCount - 1);
  publishMutationActivity(activeMutationCount > 0 ? "submitting" : status, activeMutationCount > 0 ? visibleActiveMutationAction() : action);
};

const resetMutationActivity = () => {
  mutationActivityEpoch += 1;
  activeMutationCount = 0;
  activeMutationActions.clear();
  publishMutationActivity("idle");
};

export const subscribeToMutationActivity = (listener) => {
  if (typeof listener !== "function") return () => {};
  mutationActivityListeners.add(listener);
  return () => mutationActivityListeners.delete(listener);
};

export const getMutationActivitySnapshot = () => mutationActivitySnapshot;

const fnv1a64 = (value) => {
  let hash = 0xcbf29ce484222325n;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
};

// Fingerprints identify user intent, while the random idempotency key identifies one
// execution attempt family. A retry of the same intent must reuse its guarded key.
export const mutationIntentFingerprint = (action, payload = {}, rowVersion = null) => fnv1a64(JSON.stringify([
  String(action || ""),
  stableValue(payload || {}),
  rowVersion ?? null,
]));

const mutationStorage = () => {
  try { return typeof globalThis.localStorage?.getItem === "function" ? globalThis.localStorage : null; }
  catch { return null; }
};

const mutationStorageKey = () => `${MUTATION_INTENT_STORAGE_PREFIX}${fnv1a64(mutationSessionScope)}`;

const normalizedStoredIntents = (value) => {
  const now = Date.now();
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item
    && typeof item.action === "string"
    && /^[0-9a-f]{16}$/.test(String(item.fingerprint || ""))
    && typeof item.idempotencyKey === "string"
    && item.idempotencyKey.length >= 8
    && Number.isFinite(Number(item.createdAt))
    && now - Number(item.createdAt) <= MUTATION_INTENT_MAX_AGE_MS)
    .sort((left, right) => Number(right.createdAt) - Number(left.createdAt))
    .slice(0, MUTATION_INTENT_MAX_ENTRIES);
};

const readStoredIntents = () => {
  const storage = mutationStorage();
  if (!storage || mutationSessionScope === "anonymous") return [];
  try { return normalizedStoredIntents(JSON.parse(storage.getItem(mutationStorageKey()) || "[]")); }
  catch { return []; }
};

const writeStoredIntents = (items) => {
  const storage = mutationStorage();
  if (!storage || mutationSessionScope === "anonymous") return;
  try {
    const normalized = normalizedStoredIntents(items);
    if (normalized.length) storage.setItem(mutationStorageKey(), JSON.stringify(normalized));
    else storage.removeItem(mutationStorageKey());
  } catch { /* storage availability/quota must never break financial request handling */ }
};

const hydrateMutationIntents = () => {
  memoryMutationIntents.clear();
  unresolvedMutationIntents.clear();
  for (const item of readStoredIntents()) {
    memoryMutationIntents.set(item.fingerprint, { idempotencyKey: item.idempotencyKey, action: item.action, createdAt: Number(item.createdAt) });
    if (!unresolvedMutationIntents.has(item.action)) {
      unresolvedMutationIntents.set(item.action, { fingerprint: item.fingerprint, idempotencyKey: item.idempotencyKey });
    }
  }
};

const readPersistedIntent = (fingerprint) => memoryMutationIntents.get(fingerprint) || null;

const persistIntent = (action, fingerprint, idempotencyKey) => {
  const createdAt = Date.now();
  memoryMutationIntents.set(fingerprint, { action, idempotencyKey, createdAt });
  const remaining = readStoredIntents().filter((item) => item.fingerprint !== fingerprint);
  writeStoredIntents([{ action, fingerprint, idempotencyKey, createdAt }, ...remaining]);
};

const clearIntent = (fingerprint) => {
  memoryMutationIntents.delete(fingerprint);
  writeStoredIntents(readStoredIntents().filter((item) => item.fingerprint !== fingerprint));
};

const clearPersistedAction = (action) => {
  for (const [fingerprint, item] of memoryMutationIntents.entries()) {
    if (item.action === action) memoryMutationIntents.delete(fingerprint);
  }
  writeStoredIntents(readStoredIntents().filter((item) => item.action !== action));
};

const clearUnresolvedIntent = (action, fingerprint = null) => {
  const current = unresolvedMutationIntents.get(action);
  if (!current || (fingerprint && current.fingerprint !== fingerprint)) return;
  unresolvedMutationIntents.delete(action);
};

const assertCompatibleUnknownIntent = (action, fingerprint, options) => {
  const unresolved = unresolvedMutationIntents.get(action);
  if (!unresolved || unresolved.fingerprint === fingerprint || options.newIntent) return;
  throw new ApiError(
    "Perubahan sebelumnya untuk tindakan ini belum terkonfirmasi. Data yang sekarang berbeda dari request terakhir. Coba lagi request lama dengan data yang sama sebelum membuat perubahan baru.",
    { code: "MUTATION_INTENT_LOCKED", status: 409, details: { action } },
  );
};

const clearMutationState = ({ hydrate = true } = {}) => {
  inFlightMutations.clear();
  memoryMutationIntents.clear();
  unresolvedMutationIntents.clear();
  if (hydrate) hydrateMutationIntents();
  resetMutationActivity();
};

const clearClientState = () => {
  clearReadState();
  clearMutationState();
  sessionCache = { expiresAt: 0, value: null, promise: null };
};

// Unknown outcomes remain unresolved until the exact same intent is retried or refreshed;
// silently issuing a fresh key could duplicate a server-side financial mutation.
const guardedMutationRequest = (action, payload, options = {}) => {
  const fingerprint = mutationIntentFingerprint(action, payload, options.rowVersion ?? null);
  assertCompatibleUnknownIntent(action, fingerprint, options);
  if (!options.newIntent) {
    const existingFlight = inFlightMutations.get(fingerprint);
    if (existingFlight) return existingFlight;
  } else {
    clearUnresolvedIntent(action);
    clearPersistedAction(action);
  }
  const persisted = readPersistedIntent(fingerprint);
  const idempotencyKey = persisted?.idempotencyKey || options.idempotencyKey || createSecureRandomId();
  const requestOptions = { ...options, idempotencyKey, outcomeSensitive: true };
  const activityToken = beginMutationActivity(action);
  const promise = gatewayFetch(action, payload, requestOptions, options.signal)
    .then((result) => {
      clearIntent(fingerprint);
      clearUnresolvedIntent(action, fingerprint);
      settleMutationActivity(activityToken, "success");
      return result;
    })
    .catch((error) => {
      if (isOutcomeUnknownError(error)) {
        persistIntent(action, fingerprint, idempotencyKey);
        unresolvedMutationIntents.set(action, { fingerprint, idempotencyKey });
      } else {
        clearIntent(fingerprint);
        clearUnresolvedIntent(action, fingerprint);
      }
      settleMutationActivity(activityToken, isOutcomeUnknownError(error) ? "unknown" : "error");
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
    const normalized = String(nextScope || "anonymous");
    const changed = setReadSessionScope(normalized);
    if (normalized !== mutationSessionScope) {
      mutationSessionScope = normalized;
      clearMutationState();
    } else if (changed) clearMutationState();
    if (changed) sessionCache = { expiresAt: 0, value: null, promise: null };
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
    clearUnresolvedIntent(action);
    clearPersistedAction(action);
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
