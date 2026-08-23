import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { appError, assertOwner, assertVersion, publicRow, sanitizeText, todayJakarta } from "../core.js";
import { nextVersionStamp } from "../versioning.js";
import { cancelScheduledManualRemindersForRecurringRule } from "../reminders.js";
import { ensureRuleOccurrences, enqueueRecurringRuleSync } from "./recurringSchedule.js";

// Lifecycle deletion is intentionally stricter than archive: any non-reproducible
// occurrence or linked transaction turns the rule into historical data that must stay.
const recurringRuleDependencyStatement = (ruleId, cutoff = todayJakarta()) => ({
  sql: `SELECT
    COUNT(*) AS occurrences,
    SUM(CASE WHEN due_date>=?
      AND actual_amount=0
      AND transaction_ids_json='[]'
      AND status='expected'
      AND NOT EXISTS (
        SELECT 1 FROM transactions t
        WHERE t.recurring_occurrence_id=recurring_occurrences.occurrence_id
      ) THEN 1 ELSE 0 END) AS reproducible_future_occurrences,
    SUM(CASE WHEN due_date<? THEN 1 ELSE 0 END) AS past_occurrences,
    SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled_occurrences,
    SUM(CASE WHEN actual_amount<>0 OR transaction_ids_json<>'[]' THEN 1 ELSE 0 END) AS materialized_occurrences,
    (SELECT COUNT(*) FROM transactions t
      WHERE t.recurring_occurrence_id IN (
        SELECT occurrence_id FROM recurring_occurrences WHERE recurring_rule_id=?
      )) AS transactions
    FROM recurring_occurrences
    WHERE recurring_rule_id=?`,
  args: [cutoff, cutoff, ruleId, ruleId],
});

const recurringRuleLifecycleResult = (current, counts) => {
  const dependencies = {
    occurrences: Number(counts?.occurrences || 0),
    reproducible_future_occurrences: Number(counts?.reproducible_future_occurrences || 0),
    past_occurrences: Number(counts?.past_occurrences || 0),
    cancelled_occurrences: Number(counts?.cancelled_occurrences || 0),
    materialized_occurrences: Number(counts?.materialized_occurrences || 0),
    transactions: Number(counts?.transactions || 0)
  };
  const historicalOccurrenceCount = dependencies.occurrences - dependencies.reproducible_future_occurrences;
  const canDeleteUnused = current.status === "active"
    && dependencies.transactions === 0
    && historicalOccurrenceCount === 0;
  return {
    recurring_rule_id: current.recurring_rule_id,
    status: current.status,
    row_version: current.row_version,
    canDeleteUnused,
    canArchive: current.status === "active",
    dependencies,
    blockers: canDeleteUnused ? [] : [
      ...(dependencies.transactions ? ["Aturan rutin pernah memiliki transaksi terkait."] : []),
      ...(historicalOccurrenceCount ? ["Aturan rutin sudah memiliki histori occurrence yang tidak boleh dihapus."] : [])
    ]
  };
};

export const recurringRuleLifecycleImpact = async (db, current) => {
  const statement = recurringRuleDependencyStatement(current.recurring_rule_id);
  return recurringRuleLifecycleResult(current, await db.one(statement.sql, statement.args));
};

export const previewRecurringRuleLifecycle = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const ruleId = p.recurring_rule_id;
  const statement = recurringRuleDependencyStatement(ruleId);
  const [currentRows, dependencyRows] = await readBatchRows(db, [{
    sql: "SELECT * FROM recurring_rules WHERE recurring_rule_id=?",
    args: [ruleId],
  }, statement]);
  const current = currentRows[0] || null;
  if (!current) throw appError("NOT_FOUND", "Aturan rutin tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  return recurringRuleLifecycleResult(current, dependencyRows[0] || {});
};

export const archiveRecurringRule = async (db, context, { removeUnpaidFutureOccurrences } = {}) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM recurring_rules WHERE recurring_rule_id=? AND status='active'", [p.recurring_rule_id]);
  if (!current) throw appError("NOT_FOUND", "Aturan rutin aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan arsip aturan rutin wajib diisi.", 400);
  const next = { ...current, status: "archived", ...nextVersionStamp(current, context.actor.user_id) };
  const update = await db.execute("UPDATE recurring_rules SET status='archived',row_version=?,updated_by=?,updated_at=? WHERE recurring_rule_id=? AND row_version=? AND status='active'", [next.row_version, next.updated_by, next.updated_at, current.recurring_rule_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Aturan rutin berubah di perangkat lain.", 409);
  await cancelScheduledManualRemindersForRecurringRule(db, context, current.recurring_rule_id, "ENTITY_ARCHIVED");
  if (typeof removeUnpaidFutureOccurrences !== "function") throw new TypeError("removeUnpaidFutureOccurrences callback wajib tersedia.");
  const removedFutureOccurrences = await removeUnpaidFutureOccurrences(db, current.recurring_rule_id);
  await appendAudit(db, context, { entityType: "recurring_rule", entityId: current.recurring_rule_id, previous: publicRow(current, ["auto_debit"]), next: { ...publicRow(next, ["auto_debit"]), archive_reason: reason, future_projections_removed_count: removedFutureOccurrences } });
  await enqueueRecurringRuleSync(db, context, current.recurring_rule_id);
  return publicRow(next, ["auto_debit"]);
};
export const restoreRecurringRule = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM recurring_rules WHERE recurring_rule_id=? AND status='archived'", [p.recurring_rule_id]);
  if (!current) throw appError("NOT_FOUND", "Aturan rutin arsip tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pemulihan aturan rutin wajib diisi.", 400);
  const category = await db.one("SELECT status,transaction_type FROM categories WHERE category_id=?", [current.category_id]);
  if (!category || category.status !== "active" || category.transaction_type !== current.kind) throw appError("CATEGORY_INACTIVE", "Kategori aturan rutin harus aktif dan sesuai jenis sebelum dipulihkan.", 409);
  const account = await db.one("SELECT status FROM accounts WHERE account_id=?", [current.default_account_id]);
  if (!account || account.status !== "active") throw appError("ACCOUNT_INACTIVE", "Rekening default aturan rutin harus aktif sebelum dipulihkan.", 409);
  const next = { ...current, status: "active", ...nextVersionStamp(current, context.actor.user_id) };
  const update = await db.execute("UPDATE recurring_rules SET status='active',row_version=?,updated_by=?,updated_at=? WHERE recurring_rule_id=? AND row_version=? AND status='archived'", [next.row_version, next.updated_by, next.updated_at, current.recurring_rule_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Aturan rutin berubah di perangkat lain.", 409);
  await ensureRuleOccurrences(db, next);
  await appendAudit(db, context, { entityType: "recurring_rule", entityId: current.recurring_rule_id, previous: publicRow(current, ["auto_debit"]), next: { ...publicRow(next, ["auto_debit"]), restore_reason: reason } });
  await enqueueRecurringRuleSync(db, context, current.recurring_rule_id);
  return publicRow(next, ["auto_debit"]);
};
