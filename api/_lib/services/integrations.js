import { readBatchRows } from "../db/readBatchRows.js";
import crypto from "node:crypto";
import { appError, canonicalJson, nowIso, sanitizeText, uuid } from "./core.js";

const OUTBOX_PROVIDERS = new Set(["sheets", "calendar", "drive"]);
const BRIDGE_HEALTH_TIMEOUT_MS = 12_000;
const BRIDGE_LIVENESS_TIMEOUT_MS = 7_000;
const BRIDGE_SERVICE = "saldo-bersama-google-bridge";
const BRIDGE_MIN_VERSION = 3;

export const enqueueIntegration = async (db, provider, eventType, entityType, entityId, payload = {}) => {
  if (!OUTBOX_PROVIDERS.has(provider)) throw appError("INTEGRATION_PROVIDER_INVALID", "Provider integrasi tidak valid.", 500);
  const eventKey = `${provider}:${eventType}:${entityType}:${entityId}`.slice(0, 250);
  const existing = await db.one("SELECT outbox_id FROM integration_outbox WHERE provider=? AND event_key=? AND status IN ('pending','failed') ORDER BY created_at DESC LIMIT 1", [provider, eventKey]);
  const timestamp = nowIso();
  if (existing) {
    await db.execute("UPDATE integration_outbox SET payload_json=?,status='pending',attempt_count=0,next_attempt_at=?,locked_at=NULL,locked_by=NULL,last_error_code='',last_error_message='',updated_at=? WHERE outbox_id=?", [canonicalJson(payload), timestamp, timestamp, existing.outbox_id]);
    return existing.outbox_id;
  }
  const id = uuid();
  await db.execute("INSERT INTO integration_outbox(outbox_id,provider,event_type,entity_type,entity_id,event_key,payload_json,status,attempt_count,next_attempt_at,locked_at,locked_by,last_error_code,last_error_message,created_at,updated_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [id, provider, eventType, entityType, entityId, eventKey, canonicalJson(payload), "pending", 0, timestamp, null, null, "", "", timestamp, timestamp, null]);
  return id;
};

export const integrationEnqueuers = (context) => ({
  enqueueMirror: (db, entityType, entityId) => enqueueIntegration(db, "sheets", "upsert", entityType, entityId, { requestId: context.requestId || "" }),
  enqueueCalendar: (db, entityType, entityId) => enqueueIntegration(db, "calendar", "upsert", entityType, entityId, { requestId: context.requestId || "" }),
});

const signature = (message, secret) => crypto.createHmac("sha256", secret).update(message).digest("hex");

const canonicalBridgeUrl = (value) => {
  let url;
  try { url = new URL(String(value || "").trim()); } catch {
    throw appError("GOOGLE_BRIDGE_URL_INVALID", "URL Google bridge tidak valid.", 503);
  }
  if (
    url.protocol !== "https:"
    || url.hostname !== "script.google.com"
    || !/^\/macros\/s\/[^/]+\/exec\/?$/.test(url.pathname)
    || url.search
    || url.hash
  ) {
    throw appError("GOOGLE_BRIDGE_URL_INVALID", "URL Google bridge harus Web App Apps Script canonical /exec.", 503);
  }
  return url.toString();
};

const googleBridgeConfiguration = () => {
  const rawUrl = String(process.env.GOOGLE_BRIDGE_WEB_APP_URL || "").trim();
  const secret = String(process.env.GOOGLE_BRIDGE_SHARED_SECRET || "").trim();
  if (!rawUrl || !secret) throw appError("GOOGLE_BRIDGE_NOT_CONFIGURED", "Integrasi Google belum dikonfigurasi.", 503);
  if (secret.length < 32) throw appError("GOOGLE_BRIDGE_SECRET_INVALID", "Shared secret Google bridge belum valid.", 503);
  return { url: canonicalBridgeUrl(rawUrl), secret };
};

const parseJsonResponse = async (response) => {
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { body, text };
};

const parseBridgeResponse = async (response) => {
  const { body } = await parseJsonResponse(response);
  if (response.ok && body?.ok !== false && body) return body.data ?? body;
  if (!body) throw appError("GOOGLE_BRIDGE_RESPONSE_INVALID", "Deployment Google bridge mengembalikan respons yang tidak dikenali.", 503);
  const error = body.error || {};
  throw appError(String(error.code || "GOOGLE_BRIDGE_FAILED"), sanitizeText(error.message || "Integrasi Google gagal.", 200), 503);
};

const normalizeBridgeCallError = (error) => {
  if (error?.name === "AbortError") return appError("GOOGLE_BRIDGE_TIMEOUT", "Integrasi Google melewati batas waktu.", 503);
  if (error?.code) return error;
  return appError("GOOGLE_BRIDGE_UNAVAILABLE", "Integrasi Google tidak dapat dihubungi.", 503);
};

const fetchWithTimeout = async (fetchImpl, url, options, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 15_000));
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const bridgeLiveness = async (fetchImpl = globalThis.fetch, timeoutMs = BRIDGE_LIVENESS_TIMEOUT_MS) => {
  let url;
  try {
    ({ url } = googleBridgeConfiguration());
    const startedAt = Date.now();
    const response = await fetchWithTimeout(fetchImpl, url, { method: "GET", redirect: "follow", cache: "no-store" }, timeoutMs);
    const completedAt = Date.now();
    const { body } = await parseJsonResponse(response);
    if (!response.ok || !body || body.ok === false) {
      return { checked: true, reachable: false, errorCode: "GOOGLE_BRIDGE_LIVENESS_INVALID", version: null, clockOffsetMs: 0 };
    }
    const payload = body.data ?? body;
    const serviceValid = payload?.service === BRIDGE_SERVICE;
    const version = Number(payload?.version || 0);
    const remoteTime = Date.parse(String(payload?.timestamp || ""));
    if (!serviceValid) {
      return { checked: true, reachable: false, errorCode: "GOOGLE_BRIDGE_SERVICE_MISMATCH", version: Number.isSafeInteger(version) ? version : null, clockOffsetMs: 0 };
    }
    if (!Number.isSafeInteger(version) || version < BRIDGE_MIN_VERSION) {
      return { checked: true, reachable: false, errorCode: "GOOGLE_BRIDGE_DEPLOYMENT_STALE", version: Number.isSafeInteger(version) ? version : null, clockOffsetMs: 0 };
    }
    if (!Number.isFinite(remoteTime)) {
      return { checked: true, reachable: false, errorCode: "GOOGLE_BRIDGE_TIME_INVALID", version, clockOffsetMs: 0 };
    }
    const localMidpoint = Math.round((startedAt + completedAt) / 2);
    return {
      checked: true,
      reachable: true,
      errorCode: null,
      version,
      clockOffsetMs: remoteTime - localMidpoint,
    };
  } catch (error) {
    const normalized = normalizeBridgeCallError(error);
    return { checked: true, reachable: false, errorCode: normalized.code, version: null, clockOffsetMs: 0 };
  }
};

