import { logEvent, sanitizeError } from "./observability.js";
import { refreshInternalEnvelope } from "./security.js";

const REQUEST_TOLERANCE_MS = 120_000;
const MAX_CALIBRATED_SKEW_MS = 24 * 60 * 60 * 1_000;
const CALIBRATION_TTL_MS = 15 * 60 * 1_000;

const connectorClock = {
  offsetMs: 0,
  calibratedAt: 0,
  expiresAt: 0,
  lastSkewMs: null,
  lastErrorCode: null,
  lastCallAt: null,
  lastDurationMs: null,
};

const connectorError = (code, message, status, { cause, details } = {}) => Object.assign(new Error(message), {
  code,
  status,
  cause,
  details,
});

const envelopeMetadata = (envelope) => {
  try {
    const message = JSON.parse(String(envelope?.message || ""));
    return {
      requestId: String(message.requestId || "").slice(0, 120),
      action: String(message.action || "unknown").slice(0, 120),
      timestamp: Number(message.timestamp || 0),
    };
  } catch {
    return { requestId: "", action: "unknown", timestamp: 0 };
  }
};

const normalizedConnectorFailure = (error) => {
  const code = String(error?.code || "");
  if (code === "INVALID_SIGNATURE") {
    return connectorError(
      "CONNECTOR_AUTH_FAILED",
      "Autentikasi konektor Google Apps Script gagal. Sinkronkan INTERNAL_SHARED_SECRET pada API dan Script Properties.",
      502,
      { details: error?.details },
    );
  }
  if (code === "CONFIG_MISSING") {
    return connectorError(
      "CONNECTOR_NOT_CONFIGURED",
      "INTERNAL_SHARED_SECRET belum dikonfigurasi pada Google Apps Script.",
      503,
      { details: error?.details },
    );
  }
  if (code === "REQUEST_EXPIRED") {
    return connectorError(
      "CONNECTOR_REQUEST_EXPIRED",
      "Request ke Google Apps Script kedaluwarsa. Diagnostik selisih waktu tersedia pada log dan referensi request.",
      502,
      { details: error?.details },
    );
  }
  return null;
};

const appsScriptUrl = () => {
  const raw = String(process.env.APPS_SCRIPT_WEB_APP_URL || "").trim();
  if (!raw) throw connectorError("CONNECTOR_NOT_CONFIGURED", "Koneksi Google Apps Script belum dikonfigurasi.", 503);
  let parsed;
  try { parsed = new URL(raw); } catch {
    throw connectorError("CONNECTOR_NOT_CONFIGURED", "URL Google Apps Script tidak valid.", 503);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "script.google.com" || !parsed.pathname.endsWith("/exec")) {
    throw connectorError("CONNECTOR_NOT_CONFIGURED", "Gunakan URL deployment Google Apps Script yang berakhir /exec.", 503);
  }
  return parsed.toString();
};

const activeClockOffsetMs = () => {
  if (!connectorClock.expiresAt || connectorClock.expiresAt <= Date.now()) {
    connectorClock.offsetMs = 0;
    connectorClock.calibratedAt = 0;
    connectorClock.expiresAt = 0;
    return 0;
  }
  return connectorClock.offsetMs;
};

const clockDetails = (details) => {
  const serverEpochMs = Number(details?.serverEpochMs);
  const requestEpochMs = Number(details?.requestEpochMs);
  const skewMs = Number(details?.skewMs);
  const toleranceMs = Number(details?.toleranceMs || REQUEST_TOLERANCE_MS);
  if (![serverEpochMs, requestEpochMs, skewMs, toleranceMs].every(Number.isFinite)) return null;
  return { serverEpochMs, requestEpochMs, skewMs, toleranceMs };
};

export const calculateConnectorClockOffset = (appliedOffsetMs, observedSkewMs) => {
  const nextOffsetMs = Number(appliedOffsetMs || 0) + Number(observedSkewMs);
  if (!Number.isFinite(nextOffsetMs) || Math.abs(nextOffsetMs) > MAX_CALIBRATED_SKEW_MS) return null;
  return nextOffsetMs;
};

const calibrateClock = (details, appliedOffsetMs) => {
  const parsed = clockDetails(details);
  if (!parsed) return null;
  const nextOffsetMs = calculateConnectorClockOffset(appliedOffsetMs, parsed.skewMs);
  if (nextOffsetMs === null) return null;
  connectorClock.offsetMs = nextOffsetMs;
  connectorClock.lastSkewMs = parsed.skewMs;
  connectorClock.calibratedAt = Date.now();
  connectorClock.expiresAt = connectorClock.calibratedAt + CALIBRATION_TTL_MS;
  return { ...parsed, offsetMs: nextOffsetMs };
};

export const connectorConfiguration = () => {
  let appsScriptUrlConfigured = false;
  try {
    appsScriptUrl();
    appsScriptUrlConfigured = true;
  } catch {
    appsScriptUrlConfigured = false;
  }
  return {
    appsScriptUrlConfigured,
    sharedSecretConfigured: String(process.env.INTERNAL_SHARED_SECRET || "").length >= 32,
  };
};

