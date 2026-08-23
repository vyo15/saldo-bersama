import { appError, nowIso, publicRow, sanitizeText, uuid } from "../core.js";
import { safeNotificationTargetPath } from "./pushSecurity.js";

// Queue insertion is idempotent on dedupe_key. A duplicate caller receives the
// existing notification id instead of producing a second user-visible delivery.
export const queueNotification = async (db, { userId, type, title, body, targetPath = "/", scheduledAt = nowIso(), dedupeKey }) => {
  const safeDedupeKey = sanitizeText(dedupeKey, 200);
  if (!safeDedupeKey) throw appError("NOTIFICATION_DEDUPE_REQUIRED", "Dedupe key notifikasi wajib diisi.", 500);
  const id = uuid();
  const result = await db.execute(
    "INSERT OR IGNORE INTO notification_queue(notification_id,user_id,notification_type,title,body,target_path,scheduled_at,status,attempt_count,last_attempt_at,locked_by,dedupe_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, userId, sanitizeText(type, 60), sanitizeText(title, 80), sanitizeText(body, 180), safeNotificationTargetPath(targetPath), scheduledAt, "pending", 0, null, null, safeDedupeKey, nowIso()],
  );
  if (result.rowsAffected === 1) return { notificationId: id, created: true };
  const existing = await db.one("SELECT notification_id FROM notification_queue WHERE dedupe_key=?", [safeDedupeKey]);
  if (!existing) throw appError("NOTIFICATION_QUEUE_CONFLICT", "Notifikasi tidak dapat diantrikan secara idempotent.", 409);
  return { notificationId: existing.notification_id, created: false };
};

export const listSubscriptionsForUser = async (db, userId) => (await db.all(
  "SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=? AND status='active'",
  [userId],
)).map((row) => publicRow(row));
