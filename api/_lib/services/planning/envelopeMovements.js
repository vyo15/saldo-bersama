import { appendAudit } from "../audit.js";
import { appError, assertVersion, nowIso, positiveInteger, publicRow, sanitizeText, uuid } from "../core.js";
import { nextVersionStamp } from "../versioning.js";
import { accountWithAccess, assertOwnedAccess, assertPlanningManageScope } from "./shared.js";
import { assertAllocationAvailable, assertEnvelopeAssigneeAccess, hasSameEnvelopeAssignee } from "./envelopeLifecycle.js";

// Reallocation changes planning allocation only; it is not a ledger transfer. Cross-account
// moves are rejected so money movement remains explicit through canonical transactions.
const resolveEnvelopeMove = async (db, context) => {
  const payload = context.payload || {};
  const fromId = payload.fromEnvelopePeriodId || payload.from_envelope_period_id;
  const toId = payload.toEnvelopePeriodId || payload.to_envelope_period_id;
  if (!fromId || !toId || fromId === toId) throw appError("INVALID_ENVELOPE_MOVE", "Alokasi sumber dan tujuan harus berbeda.", 400);
  const query = `SELECT p.*,r.scope,r.owner_user_id,r.assignee_user_id,r.source_account_id FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active'`;
  const [from, to] = await Promise.all([db.one(query, [fromId]), db.one(query, [toId])]);
  if (!from || !to) throw appError("INVALID_ENVELOPE", "Alokasi Dana aktif tidak ditemukan.", 404);
  assertOwnedAccess(context.actor, from);
  assertOwnedAccess(context.actor, to);
  assertEnvelopeAssigneeAccess(context.actor, from);
  assertEnvelopeAssigneeAccess(context.actor, to);
  assertVersion(from, payload.from_row_version);
  assertVersion(to, payload.to_row_version);
  if (from.scope !== to.scope || String(from.owner_user_id || "") !== String(to.owner_user_id || "")) throw appError("ENVELOPE_SCOPE_MISMATCH", "Dana hanya dapat dipindahkan antar alokasi dengan kepemilikan ledger yang sama.", 409);
  if (!from.source_account_id || !to.source_account_id) throw appError("ENVELOPE_SOURCE_ACCOUNT_REQUIRED", "Pemindahan dana memerlukan rekening sumber yang jelas pada kedua alokasi.", 409);
  if (from.source_account_id !== to.source_account_id) throw appError("ENVELOPE_SOURCE_ACCOUNT_MISMATCH", "Dana hanya dapat dipindahkan antar alokasi dari rekening sumber yang sama. Gunakan Transfer untuk memindahkan uang antar rekening.", 409);
  if (context.actor.role !== "owner" && !hasSameEnvelopeAssignee(from, to)) throw appError("ENVELOPE_ASSIGNEE_MISMATCH", "Member hanya dapat memindahkan dana antar alokasi dengan pengguna yang sama.", 409);
  return { payload, fromId, toId, from, to };
};

const assertEnvelopeMoveCapacity = async (db, fromId, from, amount) => {
  const usage = await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?", [fromId]);
  const remaining = Number(from.allocated_amount) - Number(from.reserved_amount) - Number(usage?.used || 0);
  if (amount > remaining) throw appError("INSUFFICIENT_ENVELOPE", "Nominal melebihi dana tersisa pada alokasi sumber.", 409, { remainingAmount: remaining });
};

const applyEnvelopeMoveBalances = async (db, context, { fromId, toId, from, to, amount, timestamp }) => {
  const fromUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount-?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [amount, context.actor.user_id, timestamp, fromId, from.row_version]);
  if (fromUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Alokasi sumber berubah di perangkat lain.", 409);
  const toUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount+?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [amount, context.actor.user_id, timestamp, toId, to.row_version]);
  if (toUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Alokasi tujuan berubah di perangkat lain.", 409);
};

export const moveEnvelope = async (db, context) => {
  const move = await resolveEnvelopeMove(db, context);
  const amount = positiveInteger(move.payload.amount, "Nominal realokasi");
  await assertEnvelopeMoveCapacity(db, move.fromId, move.from, amount);
  const reason = sanitizeText(move.payload.reason, 180);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan realokasi wajib diisi.", 400);
  const timestamp = nowIso();
  const movement = {
    movement_id: uuid(), from_envelope_period_id: move.fromId, to_envelope_period_id: move.toId, amount,
    movement_type: "reallocation", reason, status: "active", row_version: 1, created_by: context.actor.user_id, created_at: timestamp,
  };
  await applyEnvelopeMoveBalances(db, context, { ...move, amount, timestamp });
  await db.execute("INSERT INTO envelope_movements(movement_id,from_envelope_period_id,to_envelope_period_id,amount,movement_type,reason,status,row_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", Object.values(movement));
  await appendAudit(db, context, { entityType: "envelope_movement", entityId: movement.movement_id, next: publicRow(movement) });
  await context.enqueueMirror?.(db, "envelope", move.fromId);
  return publicRow(movement);
};

const envelopePeriodForAdjustment = async (db, periodId) => db.one(`SELECT p.*,r.scope,r.owner_user_id,r.assignee_user_id,r.source_account_id
  FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
  WHERE p.envelope_period_id=? AND p.status='active' AND r.status='active'`, [periodId]);

