import crypto from "node:crypto";
import { dispatchAction } from "./_lib/actionDispatcher.js";
import { getDatabase } from "./_lib/db/httpClient.js";
import { assertDatabaseReady } from "./_lib/db/schema.js";
import { fail, methodNotAllowed, ok, readJsonBody } from "./_lib/http.js";
import { attachRequestId, logEvent, requestIdFrom, sanitizeError } from "./_lib/observability.js";
import { assertAllowedOrigin, assertPayloadAuthorization, authorizeAction, enforceBestEffortRateLimit, identityRateLimitKey, requiresIdempotencyKey } from "./_lib/security.js";
import { resolveRegisteredSession } from "./_lib/sessionRegistry.js";
import { stableValue } from "./_lib/serialization.js";

const COALESCED_READ_ACTIONS = new Set([
  "app.initialState", "system.health", "users.list", "audit.list", "dashboard.overview", "accounts.list",
  "categories.list", "transactions.list", "sessions.listOwn", "envelopes.list", "recurring.list", "budgets.list", "goals.list",
  "reports.monthly", "reconciliations.list", "periods.list", "integrations.status", "notifications.status",
]);
const inFlightReads = new Map();
const coalescedReadKey = (session, action, payload) => crypto.createHash("sha256").update(JSON.stringify([session.uid, session.role, action, stableValue(payload || {})])).digest("hex");

const dispatch = (db, session, action, payload, options, requestId) => {
  const task = () => dispatchAction({
    signedActor: { uid: session.uid, email: session.email, name: session.name, role: session.role, sessionId: session.sessionId },
    action,
    payload,
    requestId,
    idempotencyKey: options.idempotencyKey,
    rowVersion: options.rowVersion,
    database: db,
  });
  if (!COALESCED_READ_ACTIONS.has(action)) return task();
  const key = coalescedReadKey(session, action, payload);
  const existing = inFlightReads.get(key);
  if (existing) return existing;
  const promise = task().finally(() => { if (inFlightReads.get(key) === promise) inFlightReads.delete(key); });
  inFlightReads.set(key, promise);
  return promise;
};

const rejectGatewayRequest = (response, session, body, requestId, action) => {
  if (!action) return { action, response: fail(response, 400, "ACTION_REQUIRED", "Action wajib diisi.", { requestId }) };
  if (!authorizeAction(session, action)) return { action, response: fail(response, 403, "FORBIDDEN", "Role tidak diizinkan menjalankan action ini.", { requestId }) };
  if (requiresIdempotencyKey(action) && !body.idempotencyKey) {
    return { action, response: fail(response, 400, "IDEMPOTENCY_REQUIRED", "Idempotency key wajib untuk operasi perubahan data.", { requestId }) };
  }
  return { action, response: null };
};

const processGatewayRequest = async (request, response, requestId, requestState) => {
  assertAllowedOrigin(request);
  const db = getDatabase();
  await assertDatabaseReady(db);
  const session = await resolveRegisteredSession(db, request);
  if (!session) return { action: "unknown", response: fail(response, 401, "UNAUTHENTICATED", "Sesi sudah berakhir. Silakan login kembali.", { requestId }) };
  enforceBestEffortRateLimit(identityRateLimitKey("gateway", session.uid));
  const body = await readJsonBody(request, 1_500_000);
  requestState.action = String(body.action || "").slice(0, 120);
  const rejection = rejectGatewayRequest(response, session, body, requestId, requestState.action);
  if (rejection.response) return rejection;
  const { action } = rejection;
  const payload = body.payload || {};
  assertPayloadAuthorization(session, action, payload);
  const result = await dispatch(db, session, action, payload, {
    idempotencyKey: body.idempotencyKey || null,
    rowVersion: body.rowVersion ?? null,
  }, requestId);
  return { action, response: ok(response, result), role: session.role };
};

const failGatewayRequest = (response, error, { requestId, action, startedAt }) => {
  const status = Number(error.status || 500);
  const code = String(error.code || "GATEWAY_ERROR");
  const headers = status === 429 && error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {};
  logEvent(status >= 500 ? "error" : "warn", "gateway.request.failed", {
    requestId,
    action,
    status,
    code,
    durationMs: Date.now() - startedAt,
    error: sanitizeError(error),
  });
  const safeDetails = status < 500 ? (error.details || {}) : {};
  return fail(response, status, code, error.status ? error.message : "Gateway tidak dapat memproses permintaan.", { ...safeDetails, requestId }, headers);
};

export default async function handler(request, response) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(request);
  const requestState = { action: "unknown" };
  attachRequestId(response, requestId);
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  try {
    const result = await processGatewayRequest(request, response, requestId, requestState);
    if (result.role) {
      logEvent("info", "gateway.request.completed", { requestId, action: requestState.action, role: result.role, status: 200, durationMs: Date.now() - startedAt });
    }
    return result.response;
  } catch (error) {
    return failGatewayRequest(response, error, { requestId, action: requestState.action, startedAt });
  }
}
