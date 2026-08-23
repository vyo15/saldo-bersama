/**
 * Session trust boundary for Firebase token login and server-side Google OAuth. Successful
 * provider authentication is followed by Firebase verification and canonical backend user
 * resolution before an HttpOnly registered application session is issued. The environment
 * allowlist is bootstrap-only; active runtime membership is stored server-side.
 */
import {
  assertAllowedOrigin,
  clearGoogleOAuthTransactionCookie,
  clearSessionCookie,
  clientRateLimitKey,
  createGoogleOAuthTransaction,
  createSessionCookie,
  enforceBestEffortRateLimit,
  identityRateLimitKey,
  readGoogleOAuthTransaction,
  safeEqualText,
  trustedRequestOrigin,
} from "./_lib/security.js";
import { getDatabase } from "./_lib/db/httpClient.js";
import { assertDatabaseReady } from "./_lib/db/schema.js";
import { createRegisteredSession, resolveRegisteredSession, revokeSessionFromRequest } from "./_lib/sessionRegistry.js";
import { resolveLoginIdentity } from "./_lib/services/users.js";
import { appendAudit } from "./_lib/services/audit.js";
import { fail, methodNotAllowed, ok, readJsonBody } from "./_lib/http.js";
import { verifyFirebaseIdToken } from "./_lib/firebase.js";
import { attachRequestId, logEvent, requestIdFrom, sanitizeError } from "./_lib/observability.js";

const GOOGLE_AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const FIREBASE_IDP_ENDPOINT = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp";
const GOOGLE_OAUTH_CALLBACK_PATH = "/api/auth/google/callback";
const GOOGLE_OAUTH_START_FLOW = "google-start";
const GOOGLE_OAUTH_CALLBACK_FLOW = "google-callback";
const OAUTH_NETWORK_TIMEOUT_MS = 10_000;

const requestDuration = (startedAt) => Date.now() - startedAt;

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OAUTH_NETWORK_TIMEOUT_MS);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
};

const appendSetCookie = (response, cookie) => {
  const existing = typeof response.getHeader === "function" ? response.getHeader("Set-Cookie") : undefined;
  const values = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  response.setHeader("Set-Cookie", [...values, cookie]);
};

const redirectNoStore = (response, location, status = 303) => {
  response.statusCode = status;
  response.setHeader("Location", location);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.end();
};

const requestParam = (request, name) => {
  const fromQuery = request.query?.[name];
  if (Array.isArray(fromQuery)) return String(fromQuery[0] || "");
  if (fromQuery !== undefined && fromQuery !== null) return String(fromQuery);
  try {
    return new URL(request.url || "/", "https://saldo-bersama.invalid").searchParams.get(name) || "";
  } catch {
    return "";
  }
};

const requireGoogleOAuthConfig = () => {
  const clientId = String(process.env.VITE_GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  const firebaseApiKey = String(process.env.VITE_FIREBASE_API_KEY || "").trim();
  if (!clientId || !clientSecret || !firebaseApiKey) {
    throw Object.assign(new Error("Konfigurasi OAuth Google production belum lengkap."), { status: 500, code: "OAUTH_CONFIG_INCOMPLETE" });
  }
  return { clientId, clientSecret, firebaseApiKey };
};

const decodeJwtPayload = (token) => {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); }
  catch { return null; }
};

const assertGoogleIdTokenBinding = (idToken, { clientId, nonce }) => {
  const claims = decodeJwtPayload(idToken);
  const audiences = Array.isArray(claims?.aud) ? claims.aud : [claims?.aud];
  const issuerValid = claims?.iss === "https://accounts.google.com" || claims?.iss === "accounts.google.com";
  const notExpired = Number(claims?.exp || 0) > Math.floor(Date.now() / 1000);
  if (!claims || !safeEqualText(claims.nonce, nonce) || !audiences.includes(clientId) || !issuerValid || !notExpired) {
    throw Object.assign(new Error("Respons identitas Google tidak cocok dengan permintaan login."), { status: 401, code: "OAUTH_ID_TOKEN_BINDING_INVALID" });
  }
};

