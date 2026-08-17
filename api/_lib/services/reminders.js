import { appendAudit } from "./audit.js";
import { appError, assertVersion, nowIso, publicRow, sanitizeText, uuid } from "./core.js";
import { queueNotification } from "./notifications.js";

export const MANUAL_REMINDER_ENTITY_TYPES = Object.freeze([
  "recurring_occurrence",
  "budget",
  "envelope_period",
  "goal",
]);

const ENTITY_TYPE_SET = new Set(MANUAL_REMINDER_ENTITY_TYPES);
const JAKARTA_TIMEZONE = "Asia/Jakarta";
const MAX_REMINDER_HORIZON_MS = 366 * 24 * 60 * 60_000;

const rupiah = (value) => `Rp${Math.max(0, Math.round(Number(value || 0))).toLocaleString("id-ID")}`;

const jakartaDateLabel = (value) => {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return "tanggal yang dipilih";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: JAKARTA_TIMEZONE }).format(date);
};

const normalizeEntityType = (value) => {
  const entityType = sanitizeText(value, 40);
  if (!ENTITY_TYPE_SET.has(entityType)) throw appError("INVALID_REMINDER_ENTITY", "Jenis objek pengingat tidak didukung.", 400);
  return entityType;
};

const normalizeEntityId = (value) => {
  const entityId = sanitizeText(value, 120);
  if (!entityId) throw appError("INVALID_REMINDER_ENTITY", "Objek pengingat wajib dipilih.", 400);
  return entityId;
};

const jakartaLocalParts = (date) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: JAKARTA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

export const manualReminderInstant = (value, now = new Date()) => {
  const candidate = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(candidate)) throw appError("INVALID_REMINDER_TIME", "Tanggal dan waktu pengingat tidak valid.", 400);
  const parsed = new Date(`${candidate}:00+07:00`);
  if (Number.isNaN(parsed.getTime()) || jakartaLocalParts(parsed) !== candidate) throw appError("INVALID_REMINDER_TIME", "Tanggal dan waktu pengingat tidak valid.", 400);
  const delta = parsed.getTime() - now.getTime();
  if (delta <= 0) throw appError("REMINDER_TIME_PAST", "Waktu pengingat harus berada di masa depan.", 400);
  if (delta > MAX_REMINDER_HORIZON_MS) throw appError("REMINDER_TIME_TOO_FAR", "Pengingat dapat dijadwalkan maksimal 1 tahun ke depan.", 400);
  return parsed.toISOString();
};

const assertScopedAccess = (actor, row) => {
  if (actor.role === "owner") return;
  if (row.scope === "personal" && row.owner_user_id !== actor.user_id) throw appError("FORBIDDEN_REMINDER_ENTITY", "Objek ini bukan milik pengguna aktif.", 403);
  if (row.assignee_user_id && row.assignee_user_id !== actor.user_id) throw appError("FORBIDDEN_REMINDER_ENTITY", "Kantong ini ditugaskan kepada pengguna lain.", 403);
};

const resolveRecurringOccurrence = async (db, actor, entityId) => {
  const row = await db.one(`SELECT o.occurrence_id,o.due_date,o.expected_amount,o.actual_amount,o.status,
    r.name,r.kind,r.scope,r.owner_user_id,r.status AS rule_status,a.name AS account_name
    FROM recurring_occurrences o
    JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
    JOIN accounts a ON a.account_id=r.default_account_id
    WHERE o.occurrence_id=?`, [entityId]);
  if (!row) throw appError("REMINDER_ENTITY_NOT_FOUND", "Jadwal rutin tidak ditemukan.", 404);
  assertScopedAccess(actor, row);
  if (row.rule_status !== "active" || ["paid", "cancelled"].includes(row.status)) throw appError("REMINDER_ENTITY_INACTIVE", "Jadwal ini sudah selesai atau tidak aktif.", 409);
  const remaining = Math.max(0, Number(row.expected_amount || 0) - Number(row.actual_amount || 0));
  const dateLabel = jakartaDateLabel(row.due_date);
  const income = row.kind === "income";
  return {
    entityType: "recurring_occurrence",
    entityId: row.occurrence_id,
    name: sanitizeText(row.name, 100) || "Jadwal rutin",
    targetPath: "/tagihan",
    title: `Pengingat ${sanitizeText(row.name, 72) || "jadwal rutin"}`,
    body: income
      ? `${rupiah(remaining)} dijadwalkan masuk ${dateLabel} ke ${sanitizeText(row.account_name, 60)}.`
      : `${rupiah(remaining)} dijadwalkan dibayar ${dateLabel} dari ${sanitizeText(row.account_name, 60)}.`,
  };
};

