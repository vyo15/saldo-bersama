import { readBatchRows } from "../db/readBatchRows.js";
import { nowIso, sanitizeText } from "./core.js";
import { integrationStatusStatement } from "./integrations.js";

export const SCHEDULER_STALE_MS = 35 * 60_000;

const schedulerCodePart = (value, fallback = "FAILED") => {
  const normalized = sanitizeText(value || fallback, 60).toUpperCase().replace(/[^A-Z0-9_:-]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || fallback;
};

export const schedulerStageFailureCode = ({ housekeeping, integration, notificationQueue, push } = {}) => {
  const directStages = [
    ["HOUSEKEEPING", housekeeping],
    ["INTEGRATIONS", integration],
    ["NOTIFICATION_QUEUE", notificationQueue],
    ["PUSH", push],
  ];
  for (const [name, stage] of directStages) {
    if (stage?.failed === true) return `${name}:${schedulerCodePart(stage.code)}`.slice(0, 80);
  }
  if (Number(integration?.failed || 0) > 0) return `INTEGRATIONS:${schedulerCodePart(integration?.errorCode)}`.slice(0, 80);
  if (Number(push?.failed || 0) > 0) return `PUSH:${schedulerCodePart(push?.errorCode)}`.slice(0, 80);
  if (Number(push?.partial || 0) > 0) return "PUSH:PARTIAL_DELIVERY";
  return "";
};

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

// Operational signals intentionally expose only status/count metadata. The public health
// endpoint can use the aggregate status without leaking financial rows, Google resource
// identifiers, notification contents, or integration payloads.
export const operationalHealthStatement = () => ({
  sql: `SELECT
      COALESCE((SELECT status FROM backup_runs ORDER BY created_at DESC LIMIT 1),'') AS latest_backup_status,
      COALESCE((SELECT status FROM integrity_runs ORDER BY created_at DESC LIMIT 1),'') AS latest_integrity_status,
      (SELECT COUNT(*)
        FROM notification_queue q
        WHERE q.status='dead_letter'
          AND EXISTS (
            SELECT 1 FROM push_subscriptions ps
            WHERE ps.user_id=q.user_id AND ps.status='active'
          )
          AND NOT EXISTS (
            SELECT 1 FROM notification_queue recovered
            WHERE recovered.user_id=q.user_id
              AND recovered.notification_type=q.notification_type
              AND recovered.status='sent'
              AND COALESCE(recovered.last_attempt_at,recovered.created_at)>COALESCE(q.last_attempt_at,q.created_at)
          )) AS notification_dead_letter_count,
      (SELECT COUNT(*)
        FROM notification_deliveries d
        JOIN push_subscriptions ps ON ps.subscription_id=d.subscription_id
        WHERE d.status='dead_letter'
          AND ps.status='active'
          AND NOT EXISTS (
            SELECT 1 FROM notification_deliveries recovered
            WHERE recovered.subscription_id=d.subscription_id
              AND recovered.status='sent'
              AND COALESCE(recovered.last_attempt_at,recovered.updated_at,recovered.created_at)>COALESCE(d.last_attempt_at,d.updated_at,d.created_at)
          )) AS notification_delivery_dead_letter_count`,
  args: [],
});

const unresolvedIntegrationDeadLetters = (rows = []) => rows.reduce(
  (total, row) => total + (row?.status === "dead_letter" ? Math.max(0, Number(row.count || 0)) : 0),
  0,
);

export const presentOperationalHealth = (row = {}, integrationRows = []) => {
  const integrationDeadLetters = unresolvedIntegrationDeadLetters(integrationRows);
  const notificationDeadLetters = Math.max(0, Number(row.notification_dead_letter_count || 0));
  const notificationDeliveryDeadLetters = Math.max(0, Number(row.notification_delivery_dead_letter_count || 0));
  const backupStatus = String(row.latest_backup_status || "") || "unknown";
  const integrityStatus = String(row.latest_integrity_status || "") || "unknown";
  const codes = [];
  if (integrationDeadLetters > 0) codes.push("INTEGRATION_DEAD_LETTER");
  if (notificationDeadLetters > 0) codes.push("NOTIFICATION_DEAD_LETTER");
  if (notificationDeliveryDeadLetters > 0) codes.push("NOTIFICATION_DELIVERY_DEAD_LETTER");
  if (backupStatus === "failed") codes.push("BACKUP_FAILED");
  if (integrityStatus === "failed") codes.push("INTEGRITY_FAILED");
  return {
    status: codes.length ? "degraded" : "ok",
    codes,
    integrationDeadLetters,
    notificationDeadLetters,
    notificationDeliveryDeadLetters,
    backupStatus,
    integrityStatus,
  };
};

const CORE_BLOCKING_OPERATION_CODES = Object.freeze(["INTEGRITY_FAILED"]);

export const operationalCoreBlockers = (operations = {}) => {
  const codes = Array.isArray(operations?.codes) ? operations.codes : [];
  return codes.filter((code) => CORE_BLOCKING_OPERATION_CODES.includes(String(code)));
};

export const operationalWarningCodes = (operations = {}) => {
  const blockers = new Set(operationalCoreBlockers(operations));
  const codes = Array.isArray(operations?.codes) ? operations.codes : [];
  return codes.filter((code) => !blockers.has(code));
};

export const readOperationalHealth = async (db) => {
  const [integrationRows, operationRows] = await readBatchRows(db, [integrationStatusStatement(), operationalHealthStatement()]);
  return presentOperationalHealth(operationRows?.[0] || {}, integrationRows || []);
};
