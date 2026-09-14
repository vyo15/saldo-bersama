import { appError, nonNegativeInteger, nowIso, positiveInteger, publicRow, sanitizeText, uuid } from "../core.js";
import { nextVersionStamp } from "../versioning.js";

const activeCommitment = async (db, commitmentId) => {
  const row = await db.one("SELECT * FROM commitments WHERE commitment_id=?", [commitmentId]);
  if (!row) throw appError("COMMITMENT_NOT_FOUND", "Komitmen tidak ditemukan.", 404);
  return row;
};

export const flatCommitmentPaymentBreakdown = (commitment, amount) => {
  const before = Number(commitment.current_balance || 0);
  const original = Number(commitment.original_amount || 0);
  const totalInstallments = Number(commitment.total_installments || 0);
  if (before <= 0 || original <= 0 || totalInstallments <= 0) return null;
  const scheduledPrincipal = Math.max(1, Math.round(original / totalInstallments));
  if (Number(amount || 0) < Math.min(before, scheduledPrincipal)) return null;
  const principal = Math.min(before, scheduledPrincipal);
  return {
    before,
    after: Math.max(0, before - principal),
    principal,
    interest: Math.max(0, Number(amount || 0) - principal),
    principalKnown: true,
    scheduledPrincipal,
  };
};

const paymentBalance = (commitment, payload, amount) => {
  const before = Number(commitment.current_balance || 0);
  if (commitment.commitment_type === "arisan") {
    const principal = Math.min(before, amount);
    return { before, after: Math.max(0, before - principal), principal, interest: 0, principalKnown: true };
  }
  const raw = payload.remaining_principal;
  if (raw === undefined || raw === null || raw === "") {
    const inferred = flatCommitmentPaymentBreakdown(commitment, amount);
    return inferred || { before, after: before, principal: 0, interest: 0, principalKnown: false };
  }
  const after = nonNegativeInteger(raw, "Sisa pokok");
  if (after > before) throw appError("COMMITMENT_BALANCE_INCREASE", "Sisa pokok setelah pembayaran tidak boleh lebih besar dari sebelumnya.", 409);
  const principal = before - after;
  if (principal > amount) throw appError("COMMITMENT_PRINCIPAL_EXCEEDS_PAYMENT", "Pokok yang berkurang tidak boleh melebihi nominal pembayaran.", 409);
  return { before, after, principal, interest: Math.max(0, amount - principal), principalKnown: true };
};

export const applyCommitmentOccurrencePayment = async (db, context, { rule, occurrence, nextOccurrence, transaction, payload, amount }) => {
  if (!rule.commitment_id) return null;
  const commitment = await activeCommitment(db, rule.commitment_id);
  if (commitment.status !== "active") throw appError("COMMITMENT_NOT_ACTIVE", "Komitmen sudah tidak aktif.", 409);
  const balance = paymentBalance(commitment, payload, amount);
  const completedByBalance = balance.after === 0;
  const occurrenceCompleted = nextOccurrence.status === "paid" || completedByBalance;
  const installmentDelta = occurrence.status !== "paid" && occurrenceCompleted ? 1 : 0;
  const nextPaid = Number(commitment.installments_paid || 0) + installmentDelta;
  const completedByInstallments = Number(commitment.total_installments || 0) > 0 && nextPaid >= Number(commitment.total_installments || 0);
  const nextStatus = completedByBalance || (commitment.commitment_type === "arisan" && completedByInstallments) ? "completed" : commitment.status;
  const next = {
    ...commitment,
    current_balance: balance.after,
    installments_paid: nextPaid,
    status: nextStatus,
    ...nextVersionStamp(commitment, context.actor.user_id),
  };
  const updated = await db.execute(`UPDATE commitments SET current_balance=?,installments_paid=?,status=?,row_version=?,updated_by=?,updated_at=?
    WHERE commitment_id=? AND row_version=?`, [next.current_balance, next.installments_paid, next.status, next.row_version, next.updated_by, next.updated_at, commitment.commitment_id, commitment.row_version]);
  if (updated.rowsAffected !== 1) throw appError("CONFLICT", "Komitmen berubah di perangkat lain.", 409);
  const movement = {
    commitment_movement_id: uuid(), commitment_id: commitment.commitment_id, movement_type: "payment",
    recurring_occurrence_id: occurrence.occurrence_id, transaction_id: transaction.transaction_id, amount,
    principal_amount: balance.principal, interest_amount: balance.interest, balance_before: balance.before, balance_after: balance.after,
    installments_delta: installmentDelta, principal_known: balance.principalKnown ? 1 : 0, status: "active",
    note: balance.principalKnown ? "" : "Sisa pokok belum diperbarui", created_by: context.actor.user_id, created_at: nowIso(), reversed_by: null, reversed_at: null,
  };
  await db.execute(`INSERT INTO commitment_movements(commitment_movement_id,commitment_id,movement_type,recurring_occurrence_id,transaction_id,amount,principal_amount,interest_amount,balance_before,balance_after,installments_delta,principal_known,status,note,created_by,created_at,reversed_by,reversed_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(movement));
  return {
    commitment: publicRow(next, ["auto_debit"]),
    movement: publicRow(movement, ["principal_known"]),
    occurrence_completed: occurrenceCompleted,
    commitment_completed: next.status === "completed",
  };
};

export const reverseCommitmentTransaction = async (db, context, transactionId) => {
  const movement = await db.one("SELECT * FROM commitment_movements WHERE transaction_id=? AND status='active'", [transactionId]);
  if (!movement) return null;
  const commitment = await activeCommitment(db, movement.commitment_id);
  const nextBalance = Number(commitment.current_balance || 0) + Number(movement.principal_amount || 0);
  const nextPaid = Math.max(0, Number(commitment.installments_paid || 0) - Number(movement.installments_delta || 0));
  const reactivatedFromCompleted = commitment.status === "completed";
  const next = { ...commitment, current_balance: nextBalance, installments_paid: nextPaid, status: commitment.status === "archived" ? "archived" : "active", ...nextVersionStamp(commitment, context.actor.user_id) };
  const updated = await db.execute("UPDATE commitments SET current_balance=?,installments_paid=?,status=?,row_version=?,updated_by=?,updated_at=? WHERE commitment_id=? AND row_version=?", [next.current_balance,next.installments_paid,next.status,next.row_version,next.updated_by,next.updated_at,commitment.commitment_id,commitment.row_version]);
  if (updated.rowsAffected !== 1) throw appError("CONFLICT", "Komitmen berubah di perangkat lain.", 409);
  await db.execute("UPDATE commitment_movements SET status='reversed',reversed_by=?,reversed_at=? WHERE commitment_movement_id=? AND status='active'", [context.actor.user_id, nowIso(), movement.commitment_movement_id]);
  return { ...publicRow(next, ["auto_debit"]), reactivated_from_completed: reactivatedFromCompleted };
};

export const movementNote = (value) => sanitizeText(value, 180);
export const movementAmount = (value, label = "Nominal") => positiveInteger(value, label);
