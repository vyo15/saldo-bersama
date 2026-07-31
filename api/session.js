import { assertAllowedOrigin, clearSessionCookie, clientRateLimitKey, createSessionCookie, enforceBestEffortRateLimit, findAllowedUser, identityRateLimitKey, readSession } from "./_lib/security.js";
import { fail, methodNotAllowed, ok, readJsonBody } from "./_lib/http.js";
import { verifyFirebaseIdToken } from "./_lib/firebase.js";
import { attachRequestId, logEvent, requestIdFrom, sanitizeError } from "./_lib/observability.js";

export default async function handler(request, response) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(request);
  let action = request.method === "GET" ? "session.read" : "session.unknown";
  attachRequestId(response, requestId);

  try {
    if (request.method === "GET") {
      const session = readSession(request);
      logEvent(session ? "debug" : "info", "session.request.completed", {
        requestId,
        action,
        status: session ? 200 : 401,
        code: session ? null : "UNAUTHENTICATED",
        role: session?.role,
        durationMs: Date.now() - startedAt,
      });
      return session ? ok(response, session) : fail(response, 401, "UNAUTHENTICATED", "Sesi tidak ditemukan.", { requestId });
    }
    if (request.method !== "POST") {
      logEvent("warn", "session.request.rejected", { requestId, action, status: 405, code: "METHOD_NOT_ALLOWED", durationMs: Date.now() - startedAt });
      return methodNotAllowed(response, ["GET", "POST"]);
    }
    assertAllowedOrigin(request);
    const body = await readJsonBody(request, 20_000);
    action = body.action === "logout" ? "session.logout" : "session.login";
    if (body.action === "logout") {
      response.setHeader("Set-Cookie", clearSessionCookie());
      logEvent("info", "session.request.completed", { requestId, action, status: 200, durationMs: Date.now() - startedAt });
      return ok(response, { loggedOut: true });
    }
    if (body.action !== "login" || !body.firebaseIdToken) return fail(response, 400, "INVALID_LOGIN", "Firebase ID token wajib dikirim.", { requestId });
    enforceBestEffortRateLimit(clientRateLimitKey(request, "session:login"), { limit: 10, windowMs: 60_000 });
    const verified = await verifyFirebaseIdToken(body.firebaseIdToken);
    enforceBestEffortRateLimit(identityRateLimitKey("session:identity", `${verified.uid}:${verified.email}`), { limit: 20, windowMs: 5 * 60_000 });
    const allowed = findAllowedUser(verified.email);
    if (!allowed) {
      logEvent("warn", "session.request.rejected", { requestId, action, status: 403, code: "ACCOUNT_NOT_ALLOWED", durationMs: Date.now() - startedAt });
      return fail(response, 403, "ACCOUNT_NOT_ALLOWED", "Akun Google ini tidak memiliki akses ke Saldo Bersama.", { requestId });
    }
    const session = { ...verified, role: allowed.role };
    response.setHeader("Set-Cookie", createSessionCookie(session));
    logEvent("info", "session.request.completed", { requestId, action, role: allowed.role, status: 200, durationMs: Date.now() - startedAt });
    return ok(response, session);
  } catch (error) {
    const status = error.status || 500;
    const code = error.code || "SESSION_ERROR";
    const headers = status === 429 && error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {};
    logEvent(status >= 500 ? "error" : "warn", "session.request.failed", {
      requestId,
      action,
      status,
      code,
      durationMs: Date.now() - startedAt,
      error: sanitizeError(error),
    });
    return fail(response, status, code, error.status ? error.message : "Sesi tidak dapat diproses.", { ...(error.details || {}), requestId }, headers);
  }
}
