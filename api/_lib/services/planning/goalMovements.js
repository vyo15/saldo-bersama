import { appendAudit } from "../audit.js";
import { assertTransactionDateUnlocked, cancelTransactionInternal, createTransactionInternal } from "../finance.js";
import { goalProgress } from "../readModels.js";
import { appError, assertVersion, nowIso, positiveInteger, publicRow, sanitizeText, scopeFromAccountPair, todayJakarta, uuid } from "../core.js";
import { accountWithAccess, assertOwnedAccess } from "./shared.js";

// Goal movements always materialize through the canonical transaction service; this
// module only owns the planning linkage and reversible movement record.

// Pure goal progress projection is shared by goal presentation and actionable notifications.
// Keeping it here avoids importing the reminder-aware goal facade from notification delivery.
export const goalProjection = (row, currentAmount) => {
  const targetAmount = Number(row.target_amount || 0);
  const current = Number(currentAmount || 0);
  const remaining = Math.max(0, targetAmount - current);
  const progress = targetAmount > 0 ? Math.min(100, Math.round((current / targetAmount) * 100)) : 0;
  if (!row.target_date) {
    return {
      progress_percent: progress,
      remaining_amount: remaining,
      days_remaining: null,
      months_remaining: null,
      required_monthly_amount: 0,
      pace_status: row.status === "completed" ? "completed" : "no_target_date",
    };
  }
  const today = todayJakarta();
  const targetTime = new Date(`${row.target_date}T00:00:00+07:00`).getTime();
  const todayTime = new Date(`${today}T00:00:00+07:00`).getTime();
  const createdDate = String(row.created_at || today).slice(0, 10);
  const createdTime = new Date(`${createdDate}T00:00:00+07:00`).getTime();
  const daysRemaining = Math.ceil((targetTime - todayTime) / 86_400_000);
  const monthsRemaining = Math.max(0, Math.ceil(daysRemaining / 30));
  const requiredMonthly = remaining > 0 ? Math.ceil(remaining / Math.max(1, monthsRemaining)) : 0;
  const totalDuration = Math.max(1, targetTime - createdTime);
  const elapsed = Math.min(totalDuration, Math.max(0, todayTime - createdTime));
  const expectedAmount = Math.floor(targetAmount * (elapsed / totalDuration));
  const paceStatus = row.status === "completed" || remaining === 0
    ? "completed"
    : daysRemaining < 0
      ? "overdue"
      : current + Math.max(1, Math.floor(targetAmount * 0.05)) < expectedAmount
        ? "behind"
        : "on_track";
  return {
    progress_percent: progress,
    remaining_amount: remaining,
    days_remaining: daysRemaining,
    months_remaining: monthsRemaining,
    required_monthly_amount: requiredMonthly,
    pace_status: paceStatus,
  };
};
const normalizeGoalMovementType = (value) => ({ contribution: "deposit", withdraw: "withdrawal" }[value] || value);

const assertGoalMovementAccounts = (goal, type, source, destination) => {
  const owned = scopeFromAccountPair(source, destination);
  if (owned.scope !== goal.scope || String(owned.owner_user_id || "") !== String(goal.owner_user_id || "")) {
    throw appError("GOAL_SCOPE_MISMATCH", "Rekening mutasi harus satu kepemilikan dengan target.", 409);
  }
  if (type === "deposit" && destination.account_id !== goal.account_id) {
    throw appError("GOAL_ACCOUNT_MISMATCH", "Setoran target harus masuk ke rekening target.", 409);
  }
  if (type === "withdrawal" && source.account_id !== goal.account_id) {
    throw appError("GOAL_ACCOUNT_MISMATCH", "Penarikan target harus berasal dari rekening target.", 409);
  }
};

const assertGoalMovementAmount = (goal, type, amount, current) => {
  const targetAmount = Number(goal.target_amount || 0);
  const remainingAmount = Math.max(0, targetAmount - current);
  if (type === "deposit" && remainingAmount <= 0) {
    throw appError("GOAL_REACHED", "Target sudah mencapai nominal tujuan. Selesaikan target atau naikkan nominal target sebelum menambah dana.", 409, { currentAmount: current, targetAmount });
  }
  if (type === "deposit" && amount > remainingAmount) {
    throw appError("GOAL_OVERFUND", "Nominal setoran melebihi sisa target.", 409, { currentAmount: current, targetAmount, remainingAmount });
  }
  if (type === "withdrawal" && amount > current) {
    throw appError("GOAL_INSUFFICIENT", "Nominal penarikan melebihi progress target.", 409, { currentAmount: current });
  }
};

const buildGoalMovementResponse = (goal, movement, transaction, current, amount, type) => ({
  movement: publicRow(movement),
  transaction,
  goal: {
    ...publicRow(goal),
    current_amount: type === "deposit" ? current + amount : current - amount,
  },
});

