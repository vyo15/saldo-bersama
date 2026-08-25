import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { envelopeItemsStatement, mapEnvelopeItemRows } from "../readModels.js";
import { appError, assertOwner, assertVersion, dateValue, nowIso, positiveInteger, publicRow, sanitizeText, strictBoolean, uuid, visibleScopeSql } from "../core.js";
import { newVersionStamp } from "../versioning.js";
import { cancelScheduledManualRemindersForEnvelopeRule } from "../reminders.js";
import { accountWithAccess, assertPlanningManageScope, ruleScopeFromAccount } from "./shared.js";
import { assertAllocationAvailable, assertEnvelopeAssigneeAccess, envelopeRuleLifecycleImpact, resolveEnvelopeAssignee } from "./envelopeLifecycle.js";

const PERIOD_TYPES = new Set(["daily", "weekly", "biweekly", "monthly", "paycycle", "custom"]);
const ROLLOVER_POLICIES = new Set(["unallocated", "carry"]);
const OVERSPEND_POLICIES = new Set(["block", "confirm", "allow"]);

// Stable envelope facade. Creation/list orchestration stays here; lifecycle and
// allocation movements are isolated without changing action/public imports.
export const listEnvelopes = async (db, context) => {
  const itemStatement = envelopeItemsStatement(context.actor, { period: context.payload?.period || null, includeClosed: true });
  const access = visibleScopeSql(context.actor, "fr");
  const movementStatement = {
    sql: `SELECT m.*,fp.name AS from_name,tp.name AS to_name,fp.row_version AS from_row_version,tp.row_version AS to_row_version,
      fr.scope,fr.owner_user_id
      FROM envelope_movements m
      JOIN envelope_periods fp ON fp.envelope_period_id=m.from_envelope_period_id
      JOIN envelope_periods tp ON tp.envelope_period_id=m.to_envelope_period_id
      JOIN envelope_rules fr ON fr.envelope_rule_id=fp.envelope_rule_id
      WHERE m.status='active' AND m.movement_type='reallocation' AND ${access.sql}
      ORDER BY m.created_at DESC LIMIT 20`,
    args: access.args,
  };
  const statements = [itemStatement, movementStatement];
  const archivedIndex = context.actor.role === "owner" ? statements.push({
    sql: `SELECT r.*,COALESCE(NULLIF(TRIM(au.name),''),NULLIF(TRIM(au.email),''),'') AS assignee_name,au.role AS assignee_role
      FROM envelope_rules r LEFT JOIN users au ON au.user_id=r.assignee_user_id
      WHERE r.status='archived' ORDER BY r.updated_at DESC LIMIT 50`,
    args: [],
  }) - 1 : -1;
  const resultRows = await readBatchRows(db, statements);
  const items = mapEnvelopeItemRows(resultRows[0] || []);
  const recentMovements = resultRows[1] || [];
  const archivedRules = archivedIndex >= 0 ? resultRows[archivedIndex] || [] : [];
  return {
    items: items.map((item) => ({
      ...item,
      can_close: context.actor.role === "owner" && item.status === "active",
      can_archive_rule: context.actor.role === "owner" && item.status === "active",
    })),
    recentMovements: recentMovements.map((movement) => ({
      ...publicRow(movement),
      can_reverse: context.actor.role === "owner" || movement.created_by === context.actor.user_id,
    })),
    archivedRules: archivedRules.map((row) => publicRow(row)),
  };
};

