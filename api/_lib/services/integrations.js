import crypto from "node:crypto";
import { appError, canonicalJson, nowIso, sanitizeText, uuid } from "./core.js";

const OUTBOX_PROVIDERS = new Set(["sheets", "calendar", "drive"]);

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

export const integrationStatus = async (db) => {
  const rows = await db.all("SELECT provider,status,COUNT(*) AS count,MAX(updated_at) AS last_updated_at FROM integration_outbox GROUP BY provider,status");
  const providers = {};
  for (const row of rows) {
    const item = providers[row.provider] || { pending: 0, processing: 0, failed: 0, dead_letter: 0, completed: 0, lastUpdatedAt: null };
    item[row.status] = Number(row.count || 0);
    if (!item.lastUpdatedAt || String(row.last_updated_at) > item.lastUpdatedAt) item.lastUpdatedAt = row.last_updated_at;
    providers[row.provider] = item;
  }
  const bridgeConfigured = Boolean(process.env.GOOGLE_BRIDGE_WEB_APP_URL && process.env.GOOGLE_BRIDGE_SHARED_SECRET);
  return { providers, configured: { sheets: bridgeConfigured, calendar: bridgeConfigured, drive: bridgeConfigured } };
};

const signature = (message, secret) => crypto.createHmac("sha256", secret).update(message).digest("hex");

export const callGoogleBridge = async (action, payload, { fetchImpl = globalThis.fetch } = {}) => {
  const url = String(process.env.GOOGLE_BRIDGE_WEB_APP_URL || "").trim();
  const secret = String(process.env.GOOGLE_BRIDGE_SHARED_SECRET || "").trim();
  if (!url || !secret) throw appError("GOOGLE_BRIDGE_NOT_CONFIGURED", "Integrasi Google belum dikonfigurasi.", 503);
  const message = canonicalJson({ action, payload, timestamp: Date.now(), nonce: crypto.randomUUID() });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, signature: signature(message, secret) }), signal: controller.signal });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok || body.ok === false) throw appError(String(body?.error?.code || "GOOGLE_BRIDGE_FAILED"), sanitizeText(body?.error?.message || "Integrasi Google gagal.", 200), 503);
    return body.data ?? body;
  } catch (error) {
    if (error?.name === "AbortError") throw appError("GOOGLE_BRIDGE_TIMEOUT", "Integrasi Google melewati batas waktu.", 503);
    if (error?.code) throw error;
    throw appError("GOOGLE_BRIDGE_UNAVAILABLE", "Integrasi Google tidak dapat dihubungi.", 503);
  } finally { clearTimeout(timer); }
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
