import { appError, sanitizeText } from "../core.js";
import { notificationRupiah } from "../notifications/actionable.js";

export const MANUAL_REMINDER_ENTITY_TYPES = Object.freeze([
  "recurring_occurrence",
  "budget",
  "envelope_period",
  "goal",
]);

const ENTITY_TYPE_SET = new Set(MANUAL_REMINDER_ENTITY_TYPES);
const JAKARTA_TIMEZONE = "Asia/Jakarta";
const MAX_REMINDER_HORIZON_MS = 366 * 24 * 60 * 60_000;


const jakartaDateLabel = (value) => {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return "tanggal yang dipilih";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: JAKARTA_TIMEZONE }).format(date);
};

export const normalizeEntityType = (value) => {
  const entityType = sanitizeText(value, 40);
  if (!ENTITY_TYPE_SET.has(entityType)) throw appError("INVALID_REMINDER_ENTITY", "Jenis objek pengingat tidak didukung.", 400);
  return entityType;
};

export const normalizeEntityId = (value) => {
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
  if (row.assignee_user_id && row.assignee_user_id !== actor.user_id) throw appError("FORBIDDEN_REMINDER_ENTITY", "Alokasi Dana ini digunakan oleh pengguna lain.", 403);
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
    targetPath: "/perencanaan/jadwal",
    title: `Pengingat ${sanitizeText(row.name, 72) || "jadwal rutin"}`,
    body: income
      ? `${notificationRupiah(remaining)} dijadwalkan masuk ${dateLabel} ke ${sanitizeText(row.account_name, 60)}.`
      : `${notificationRupiah(remaining)} dijadwalkan dibayar ${dateLabel} dari ${sanitizeText(row.account_name, 60)}.`,
  };
};

const resolveBudget = async (db, actor, entityId) => {
  const row = await db.one(`SELECT b.*,er.assignee_user_id,
    COALESCE((SELECT SUM(t.amount) FROM transactions t
      WHERE t.status='active' AND t.transaction_type='expense' AND t.category_id=b.category_id
        AND substr(t.transaction_date,1,7)=b.period_key
        AND ((b.scope='shared' AND t.scope='shared') OR (b.scope='personal' AND t.scope='personal' AND t.owner_user_id=b.owner_user_id))),0) AS used_amount
    FROM budgets b
    LEFT JOIN envelope_rules er ON er.envelope_rule_id=b.envelope_rule_id
    WHERE b.budget_id=?`, [entityId]);
  if (!row) throw appError("REMINDER_ENTITY_NOT_FOUND", "Kebutuhan tidak ditemukan.", 404);
  assertScopedAccess(actor, row);
  if (row.status !== "active") throw appError("REMINDER_ENTITY_INACTIVE", "Kebutuhan ini sudah tidak aktif.", 409);
  const used = Number(row.used_amount || 0);
  const amount = Number(row.amount || 0);
  const remaining = Math.max(0, amount - used);
  return {
    entityType: "budget",
    entityId: row.budget_id,
    name: sanitizeText(row.name, 100) || "Kebutuhan",
    targetPath: "/perencanaan/kantong",
    title: `Cek kebutuhan ${sanitizeText(row.name, 65) || "bulan ini"}`,
    body: `Terpakai ${notificationRupiah(used)} dari ${notificationRupiah(amount)}. Sisa ${notificationRupiah(remaining)}.`,
  };
};

const resolveEnvelopePeriod = async (db, actor, entityId) => {
  const row = await db.one(`SELECT p.envelope_period_id,p.name,p.allocated_amount,p.reserved_amount,p.status,
      r.scope,r.owner_user_id,r.assignee_user_id,r.status AS rule_status,
      COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.status='active' AND t.transaction_type='expense' AND t.envelope_period_id=p.envelope_period_id),0) AS used_amount
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    WHERE p.envelope_period_id=?`, [entityId]);
  if (!row) throw appError("REMINDER_ENTITY_NOT_FOUND", "Alokasi Dana tidak ditemukan.", 404);
  assertScopedAccess(actor, row);
  if (row.status !== "active" || row.rule_status !== "active") throw appError("REMINDER_ENTITY_INACTIVE", "Alokasi Dana ini sudah tidak aktif.", 409);
  const allocated = Number(row.allocated_amount || 0);
  const committed = Number(row.used_amount || 0) + Number(row.reserved_amount || 0);
  const remaining = Math.max(0, allocated - committed);
  return {
    entityType: "envelope_period",
    entityId: row.envelope_period_id,
    name: sanitizeText(row.name, 100) || "Alokasi Dana",
    targetPath: "/perencanaan/kantong",
    title: `Cek Alokasi Dana ${sanitizeText(row.name, 67) || "aktif"}`,
    body: `Terpakai + dipesan ${notificationRupiah(committed)} dari ${notificationRupiah(allocated)}. Sisa ${notificationRupiah(remaining)}.`,
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
    body: `Terkumpul ${notificationRupiah(current)} dari ${notificationRupiah(target)}. Sisa ${notificationRupiah(remaining)}.`,
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