const signedBridgePost = async ({ url, secret, action, payload, fetchImpl, timeoutMs, clockOffsetMs = 0 }) => {
  const message = canonicalJson({ action, payload, timestamp: Date.now() + Number(clockOffsetMs || 0), nonce: crypto.randomUUID() });
  const response = await fetchWithTimeout(fetchImpl, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature: signature(message, secret) }),
    redirect: "follow",
    cache: "no-store",
  }, timeoutMs);
  return parseBridgeResponse(response);
};

export const callGoogleBridge = async (action, payload, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  clockOffsetMs = 0,
  allowClockRecovery = true,
} = {}) => {
  const config = googleBridgeConfiguration();
  try {
    return await signedBridgePost({ ...config, action, payload, fetchImpl, timeoutMs, clockOffsetMs });
  } catch (error) {
    const normalized = normalizeBridgeCallError(error);
    if (normalized.code !== "MESSAGE_EXPIRED" || !allowClockRecovery || clockOffsetMs) throw normalized;
    const liveness = await bridgeLiveness(fetchImpl);
    if (!liveness.reachable) throw normalized;
    try {
      return await signedBridgePost({
        ...config,
        action,
        payload,
        fetchImpl,
        timeoutMs,
        clockOffsetMs: liveness.clockOffsetMs,
      });
    } catch (retryError) {
      throw normalizeBridgeCallError(retryError);
    }
  }
};

