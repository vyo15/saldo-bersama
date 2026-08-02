import crypto from "node:crypto";
import { dispatchAction } from "./_lib/actionDispatcher.js";
import { fail, methodNotAllowed, ok, readJsonBody } from "./_lib/http.js";
import { attachRequestId, logEvent, requestIdFrom, sanitizeError } from "./_lib/observability.js";
import { assertAllowedOrigin, assertPayloadAuthorization, authorizeAction, enforceBestEffortRateLimit, readSession, requiresIdempotencyKey } from "./_lib/security.js";

const COALESCED_READ_ACTIONS = new Set([
  "app.initialState", "system.health", "users.list", "audit.list", "dashboard.overview", "accounts.list",
  "categories.list", "transactions.list", "envelopes.list", "recurring.list", "budgets.list", "goals.list",
  "reports.monthly", "reconciliations.list", "periods.list", "integrations.status",
]);
const inFlightReads = new Map();
const stableValue = (value) => Array.isArray(value) ? value.map(stableValue) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])])) : value;
const coalescedReadKey = (session, action, payload) => crypto.createHash("sha256").update(JSON.stringify([session.uid, session.role, action, stableValue(payload || {})])).digest("hex");

const dispatch = (session, action, payload, options, requestId) => {
  const task = () => dispatchAction({
    signedActor: { uid: session.uid, email: session.email, name: session.name, role: session.role },
    action,
    payload,
    requestId,
    idempotencyKey: options.idempotencyKey,
    rowVersion: options.rowVersion,
  });
  if (!COALESCED_READ_ACTIONS.has(action)) return task();
  const key = coalescedReadKey(session, action, payload);
  const existing = inFlightReads.get(key);
  if (existing) return existing;
  const promise = task().finally(() => { if (inFlightReads.get(key) === promise) inFlightReads.delete(key); });
  inFlightReads.set(key, promise);
  return promise;
};

export default async function handler(request, response) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(request);
  let action = "unknown";
  attachRequestId(response, requestId);
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  try {
    assertAllowedOrigin(request);
    const session = readSession(request);
    if (!session) return fail(response, 401, "UNAUTHENTICATED", "Sesi sudah berakhir. Silakan login kembali.", { requestId });
    enforceBestEffortRateLimit(session.uid);
    const body = await readJsonBody(request, 1_500_000);
    action = String(body.action || "").slice(0, 120);
    if (!action) return fail(response, 400, "ACTION_REQUIRED", "Action wajib diisi.", { requestId });
    if (!authorizeAction(session, action)) return fail(response, 403, "FORBIDDEN", "Role tidak diizinkan menjalankan action ini.", { requestId });
    if (requiresIdempotencyKey(action) && !body.idempotencyKey) return fail(response, 400, "IDEMPOTENCY_REQUIRED", "Idempotency key wajib untuk operasi perubahan data.", { requestId });
    assertPayloadAuthorization(session, action, body.payload || {});
    const result = await dispatch(session, action, body.payload || {}, { idempotencyKey: body.idempotencyKey || null, rowVersion: body.rowVersion ?? null }, requestId);
    logEvent("info", "gateway.request.completed", { requestId, action, role: session.role, status: 200, durationMs: Date.now() - startedAt });
    return ok(response, result);
  } catch (error) {
    const status = Number(error.status || 500);
    const code = String(error.code || "GATEWAY_ERROR");
    const headers = status === 429 && error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {};
    logEvent(status >= 500 ? "error" : "warn", "gateway.request.failed", { requestId, action, status, code, durationMs: Date.now() - startedAt, error: sanitizeError(error) });
    const safeDetails = status < 500 ? (error.details || {}) : {};
    return fail(response, status, code, error.status ? error.message : "Gateway tidak dapat memproses permintaan.", { ...safeDetails, requestId }, headers);
  }
}
