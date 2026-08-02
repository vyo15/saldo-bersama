import { appendAudit } from "./audit.js";
import { appError, nowIso, publicRow, sanitizeText, uuid } from "./core.js";

export const registerPush = async (db, context) => {
  const p = context.payload || {};
  if (!/^https:\/\//.test(String(p.endpoint || "")) || !p.keys?.p256dh || !p.keys?.auth) throw appError("INVALID_SUBSCRIPTION", "Push subscription tidak valid.", 400);
  const existing = await db.one("SELECT * FROM push_subscriptions WHERE endpoint=?", [p.endpoint]);
  if (existing && existing.user_id !== context.actor.user_id) throw appError("PUSH_ENDPOINT_OWNERSHIP_CONFLICT", "Perangkat ini masih terhubung ke akun lain.", 409);
  const timestamp = nowIso();
  let next;
  if (existing) {
    next = { ...existing, p256dh: String(p.keys.p256dh), auth: String(p.keys.auth), user_agent: sanitizeText(p.userAgent, 250), status: "active", updated_at: timestamp };
    await db.execute("UPDATE push_subscriptions SET p256dh=?,auth=?,user_agent=?,status='active',updated_at=? WHERE subscription_id=?", [next.p256dh, next.auth, next.user_agent, next.updated_at, existing.subscription_id]);
  } else {
    next = { subscription_id: uuid(), user_id: context.actor.user_id, endpoint: String(p.endpoint), p256dh: String(p.keys.p256dh), auth: String(p.keys.auth), user_agent: sanitizeText(p.userAgent, 250), status: "active", created_at: timestamp, updated_at: timestamp };
    await db.execute("INSERT INTO push_subscriptions(subscription_id,user_id,endpoint,p256dh,auth,user_agent,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", Object.values(next));
  }
  await appendAudit(db, context, { entityType: "push_subscription", entityId: next.subscription_id, previous: existing ? { status: existing.status } : null, next: { status: next.status } });
  return { registered: true, subscriptionId: next.subscription_id };
};

export const unregisterPush = async (db, context) => {
  const endpoint = String(context.payload?.endpoint || "");
  const current = await db.one("SELECT * FROM push_subscriptions WHERE endpoint=? AND user_id=?", [endpoint, context.actor.user_id]);
  if (!current) throw appError("NOT_FOUND", "Subscription tidak ditemukan.", 404);
  await db.execute("UPDATE push_subscriptions SET status='inactive',updated_at=? WHERE subscription_id=?", [nowIso(), current.subscription_id]);
  await appendAudit(db, context, { entityType: "push_subscription", entityId: current.subscription_id, previous: { status: current.status }, next: { status: "inactive" } });
  return { unregistered: true };
};

export const queueNotification = async (db, { userId, type, title, body, targetPath = "/", scheduledAt = nowIso(), dedupeKey }) => {
  const safeDedupeKey = sanitizeText(dedupeKey, 200);
  if (!safeDedupeKey) throw appError("NOTIFICATION_DEDUPE_REQUIRED", "Dedupe key notifikasi wajib diisi.", 500);
  const id = uuid();
  const result = await db.execute("INSERT OR IGNORE INTO notification_queue(notification_id,user_id,notification_type,title,body,target_path,scheduled_at,status,attempt_count,last_attempt_at,locked_by,dedupe_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", [id, userId, sanitizeText(type, 60), sanitizeText(title, 80), sanitizeText(body, 180), String(targetPath).startsWith("/") ? targetPath : "/", scheduledAt, "pending", 0, null, null, safeDedupeKey, nowIso()]);
  if (result.rowsAffected === 1) return { notificationId: id, created: true };
  const existing = await db.one("SELECT notification_id FROM notification_queue WHERE dedupe_key=?", [safeDedupeKey]);
  if (!existing) throw appError("NOTIFICATION_QUEUE_CONFLICT", "Notifikasi tidak dapat diantrikan secara idempotent.", 409);
  return { notificationId: existing.notification_id, created: false };
};

export const listSubscriptionsForUser = async (db, userId) => (await db.all("SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=? AND status='active'", [userId])).map((row) => publicRow(row));
