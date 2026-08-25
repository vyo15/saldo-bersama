import { appendAudit } from "../audit.js";
import { appError, assertOwner, assertVersion, dateValue, nowIso, periodKey, positiveInteger, publicRow, sanitizeText, strictBoolean, todayJakarta, uuid, visibleScopeSql } from "../core.js";
import { newVersionStamp, nextVersionStamp } from "../versioning.js";
import { cancelScheduledManualRemindersForRecurringRule } from "../reminders.js";
import { accountWithAccess, assertPlanningManageScope, dueDayValue, ruleScopeFromAccount } from "./shared.js";
import { archiveRecurringRule as archiveRecurringRuleInternal, previewRecurringRuleLifecycle, recurringRuleLifecycleImpact, restoreRecurringRule } from "./recurringLifecycle.js";
import {
  RECURRING_FREQUENCIES,
  ensureRuleOccurrences,
  enqueueRecurringRuleSync,
  recurringScheduleChanged,
} from "./recurringSchedule.js";

const FREQUENCIES = RECURRING_FREQUENCIES;

// Hard DELETE of recurring projections stays in this explicitly allowlisted facade.
// Only reproducible future projections are eligible; historical/materialized rows remain audit history.
const removeUnpaidFutureOccurrences = async (db, ruleId, cutoff = todayJakarta()) => {
  const result = await db.execute(`DELETE FROM recurring_occurrences
    WHERE recurring_rule_id=?
      AND due_date>=?
      AND actual_amount=0
      AND transaction_ids_json='[]'
      AND status='expected'
      AND NOT EXISTS (
        SELECT 1 FROM transactions t
        WHERE t.recurring_occurrence_id=recurring_occurrences.occurrence_id
      )`, [ruleId, cutoff]);
  return Number(result.rowsAffected || 0);
};

// Stable recurring-rule facade. Schedule projection, lifecycle, and occurrence
// mutations are split by responsibility while action exports remain compatible.
const recurringPayloadValue = (payload, current, key) => payload[key] === undefined ? current[key] : payload[key];

const validateRecurringIdentity = (category, kind, frequency) => {
  if (!category || category.transaction_type !== kind || !FREQUENCIES.has(frequency)) {
    throw appError("INVALID_RECURRING_RULE", "Aturan rutin tidak valid.", 400);
  }
};

const buildUpdatedRecurringRule = (current, payload, account, owned, category, actorId) => {
  const kind = String(recurringPayloadValue(payload, current, "kind"));
  const frequency = String(recurringPayloadValue(payload, current, "frequency"));
  validateRecurringIdentity(category, kind, frequency);
  const endDateValue = recurringPayloadValue(payload, current, "end_date");
  const endDate = payload.end_date === undefined ? current.end_date : (endDateValue ? dateValue(endDateValue) : null);
  const autoDebit = payload.auto_debit === undefined ? current.auto_debit : (strictBoolean(payload.auto_debit) ? 1 : 0);
  return {
    ...current,
    name: sanitizeText(recurringPayloadValue(payload, current, "name"), 100),
    kind,
    category_id: category.category_id,
    expected_amount: payload.expected_amount === undefined ? current.expected_amount : positiveInteger(payload.expected_amount, "Nominal rutin"),
    frequency,
    due_day: payload.due_day === undefined ? current.due_day : dueDayValue(payload.due_day),
    default_account_id: account.account_id,
    payment_method: sanitizeText(recurringPayloadValue(payload, current, "payment_method"), 40),
    auto_debit: autoDebit,
    start_date: payload.start_date === undefined ? current.start_date : dateValue(payload.start_date),
    end_date: endDate,
    priority: payload.priority === undefined ? current.priority : String(payload.priority || "normal"),
    status: current.status,
    scope: owned.scope,
    owner_user_id: owned.owner_user_id,
    ...nextVersionStamp(current, actorId),
  };
};

