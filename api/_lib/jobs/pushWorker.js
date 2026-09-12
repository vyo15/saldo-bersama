import webpush from "web-push";
import {
  configureWebPushClient, queueActionableNotifications, safeNotificationTargetPath, webPushConfigurationStatus, webPushRequestOptions,
} from "../services/notifications.js";
import { nowIso, sanitizeText, uuid } from "../services/core.js";

export const queueDueNotifications = queueActionableNotifications;

const PUSH_TIME_BUDGET_MS = 25_000;
const MAX_PUSH_ATTEMPTS = 5;

const ensureNotificationDeliveries = async (db, notification, timestamp) => {
  const subscriptions = await db.all("SELECT subscription_id FROM push_subscriptions WHERE user_id=? AND status='active'", [notification.user_id]);
  for (const subscription of subscriptions) {
    await db.execute(`INSERT OR IGNORE INTO notification_deliveries(
      delivery_id,notification_id,subscription_id,status,attempt_count,last_attempt_at,locked_by,error_code,created_at,updated_at
    ) VALUES(?,?,?,'pending',0,NULL,NULL,NULL,?,?)`, [uuid(), notification.notification_id, subscription.subscription_id, timestamp, timestamp]);
  }
  await db.execute(`UPDATE notification_deliveries SET status='expired',locked_by=NULL,error_code='SUBSCRIPTION_UNAVAILABLE',updated_at=?
    WHERE notification_id=? AND status IN ('pending','processing','failed')
      AND subscription_id IN (SELECT subscription_id FROM push_subscriptions WHERE status<>'active' OR user_id<>?)`,
  [timestamp, notification.notification_id, notification.user_id]);
};

const summarizeNotificationDelivery = async (db, notificationId) => db.one(`SELECT
  COUNT(*) AS total,
  COALESCE(SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END),0) AS sent_count,
  COALESCE(SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END),0) AS expired_count,
  COALESCE(SUM(CASE WHEN status='dead_letter' THEN 1 ELSE 0 END),0) AS dead_letter_count,
  COALESCE(SUM(CASE WHEN status IN ('pending','processing','failed') THEN 1 ELSE 0 END),0) AS retryable_count
  FROM notification_deliveries WHERE notification_id=?`, [notificationId]);

const preparePushRuntime = (pushClient, timeBudgetMs) => {
  const configuration = webPushConfigurationStatus();
  if (!configuration.configured) return { skipped: true, result: { claimed: 0, sent: 0, failed: 0, skipped: true, reason: "DISABLED" } };
  if (!configuration.ready) return { skipped: true, result: { claimed: 0, sent: 0, failed: 0, skipped: true, reason: configuration.code } };
  try {
    configureWebPushClient(pushClient);
  } catch (error) {
    return {
      skipped: true,
      result: {
        claimed: 0,
        sent: 0,
        failed: 0,
        skipped: true,
        reason: error?.details?.configurationCode || error?.code || "INVALID",
      },
    };
  }
  return { skipped: false, pushClient, timeBudgetMs, startedAt: Date.now(), workerId: `push:${uuid()}` };
};

const recoverStalePushLocks = async (db, timestamp) => {
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  await db.execute("UPDATE notification_deliveries SET status='failed',locked_by=NULL,error_code='STALE_LOCK',updated_at=? WHERE status='processing' AND last_attempt_at<?", [timestamp, staleBefore]);
  await db.execute("UPDATE notification_queue SET status='failed',locked_by=NULL WHERE status='processing' AND last_attempt_at<?", [staleBefore]);
};

const claimNotification = async (db, item, workerId) => {
  const claim = await db.execute(
    "UPDATE notification_queue SET status='processing',last_attempt_at=?,locked_by=? WHERE notification_id=? AND status IN ('pending','failed')",
    [nowIso(), workerId, item.notification_id],
  );
  return claim.rowsAffected === 1;
};

const claimNotificationDeliveries = async (db, item, workerId) => {
  const deliveryTimestamp = nowIso();
  await ensureNotificationDeliveries(db, item, deliveryTimestamp);
  const candidates = await db.all(`SELECT d.*,s.endpoint,s.p256dh,s.auth
    FROM notification_deliveries d JOIN push_subscriptions s ON s.subscription_id=d.subscription_id
    WHERE d.notification_id=? AND s.user_id=? AND s.status='active' AND d.status IN ('pending','failed')
    ORDER BY d.created_at`, [item.notification_id, item.user_id]);
  const claimed = [];
  for (const delivery of candidates) {
    const deliveryClaim = await db.execute(`UPDATE notification_deliveries
      SET status='processing',attempt_count=attempt_count+1,last_attempt_at=?,locked_by=?,error_code=NULL,updated_at=?
      WHERE delivery_id=? AND status IN ('pending','failed')`, [deliveryTimestamp, workerId, deliveryTimestamp, delivery.delivery_id]);
    if (deliveryClaim.rowsAffected === 1) claimed.push({ ...delivery, attempt_count: Number(delivery.attempt_count || 0) + 1 });
  }
  return claimed;
};