const normalizeBridgeHealth = (value = {}) => ({
  mirrorConfigured: value?.mirrorConfigured === true,
  calendarConfigured: value?.calendarConfigured === true,
  backupConfigured: value?.backupConfigured === true,
  jobsConfigured: value?.jobsConfigured === true,
  triggerReady: value?.triggerReady === true,
  timestamp: sanitizeText(value?.timestamp || "", 80) || null,
});

const bridgeReadiness = (bridgeConfigured, bridge) => {
  if (!bridgeConfigured) return { sheets: false, calendar: false, drive: false };
  if (!bridge?.checked) return { sheets: false, calendar: false, drive: false };
  if (!bridge.reachable || !bridge.health) return { sheets: false, calendar: false, drive: false };
  const schedulerReady = bridge.health.jobsConfigured && bridge.health.triggerReady;
  return {
    sheets: bridge.health.mirrorConfigured && schedulerReady,
    calendar: bridge.health.calendarConfigured && schedulerReady,
    drive: bridge.health.backupConfigured,
  };
};

const probeGoogleBridgeHealth = async (fetchImpl) => {
  const liveness = await bridgeLiveness(fetchImpl);
  try {
    const health = normalizeBridgeHealth(await callGoogleBridge("integration.health", {}, {
      fetchImpl,
      timeoutMs: BRIDGE_HEALTH_TIMEOUT_MS,
      clockOffsetMs: liveness.reachable ? liveness.clockOffsetMs : 0,
      allowClockRecovery: !liveness.reachable,
    }));
    return {
      checked: true,
      reachable: true,
      errorCode: null,
      health,
      liveness: {
        reachable: liveness.reachable,
        errorCode: liveness.errorCode,
        version: liveness.version,
        clockSkewSeconds: liveness.reachable ? Math.round(liveness.clockOffsetMs / 1_000) : null,
      },
    };
  } catch (error) {
    const normalized = normalizeBridgeCallError(error);
    return {
      checked: true,
      reachable: false,
      errorCode: sanitizeText(normalized.code || "GOOGLE_BRIDGE_UNAVAILABLE", 80),
      health: null,
      liveness: {
        reachable: liveness.reachable,
        errorCode: liveness.errorCode,
        version: liveness.version,
        clockSkewSeconds: liveness.reachable ? Math.round(liveness.clockOffsetMs / 1_000) : null,
      },
    };
  }
};

const emptyProviderStatus = () => ({
  pending: 0,
  processing: 0,
  failed: 0,
  dead_letter: 0,
  completed: 0,
  lastUpdatedAt: null,
  lastCompletedAt: null,
  lastFailureAt: null,
});

const newerTimestamp = (current, candidate) => (!current || String(candidate) > current ? candidate : current);

const accumulateProviderRows = (rows) => {
  const providers = {};
  for (const row of rows) {
    const item = providers[row.provider] || emptyProviderStatus();
    item[row.status] = Number(row.count || 0);
    item.lastUpdatedAt = newerTimestamp(item.lastUpdatedAt, row.last_updated_at);
    if (row.status === "completed" && row.last_completed_at) {
      item.lastCompletedAt = newerTimestamp(item.lastCompletedAt, row.last_completed_at);
    }
    if (["failed", "dead_letter"].includes(row.status) && row.last_updated_at) {
      item.lastFailureAt = newerTimestamp(item.lastFailureAt, row.last_updated_at);
    }
    providers[row.provider] = item;
  }
  return providers;
};

