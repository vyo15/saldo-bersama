import crypto from "node:crypto";
import { callAppsScript } from "./_lib/appsScript.js";
import { fail, methodNotAllowed, ok, readJsonBody } from "./_lib/http.js";
import { attachRequestId, logEvent, requestIdFrom, sanitizeError } from "./_lib/observability.js";
import { assertAllowedOrigin, assertPayloadAuthorization, authorizeAction, createInternalEnvelope, enforceBestEffortRateLimit, readSession, requiresIdempotencyKey } from "./_lib/security.js";

const COALESCED_READ_ACTIONS = new Set([
  "app.initialState", "bootstrap.get", "system.health", "users.list", "audit.list",
  "dashboard.overview", "accounts.list", "categories.list", "transactions.list",
  "envelopes.list", "recurring.list", "budgets.list", "goals.list", "reports.monthly", "periods.list"
]);
const inFlightReads = new Map();

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
};

const coalescedReadKey = (session, action, payload) => crypto.createHash("sha256")
  .update(JSON.stringify([session.uid, session.role, action, stableValue(payload || {})]))
  .digest("hex");

const callUpstream = (session, action, payload, envelope, requestId) => {
  if (!COALESCED_READ_ACTIONS.has(action)) return callAppsScript(envelope);
  const key = coalescedReadKey(session, action, payload);
  const existing = inFlightReads.get(key);
  if (existing) {
    logEvent("debug", "gateway.request.coalesced", {
      requestId,
      action,
      operationKey: key.slice(0, 16),
      upstreamRequestId: existing.requestId,
    });
    return existing.promise;
  }
  const entry = { requestId, promise: null };
  entry.promise = callAppsScript(envelope).finally(() => {
    if (inFlightReads.get(key) === entry) inFlightReads.delete(key);
  });
  inFlightReads.set(key, entry);
  return entry.promise;
};

export default async function handler(request, response) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(request);
  let action = "unknown";
  attachRequestId(response, requestId);

  if (request.method !== "POST") {
    logEvent("warn", "gateway.request.rejected", { requestId, action, status: 405, code: "METHOD_NOT_ALLOWED", durationMs: Date.now() - startedAt });
    return methodNotAllowed(response, ["POST"]);
  }

  try {
    assertAllowedOrigin(request);
    const session = readSession(request);
    if (!session) {
      logEvent("warn", "gateway.request.rejected", { requestId, action, status: 401, code: "UNAUTHENTICATED", durationMs: Date.now() - startedAt });
      return fail(response, 401, "UNAUTHENTICATED", "Sesi sudah berakhir. Silakan login kembali.", { requestId });
    }
    enforceBestEffortRateLimit(session.uid);
    const body = await readJsonBody(request, 1_500_000);
    action = String(body.action || "unknown").slice(0, 120);
    if (!body.action || typeof body.action !== "string") return fail(response, 400, "ACTION_REQUIRED", "Action wajib diisi.", { requestId });
    if (!authorizeAction(session, body.action)) return fail(response, 403, "FORBIDDEN", "Role tidak diizinkan menjalankan action ini.", { requestId });
    if (requiresIdempotencyKey(body.action) && !body.idempotencyKey) return fail(response, 400, "IDEMPOTENCY_REQUIRED", "Idempotency key wajib untuk operasi perubahan data.", { requestId });
    assertPayloadAuthorization(session, body.action, body.payload || {});
    const envelope = createInternalEnvelope({
      actor: { uid: session.uid, email: session.email, name: session.name, role: session.role },
      action: body.action,
      payload: body.payload || {},
      requestId,
      idempotencyKey: body.idempotencyKey,
      rowVersion: body.rowVersion,
    });
    const upstream = await callUpstream(session, body.action, body.payload || {}, envelope, requestId);
    if (upstream.ok === false) {
      const status = upstream.error?.status || 400;
      const code = upstream.error?.code || "UPSTREAM_ERROR";
      logEvent(status >= 500 ? "error" : "warn", "gateway.request.completed", {
        requestId,
        action,
        role: session.role,
        status,
        code,
        durationMs: Date.now() - startedAt,
      });
      return fail(response, status, code, upstream.error?.message || "Operasi ditolak.", { ...(upstream.error?.details || {}), requestId });
    }
    logEvent("info", "gateway.request.completed", {
      requestId,
      action,
      role: session.role,
      status: 200,
      durationMs: Date.now() - startedAt,
    });
    return ok(response, upstream.data);
  } catch (error) {
    const status = error.status || 500;
    const code = error.code || "GATEWAY_ERROR";
    const headers = status === 429 && error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {};
    logEvent(status >= 500 ? "error" : "warn", "gateway.request.failed", {
      requestId,
      action,
      status,
      code,
      durationMs: Date.now() - startedAt,
      error: sanitizeError(error),
    });
    return fail(response, status, code, error.status ? error.message : "Gateway tidak dapat memproses permintaan.", {
      ...(error.details || {}),
      requestId,
    }, headers);
  }
}