const assertRecurringUpdateShape = (next) => {
  const invalidPriority = !["low", "normal", "high"].includes(next.priority);
  const invalidRange = Boolean(next.end_date && next.end_date < next.start_date);
  if (!next.name || invalidPriority || invalidRange) throw appError("INVALID_RECURRING_RULE", "Aturan rutin tidak valid.", 400);
};

const financialIdentityChanged = (current, next) => ["kind", "category_id", "default_account_id", "scope", "owner_user_id"]
  .some((field) => String(next[field] || "") !== String(current[field] || ""));

const assertRecurringIdentityChangeAllowed = async (db, current, next) => {
  const linked = await db.one("SELECT COUNT(*) AS count FROM transactions WHERE recurring_occurrence_id IN (SELECT occurrence_id FROM recurring_occurrences WHERE recurring_rule_id=?)", [current.recurring_rule_id]);
  if (Number(linked?.count || 0) && financialIdentityChanged(current, next)) {
    throw appError("RECURRING_FINANCIAL_IDENTITY_LOCKED", "Rekening, kategori, jenis, dan kepemilikan tidak dapat diubah setelah memiliki transaksi terkait.", 409);
  }
};

export const createRecurringRule = async (db, context) => {
  const p = context.payload || {};
  const name = sanitizeText(p.name, 100);
  const kind = String(p.kind || "expense");
  const frequency = String(p.frequency || "monthly");
  if (!name || !["expense", "income"].includes(kind) || !FREQUENCIES.has(frequency)) throw appError("INVALID_RECURRING_RULE", "Aturan rutin tidak valid.", 400);
  const category = await db.one("SELECT * FROM categories WHERE category_id=? AND status='active'", [p.category_id]);
  if (!category || category.transaction_type !== kind) throw appError("INVALID_CATEGORY", "Kategori jadwal tidak valid.", 400);
  const account = await accountWithAccess(db, context.actor, p.default_account_id);
  const owned = ruleScopeFromAccount(account);
  assertPlanningManageScope(context.actor, owned, { allowOwnedPersonal: true });
  const start = dateValue(p.start_date || todayJakarta(), "Tanggal mulai");
  const end = p.end_date ? dateValue(p.end_date, "Tanggal akhir") : null;
  if (end && end < start) throw appError("INVALID_DATE_RANGE", "Tanggal akhir sebelum tanggal mulai.", 400);
  const now = nowIso();
  const rule = {
    recurring_rule_id: uuid(),
    name,
    kind,
    category_id: category.category_id,
    expected_amount: positiveInteger(p.expected_amount, "Nominal rutin"),
    frequency,
    due_day: dueDayValue(p.due_day ?? 1),
    default_account_id: account.account_id,
    payment_method: sanitizeText(p.payment_method, 40),
    auto_debit: strictBoolean(p.auto_debit, false) ? 1 : 0,
    start_date: start,
    end_date: end,
    priority: ["low", "normal", "high"].includes(String(p.priority || "normal")) ? String(p.priority || "normal") : "normal",
    status: "active",
    ...newVersionStamp(context.actor.user_id, now),
    scope: owned.scope,
    owner_user_id: owned.owner_user_id
  };
  await db.execute(`INSERT INTO recurring_rules(recurring_rule_id,name,kind,category_id,expected_amount,frequency,due_day,default_account_id,payment_method,auto_debit,start_date,end_date,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(rule));
  await ensureRuleOccurrences(db, rule);
  await appendAudit(db, context, {
    entityType: "recurring_rule",
    entityId: rule.recurring_rule_id,
    next: publicRow(rule, ["auto_debit"])
  });
  await enqueueRecurringRuleSync(db, context, rule.recurring_rule_id);
  return publicRow(rule, ["auto_debit"]);
};
export const updateRecurringRule = async (db, context) => {
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM recurring_rules WHERE recurring_rule_id=?", [p.recurring_rule_id]);
  if (!current) throw appError("NOT_FOUND", "Aturan rutin tidak ditemukan.", 404);
  assertPlanningManageScope(context.actor, current, { allowOwnedPersonal: true });
  assertVersion(current, context.rowVersion ?? p.row_version);
  if (p.status !== undefined && String(p.status) !== "active") {
    throw appError("INVALID_STATUS", "Status aturan hanya dapat diubah melalui aksi arsip/pulihkan.", 400);
  }
  const accountId = recurringPayloadValue(p, current, "default_account_id");
  const categoryId = recurringPayloadValue(p, current, "category_id");
  const [account, category] = await Promise.all([
    accountWithAccess(db, context.actor, accountId),
    db.one("SELECT * FROM categories WHERE category_id=? AND status='active'", [categoryId]),
  ]);
  const owned = ruleScopeFromAccount(account);
  assertPlanningManageScope(context.actor, owned, { allowOwnedPersonal: true });
  const next = buildUpdatedRecurringRule(current, p, account, owned, category, context.actor.user_id);
  assertRecurringUpdateShape(next);
  await assertRecurringIdentityChangeAllowed(db, current, next);
  const result = await db.execute(`UPDATE recurring_rules SET name=?,kind=?,category_id=?,expected_amount=?,frequency=?,due_day=?,default_account_id=?,payment_method=?,auto_debit=?,start_date=?,end_date=?,priority=?,status=?,scope=?,owner_user_id=?,row_version=?,updated_by=?,updated_at=? WHERE recurring_rule_id=? AND row_version=?`, [next.name, next.kind, next.category_id, next.expected_amount, next.frequency, next.due_day, next.default_account_id, next.payment_method, next.auto_debit, next.start_date, next.end_date, next.priority, next.status, next.scope, next.owner_user_id, next.row_version, next.updated_by, next.updated_at, current.recurring_rule_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Aturan rutin berubah di perangkat lain.", 409);
  if (recurringScheduleChanged(current, next)) await removeUnpaidFutureOccurrences(db, current.recurring_rule_id);
  await ensureRuleOccurrences(db, next);
  await appendAudit(db, context, { entityType: "recurring_rule", entityId: current.recurring_rule_id, previous: publicRow(current), next: publicRow(next, ["auto_debit"]) });
  await enqueueRecurringRuleSync(db, context, current.recurring_rule_id);
  return publicRow(next, ["auto_debit"]);
};

export const recurringListStatement = (context) => {
  const period = periodKey(context.payload?.period);
  const access = visibleScopeSql(context.actor, "r");
  const reverseAccess = context.actor.role === "owner"
    ? { sql: "1=1", args: [] }
    : { sql: "t.created_by=?", args: [context.actor.user_id] };
  return {
    sql: `SELECT o.*,r.name,r.kind,r.category_id,r.expected_amount AS rule_expected_amount,r.frequency,r.due_day AS rule_due_day,r.default_account_id,r.payment_method,r.auto_debit,r.start_date,r.end_date,r.priority,r.status AS rule_status,r.row_version AS rule_row_version,r.scope,r.owner_user_id,
      (SELECT t.transaction_id FROM transactions t
        WHERE t.recurring_occurrence_id=o.occurrence_id AND t.status='active' AND ${reverseAccess.sql}
        ORDER BY t.created_at DESC,t.transaction_id DESC LIMIT 1) AS reverse_transaction_id
      FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
      WHERE o.period_key=? AND ${access.sql} ORDER BY o.due_date,r.name`,
    args: [...reverseAccess.args, period, ...access.args],
  };
};

const recurringDisplayStatus = (row, today) => {
  if (String(row.status || "") === "cancelled") return "cancelled";
  const actual = Number(row.actual_amount || 0);
  const expected = Number(row.expected_amount || 0);
  if (actual >= expected) return row.kind === "income" ? "received" : "paid";
  if (actual > 0) return "partial";
  return row.due_date < today ? "overdue" : "expected";
};

const canManageRecurringRule = (actor, row) => Boolean(
  actor?.role === "owner"
  || (row?.scope === "shared" && !row?.owner_user_id)
  || (row?.scope === "personal" && row?.owner_user_id === actor?.user_id)
);

const recurringCapabilities = (row, context, status, transactionIds) => {
  const actor = context.actor;
  const activeRule = row.rule_status === "active";
  const canManageRule = canManageRecurringRule(actor, row);
  const unpaid = Number(row.actual_amount || 0) < Number(row.expected_amount || 0);
  const canSkip = actor.role === "owner" && activeRule && status !== "cancelled"
    && Number(row.actual_amount || 0) === 0 && transactionIds.length === 0;
  return {
    can_pay: activeRule && canManageRule && status !== "cancelled" && unpaid,
    can_reverse: Boolean(row.reverse_transaction_id),
    can_cancel_occurrence: canSkip,
    can_restore_occurrence: actor.role === "owner" && activeRule && status === "cancelled",
    can_edit_rule: activeRule && canManageRule,
    can_archive_rule: actor.role === "owner" && activeRule,
    can_set_reminder: activeRule && canManageRule && !["paid", "received", "cancelled"].includes(status),
  };
};

export const mapRecurringRows = (rows, context) => {
  const today = todayJakarta();
  return { items: rows.map((row) => {
    const transactionIds = JSON.parse(row.transaction_ids_json || "[]");
    const status = recurringDisplayStatus(row, today);
    return {
      ...publicRow(row, ["auto_debit"]),
      status,
      transaction_ids: transactionIds.join(","),
      ...recurringCapabilities(row, context, status, transactionIds),
      transaction_type: row.kind,
    };
  }) };
};

export const listRecurring = async (db, context) => {
  const statement = recurringListStatement(context);
  return mapRecurringRows(await db.all(statement.sql, statement.args), context);
};
export { ensureRuleOccurrences } from "./recurringSchedule.js";
export const deleteUnusedRecurringRule = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM recurring_rules WHERE recurring_rule_id=? AND status='active'", [p.recurring_rule_id]);
  if (!current) throw appError("NOT_FOUND", "Aturan rutin aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penghapusan aturan rutin wajib diisi.", 400);
  if (!strictBoolean(p.acknowledged, false)) throw appError("ACKNOWLEDGEMENT_REQUIRED", "Konfirmasi bahwa aturan rutin belum pernah digunakan wajib dicentang.", 400);
  const impact = await recurringRuleLifecycleImpact(db, current);
  if (!impact.canDeleteUnused) throw appError("RECURRING_RULE_HAS_HISTORY", "Aturan rutin sudah memiliki histori dan hanya dapat diarsipkan.", 409, { lifecycle: impact });

  await cancelScheduledManualRemindersForRecurringRule(db, context, current.recurring_rule_id, "ENTITY_DELETED");
  const removedFutureOccurrences = await removeUnpaidFutureOccurrences(db, current.recurring_rule_id);
  await appendAudit(db, context, {
    entityType: "recurring_rule",
    entityId: current.recurring_rule_id,
    previous: publicRow(current, ["auto_debit"]),
    next: {
      deleted: true,
      deletion_type: "unused_recurring_rule_only",
      reason,
      dependencies: impact.dependencies,
      removed_future_projections: removedFutureOccurrences,
      audit_preserved: true
    }
  });
  const deleted = await db.execute("DELETE FROM recurring_rules WHERE recurring_rule_id=? AND row_version=? AND status='active'", [current.recurring_rule_id, current.row_version]);
  if (deleted.rowsAffected !== 1) throw appError("CONFLICT", "Aturan rutin berubah di perangkat lain.", 409);
  await enqueueRecurringRuleSync(db, context, current.recurring_rule_id);
  return { recurring_rule_id: current.recurring_rule_id, deleted: true, audit_preserved: true };
};

export const archiveRecurringRule = (db, context) => archiveRecurringRuleInternal(db, context, { removeUnpaidFutureOccurrences });
export { previewRecurringRuleLifecycle, restoreRecurringRule };
export { cancelOccurrence, payOccurrence, restoreOccurrence, reverseOccurrencePayment } from "./recurringOccurrences.js";
