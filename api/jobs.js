import { getDatabase } from "./_lib/db/httpClient.js";
import { assertDatabaseReady } from "./_lib/db/schema.js";
import { fail, methodNotAllowed, ok, readJsonBody } from "./_lib/http.js";
import { attachRequestId, logEvent, requestIdFrom, sanitizeError } from "./_lib/observability.js";
import { verifyScheduledJobSignature } from "./_lib/security.js";
import { cleanupExpiredEphemeralState, createTechnicalBackup } from "./_lib/services/maintenance/index.js";
import { queueDueManualReminders } from "./_lib/services/reminders.js";
import { nowIso, todayJakarta, uuid } from "./_lib/services/core.js";
import { recordSchedulerHeartbeat, schedulerStageFailureCode } from "./_lib/services/operationalHealth.js";
import { bumpSyncRevisions } from "./_lib/syncRevisions.js";
import { consumeScheduledNonce, processIntegrations } from "./_lib/jobs/integrationWorker.js";
import { processPush, queueDueNotifications } from "./_lib/jobs/pushWorker.js";

export { processPush } from "./_lib/jobs/pushWorker.js";

const maybeDailyBackup = async (db) => {
  const latest = await db.one("SELECT created_at FROM backup_runs WHERE backup_type='scheduled' AND status='verified' ORDER BY created_at DESC LIMIT 1");
  if (latest && Date.now() - new Date(latest.created_at).getTime() < 20 * 60 * 60_000) return { skipped: true };
  const owner = await db.one("SELECT * FROM users WHERE role='owner' AND status='active' ORDER BY created_at LIMIT 1");
  if (!owner) return { skipped: true, reason: "NO_OWNER" };
  const context = { actor: owner, action: "backup.create", payload: { type: "scheduled" }, requestId: `job-${uuid()}`, idempotencyKey: `scheduled-backup:${todayJakarta()}` };
  return createTechnicalBackup(db, context, { type: "scheduled", audit: true });
};

const runOptionalStage = async (name, requestId, task, fallback) => {
  try {
    return await task();
  } catch (error) {
    logEvent("error", "jobs.stage.failed", { requestId, stage: name, error: sanitizeError(error) });
    return { ...fallback, failed: true, code: error?.code || "STAGE_FAILED" };
  }
};

const schedulerSyncResources = ({ housekeeping, integration, notificationQueue, push, backup }) => {
  const resources = ["system.health"];
  if (Number(housekeeping.userSessions || 0) > 0) resources.push("sessions.listOwn");
  if ([integration.claimed, integration.completed, integration.failed].some((value) => Number(value || 0) > 0)) resources.push("integrations.status");
  if (Number(notificationQueue.queued || 0) > 0) resources.push("notifications.center", "reminders.get");
  if ([push.claimed, push.sent, push.failed].some((value) => Number(value || 0) > 0)) resources.push("notifications.center", "notifications.status");
  if (!backup?.skipped) resources.push("integrations.status", "audit.list");
  return [...new Set(resources)];
};

const runScheduledJobStages = async (db, message, requestId) => {
  const housekeeping = await runOptionalStage("housekeeping", requestId, () => cleanupExpiredEphemeralState(db), { idempotencyKeys: 0, importPreviews: 0, restorePreviews: 0, userSessions: 0, rateLimitBuckets: 0 });
  const integration = await runOptionalStage("integrations", requestId, () => processIntegrations(db), { claimed: 0, completed: 0, failed: 0 });
  const notificationQueue = await runOptionalStage("notification_queue", requestId, async () => {
    const automatic = await queueDueNotifications(db);
    const manual = await queueDueManualReminders(db);
    return { queued: automatic + manual, automatic, manual };
  }, { queued: 0, automatic: 0, manual: 0 });
  const push = await runOptionalStage("push", requestId, () => processPush(db), { claimed: 0, sent: 0, failed: 0, skipped: true });
  const backup = message.includeBackup === false ? { skipped: true } : await maybeDailyBackup(db);
  return { housekeeping, integration, notificationQueue, push, backup };
};

const recordScheduledJobFailure = async (db, code) => {
  if (!db) return;
  await recordSchedulerHeartbeat(db, { success: false, errorCode: code }).catch(() => undefined);
  await bumpSyncRevisions(db, ["system.health"]).catch(() => undefined);
};

export default async function handler(request, response) {
  const startedAt = Date.now();
  const requestId = requestIdFrom(request);
  attachRequestId(response, requestId);
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);

  let db = null;
  try {
    const body = await readJsonBody(request, 100_000);
    const message = verifyScheduledJobSignature(body);
    if (!message) return fail(response, 401, "INVALID_SIGNATURE", "Signature scheduler tidak valid.", { requestId });

    db = getDatabase();
    await assertDatabaseReady(db);
    await consumeScheduledNonce(db, String(message.nonce));

    const stages = await runScheduledJobStages(db, message, requestId);
    const { housekeeping, integration, notificationQueue, push, backup } = stages;
    const schedulerErrorCode = schedulerStageFailureCode({ housekeeping, integration, notificationQueue, push });
    const stageFailed = Boolean(schedulerErrorCode);
    await recordSchedulerHeartbeat(db, { success: !stageFailed, errorCode: schedulerErrorCode });
    await bumpSyncRevisions(db, schedulerSyncResources({ housekeeping, integration, notificationQueue, push, backup }));

    logEvent(stageFailed ? "warn" : "info", "jobs.request.completed", {
      requestId, status: 200, durationMs: Date.now() - startedAt, housekeeping, integration, notificationQueue, push, schedulerDegraded: stageFailed,
    });
    return ok(response, {
      housekeeping, integration, notificationsQueued: Number(notificationQueue.queued || 0), notificationQueue, push, backup, timestamp: nowIso(),
    });
  } catch (error) {
    const status = error.status || 500;
    const code = error.code || "JOBS_ERROR";
    await recordScheduledJobFailure(db, code);
    logEvent("error", "jobs.request.failed", { requestId, status, code, durationMs: Date.now() - startedAt, error: sanitizeError(error) });
    return fail(response, status, code, status < 500 ? error.message : "Scheduled job gagal.", { requestId });
  }
}