const deliverPushNotifications = async (pushClient, item, deliveries) => Promise.all(deliveries.map(async (delivery) => {
  try {
    await pushClient.sendNotification(
      { endpoint: delivery.endpoint, keys: { p256dh: delivery.p256dh, auth: delivery.auth } },
      JSON.stringify({
        notificationType: item.notification_type,
        targetPath: safeNotificationTargetPath(item.target_path),
        notificationId: item.notification_id,
      }),
      webPushRequestOptions(3_600),
    );
    return { state: "sent", delivery };
  } catch (error) {
    const statusCode = Number(error?.statusCode || 0);
    if ([404, 410].includes(statusCode)) return { state: "expired", delivery, errorCode: "SUBSCRIPTION_EXPIRED" };
    if (error?.code === "PUSH_ENDPOINT_PRIVATE_ADDRESS") return { state: "blocked", delivery, errorCode: "PUSH_ENDPOINT_PRIVATE_ADDRESS" };
    return { state: "failed", delivery, statusCode: statusCode || null, errorCode: null };
  }
}));

const persistPushOutcomes = async (db, outcomes, workerId) => {
  const summary = { deviceSent: 0, deviceFailed: 0, deviceExpired: 0 };
  for (const outcome of outcomes) {
    const updatedAt = nowIso();
    if (outcome.state === "sent") {
      summary.deviceSent += 1;
      await db.execute("UPDATE notification_deliveries SET status='sent',locked_by=NULL,error_code=NULL,updated_at=? WHERE delivery_id=? AND status='processing' AND locked_by=?", [updatedAt, outcome.delivery.delivery_id, workerId]);
      continue;
    }
    if (["expired", "blocked"].includes(outcome.state)) {
      summary.deviceExpired += 1;
      await db.execute("UPDATE push_subscriptions SET status='inactive',updated_at=? WHERE subscription_id=?", [updatedAt, outcome.delivery.subscription_id]);
      await db.execute(`UPDATE notification_deliveries SET status='expired',locked_by=NULL,error_code=?,updated_at=?
        WHERE subscription_id=? AND status IN ('pending','processing','failed')`, [outcome.errorCode, updatedAt, outcome.delivery.subscription_id]);
      continue;
    }
    summary.deviceFailed += 1;
    const terminal = Number(outcome.delivery.attempt_count || 0) >= MAX_PUSH_ATTEMPTS;
    const errorCode = sanitizeText(outcome.statusCode ? `PUSH_HTTP_${outcome.statusCode}` : outcome.errorCode || "PUSH_DELIVERY_FAILED", 80);
    await db.execute("UPDATE notification_deliveries SET status=?,locked_by=NULL,error_code=?,updated_at=? WHERE delivery_id=? AND status='processing' AND locked_by=?", [terminal ? "dead_letter" : "failed", errorCode, updatedAt, outcome.delivery.delivery_id, workerId]);
  }
  return summary;
};

const queueStatusFromDeliverySummary = (deliverySummary, attempts) => {
  const sentCount = Number(deliverySummary?.sent_count || 0);
  const retryableCount = Number(deliverySummary?.retryable_count || 0);
  const totalCount = Number(deliverySummary?.total || 0);
  if (retryableCount > 0) return "failed";
  if (sentCount > 0) return "sent";
  if (totalCount === 0 && attempts < MAX_PUSH_ATTEMPTS) return "failed";
  return "dead_letter";
};

const processClaimedNotification = async (db, item, runtime) => {
  const deliveries = await claimNotificationDeliveries(db, item, runtime.workerId);
  const outcomes = await deliverPushNotifications(runtime.pushClient, item, deliveries);
  const deviceSummary = await persistPushOutcomes(db, outcomes, runtime.workerId);
  const deliverySummary = await summarizeNotificationDelivery(db, item.notification_id);
  const attempts = Number(item.attempt_count || 0) + 1;
  const queueStatus = queueStatusFromDeliverySummary(deliverySummary, attempts);
  const sentCount = Number(deliverySummary?.sent_count || 0);
  const partial = sentCount > 0 && (Number(deliverySummary?.dead_letter_count || 0) > 0 || deviceSummary.deviceFailed > 0);
  const update = await db.execute(
    "UPDATE notification_queue SET status=?,attempt_count=?,last_attempt_at=?,locked_by=NULL WHERE notification_id=? AND status='processing' AND locked_by=?",
    [queueStatus, attempts, nowIso(), item.notification_id, runtime.workerId],
  );
  return { updated: update.rowsAffected === 1, queueStatus, partial, ...deviceSummary };
};

export const processPush = async (db, { pushClient = webpush, timeBudgetMs = PUSH_TIME_BUDGET_MS } = {}) => {
  const runtime = preparePushRuntime(pushClient, timeBudgetMs);
  if (runtime.skipped) return runtime.result;

  const timestamp = nowIso();
  await recoverStalePushLocks(db, timestamp);
  const notifications = await db.all("SELECT * FROM notification_queue WHERE status IN ('pending','failed') AND scheduled_at<=? ORDER BY scheduled_at LIMIT 25", [timestamp]);
  const summary = { claimed: 0, sent: 0, failed: 0, partial: 0, deviceSent: 0, deviceFailed: 0, deviceExpired: 0 };

  for (const item of notifications) {
    if (Date.now() - runtime.startedAt >= runtime.timeBudgetMs) break;
    if (!(await claimNotification(db, item, runtime.workerId))) continue;
    summary.claimed += 1;

    const result = await processClaimedNotification(db, item, runtime);
    summary.deviceSent += result.deviceSent;
    summary.deviceFailed += result.deviceFailed;
    summary.deviceExpired += result.deviceExpired;
    if (result.partial) summary.partial += 1;
    if (!result.updated) continue;
    if (result.queueStatus === "sent") summary.sent += 1;
    else summary.failed += 1;
  }

  return {
    ...summary,
    deferred: Math.max(0, notifications.length - summary.claimed),
    skipped: false,
  };
};