export const createEnvelopeRule = async (db, context, payload = context.payload || {}) => {
  const name = sanitizeText(payload.name, 100);
  const periodType = String(payload.period_type || "monthly");
  const rollover = String(payload.rollover_policy || "unallocated");
  const overspend = String(payload.overspend_policy || "confirm");
  if (!name) throw appError("NAME_REQUIRED", "Nama alokasi wajib diisi.", 400);
  if (!PERIOD_TYPES.has(periodType) || !ROLLOVER_POLICIES.has(rollover) || !OVERSPEND_POLICIES.has(overspend)) throw appError("INVALID_ENVELOPE_RULE", "Aturan alokasi tidak valid.", 400);
  const sourceAccountId = sanitizeText(payload.source_account_id, 100);
  if (!sourceAccountId) throw appError("ENVELOPE_SOURCE_ACCOUNT_REQUIRED", "Rekening sumber wajib dipilih agar dana alokasi memiliki asal yang jelas.", 400);
  const account = await accountWithAccess(db, context.actor, sourceAccountId);
  const owned = ruleScopeFromAccount(account);
  assertPlanningManageScope(context.actor, owned, { allowOwnedPersonal: true });
  const legacyAssignee = owned.scope === "personal" ? owned.owner_user_id : null;
  const requestedAssignee = Object.hasOwn(payload, "assignee_user_id") ? payload.assignee_user_id : legacyAssignee;
  const assignee = await resolveEnvelopeAssignee(db, requestedAssignee);
  if (owned.scope === "personal" && assignee?.user_id !== owned.owner_user_id) {
    throw appError("ENVELOPE_ASSIGNEE_SCOPE_MISMATCH", "Alokasi Dana dari rekening personal hanya dapat digunakan oleh pemilik rekening tersebut.", 409);
  }
  const amount = positiveInteger(payload.default_amount, "Nominal alokasi");
  const timestamp = nowIso();
  const record = {
    envelope_rule_id: uuid(),
    name,
    period_type: periodType,
    scope: owned.scope,
    owner_user_id: owned.owner_user_id,
    assignee_user_id: assignee?.user_id || null,
    default_amount: amount,
    source_account_id: account?.account_id || null,
    rollover_policy: rollover,
    overspend_policy: overspend,
    status: "active",
    ...newVersionStamp(context.actor.user_id, timestamp)
  };
  assertEnvelopeAssigneeAccess(context.actor, record);
  await db.execute(`INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,assignee_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  return record;
};
export const createEnvelopePeriod = async (db, context, payload = context.payload || {}) => {
  const rule = await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='active'", [payload.envelope_rule_id]);
  if (!rule) throw appError("INVALID_ENVELOPE_RULE", "Aturan alokasi tidak ditemukan.", 404);
  assertPlanningManageScope(context.actor, rule, { allowOwnedPersonal: true });
  assertEnvelopeAssigneeAccess(context.actor, rule);
  const start = dateValue(payload.period_start, "Tanggal mulai alokasi");
  const end = dateValue(payload.period_end, "Tanggal akhir alokasi");
  if (start > end) throw appError("INVALID_PERIOD_RANGE", "Tanggal akhir harus setelah tanggal mulai.", 400);
  const amount = positiveInteger(payload.allocated_amount ?? rule.default_amount, "Nominal alokasi");
  const source = rule.source_account_id ? await accountWithAccess(db, context.actor, rule.source_account_id) : null;
  await assertAllocationAvailable(db, source, amount);
  const duplicate = await db.one("SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=? AND period_start=? AND period_end=?", [rule.envelope_rule_id, start, end]);
  if (duplicate) throw appError("DUPLICATE_ENVELOPE_PERIOD", "Periode alokasi yang sama sudah ada.", 409);
  const timestamp = nowIso();
  const record = {
    envelope_period_id: uuid(),
    envelope_rule_id: rule.envelope_rule_id,
    name: sanitizeText(payload.name || rule.name, 100),
    period_start: start,
    period_end: end,
    allocated_amount: amount,
    reserved_amount: 0,
    status: "active",
    ...newVersionStamp(context.actor.user_id, timestamp),
    closed_by: null,
    closed_at: null
  };
  await db.execute(`INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  return record;
};
export const createEnvelope = async (db, context) => {
  const rule = await createEnvelopeRule(db, context, context.payload || {});
  const period = await createEnvelopePeriod(db, context, {
    ...context.payload,
    envelope_rule_id: rule.envelope_rule_id,
    name: rule.name
  });
  const result = {
    rule: publicRow(rule),
    period: publicRow(period)
  };
  await appendAudit(db, context, {
    entityType: "envelope",
    entityId: period.envelope_period_id,
    next: result
  });
  await context.enqueueMirror?.(db, "envelope", period.envelope_period_id);
  return result;
};
export const deleteUnusedEnvelopeRule = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='active'", [payload.envelope_rule_id]);
  if (!current) throw appError("NOT_FOUND", "Aturan alokasi aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penghapusan alokasi wajib diisi.", 400);
  if (!strictBoolean(payload.acknowledged, false)) throw appError("ACKNOWLEDGEMENT_REQUIRED", "Konfirmasi pemahaman penghapusan alokasi wajib dicentang.", 400);
  const impact = await envelopeRuleLifecycleImpact(db, current);
  if (!impact.canDeleteUnused) throw appError("ENVELOPE_DELETE_BLOCKED", "Alokasi Dana tidak memenuhi syarat sebagai alokasi yang belum pernah digunakan.", 409, impact);
  const period = await db.one("SELECT * FROM envelope_periods WHERE envelope_rule_id=?", [current.envelope_rule_id]);
  if (!period || period.status !== "active") throw appError("ENVELOPE_DELETE_BLOCKED", "Periode awal alokasi tidak lagi aman untuk dihapus.", 409, impact);
  await cancelScheduledManualRemindersForEnvelopeRule(db, context, current.envelope_rule_id, "ENTITY_DELETED");
  await appendAudit(db, context, {
    entityType: "envelope_rule",
    entityId: current.envelope_rule_id,
    previous: { rule: publicRow(current), period: publicRow(period) },
    next: { deleted: true, deletion_type: "unused_envelope_only", reason, dependencies: impact.dependencies, audit_preserved: true },
  });
  const periodDelete = await db.execute("DELETE FROM envelope_periods WHERE envelope_period_id=? AND envelope_rule_id=? AND row_version=? AND status='active'", [period.envelope_period_id, current.envelope_rule_id, period.row_version]);
  if (periodDelete.rowsAffected !== 1) throw appError("CONFLICT", "Periode alokasi berubah atau baru saja digunakan di perangkat lain.", 409);
  const ruleDelete = await db.execute("DELETE FROM envelope_rules WHERE envelope_rule_id=? AND row_version=? AND status='active'", [current.envelope_rule_id, current.row_version]);
  if (ruleDelete.rowsAffected !== 1) throw appError("CONFLICT", "Aturan alokasi berubah di perangkat lain.", 409);
  await context.enqueueMirror?.(db, "envelope", current.envelope_rule_id);
  return { envelope_rule_id: current.envelope_rule_id, deleted: true, audit_preserved: true };
};

export { closeEnvelope, previewEnvelopeRuleLifecycle, archiveEnvelopeRule, restoreEnvelopeRule } from "./envelopeLifecycle.js";
export { adjustEnvelopeAllocation, moveEnvelope, reverseEnvelopeMovement } from "./envelopeMovements.js";