const resolveBudget = async (db, actor, entityId) => {
  const row = await db.one(`SELECT b.*,
    COALESCE((SELECT SUM(t.amount) FROM transactions t
      WHERE t.status='active' AND t.transaction_type='expense' AND t.category_id=b.category_id
        AND substr(t.transaction_date,1,7)=b.period_key
        AND ((b.scope='shared' AND t.scope='shared') OR (b.scope='personal' AND t.scope='personal' AND t.owner_user_id=b.owner_user_id))),0) AS used_amount
    FROM budgets b WHERE b.budget_id=?`, [entityId]);
  if (!row) throw appError("REMINDER_ENTITY_NOT_FOUND", "Anggaran tidak ditemukan.", 404);
  assertScopedAccess(actor, row);
  if (row.status !== "active") throw appError("REMINDER_ENTITY_INACTIVE", "Anggaran ini sudah tidak aktif.", 409);
  const used = Number(row.used_amount || 0);
  const amount = Number(row.amount || 0);
  const remaining = Math.max(0, amount - used);
  return {
    entityType: "budget",
    entityId: row.budget_id,
    name: sanitizeText(row.name, 100) || "Anggaran",
    targetPath: "/anggaran",
    title: `Cek Anggaran ${sanitizeText(row.name, 65) || "bulan ini"}`,
    body: `Terpakai ${rupiah(used)} dari ${rupiah(amount)}. Sisa ${rupiah(remaining)}.`,
  };
};

const resolveEnvelopePeriod = async (db, actor, entityId) => {
  const row = await db.one(`SELECT p.envelope_period_id,p.name,p.allocated_amount,p.reserved_amount,p.status,
      r.scope,r.owner_user_id,r.assignee_user_id,r.status AS rule_status,
      COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.status='active' AND t.transaction_type='expense' AND t.envelope_period_id=p.envelope_period_id),0) AS used_amount
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    WHERE p.envelope_period_id=?`, [entityId]);
  if (!row) throw appError("REMINDER_ENTITY_NOT_FOUND", "Kantong alokasi tidak ditemukan.", 404);
  assertScopedAccess(actor, row);
  if (row.status !== "active" || row.rule_status !== "active") throw appError("REMINDER_ENTITY_INACTIVE", "Kantong ini sudah tidak aktif.", 409);
  const allocated = Number(row.allocated_amount || 0);
  const committed = Number(row.used_amount || 0) + Number(row.reserved_amount || 0);
  const remaining = Math.max(0, allocated - committed);
  return {
    entityType: "envelope_period",
    entityId: row.envelope_period_id,
    name: sanitizeText(row.name, 100) || "Kantong",
    targetPath: "/alokasi",
    title: `Cek Kantong ${sanitizeText(row.name, 67) || "aktif"}`,
    body: `Terpakai ${rupiah(committed)} dari ${rupiah(allocated)}. Sisa ${rupiah(remaining)}.`,
  };
};

const resolveGoal = async (db, actor, entityId) => {
  const row = await db.one(`SELECT g.*,
      COALESCE((SELECT SUM(CASE WHEN m.movement_type='deposit' THEN m.amount WHEN m.movement_type='withdrawal' THEN -m.amount ELSE m.amount END)
        FROM goal_movements m WHERE m.goal_id=g.goal_id AND m.status='active'),0) AS current_amount
    FROM savings_goals g WHERE g.goal_id=?`, [entityId]);
  if (!row) throw appError("REMINDER_ENTITY_NOT_FOUND", "Target tidak ditemukan.", 404);
  assertScopedAccess(actor, row);
  if (row.status !== "active") throw appError("REMINDER_ENTITY_INACTIVE", "Target ini sudah tidak aktif.", 409);
  const current = Number(row.current_amount || 0);
  const target = Number(row.target_amount || 0);
  const remaining = Math.max(0, target - current);
  return {
    entityType: "goal",
    entityId: row.goal_id,
    name: sanitizeText(row.name, 100) || "Target",
    targetPath: "/target",
    title: `Cek Target ${sanitizeText(row.name, 69) || "keuangan"}`,
    body: `Terkumpul ${rupiah(current)} dari ${rupiah(target)}. Sisa ${rupiah(remaining)}.`,
  };
};

export const resolveManualReminderEntity = async (db, actor, entityType, entityId) => {
  const type = normalizeEntityType(entityType);
  const id = normalizeEntityId(entityId);
  if (type === "recurring_occurrence") return resolveRecurringOccurrence(db, actor, id);
  if (type === "budget") return resolveBudget(db, actor, id);
  if (type === "envelope_period") return resolveEnvelopePeriod(db, actor, id);
  return resolveGoal(db, actor, id);
};

const activeReminderForEntity = (db, userId, entityType, entityId) => db.one(
  "SELECT * FROM manual_reminders WHERE user_id=? AND entity_type=? AND entity_id=? AND status='scheduled' ORDER BY created_at DESC LIMIT 1",
  [userId, entityType, entityId],
);

export const getManualReminder = async (db, context) => {
  const entityType = normalizeEntityType(context.payload?.entity_type);
  const entityId = normalizeEntityId(context.payload?.entity_id);
  const entity = await resolveManualReminderEntity(db, context.actor, entityType, entityId);
  const reminder = await activeReminderForEntity(db, context.actor.user_id, entityType, entityId);
  return { item: publicRow(reminder), entity };
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
