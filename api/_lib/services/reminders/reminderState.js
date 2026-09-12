import { appError } from "../core.js";

export const activeReminderForEntity = (db, userId, entityType, entityId) => db.one(
  "SELECT * FROM manual_reminders WHERE user_id=? AND entity_type=? AND entity_id=? AND status='scheduled' ORDER BY created_at DESC LIMIT 1",
  [userId, entityType, entityId],
);

export const latestQueuedReminderForEntity = (db, userId, entityType, entityId) => db.one(
  "SELECT * FROM manual_reminders WHERE user_id=? AND entity_type=? AND entity_id=? AND status='queued' ORDER BY updated_at DESC,created_at DESC LIMIT 1",
  [userId, entityType, entityId],
);

export const pendingQueuedReminderForEntity = (db, userId, entityType, entityId) => db.one(
  `SELECT r.* FROM manual_reminders r
    LEFT JOIN notification_queue q ON q.dedupe_key=('manual-reminder:' || r.reminder_id) AND q.user_id=r.user_id AND q.notification_type='manual_reminder'
    WHERE r.user_id=? AND r.entity_type=? AND r.entity_id=? AND r.status='queued'
      AND (q.notification_id IS NULL OR q.status NOT IN ('sent','dead_letter'))
    ORDER BY r.updated_at DESC,r.created_at DESC LIMIT 1`,
  [userId, entityType, entityId],
);

export const dispatchStatusForReminder = async (db, reminder) => {
  if (!reminder || reminder.status !== "queued") return null;
  const queue = await db.one(`SELECT notification_id,status,attempt_count,last_attempt_at,scheduled_at,created_at
    FROM notification_queue WHERE dedupe_key=? AND user_id=? AND notification_type='manual_reminder' LIMIT 1`,
  [`manual-reminder:${reminder.reminder_id}`, reminder.user_id]);
  if (!queue) return { reminder_id: reminder.reminder_id, status: "missing", queued_at: reminder.updated_at, notification_id: null };
  const delivery = await db.one(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status='dead_letter' THEN 1 ELSE 0 END) AS dead_letter,
      SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END) AS expired
    FROM notification_deliveries WHERE notification_id=?`, [queue.notification_id]);
  return {
    reminder_id: reminder.reminder_id,
    notification_id: queue.notification_id,
    status: queue.status,
    attempt_count: Number(queue.attempt_count || 0),
    last_attempt_at: queue.last_attempt_at || null,
    queued_at: queue.created_at || reminder.updated_at,
    delivery: {
      total: Number(delivery?.total || 0),
      sent: Number(delivery?.sent || 0),
      failed: Number(delivery?.failed || 0),
      dead_letter: Number(delivery?.dead_letter || 0),
      expired: Number(delivery?.expired || 0),
    },
  };
};

export const assertNoPendingDispatch = async (db, userId, entityType, entityId) => {
  const pending = await pendingQueuedReminderForEntity(db, userId, entityType, entityId);
  const dispatch = await dispatchStatusForReminder(db, pending);
  if (!dispatch) return null;
  throw appError(
    "REMINDER_DELIVERY_PENDING",
    dispatch.status === "missing"
      ? "Status pengiriman pengingat sebelumnya belum dapat dipastikan. Periksa kembali sebelum membuat pengingat baru."
      : "Pengingat sebelumnya masih dalam proses pengiriman. Tunggu hasilnya sebelum membuat pengingat baru.",
    409,
    { dispatchStatus: dispatch.status },
  );
};

