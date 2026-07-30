import crypto from "node:crypto";
import { callAppsScript } from "./_lib/appsScript.js";
import { fail, methodNotAllowed, ok, readJsonBody } from "./_lib/http.js";
import { assertAllowedOrigin, assertPayloadAuthorization, authorizeAction, createInternalEnvelope, enforceBestEffortRateLimit, readSession, requiresIdempotencyKey } from "./_lib/security.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  try {
    assertAllowedOrigin(request);
    const session = readSession(request);
    if (!session) return fail(response, 401, "UNAUTHENTICATED", "Sesi sudah berakhir. Silakan login kembali.");
    enforceBestEffortRateLimit(session.uid);
    const body = await readJsonBody(request, 1_500_000);
    if (!body.action || typeof body.action !== "string") return fail(response, 400, "ACTION_REQUIRED", "Action wajib diisi.");
    if (!authorizeAction(session, body.action)) return fail(response, 403, "FORBIDDEN", "Role tidak diizinkan menjalankan action ini.");
    if (requiresIdempotencyKey(body.action) && !body.idempotencyKey) return fail(response, 400, "IDEMPOTENCY_REQUIRED", "Idempotency key wajib untuk operasi perubahan data.");
    assertPayloadAuthorization(session, body.action, body.payload || {});
    const requestId = String(request.headers["x-request-id"] || crypto.randomUUID()).slice(0, 120);
    const envelope = createInternalEnvelope({
      actor: { uid: session.uid, email: session.email, name: session.name, role: session.role },
      action: body.action,
      payload: body.payload || {},
      requestId,
      idempotencyKey: body.idempotencyKey,
      rowVersion: body.rowVersion,
    });
    const upstream = await callAppsScript(envelope);
    if (upstream.ok === false) return fail(response, upstream.error?.status || 400, upstream.error?.code || "UPSTREAM_ERROR", upstream.error?.message || "Operasi ditolak.", upstream.error?.details);
    return ok(response, upstream.data);
  } catch (error) {
    const headers = error.status === 429 && error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {};
    return fail(response, error.status || 500, error.code || "GATEWAY_ERROR", error.status ? error.message : "Gateway tidak dapat memproses permintaan.", error.details, headers);
  }
}