export const adjustEnvelopeAllocation = async (db, context) => {
  const payload = context.payload || {};
  const periodId = sanitizeText(payload.envelope_period_id, 100);
  const direction = String(payload.direction || "fund");
  const amount = positiveInteger(payload.amount, "Nominal alokasi");
  if (!periodId) throw appError("ENVELOPE_REQUIRED", "Alokasi Dana aktif wajib dipilih.", 400);
  if (!["fund", "release"].includes(direction)) throw appError("INVALID_ALLOCATION_DIRECTION", "Arah perubahan alokasi tidak valid.", 400);
  const current = await envelopePeriodForAdjustment(db, periodId);
  if (!current) throw appError("INVALID_ENVELOPE", "Alokasi Dana aktif tidak ditemukan.", 404);
  assertOwnedAccess(context.actor, current);
  assertPlanningManageScope(context.actor, current, { allowOwnedPersonal: true });
  assertEnvelopeAssigneeAccess(context.actor, current);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const source = await accountWithAccess(db, context.actor, current.source_account_id);
  if (direction === "fund") {
    await assertAllocationAvailable(db, source, amount);
  } else {
    const usage = await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?", [periodId]);
    const removable = Number(current.allocated_amount) - Number(current.reserved_amount) - Number(usage?.used || 0);
    if (amount > removable) throw appError("INSUFFICIENT_ENVELOPE", "Nominal melebihi dana alokasi yang belum terpakai atau dipesan.", 409, { removableAmount: Math.max(0, removable) });
  }
  const timestamp = nowIso();
  const nextAmount = Number(current.allocated_amount) + (direction === "fund" ? amount : -amount);
  const next = { ...current, allocated_amount: nextAmount, ...nextVersionStamp(current, context.actor.user_id, timestamp) };
  const result = await db.execute("UPDATE envelope_periods SET allocated_amount=?,row_version=?,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=? AND status='active'", [next.allocated_amount, next.row_version, next.updated_by, next.updated_at, periodId, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Alokasi berubah di perangkat lain.", 409);
  const reason = sanitizeText(payload.reason, 180) || (direction === "fund" ? "Tambah dana dari dana tersedia" : "Kembalikan dana ke dana tersedia");
  await appendAudit(db, context, {
    entityType: "envelope_period",
    entityId: periodId,
    previous: publicRow(current),
    next: { ...publicRow(next), allocation_adjustment: { direction, amount, reason } },
  });
  await context.enqueueMirror?.(db, "envelope", periodId);
  return { period: publicRow(next), direction, amount };
};

export const reverseEnvelopeMovement = async (db, context) => {
  const payload = context.payload || {};
  const movement = await db.one("SELECT * FROM envelope_movements WHERE movement_id=? AND movement_type='reallocation' AND status='active'", [payload.movement_id]);
  if (!movement) throw appError("NOT_FOUND", "Mutasi alokasi aktif tidak ditemukan.", 404);
  if (context.actor.role !== "owner" && movement.created_by !== context.actor.user_id) throw appError("FORBIDDEN", "Member hanya dapat membatalkan mutasi alokasi yang dibuat sendiri.", 403);
  assertVersion(movement, context.rowVersion ?? payload.row_version);
  const [from, to] = await Promise.all([
    db.one(`SELECT p.*,r.scope,r.owner_user_id,r.assignee_user_id,r.source_account_id FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active' AND r.status='active'`, [movement.from_envelope_period_id]),
    db.one(`SELECT p.*,r.scope,r.owner_user_id,r.assignee_user_id,r.source_account_id FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active' AND r.status='active'`, [movement.to_envelope_period_id]),
  ]);
  if (!from || !to) throw appError("ENVELOPE_MOVEMENT_LOCKED", "Pemindahan dana hanya dapat dibatalkan ketika kedua alokasi masih aktif.", 409);
  assertOwnedAccess(context.actor, from);
  assertOwnedAccess(context.actor, to);
  assertEnvelopeAssigneeAccess(context.actor, from);
  assertEnvelopeAssigneeAccess(context.actor, to);
  if (context.actor.role !== "owner" && !hasSameEnvelopeAssignee(from, to)) throw appError("ENVELOPE_ASSIGNEE_MISMATCH", "Member hanya dapat membatalkan pemindahan antar alokasi dengan pengguna yang sama.", 409);
  assertVersion(from, payload.from_row_version);
  assertVersion(to, payload.to_row_version);
  const usage = await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?", [to.envelope_period_id]);
  const removable = Number(to.allocated_amount) - Number(to.reserved_amount) - Number(usage?.used || 0);
  if (Number(movement.amount) > removable) throw appError("ENVELOPE_MOVEMENT_IN_USE", "Dana hasil realokasi sudah terpakai atau dipesan sehingga mutasi tidak dapat dibatalkan.", 409, { removableAmount: removable });
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pembatalan mutasi wajib diisi.", 400);
  const timestamp = nowIso();
  const fromUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount+?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [movement.amount, context.actor.user_id, timestamp, from.envelope_period_id, from.row_version]);
  if (fromUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Alokasi sumber berubah di perangkat lain.", 409);
  const toUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount-?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [movement.amount, context.actor.user_id, timestamp, to.envelope_period_id, to.row_version]);
  if (toUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Alokasi tujuan berubah di perangkat lain.", 409);
  const next = { ...movement, status: "reversed", row_version: Number(movement.row_version) + 1 };
  const movementUpdate = await db.execute("UPDATE envelope_movements SET status='reversed',row_version=? WHERE movement_id=? AND row_version=? AND status='active'", [next.row_version, movement.movement_id, movement.row_version]);
  if (movementUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Mutasi alokasi berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "envelope_movement", entityId: movement.movement_id, previous: publicRow(movement), next: { ...publicRow(next), reversal_reason: reason } });
  await context.enqueueMirror?.(db, "envelope", from.envelope_period_id);
  return publicRow(next);
};
