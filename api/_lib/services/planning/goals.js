import { appendAudit } from "../audit.js";
import { cancelTransactionInternal, createTransactionInternal, assertTransactionDateUnlocked } from "../finance.js";
import { goalProgress } from "../readModels.js";
import { appError, assertOwner, assertVersion, dateValue, nowIso, positiveInteger, publicRow, sanitizeText, scopeFromAccountPair, strictBoolean, todayJakarta, uuid, visibleScopeSql } from "../core.js";
import { nextVersionStamp } from "../versioning.js";
import { accountWithAccess, assertOwnedAccess, ruleScopeFromAccount } from "./shared.js";

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
const goalLifecycleImpact = async (db, current) => {
  const dependencies = await db.one(`SELECT
    (SELECT COUNT(*) FROM goal_movements WHERE goal_id=?) AS movements,
    (SELECT COUNT(*) FROM transactions WHERE goal_id=?) AS transactions`, [current.goal_id, current.goal_id]);
  const normalized = {
    movements: Number(dependencies?.movements || 0),
    transactions: Number(dependencies?.transactions || 0),
  };
  const currentAmount = await goalProgress(db, current.goal_id);
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

export const listGoals = async (db, context) => {
  const access = visibleScopeSql(context.actor, "g");
  const rows = await db.all(`SELECT g.*,a.name AS account_name,a.status AS account_status FROM savings_goals g JOIN accounts a ON a.account_id=g.account_id WHERE ${access.sql} AND g.status<>'archived' ORDER BY CASE g.priority WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC,g.status,g.target_date`, access.args);
  const items = [];
  for (const row of rows) {
    const current = await goalProgress(db, row.goal_id);
    const last = await db.one("SELECT goal_movement_id,transaction_id,row_version,created_at FROM goal_movements WHERE goal_id=? AND status='active' ORDER BY created_at DESC LIMIT 1", [row.goal_id]);
    const linked = last?.transaction_id ? await db.one("SELECT transaction_date FROM transactions WHERE transaction_id=?", [last.transaction_id]) : null;
    const locked = linked ? Boolean(await db.one("SELECT closure_id FROM period_closures WHERE status='closed' AND period_key>=substr(?,1,7) LIMIT 1", [linked.transaction_date])) : false;
    items.push({
      ...publicRow(row),
      current_amount: current,
      ...goalProjection(row, current),
      last_movement_id: last?.goal_movement_id || "",
      last_movement_row_version: last?.row_version || null,
      can_move: row.status === "active" && row.account_status === "active",
      can_reverse: Boolean(last) && !locked,
      can_update: context.actor.role === "owner",
      can_archive: context.actor.role === "owner" && row.status !== "archived"
    });
  }
  return {
    items
  };
};

const goalPayloadValue = (payload, current, key) => payload[key] === undefined ? current[key] : payload[key];

const assertGoalEnums = ({ status, goalType, priority }) => {
  if (!["active", "completed"].includes(status)) throw appError("INVALID_GOAL", "Data target tidak valid.", 400);
  if (!["savings", "emergency_fund", "sinking_fund"].includes(goalType)) throw appError("INVALID_GOAL", "Data target tidak valid.", 400);
  if (!["low", "normal", "high"].includes(priority)) throw appError("INVALID_GOAL", "Data target tidak valid.", 400);
};

const assertGoalCompletionAllowed = async (db, current, status, targetAmount) => {
  if (status !== "completed") return;
  if ((await goalProgress(db, current.goal_id)) < Number(targetAmount)) {
    throw appError("GOAL_NOT_REACHED", "Target belum mencapai nominal tujuan.", 409);
  }
};

const assertGoalAccountChangeAllowed = async (db, current, account, owned) => {
  const movements = await db.one("SELECT COUNT(*) AS count FROM goal_movements WHERE goal_id=?", [current.goal_id]);
  if (!Number(movements?.count || 0)) return;
  const sameOwner = owned.scope === current.scope && String(owned.owner_user_id || "") === String(current.owner_user_id || "");
  if (account.account_id === current.account_id && sameOwner) return;
  throw appError("GOAL_ACCOUNT_LOCKED", "Rekening dan kepemilikan target tidak dapat diubah setelah memiliki mutasi.", 409);
};

const buildUpdatedGoal = (current, payload, account, owned, actorId) => {
  const status = String(goalPayloadValue(payload, current, "status"));
  const goalType = String(goalPayloadValue(payload, current, "goal_type"));
  const priority = String(goalPayloadValue(payload, current, "priority"));
  const targetAmount = payload.target_amount === undefined ? current.target_amount : positiveInteger(payload.target_amount, "Target nominal");
  let targetDate = current.target_date;
  if (payload.target_date !== undefined) targetDate = payload.target_date ? dateValue(payload.target_date) : null;
  return {
    ...current,
    name: sanitizeText(goalPayloadValue(payload, current, "name"), 100),
    goal_type: goalType,
    target_amount: targetAmount,
    target_date: targetDate,
    account_id: account.account_id,
    priority,
    status,
    scope: owned.scope,
    owner_user_id: owned.owner_user_id,
    ...nextVersionStamp(current, actorId),
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

const assertGoalWithdrawalAmount = (type, amount, current) => {
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

export const createGoal = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const account = await accountWithAccess(db, context.actor, p.account_id);
  const owned = ruleScopeFromAccount(account);
  const now = nowIso();
  const priority = String(p.priority || "normal");
  const goalType = String(p.goal_type || "savings");
  const record = {
    goal_id: uuid(),
    name: sanitizeText(p.name, 100),
    goal_type: goalType,
    target_amount: positiveInteger(p.target_amount, "Target nominal"),
    target_date: p.target_date ? dateValue(p.target_date, "Tanggal target") : null,
    account_id: account.account_id,
    priority,
    status: "active",
    row_version: 1,
    created_by: context.actor.user_id,
    created_at: now,
    updated_by: context.actor.user_id,
    updated_at: now,
    scope: owned.scope,
    owner_user_id: owned.owner_user_id
  };
  if (!record.name || !["savings", "emergency_fund", "sinking_fund"].includes(goalType) || !["low", "normal", "high"].includes(priority)) throw appError("INVALID_GOAL", "Data target tidak valid.", 400);
  await db.execute("INSERT INTO savings_goals(goal_id,name,goal_type,target_amount,target_date,account_id,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", Object.values(record));
  await appendAudit(db, context, {
    entityType: "goal",
    entityId: record.goal_id,
    next: publicRow(record)
  });
  await context.enqueueMirror?.(db, "goal", record.goal_id);
  return publicRow(record);
};
export const updateGoal = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM savings_goals WHERE goal_id=?", [p.goal_id]);
  if (!current) throw appError("NOT_FOUND", "Target tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const account = await accountWithAccess(db, context.actor, goalPayloadValue(p, current, "account_id"));
  const owned = ruleScopeFromAccount(account);
  const next = buildUpdatedGoal(current, p, account, owned, context.actor.user_id);
  assertGoalEnums({ status: next.status, goalType: next.goal_type, priority: next.priority });
  await assertGoalCompletionAllowed(db, current, next.status, next.target_amount);
  await assertGoalAccountChangeAllowed(db, current, account, owned);
  if (!next.name) throw appError("NAME_REQUIRED", "Nama target wajib diisi.", 400);
  const r = await db.execute("UPDATE savings_goals SET name=?,goal_type=?,target_amount=?,target_date=?,account_id=?,priority=?,status=?,scope=?,owner_user_id=?,row_version=?,updated_by=?,updated_at=? WHERE goal_id=? AND row_version=?", [next.name, next.goal_type, next.target_amount, next.target_date, next.account_id, next.priority, next.status, next.scope, next.owner_user_id, next.row_version, next.updated_by, next.updated_at, current.goal_id, current.row_version]);
  if (r.rowsAffected !== 1) throw appError("CONFLICT", "Target berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "goal", entityId: current.goal_id, previous: publicRow(current), next: publicRow(next) });
  await context.enqueueMirror?.(db, "goal", current.goal_id);
  return publicRow(next);
};

export const previewGoalLifecycle = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM savings_goals WHERE goal_id=? AND status<>'archived'", [p.goal_id]);
  if (!current) throw appError("NOT_FOUND", "Target aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  return goalLifecycleImpact(db, current);
};

export const deleteUnusedGoal = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM savings_goals WHERE goal_id=? AND status='active'", [p.goal_id]);
  if (!current) throw appError("NOT_FOUND", "Target aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penghapusan target wajib diisi.", 400);
  if (!strictBoolean(p.acknowledged, false)) throw appError("ACKNOWLEDGEMENT_REQUIRED", "Konfirmasi pemahaman penghapusan target wajib dicentang.", 400);
  const impact = await goalLifecycleImpact(db, current);
  if (!impact.canDeleteUnused) throw appError("GOAL_DELETE_BLOCKED", "Target tidak memenuhi syarat sebagai target belum pernah digunakan.", 409, impact);
  await appendAudit(db, context, {
    entityType: "goal",
    entityId: current.goal_id,
    previous: publicRow(current),
    next: { deleted: true, deletion_type: "unused_goal_only", reason, current_amount: impact.currentAmount, dependencies: impact.dependencies, audit_preserved: true },
  });
  const result = await db.execute("DELETE FROM savings_goals WHERE goal_id=? AND row_version=? AND status='active'", [current.goal_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Target berubah atau baru saja digunakan di perangkat lain.", 409);
  await context.enqueueMirror?.(db, "goal", current.goal_id);
  return { goal_id: current.goal_id, deleted: true, audit_preserved: true };
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
  assertGoalWithdrawalAmount(type, amount, current);
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
  const movement = await db.one(`SELECT m.*,g.scope,g.owner_user_id,g.name FROM goal_movements m JOIN savings_goals g ON g.goal_id=m.goal_id WHERE m.goal_movement_id=? AND m.status='active'`, [p.goal_movement_id]);
  if (!movement) throw appError("NOT_FOUND", "Mutasi target aktif tidak ditemukan.", 404);
  assertOwnedAccess(context.actor, movement);
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
