import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { goalProgress } from "../readModels.js";
import { appError, assertOwner, assertVersion, publicRow, sanitizeText, todayJakarta } from "../core.js";
import { nextVersionStamp } from "../versioning.js";
import { cancelScheduledManualRemindersForEntity } from "../reminders.js";

// Goal deletion is reserved for truly unused records. Any movement/transaction
// history keeps the goal recoverable through archive instead of removing history.
const goalLifecycleResult = (current, dependencies, currentAmount) => {
  const normalized = {
    movements: Number(dependencies?.movements || 0),
    transactions: Number(dependencies?.transactions || 0),
  };
  const deleteBlockers = [];
  if (current.status !== "active") deleteBlockers.push("Hanya target aktif yang dapat dihapus sebagai target belum dipakai.");
  if (currentAmount !== 0) deleteBlockers.push("Progress target harus Rp0.");
  if (normalized.movements) deleteBlockers.push("Target pernah memiliki mutasi, termasuk mutasi reversed.");
  if (normalized.transactions) deleteBlockers.push("Target pernah memiliki transaksi terkait, termasuk transaksi cancelled atau archived.");
  return {
    goal: publicRow(current),
    currentAmount,
    dependencies: normalized,
    canArchive: current.status !== "archived",
    canDeleteUnused: deleteBlockers.length === 0,
    archiveBlockers: [],
    deleteBlockers,
  };
};

export const goalLifecycleImpact = async (db, current) => goalLifecycleResult(
  current,
  await db.one(`SELECT
    (SELECT COUNT(*) FROM goal_movements WHERE goal_id=?) AS movements,
    (SELECT COUNT(*) FROM transactions WHERE goal_id=?) AS transactions`, [current.goal_id, current.goal_id]),
  await goalProgress(db, current.goal_id),
);

const goalLifecyclePreviewStatements = (goalId, cutoffDate = todayJakarta()) => [{
  sql: "SELECT * FROM savings_goals WHERE goal_id=? AND status<>'archived'",
  args: [goalId],
}, {
  sql: `SELECT
    (SELECT COUNT(*) FROM goal_movements WHERE goal_id=?) AS movements,
    (SELECT COUNT(*) FROM transactions WHERE goal_id=?) AS transactions`,
  args: [goalId, goalId],
}, {
  sql: `SELECT COALESCE(SUM(CASE WHEN m.movement_type='deposit' THEN m.amount WHEN m.movement_type='withdrawal' THEN -m.amount ELSE m.amount END),0) AS total
    FROM goal_movements m LEFT JOIN transactions t ON t.transaction_id=m.transaction_id
    WHERE m.goal_id=? AND m.status='active' AND COALESCE(t.transaction_date,substr(m.created_at,1,10)) <= ?`,
  args: [goalId, cutoffDate],
}];

const GOAL_EDIT_FIELDS = Object.freeze(["name", "goal_type", "target_amount", "target_date", "account_id", "priority"]);

export const assertGoalLifecycleUpdateShape = (current, payload) => {
  if (current.status === "archived") {
    throw appError("GOAL_ARCHIVED_LOCKED", "Target arsip hanya dapat dipulihkan melalui aksi pemulihan.", 409);
  }
  if (payload.status === undefined) {
    if (current.status === "completed") {
      throw appError("GOAL_COMPLETED_LOCKED", "Target selesai harus dibuka kembali sebelum diedit.", 409);
    }
    return;
  }
  const nextStatus = String(payload.status);
  const hasEditFields = GOAL_EDIT_FIELDS.some((key) => payload[key] !== undefined);
  if (hasEditFields && nextStatus !== current.status) {
    throw appError("GOAL_LIFECYCLE_MIXED", "Perubahan status target harus dilakukan terpisah dari perubahan data target.", 400);
  }
  if (current.status === "completed" && nextStatus === "completed" && hasEditFields) {
    throw appError("GOAL_COMPLETED_LOCKED", "Target selesai harus dibuka kembali sebelum diedit.", 409);
  }
};

export const previewGoalLifecycle = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const goalId = p.goal_id;
  const [currentRows, dependencyRows, progressRows] = await readBatchRows(db, goalLifecyclePreviewStatements(goalId));
  const current = currentRows[0] || null;
  if (!current) throw appError("NOT_FOUND", "Target aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  return goalLifecycleResult(current, dependencyRows[0] || {}, Number(progressRows[0]?.total || 0));
};

export const archiveGoal = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM savings_goals WHERE goal_id=? AND status<>'archived'", [p.goal_id]);
  if (!current) throw appError("NOT_FOUND", "Target aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan arsip target wajib diisi.", 400);
  const next = { ...current, status: "archived", ...nextVersionStamp(current, context.actor.user_id) };
  const update = await db.execute("UPDATE savings_goals SET status='archived',row_version=?,updated_by=?,updated_at=? WHERE goal_id=? AND row_version=? AND status<>'archived'", [next.row_version, next.updated_by, next.updated_at, current.goal_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Target berubah di perangkat lain.", 409);
  await cancelScheduledManualRemindersForEntity(db, context, "goal", current.goal_id, "ENTITY_ARCHIVED");
  await appendAudit(db, context, { entityType: "goal", entityId: current.goal_id, previous: publicRow(current), next: { ...publicRow(next), archive_reason: reason } });
  await context.enqueueMirror?.(db, "goal", current.goal_id);
  return publicRow(next);
};
export const restoreGoal = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM savings_goals WHERE goal_id=? AND status='archived'", [p.goal_id]);
  if (!current) throw appError("NOT_FOUND", "Target arsip tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pemulihan target wajib diisi.", 400);
  const account = await db.one("SELECT status FROM accounts WHERE account_id=?", [current.account_id]);
  if (!account || account.status !== "active") throw appError("ACCOUNT_INACTIVE", "Rekening target harus aktif sebelum target dipulihkan.", 409);
  const currentAmount = await goalProgress(db, current.goal_id);
  const nextStatus = currentAmount >= Number(current.target_amount) ? "completed" : "active";
  const next = { ...current, status: nextStatus, ...nextVersionStamp(current, context.actor.user_id) };
  const update = await db.execute("UPDATE savings_goals SET status=?,row_version=?,updated_by=?,updated_at=? WHERE goal_id=? AND row_version=? AND status='archived'", [next.status, next.row_version, next.updated_by, next.updated_at, current.goal_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Target berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "goal", entityId: current.goal_id, previous: publicRow(current), next: { ...publicRow(next), restore_reason: reason } });
  await context.enqueueMirror?.(db, "goal", current.goal_id);
  return publicRow(next);
};