const resolveBridgeProbe = async (context, bridgeConfigured) => {
  if (bridgeConfigured && context?.action === "integrations.status") {
    return probeGoogleBridgeHealth(context?.fetchImpl || globalThis.fetch);
  }
  return { checked: false, reachable: null, errorCode: null, health: null };
};

export const integrationStatusStatement = () => ({
  sql: `WITH latest_full_sync AS (
      SELECT provider,MAX(completed_at) AS resolved_at
      FROM integration_outbox
      WHERE status='completed' AND entity_type='system' AND event_type IN ('sync','rebuild') AND completed_at IS NOT NULL
      GROUP BY provider
    )
    SELECT o.provider,o.status,COUNT(*) AS count,MAX(o.updated_at) AS last_updated_at,MAX(o.completed_at) AS last_completed_at
    FROM integration_outbox o
    LEFT JOIN latest_full_sync f ON f.provider=o.provider
    WHERE o.status NOT IN ('failed','dead_letter')
      OR f.resolved_at IS NULL
      OR o.updated_at>f.resolved_at
    GROUP BY o.provider,o.status`,
  args: [],
});

export const backupActivityStatement = () => ({
  sql: `SELECT backup_id,backup_type,external_file_id,file_name,schema_version,status,created_at,verified_at,error_code
    FROM backup_runs ORDER BY created_at DESC LIMIT 1`,
  args: [],
});

const presentDriveBackup = (rows = []) => {
  const row = rows[0];
  if (!row) return null;
  return {
    backupId: row.backup_id,
    backupType: row.backup_type,
    fileId: row.external_file_id || null,
    fileName: row.file_name,
    schemaVersion: Number(row.schema_version || 0),
    status: row.status,
    createdAt: row.created_at,
    verifiedAt: row.verified_at || null,
    errorCode: row.error_code || null,
  };
};

export const presentIntegrationStatus = async (rows, context = null, backupRows = []) => {
  const providers = accumulateProviderRows(rows);
  const bridgeConfigured = Boolean(process.env.GOOGLE_BRIDGE_WEB_APP_URL && process.env.GOOGLE_BRIDGE_SHARED_SECRET);
  const bridgeProbe = await resolveBridgeProbe(context, bridgeConfigured);
  const bridge = { configured: bridgeConfigured, ...bridgeProbe };
  return {
    providers,
    bridge,
    configured: bridgeReadiness(bridgeConfigured, bridge),
    driveBackup: presentDriveBackup(backupRows),
  };
};

export const integrationStatus = async (db, context = null) => {
  const [rows, backupRows] = await readBatchRows(db, [integrationStatusStatement(), backupActivityStatement()]);
  return presentIntegrationStatus(rows, context, backupRows);
};

export const markIntegrationResult = async (db, row, error = null) => {
  const timestamp = nowIso();
  if (!error) {
    const result = await db.execute("UPDATE integration_outbox SET status='completed',completed_at=?,updated_at=?,locked_at=NULL,locked_by=NULL,last_error_code='',last_error_message='' WHERE outbox_id=? AND status='processing' AND locked_by=?", [timestamp, timestamp, row.outbox_id, row.locked_by]);
    return result.rowsAffected === 1;
  }
  const attempts = Number(row.attempt_count || 0) + 1;
  const terminal = attempts >= 5;
  const delayMinutes = Math.min(60, 2 ** Math.min(attempts, 5));
  const next = new Date(Date.now() + delayMinutes * 60_000).toISOString();
  const result = await db.execute("UPDATE integration_outbox SET status=?,attempt_count=?,next_attempt_at=?,updated_at=?,locked_at=NULL,locked_by=NULL,last_error_code=?,last_error_message=? WHERE outbox_id=? AND status='processing' AND locked_by=?", [terminal ? "dead_letter" : "failed", attempts, next, timestamp, sanitizeText(error.code || "INTEGRATION_FAILED", 80), sanitizeText(error.message || "Integrasi gagal.", 250), row.outbox_id, row.locked_by]);
  return result.rowsAffected === 1;
};
