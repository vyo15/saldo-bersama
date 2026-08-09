import { assertAllowedOrigin, clearSessionCookie, clientRateLimitKey, createSessionCookie, enforceBestEffortRateLimit, findAllowedUser, identityRateLimitKey, readSession } from "./_lib/security.js";
import { fail, methodNotAllowed, ok, readJsonBody } from "./_lib/http.js";
import { verifyFirebaseIdToken } from "./_lib/firebase.js";
import { attachRequestId, logEvent, requestIdFrom, sanitizeError } from "./_lib/observability.js";

const requestDuration = (startedAt) => Date.now() - startedAt;

const readCurrentSession = (request, response, requestId, startedAt) => {
  const session = readSession(request);
  logEvent(session ? "debug" : "info", "session.request.completed", {
    requestId,
    action: "session.read",
    status: session ? 200 : 401,
    code: session ? null : "UNAUTHENTICATED",
    role: session?.role,
    durationMs: requestDuration(startedAt),
  });
  return session ? ok(response, session) : fail(response, 401, "UNAUTHENTICATED", "Sesi tidak ditemukan.", { requestId });
};

const logoutSession = (response, requestId, startedAt) => {
  response.setHeader("Set-Cookie", clearSessionCookie());
  logEvent("info", "session.request.completed", { requestId, action: "session.logout", status: 200, durationMs: requestDuration(startedAt) });
  return ok(response, { loggedOut: true });
};

const loginSession = async (request, response, body, requestId, startedAt) => {
  if (body.action !== "login" || !body.firebaseIdToken) {
    return fail(response, 400, "INVALID_LOGIN", "Firebase ID token wajib dikirim.", { requestId });
  }
  enforceBestEffortRateLimit(clientRateLimitKey(request, "session:login"), { limit: 10, windowMs: 60_000 });
  const verified = await verifyFirebaseIdToken(body.firebaseIdToken);
  enforceBestEffortRateLimit(identityRateLimitKey("session:identity", `${verified.uid}:${verified.email}`), { limit: 20, windowMs: 5 * 60_000 });
  const allowed = findAllowedUser(verified.email);
  if (!allowed) {
    logEvent("warn", "session.request.rejected", { requestId, action: "session.login", status: 403, code: "ACCOUNT_NOT_ALLOWED", durationMs: requestDuration(startedAt) });
    return fail(response, 403, "ACCOUNT_NOT_ALLOWED", "Akun Google ini tidak memiliki akses ke Saldo Bersama.", { requestId });
  }
  const session = { ...verified, role: allowed.role };
  response.setHeader("Set-Cookie", createSessionCookie(session));
  logEvent("info", "session.request.completed", { requestId, action: "session.login", role: allowed.role, status: 200, durationMs: requestDuration(startedAt) });
  return ok(response, session);
};

const processSessionPost = async (request, response, requestId, startedAt, requestState) => {
  assertAllowedOrigin(request);
  const body = await readJsonBody(request, 20_000);
  requestState.action = body.action === "logout" ? "session.logout" : "session.login";
  if (body.action === "logout") return logoutSession(response, requestId, startedAt);
  return loginSession(request, response, body, requestId, startedAt);
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
  const requestState = { action: request.method === "GET" ? "session.read" : "session.unknown" };
  attachRequestId(response, requestId);
  try {
    if (request.method === "GET") return readCurrentSession(request, response, requestId, startedAt);
    if (request.method !== "POST") {
      logEvent("warn", "session.request.rejected", { requestId, action: requestState.action, status: 405, code: "METHOD_NOT_ALLOWED", durationMs: requestDuration(startedAt) });
      return methodNotAllowed(response, ["GET", "POST"]);
    }
    return processSessionPost(request, response, requestId, startedAt, requestState);
  } catch (error) {
    return failSessionRequest(response, error, { requestId, action: requestState.action, startedAt });
  }
}