const exchangeGoogleCode = async ({ code, clientId, clientSecret, redirectUri, codeVerifier }) => {
  let response;
  try {
    response = await fetchWithTimeout(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });
  } catch {
    throw Object.assign(new Error("Google OAuth tidak dapat dihubungi."), { status: 502, code: "OAUTH_TOKEN_NETWORK_FAILED" });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id_token) {
    throw Object.assign(new Error("Authorization code Google tidak dapat ditukar."), { status: 401, code: "OAUTH_TOKEN_EXCHANGE_FAILED" });
  }
  return body.id_token;
};

const exchangeGoogleIdTokenForFirebase = async ({ googleIdToken, firebaseApiKey, requestUri }) => {
  let response;
  try {
    response = await fetchWithTimeout(`${FIREBASE_IDP_ENDPOINT}?key=${encodeURIComponent(firebaseApiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestUri,
        postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
        returnSecureToken: true,
      }),
    });
  } catch {
    throw Object.assign(new Error("Firebase Authentication tidak dapat dihubungi."), { status: 502, code: "FIREBASE_IDP_NETWORK_FAILED" });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.idToken) {
    throw Object.assign(new Error("Firebase Authentication menolak credential Google."), { status: 401, code: "FIREBASE_IDP_EXCHANGE_FAILED" });
  }
  return body.idToken;
};

// Identity is always re-verified server-side. Runtime access comes from the canonical
// backend user registry; ALLOWED_USERS_JSON is only consulted by resolveLoginIdentity
// for guarded first-owner bootstrap on an empty database.
const establishSessionFromFirebaseToken = async (firebaseIdToken) => {
  const verified = await verifyFirebaseIdToken(firebaseIdToken);
  enforceBestEffortRateLimit(identityRateLimitKey("session:identity", `${verified.uid}:${verified.email}`), { limit: 20, windowMs: 5 * 60_000 });
  return verified;
};

const databaseForRequest = (request) => request.database || getDatabase();

const issueSession = async (request, verifiedIdentity, requestId) => {
  const db = databaseForRequest(request);
  await assertDatabaseReady(db);
  const actor = await resolveLoginIdentity(db, verifiedIdentity, { requestId });
  const signedActor = { ...verifiedIdentity, role: actor.role };
  const create = (tx) => createRegisteredSession(tx, { actor, signedActor, request, requestId, photoURL: verifiedIdentity.photoURL || "" });
  return typeof db.transaction === "function" ? db.transaction(create) : create(db);
};

const readCurrentSession = async (request, response, requestId, startedAt) => {
  const db = databaseForRequest(request);
  await assertDatabaseReady(db);
  const session = await resolveRegisteredSession(db, request);
  logEvent(session ? "debug" : "info", "session.request.completed", {
    requestId,
    action: "session.read",
    status: session ? 200 : 401,
    code: session ? null : "UNAUTHENTICATED",
    role: session?.role,
    durationMs: requestDuration(startedAt),
  });
  if (session) return ok(response, session);
  response.setHeader("Set-Cookie", clearSessionCookie());
  return fail(response, 401, "UNAUTHENTICATED", "Sesi tidak ditemukan.", { requestId });
};

const logoutSession = async (request, response, requestId, startedAt) => {
  const db = databaseForRequest(request);
  await assertDatabaseReady(db);
  const revoke = async (tx) => {
    const revoked = await revokeSessionFromRequest(tx, request, "logout");
    if (revoked.revoked && !revoked.alreadyRevoked && revoked.sessionId && revoked.userId) {
      const actor = await tx.one("SELECT * FROM users WHERE user_id=?", [revoked.userId]);
      if (actor) await appendAudit(tx, { actor, action: "session.logout", requestId }, {
        entityType: "session",
        entityId: revoked.sessionId,
        next: { revoked: true, reason: "logout" },
      });
    }
    return revoked;
  };
  if (typeof db.transaction === "function") await db.transaction(revoke);
  else await revoke(db);
  response.setHeader("Set-Cookie", clearSessionCookie());
  logEvent("info", "session.request.completed", { requestId, action: "session.logout", status: 200, durationMs: requestDuration(startedAt) });
  return ok(response, { loggedOut: true });
};

const loginSession = async (request, response, body, requestId, startedAt) => {
  if (body.action !== "login" || !body.firebaseIdToken) {
    return fail(response, 400, "INVALID_LOGIN", "Firebase ID token wajib dikirim.", { requestId });
  }
  enforceBestEffortRateLimit(clientRateLimitKey(request, "session:login"), { limit: 10, windowMs: 60_000 });
  try {
    const verifiedIdentity = await establishSessionFromFirebaseToken(body.firebaseIdToken);
    const issued = await issueSession(request, verifiedIdentity, requestId);
    const role = issued.session.role;
    response.setHeader("Set-Cookie", createSessionCookie(issued.credential));
    logEvent("info", "session.request.completed", { requestId, action: "session.login", role, status: 200, durationMs: requestDuration(startedAt) });
    return ok(response, issued.session);
  } catch (error) {
    if (error?.code === "ACCOUNT_NOT_ALLOWED") {
      logEvent("warn", "session.request.rejected", { requestId, action: "session.login", status: 403, code: error.code, durationMs: requestDuration(startedAt) });
    }
    throw error;
  }
};

const processSessionPost = async (request, response, requestId, startedAt, requestState) => {
  assertAllowedOrigin(request);
  const body = await readJsonBody(request, 20_000);
  requestState.action = body.action === "logout" ? "session.logout" : "session.login";
  if (body.action === "logout") return logoutSession(request, response, requestId, startedAt);
  return loginSession(request, response, body, requestId, startedAt);
};

const startGoogleOAuth = (request, response, requestId, startedAt) => {
  enforceBestEffortRateLimit(clientRateLimitKey(request, "session:oauth-start"), { limit: 12, windowMs: 60_000 });
  const origin = trustedRequestOrigin(request);
  const { clientId } = requireGoogleOAuthConfig();
  const transaction = createGoogleOAuthTransaction({ returnTo: requestParam(request, "returnTo") || "/" });
  const redirectUri = `${origin}${GOOGLE_OAUTH_CALLBACK_PATH}`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: transaction.state,
    nonce: transaction.nonce,
    prompt: "select_account",
    code_challenge: transaction.codeChallenge,
    code_challenge_method: "S256",
  });
  appendSetCookie(response, transaction.cookie);
  logEvent("info", "session.request.completed", {
    requestId,
    action: "session.oauth.start",
    status: 302,
    durationMs: requestDuration(startedAt),
  });
  return redirectNoStore(response, `${GOOGLE_AUTHORIZE_ENDPOINT}?${params.toString()}`, 302);
};

const googleOAuthFailureCode = (error) => {
  if (error?.code === "OAUTH_ACCESS_DENIED") return "cancelled";
  if (error?.code === "OAUTH_CONFIG_INCOMPLETE") return "config";
  if (["ACCOUNT_NOT_ALLOWED", "IDENTITY_NOT_PROVISIONED"].includes(error?.code)) return "not-allowed";
  if (error?.code === "ACCOUNT_INACTIVE") return "inactive";
  if (error?.code === "IDENTITY_CONFLICT") return "identity-conflict";
  return "failed";
};

const failGoogleOAuthFlow = (response, error, { requestId, action, startedAt }) => {
  appendSetCookie(response, clearGoogleOAuthTransactionCookie());
  const status = error?.status || 500;
  logEvent(status >= 500 ? "error" : "warn", "session.request.failed", {
    requestId,
    action,
    status,
    code: error?.code || "OAUTH_LOGIN_FAILED",
    durationMs: requestDuration(startedAt),
    error: sanitizeError(error),
  });
  return redirectNoStore(response, `/login?authError=${encodeURIComponent(googleOAuthFailureCode(error))}`, 303);
};

// Bind callback state + nonce to the short-lived server transaction before exchanging
// credentials; then establish the same Firebase-backed application session used elsewhere.
const completeGoogleOAuth = async (request, response, requestId, startedAt) => {
  enforceBestEffortRateLimit(clientRateLimitKey(request, "session:oauth-callback"), { limit: 12, windowMs: 60_000 });
  const origin = trustedRequestOrigin(request);
  const { clientId, clientSecret, firebaseApiKey } = requireGoogleOAuthConfig();
  const transaction = readGoogleOAuthTransaction(request);
  const state = requestParam(request, "state");
  if (!transaction || !state || !safeEqualText(state, transaction.state)) {
    throw Object.assign(new Error("State OAuth tidak valid atau sudah kedaluwarsa."), { status: 403, code: "OAUTH_STATE_INVALID" });
  }

  const providerError = requestParam(request, "error");
  if (providerError) {
    throw Object.assign(new Error("Login Google dibatalkan sebelum selesai."), {
      status: 401,
      code: providerError === "access_denied" ? "OAUTH_ACCESS_DENIED" : "OAUTH_PROVIDER_REJECTED",
    });
  }

  const code = requestParam(request, "code");
  if (!code || code.length > 4_096) {
    throw Object.assign(new Error("Authorization code Google tidak tersedia."), { status: 400, code: "OAUTH_CODE_MISSING" });
  }

  const redirectUri = `${origin}${GOOGLE_OAUTH_CALLBACK_PATH}`;
  const googleIdToken = await exchangeGoogleCode({ code, clientId, clientSecret, redirectUri, codeVerifier: transaction.codeVerifier });
  assertGoogleIdTokenBinding(googleIdToken, { clientId, nonce: transaction.nonce });
  const firebaseIdToken = await exchangeGoogleIdTokenForFirebase({ googleIdToken, firebaseApiKey, requestUri: origin });
  const verifiedIdentity = await establishSessionFromFirebaseToken(firebaseIdToken);
  const issued = await issueSession(request, verifiedIdentity, requestId);
  const role = issued.session.role;

  appendSetCookie(response, clearGoogleOAuthTransactionCookie());
  appendSetCookie(response, createSessionCookie(issued.credential));
  logEvent("info", "session.request.completed", {
    requestId,
    action: "session.login",
    flow: "google-oauth-server",
    role,
    status: 200,
    durationMs: requestDuration(startedAt),
  });
  return redirectNoStore(response, transaction.returnTo || "/", 303);
};

const failSessionRequest = (response, error, { requestId, action, startedAt }) => {
  const status = error.status || 500;
  const code = error.code || "SESSION_ERROR";
  const headers = status === 429 && error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {};
  logEvent(status >= 500 ? "error" : "warn", "session.request.failed", {
    requestId,
    action,
    status,
    code,
    durationMs: requestDuration(startedAt),
    error: sanitizeError(error),
  });
  return fail(response, status, code, error.status ? error.message : "Sesi tidak dapat diproses.", { ...(error.details || {}), requestId }, headers);
};

export default async function handler(request, response) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(request);
  const flow = request.method === "GET" ? requestParam(request, "flow") : "";
  const requestState = {
    action: flow === GOOGLE_OAUTH_START_FLOW
      ? "session.oauth.start"
      : flow === GOOGLE_OAUTH_CALLBACK_FLOW
        ? "session.oauth.callback"
        : request.method === "GET" ? "session.read" : "session.unknown",
  };
  attachRequestId(response, requestId);
  try {
    if (request.method === "GET" && flow === GOOGLE_OAUTH_START_FLOW) {
      try { return startGoogleOAuth(request, response, requestId, startedAt); }
      catch (error) { return failGoogleOAuthFlow(response, error, { requestId, action: requestState.action, startedAt }); }
    }
    if (request.method === "GET" && flow === GOOGLE_OAUTH_CALLBACK_FLOW) {
      try { return await completeGoogleOAuth(request, response, requestId, startedAt); }
      catch (error) { return failGoogleOAuthFlow(response, error, { requestId, action: requestState.action, startedAt }); }
    }
    if (request.method === "GET") return await readCurrentSession(request, response, requestId, startedAt);
    if (request.method !== "POST") {
      logEvent("warn", "session.request.rejected", { requestId, action: requestState.action, status: 405, code: "METHOD_NOT_ALLOWED", durationMs: requestDuration(startedAt) });
      return methodNotAllowed(response, ["GET", "POST"]);
    }
    return await processSessionPost(request, response, requestId, startedAt, requestState);
  } catch (error) {
    return failSessionRequest(response, error, { requestId, action: requestState.action, startedAt });
  }
}