export const connectorRuntimeDiagnostics = () => ({
  clock: {
    status: connectorClock.calibratedAt ? "calibrated" : "uncalibrated",
    offsetMs: connectorClock.calibratedAt ? Math.round(connectorClock.offsetMs) : null,
    lastSkewMs: connectorClock.lastSkewMs === null ? null : Math.round(connectorClock.lastSkewMs),
    calibratedAt: connectorClock.calibratedAt ? new Date(connectorClock.calibratedAt).toISOString() : null,
    expiresAt: connectorClock.expiresAt ? new Date(connectorClock.expiresAt).toISOString() : null,
    toleranceMs: REQUEST_TOLERANCE_MS,
  },
  lastCall: {
    at: connectorClock.lastCallAt,
    durationMs: connectorClock.lastDurationMs,
    errorCode: connectorClock.lastErrorCode,
  },
});

const postEnvelope = async (url, envelope, attempt) => {
  const metadata = envelopeMetadata(envelope);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  const startedAt = Date.now();
  logEvent("debug", "connector.request.started", {
    requestId: metadata.requestId,
    action: metadata.action,
    attempt,
    timestampDeltaMs: metadata.timestamp ? metadata.timestamp - Date.now() : null,
  });
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    const durationMs = Date.now() - startedAt;
    connectorClock.lastCallAt = new Date().toISOString();
    connectorClock.lastDurationMs = durationMs;
    logEvent(body?.ok === false || !response.ok ? "warn" : "info", "connector.request.completed", {
      requestId: metadata.requestId,
      action: metadata.action,
      attempt,
      durationMs,
      httpStatus: response.status,
      upstreamOk: body?.ok,
      upstreamCode: body?.error?.code || null,
      upstreamDetails: body?.error?.code === "REQUEST_EXPIRED" ? body.error.details : undefined,
      responseDate: response.headers?.get?.("date") || null,
    });
    if (!response.ok) {
      throw connectorError("APPS_SCRIPT_UNREACHABLE", "Google Apps Script menolak atau tidak dapat menerima request.", 502, {
        details: { upstreamStatus: response.status },
      });
    }
    if (!body || typeof body !== "object" || typeof body.ok !== "boolean") {
      throw connectorError("APPS_SCRIPT_INVALID_RESPONSE", "Google Apps Script mengembalikan respons yang tidak valid.", 502);
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      throw connectorError("UPSTREAM_TIMEOUT", "Google Apps Script timeout. Jangan ulangi operasi perubahan dengan idempotency key baru.", 504, { cause: error });
    }
    if (error.code && error.status) throw error;
    throw connectorError("APPS_SCRIPT_UNREACHABLE", "Google Apps Script belum dapat dihubungi.", 502, { cause: error });
  } finally {
    clearTimeout(timer);
  }
};

export const callAppsScript = async (envelope) => {
  const url = appsScriptUrl();
  const originalMetadata = envelopeMetadata(envelope);
  const cachedOffset = activeClockOffsetMs();
  let appliedOffsetMs = cachedOffset;
  let currentEnvelope = appliedOffsetMs
    ? refreshInternalEnvelope(envelope, Date.now() + appliedOffsetMs)
    : envelope;

  try {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const body = await postEnvelope(url, currentEnvelope, attempt);
      if (body.ok === false && body.error?.code === "REQUEST_EXPIRED" && attempt === 1) {
        const calibrated = calibrateClock(body.error.details, appliedOffsetMs);
        if (calibrated) {
          logEvent("warn", "connector.clock.calibrated", {
            requestId: originalMetadata.requestId,
            action: originalMetadata.action,
            skewMs: calibrated.skewMs,
            calibratedOffsetMs: calibrated.offsetMs,
            toleranceMs: calibrated.toleranceMs,
            retrySafe: true,
          });
          appliedOffsetMs = calibrated.offsetMs;
          currentEnvelope = refreshInternalEnvelope(envelope, Date.now() + appliedOffsetMs);
          continue;
        }
      }
      if (body.ok === false) {
        const connectorFailure = normalizedConnectorFailure(body.error);
        if (connectorFailure) throw connectorFailure;
      }
      connectorClock.lastErrorCode = null;
      return body;
    }
    throw connectorError("CONNECTOR_RETRY_EXHAUSTED", "Koneksi Google Apps Script gagal setelah retry aman.", 502);
  } catch (error) {
    connectorClock.lastErrorCode = String(error.code || "APPS_SCRIPT_UNREACHABLE");
    logEvent("error", "connector.request.failed", {
      requestId: originalMetadata.requestId,
      action: originalMetadata.action,
      error: sanitizeError(error),
      diagnostics: connectorRuntimeDiagnostics(),
    });
    throw error;
  }
};
