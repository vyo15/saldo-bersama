import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { appError, assertOwner, assertVersion, publicRow, sanitizeText, todayJakarta } from "../core.js";
import { nextVersionStamp } from "../versioning.js";
import { cancelScheduledManualRemindersForEntity } from "../reminders.js";
import { assertGoalInvestmentArchiveAllowed } from "./goalInvestments.js";

// Goal deletion is reserved for truly unused records. Any movement/transaction
// history keeps the goal recoverable through archive instead of removing history.
const goalLifecycleResult = (current, dependencies, currentAmount) => {
  const normalized = {
    movements: Number(dependencies?.movements || 0),
    transactions: Number(dependencies?.transactions || 0),
    investmentEvents: Number(dependencies?.investmentEvents || dependencies?.investment_events || 0),
  };
  const deleteBlockers = [];
  if (current.status !== "active") deleteBlockers.push("Hanya target aktif yang dapat dihapus sebagai target belum dipakai.");
  if (currentAmount !== 0) deleteBlockers.push("Progress target harus Rp0.");
  if (normalized.movements) deleteBlockers.push("Target pernah memiliki mutasi, termasuk mutasi reversed.");
  if (normalized.transactions) deleteBlockers.push("Target pernah memiliki transaksi terkait, termasuk transaksi cancelled atau archived.");
  if (normalized.investmentEvents) deleteBlockers.push("Target pernah memiliki alokasi atau transaksi investasi terkait.");
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

const goalLifecycleDependencyStatement = (goalId) => ({
  sql: `SELECT
    (SELECT COUNT(*) FROM goal_movements WHERE goal_id=?) AS movements,
    (SELECT COUNT(*) FROM transactions WHERE goal_id=?) AS transactions,
    (SELECT COUNT(*) FROM goal_investment_events WHERE goal_id=?) AS investment_events`,
  args: [goalId, goalId, goalId],
});

const goalProgressStatement = (goalId, cutoffDate = todayJakarta()) => ({
  sql: `WITH cash_progress AS (
      SELECT COALESCE(SUM(CASE WHEN m.movement_type='deposit' THEN m.amount WHEN m.movement_type='withdrawal' THEN -m.amount ELSE m.amount END),0) AS cash_amount
      FROM goal_movements m LEFT JOIN transactions t ON t.transaction_id=m.transaction_id
      WHERE m.goal_id=? AND m.status='active' AND COALESCE(t.transaction_date,substr(m.created_at,1,10))<=?
    ), price_events AS (
      SELECT portfolio_id,instrument_id,valuation_date AS price_date,created_at,price_per_share,3 AS priority,rowid AS source_order FROM investment_valuations WHERE valuation_date<=?
      UNION ALL
      SELECT portfolio_id,instrument_id,trade_date,created_at,price_per_share,2,rowid FROM investment_trades WHERE trade_date<=?
      UNION ALL
      SELECT portfolio_id,instrument_id,correction_date,created_at,reference_price,1,rowid FROM investment_corrections WHERE correction_type='opening_position' AND reference_price>0 AND correction_date<=?
    ), latest_prices AS (
      SELECT portfolio_id,instrument_id,price_per_share FROM (
        SELECT price_events.*,ROW_NUMBER() OVER (PARTITION BY portfolio_id,instrument_id ORDER BY price_date DESC,created_at DESC,priority DESC,source_order DESC) AS rn
        FROM price_events
      ) WHERE rn=1
    ), allocated AS (
      SELECT portfolio_id,instrument_id,COALESCE(SUM(share_delta),0) AS shares,COALESCE(SUM(cash_delta),0) AS retained_cash
      FROM goal_investment_events
      WHERE goal_id=? AND status='active' AND event_date<=?
      GROUP BY portfolio_id,instrument_id
    )
    SELECT COALESCE((SELECT cash_amount FROM cash_progress),0)+COALESCE((
      SELECT SUM(COALESCE(a.retained_cash,0)+CASE WHEN a.instrument_id IS NOT NULL AND a.shares>0 THEN a.shares*COALESCE(lp.price_per_share,0) ELSE 0 END)
      FROM allocated a LEFT JOIN latest_prices lp ON lp.portfolio_id=a.portfolio_id AND lp.instrument_id=a.instrument_id
    ),0) AS current_amount`,
  args: [goalId, cutoffDate, cutoffDate, cutoffDate, cutoffDate, goalId, cutoffDate],
});

const firstRow = (rows) => rows?.[0] || null;

export const goalLifecycleImpact = async (db, current) => {
  const [dependencyRows, progressRows] = await readBatchRows(db, [
    goalLifecycleDependencyStatement(current.goal_id),
    goalProgressStatement(current.goal_id),
  ]);
  return goalLifecycleResult(current, firstRow(dependencyRows) || {}, Number(firstRow(progressRows)?.current_amount || 0));
};

const GOAL_EDIT_FIELDS = Object.freeze(["name", "goal_type", "target_amount", "target_date", "account_id", "priority", "funding_mode"]);

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
  const [goalRows, dependencyRows, progressRows] = await readBatchRows(db, [
    { sql: "SELECT * FROM savings_goals WHERE goal_id=? AND status<>'archived'", args: [goalId] },
    goalLifecycleDependencyStatement(goalId),
    goalProgressStatement(goalId),
  ]);
  const current = firstRow(goalRows);
  if (!current) throw appError("NOT_FOUND", "Target aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  return goalLifecycleResult(current, firstRow(dependencyRows) || {}, Number(firstRow(progressRows)?.current_amount || 0));
};

export const archiveGoal = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM savings_goals WHERE goal_id=? AND status<>'archived'", [p.goal_id]);
  if (!current) throw appError("NOT_FOUND", "Target aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan arsip target wajib diisi.", 400);
  await assertGoalInvestmentArchiveAllowed(db, current.goal_id);
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
  // Market value can move above or below the target; restoring never auto-completes it.
  // Completion remains an explicit user decision.
  const nextStatus = "active";
  const next = { ...current, status: nextStatus, ...nextVersionStamp(current, context.actor.user_id) };
  const update = await db.execute("UPDATE savings_goals SET status=?,row_version=?,updated_by=?,updated_at=? WHERE goal_id=? AND row_version=? AND status='archived'", [next.status, next.row_version, next.updated_by, next.updated_at, current.goal_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Target berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "goal", entityId: current.goal_id, previous: publicRow(current), next: { ...publicRow(next), restore_reason: reason } });
  await context.enqueueMirror?.(db, "goal", current.goal_id);
  return publicRow(next);
};
