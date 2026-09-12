import { appendAudit } from "../audit.js";
import { nowIso, publicRow } from "../core.js";
import { queueNotification } from "../notifications/delivery.js";
import { resolveManualReminderEntity } from "./reminderEntity.js";

const queueOneDueReminder = async (db, reminder) => db.transaction(async (tx) => {
  const current = await tx.one("SELECT * FROM manual_reminders WHERE reminder_id=? AND status='scheduled'", [reminder.reminder_id]);
  if (!current || current.scheduled_at > nowIso()) return 0;
  const actor = await tx.one("SELECT user_id,email,name,role,status FROM users WHERE user_id=?", [current.user_id]);
  if (!actor || actor.status !== "active") {
    const inactiveActor = actor || { user_id: current.user_id, email: "", name: "", role: "member", status: "inactive" };
    await tx.execute("UPDATE manual_reminders SET status='cancelled',row_version=row_version+1,updated_at=? WHERE reminder_id=? AND status='scheduled'", [nowIso(), current.reminder_id]);
    await appendAudit(tx, { actor: inactiveActor, action: "reminders.autoCancel", requestId: `job:${current.reminder_id}` }, {
      entityType: "manual_reminder",
      entityId: current.reminder_id,
      previous: publicRow(current),
      next: { status: "cancelled", reason: "USER_INACTIVE" },
    });
    return 0;
  }
  let entity;
  try {
    entity = await resolveManualReminderEntity(tx, actor, current.entity_type, current.entity_id);
  } catch (error) {
    if (!["REMINDER_ENTITY_NOT_FOUND", "REMINDER_ENTITY_INACTIVE", "FORBIDDEN_REMINDER_ENTITY"].includes(error?.code)) throw error;
    await tx.execute("UPDATE manual_reminders SET status='cancelled',row_version=row_version+1,updated_at=? WHERE reminder_id=? AND status='scheduled'", [nowIso(), current.reminder_id]);
    await appendAudit(tx, { actor, action: "reminders.autoCancel", requestId: `job:${current.reminder_id}` }, {
      entityType: "manual_reminder",
      entityId: current.reminder_id,
      previous: publicRow(current),
      next: { status: "cancelled", reason: error.code },
    });
    return 0;
  }
  const claim = await tx.execute("UPDATE manual_reminders SET status='queued',row_version=row_version+1,updated_at=? WHERE reminder_id=? AND status='scheduled'", [nowIso(), current.reminder_id]);
  if (claim.rowsAffected !== 1) return 0;
  const queued = await queueNotification(tx, {
    userId: current.user_id,
    type: "manual_reminder",
    title: entity.title,
    body: entity.body,
    targetPath: entity.targetPath,
    scheduledAt: nowIso(),
    dedupeKey: `manual-reminder:${current.reminder_id}`,
  });
  await appendAudit(tx, { actor, action: "reminders.dispatch", requestId: `job:${current.reminder_id}` }, {
    entityType: "manual_reminder",
    entityId: current.reminder_id,
    previous: publicRow(current),
    next: { status: "queued", notification_id: queued.notificationId, notification_created: queued.created },
  });
  return queued.created ? 1 : 0;
});

export const queueDueManualReminders = async (db, limit = 100) => {
  const due = await db.all("SELECT reminder_id FROM manual_reminders WHERE status='scheduled' AND scheduled_at<=? ORDER BY scheduled_at LIMIT ?", [nowIso(), Math.min(200, Math.max(1, Number(limit || 100)))]);
  let queued = 0;
  for (const reminder of due) queued += await queueOneDueReminder(db, reminder);
  return queued;
};