export const moveGoal = async (db, context) => {
  const p = context.payload || {};
  const goal = await db.one("SELECT * FROM savings_goals WHERE goal_id=? AND status='active'", [p.goal_id]);
  if (!goal) throw appError("NOT_FOUND", "Target aktif tidak ditemukan.", 404);
  assertOwnedAccess(context.actor, goal);
  const amount = positiveInteger(p.amount, "Nominal mutasi target");
  const type = normalizeGoalMovementType(String(p.movement_type || "deposit"));
  if (!["deposit", "withdrawal"].includes(type)) throw appError("INVALID_GOAL_MOVEMENT", "Jenis mutasi target tidak valid.", 400);
  const [source, destination] = await Promise.all([
    accountWithAccess(db, context.actor, p.source_account_id),
    accountWithAccess(db, context.actor, p.destination_account_id),
  ]);
  assertGoalMovementAccounts(goal, type, source, destination);
  const current = await goalProgress(db, goal.goal_id);
  assertGoalMovementAmount(goal, type, amount, current);
  const transaction = await createTransactionInternal(db, { ...context, action: "goals.move" }, {
    transaction_type: "transfer",
    transaction_date: p.transaction_date || todayJakarta(),
    source_account_id: source.account_id,
    destination_account_id: destination.account_id,
    amount,
    description: sanitizeText(p.reason || `Mutasi target ${goal.name}`, 180),
    goal_id: goal.goal_id,
  }, { allowInternalLinks: true, audit: false });
  const movement = {
    goal_movement_id: uuid(), goal_id: goal.goal_id, transaction_id: transaction.transaction_id,
    movement_type: type, amount, reason: sanitizeText(p.reason, 180), status: "active", row_version: 1,
    created_by: context.actor.user_id, created_at: nowIso(), reversed_by: null, reversed_at: null, reversal_reason: "",
  };
  if (!movement.reason) throw appError("REASON_REQUIRED", "Alasan mutasi target wajib diisi.", 400);
  await db.execute("INSERT INTO goal_movements(goal_movement_id,goal_id,transaction_id,movement_type,amount,reason,status,row_version,created_by,created_at,reversed_by,reversed_at,reversal_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", Object.values(movement));
  const response = buildGoalMovementResponse(goal, movement, transaction, current, amount, type);
  await appendAudit(db, context, { entityType: "goal_movement", entityId: movement.goal_movement_id, next: response });
  await context.enqueueMirror?.(db, "goal", goal.goal_id);
  return response;
};

export const reverseGoalMovement = async (db, context) => {
  const p = context.payload || {};
  const movement = await db.one(`SELECT m.*,g.scope,g.owner_user_id,g.name,g.status AS goal_status FROM goal_movements m JOIN savings_goals g ON g.goal_id=m.goal_id WHERE m.goal_movement_id=? AND m.status='active'`, [p.goal_movement_id]);
  if (!movement) throw appError("NOT_FOUND", "Mutasi target aktif tidak ditemukan.", 404);
  assertOwnedAccess(context.actor, movement);
  if (movement.goal_status === "completed") throw appError("GOAL_COMPLETED_LOCKED", "Target harus dibuka kembali sebelum mutasi terakhir dibatalkan.", 409);
  if (movement.goal_status === "archived") throw appError("GOAL_ARCHIVED_LOCKED", "Target harus dipulihkan sebelum mutasi terakhir dibatalkan.", 409);
  if (context.actor.role !== "owner" && movement.created_by !== context.actor.user_id) throw appError("FORBIDDEN", "Member hanya dapat membatalkan mutasi target yang dibuat sendiri.", 403);
  assertVersion(movement, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 180);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pembatalan wajib diisi.", 400);
  const transaction = movement.transaction_id ? await db.one("SELECT * FROM transactions WHERE transaction_id=? AND status='active'", [movement.transaction_id]) : null;
  let cancelledTransaction = null;
  if (transaction) {
    await assertTransactionDateUnlocked(db, transaction.transaction_date);
    cancelledTransaction = await cancelTransactionInternal(db, context, transaction, reason, {
      allowLinked: true,
      audit: false
    });
  }
  const next = {
    ...movement,
    status: "reversed",
    row_version: Number(movement.row_version) + 1,
    reversed_by: context.actor.user_id,
    reversed_at: nowIso(),
    reversal_reason: reason
  };
  const update = await db.execute("UPDATE goal_movements SET status='reversed',row_version=?,reversed_by=?,reversed_at=?,reversal_reason=? WHERE goal_movement_id=? AND row_version=? AND status='active'", [next.row_version, next.reversed_by, next.reversed_at, next.reversal_reason, movement.goal_movement_id, movement.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Mutasi target berubah di perangkat lain.", 409);
  const goal = await db.one("SELECT * FROM savings_goals WHERE goal_id=?", [movement.goal_id]);
  const response = {
    movement: publicRow(next),
    transaction: cancelledTransaction,
    goal: {
      ...publicRow(goal),
      current_amount: await goalProgress(db, movement.goal_id)
    }
  };
  await appendAudit(db, context, {
    entityType: "goal_movement",
    entityId: movement.goal_movement_id,
    previous: publicRow(movement),
    next: response
  });
  await context.enqueueMirror?.(db, "goal", movement.goal_id);
  return response;
};
