import { assertAllowedOrigin, clearSessionCookie, clientRateLimitKey, createSessionCookie, enforceBestEffortRateLimit, findAllowedUser, identityRateLimitKey, readSession } from "./_lib/security.js";
import { fail, methodNotAllowed, ok, readJsonBody } from "./_lib/http.js";
import { verifyFirebaseIdToken } from "./_lib/firebase.js";

export default async function handler(request, response) {
  try {
    if (request.method === "GET") {
      const session = readSession(request);
      return session ? ok(response, session) : fail(response, 401, "UNAUTHENTICATED", "Sesi tidak ditemukan.");
    }
    if (request.method !== "POST") return methodNotAllowed(response, ["GET", "POST"]);
    assertAllowedOrigin(request);
    const body = await readJsonBody(request, 20_000);
    if (body.action === "logout") {
      response.setHeader("Set-Cookie", clearSessionCookie());
      return ok(response, { loggedOut: true });
    }
    if (body.action !== "login" || !body.firebaseIdToken) return fail(response, 400, "INVALID_LOGIN", "Firebase ID token wajib dikirim.");
    enforceBestEffortRateLimit(clientRateLimitKey(request, "session:login"), { limit: 10, windowMs: 60_000 });
    const verified = await verifyFirebaseIdToken(body.firebaseIdToken);
    enforceBestEffortRateLimit(identityRateLimitKey("session:identity", `${verified.uid}:${verified.email}`), { limit: 20, windowMs: 5 * 60_000 });
    const allowed = findAllowedUser(verified.email);
    if (!allowed) return fail(response, 403, "ACCOUNT_NOT_ALLOWED", "Akun Google ini tidak memiliki akses ke Saldo Bersama.");
    const session = { ...verified, role: allowed.role };
    response.setHeader("Set-Cookie", createSessionCookie(session));
    return ok(response, session);
  } catch (error) {
    const headers = error.status === 429 && error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {};
    return fail(response, error.status || 500, error.code || "SESSION_ERROR", error.status ? error.message : "Sesi tidak dapat diproses.", error.details, headers);
  }
}
