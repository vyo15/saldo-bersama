import { nowIso, sanitizeText } from "./core.js";

export const SCHEDULER_STALE_MS = 35 * 60_000;

const upsertConfig = (db, key, value, timestamp) => db.execute(
  "INSERT INTO system_config(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
  [key, value, timestamp],
);

export const recordSchedulerHeartbeat = async (db, { success, errorCode = "" }) => {
  const timestamp = nowIso();
  const statements = [
    ["scheduler_last_run_at", timestamp],
    success ? ["scheduler_last_success_at", timestamp] : ["scheduler_last_failure_at", timestamp],
    ["scheduler_last_error_code", success ? "" : sanitizeText(errorCode || "SCHEDULER_FAILED", 80)],
  ];
  for (const [key, value] of statements) await upsertConfig(db, key, value, timestamp);
  return timestamp;
};

const timestampMs = (value) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const presentSchedulerHealth = (config = {}, { configured = Boolean(process.env.JOBS_SHARED_SECRET), now = Date.now() } = {}) => {
  if (!configured) return { configured: false, status: "disabled", stale: false, lastRunAt: "", lastSuccessAt: "", lastFailureAt: "", errorCode: "" };
  const lastSuccessMs = timestampMs(config.scheduler_last_success_at);
  const lastFailureMs = timestampMs(config.scheduler_last_failure_at);
  const stale = !lastSuccessMs || now - lastSuccessMs > SCHEDULER_STALE_MS;
  const failedSinceSuccess = lastFailureMs > lastSuccessMs;
  return {
    configured: true,
    status: stale || failedSinceSuccess ? "degraded" : "ok",
    stale,
    lastRunAt: String(config.scheduler_last_run_at || ""),
    lastSuccessAt: String(config.scheduler_last_success_at || ""),
    lastFailureAt: String(config.scheduler_last_failure_at || ""),
    errorCode: failedSinceSuccess ? String(config.scheduler_last_error_code || "SCHEDULER_FAILED") : "",
  };
};

export const readSchedulerHealth = async (db, options = {}) => {
  const configured = options.configured ?? Boolean(process.env.JOBS_SHARED_SECRET);
  if (!configured) return presentSchedulerHealth({}, { ...options, configured: false });
  const rows = await db.all(`SELECT key,value FROM system_config WHERE key IN (
    'scheduler_last_run_at','scheduler_last_success_at','scheduler_last_failure_at','scheduler_last_error_code'
  )`);
  const config = Object.fromEntries(rows.map((row) => [row.key, String(row.value || "")]));
  return presentSchedulerHealth(config, { ...options, configured: true });
};
