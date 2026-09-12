import { appendAudit } from "../audit.js";
import { appError, assertVersion, nowIso, publicRow, sanitizeText, uuid } from "../core.js";
import { manualReminderInstant, normalizeEntityId, normalizeEntityType, resolveManualReminderEntity } from "./reminderEntity.js";
import { activeReminderForEntity, assertNoPendingDispatch, dispatchStatusForReminder, latestQueuedReminderForEntity, pendingQueuedReminderForEntity } from "./reminderState.js";

export const cancelScheduledManualRemindersForEntities = async (db, context, { entityType, entityIds, reason }) => {
  const type = normalizeEntityType(entityType);
  const ids = [...new Set((entityIds || []).map((value) => normalizeEntityId(value)))];
  if (!ids.length) return { cancelled: 0 };
  const placeholders = ids.map(() => "?").join(",");
  const rows = await db.all(`SELECT * FROM manual_reminders WHERE entity_type=? AND entity_id IN (${placeholders}) AND status='scheduled' ORDER BY created_at`, [type, ...ids]);
  let cancelled = 0;
  for (const current of rows) {
    const timestamp = nowIso();
    const next = { ...current, status: "cancelled", row_version: Number(current.row_version) + 1, updated_at: timestamp };
    const update = await db.execute(
      "UPDATE manual_reminders SET status='cancelled',row_version=?,updated_at=? WHERE reminder_id=? AND status='scheduled' AND row_version=?",
      [next.row_version, next.updated_at, current.reminder_id, current.row_version],
    );
    if (update.rowsAffected !== 1) throw appError("CONFLICT", "Pengingat terkait berubah di perangkat lain. Ulangi perubahan objek setelah memuat ulang data.", 409);
    await appendAudit(db, { ...context, action: "reminders.autoCancel" }, {
      entityType: "manual_reminder",
      entityId: current.reminder_id,
      previous: publicRow(current),
      next: { ...publicRow(next), reason: sanitizeText(reason || "ENTITY_LIFECYCLE_CHANGED", 80), trigger_action: context.action },
    });
    cancelled += 1;
  }
  return { cancelled };
};

export const cancelScheduledManualRemindersForEntity = (db, context, entityType, entityId, reason) => (
  cancelScheduledManualRemindersForEntities(db, context, { entityType, entityIds: [entityId], reason })
);

export const cancelScheduledManualRemindersForEnvelopeRule = async (db, context, ruleId, reason) => {
  const periods = await db.all("SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=?", [ruleId]);
  return cancelScheduledManualRemindersForEntities(db, context, { entityType: "envelope_period", entityIds: periods.map((row) => row.envelope_period_id), reason });
};

export const cancelScheduledManualRemindersForRecurringRule = async (db, context, ruleId, reason) => {
  const occurrences = await db.all("SELECT occurrence_id FROM recurring_occurrences WHERE recurring_rule_id=?", [ruleId]);
  return cancelScheduledManualRemindersForEntities(db, context, { entityType: "recurring_occurrence", entityIds: occurrences.map((row) => row.occurrence_id), reason });
};

export const getManualReminder = async (db, context) => {
  const entityType = normalizeEntityType(context.payload?.entity_type);
  const entityId = normalizeEntityId(context.payload?.entity_id);
  const entity = await resolveManualReminderEntity(db, context.actor, entityType, entityId);
  const reminder = await activeReminderForEntity(db, context.actor.user_id, entityType, entityId);
  const pendingQueued = await pendingQueuedReminderForEntity(db, context.actor.user_id, entityType, entityId);
  const latestQueued = pendingQueued || await latestQueuedReminderForEntity(db, context.actor.user_id, entityType, entityId);
  const lastDispatch = await dispatchStatusForReminder(db, latestQueued);
  return { item: publicRow(reminder), entity, lastDispatch };
};

export const upsertManualReminder = async (db, context) => {
  const p = context.payload || {};
  const entityType = normalizeEntityType(p.entity_type);
  const entityId = normalizeEntityId(p.entity_id);
  const scheduledAt = manualReminderInstant(p.scheduled_local);
  const timestamp = nowIso();
  return db.transaction(async (tx) => {
    const entity = await resolveManualReminderEntity(tx, context.actor, entityType, entityId);
    const current = await activeReminderForEntity(tx, context.actor.user_id, entityType, entityId);
    if (!current) await assertNoPendingDispatch(tx, context.actor.user_id, entityType, entityId);
    let next;
    if (current) {
      assertVersion(current, context.rowVersion ?? p.row_version);
      next = { ...current, scheduled_at: scheduledAt, row_version: Number(current.row_version) + 1, updated_at: timestamp };
      const result = await tx.execute(
        "UPDATE manual_reminders SET scheduled_at=?,row_version=?,updated_at=? WHERE reminder_id=? AND user_id=? AND status='scheduled' AND row_version=?",
        [next.scheduled_at, next.row_version, next.updated_at, current.reminder_id, context.actor.user_id, current.row_version],
      );
      if (result.rowsAffected !== 1) throw appError("CONFLICT", "Pengingat berubah di perangkat lain. Muat ulang sebelum menyimpan.", 409);
    } else {
      next = {
        reminder_id: uuid(), user_id: context.actor.user_id, entity_type: entityType, entity_id: entityId,
        scheduled_at: scheduledAt, status: "scheduled", row_version: 1, created_at: timestamp, updated_at: timestamp,
      };
      const result = await tx.execute(
        "INSERT INTO manual_reminders(reminder_id,user_id,entity_type,entity_id,scheduled_at,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,entity_type,entity_id) WHERE status='scheduled' DO NOTHING",
        [next.reminder_id, next.user_id, next.entity_type, next.entity_id, next.scheduled_at, next.status, next.row_version, next.created_at, next.updated_at],
      );
      if (result.rowsAffected !== 1) throw appError("CONFLICT", "Pengingat baru dibuat di perangkat lain. Muat ulang sebelum menyimpan.", 409);
    }
    await appendAudit(tx, context, {
      entityType: "manual_reminder",
      entityId: next.reminder_id,
      previous: current ? publicRow(current) : null,
      next: { ...publicRow(next), entity_name: entity.name },
    });
    return { item: publicRow(next), entity };
  });
};

export const cancelManualReminder = async (db, context) => {
  const p = context.payload || {};
  const reminderId = normalizeEntityId(p.reminder_id);
  return db.transaction(async (tx) => {
    const current = await tx.one("SELECT * FROM manual_reminders WHERE reminder_id=? AND user_id=? AND status='scheduled'", [reminderId, context.actor.user_id]);
    if (!current) throw appError("REMINDER_NOT_FOUND", "Pengingat aktif tidak ditemukan.", 404);
    assertVersion(current, context.rowVersion ?? p.row_version);
    const next = { ...current, status: "cancelled", row_version: Number(current.row_version) + 1, updated_at: nowIso() };
    const result = await tx.execute(
      "UPDATE manual_reminders SET status='cancelled',row_version=?,updated_at=? WHERE reminder_id=? AND user_id=? AND status='scheduled' AND row_version=?",
      [next.row_version, next.updated_at, current.reminder_id, context.actor.user_id, current.row_version],
    );
    if (result.rowsAffected !== 1) throw appError("CONFLICT", "Pengingat berubah di perangkat lain. Muat ulang sebelum membatalkan.", 409);
    await appendAudit(tx, context, { entityType: "manual_reminder", entityId: current.reminder_id, previous: publicRow(current), next: publicRow(next) });
    return { item: publicRow(next) };
  });
};

