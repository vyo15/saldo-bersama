import { appendAudit } from "../audit.js";
import { transactionCostSharePresentation } from "../costSharing.js";
import { appError, assertOwner, assertVersion, nowIso, publicRow, sanitizeText, uuid } from "../core.js";
import {
  assertAffectedBalances, assertCanModify, assertTransactionDateUnlocked, normalizeTransaction,
} from "./transactionValidation.js";

export const createTransactionInternal = async (db, context, payload, { allowInternalLinks = false, audit = true } = {}) => {
  const normalized = await normalizeTransaction(db, context, payload, { allowInternalLinks });
  const timestamp = nowIso();
  const record = {
    transaction_id: uuid(), ...normalized, status: "active", row_version: 1, idempotency_key: context.idempotencyKey || `internal:${uuid()}`,
    created_by: context.actor.user_id, created_at: timestamp, updated_by: context.actor.user_id, updated_at: timestamp,
    cancelled_by: null, cancelled_at: null, cancellation_reason: "",
  };
  await db.execute(`INSERT INTO transactions(transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,budget_id,recurring_occurrence_id,goal_id,amount,description,overspend_reason,merchant,payment_method,scope,owner_user_id,cost_share_mode,cost_share_json,status,row_version,idempotency_key,created_by,created_at,updated_by,updated_at,cancelled_by,cancelled_at,cancellation_reason)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  if (audit) await appendAudit(db, context, { entityType: "transaction", entityId: record.transaction_id, next: { ...publicRow(record), ...transactionCostSharePresentation(record) } });
  await context.enqueueMirror?.(db, "transaction", record.transaction_id);
  return { ...publicRow(record), ...transactionCostSharePresentation(record) };
};

export const createTransaction = (db, context) => createTransactionInternal(db, context, context.payload || {});

// Optimistic row_version protects edits made from another device. The projected ledger
// is revalidated before the compare-and-swap update is committed.
export const updateTransaction = async (db, context) => {
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM transactions WHERE transaction_id=? AND status='active'", [payload.transaction_id]);
  if (!current) throw appError("NOT_FOUND", "Transaksi aktif tidak ditemukan.", 404);
  assertCanModify(context, current);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const normalized = await normalizeTransaction(db, context, payload, { current });
  await assertAffectedBalances(db, current, normalized);
  const next = { ...current, ...normalized, row_version: Number(current.row_version)+1, updated_by: context.actor.user_id, updated_at: nowIso() };
  const result = await db.execute(`UPDATE transactions SET transaction_date=?,transaction_type=?,source_account_id=?,destination_account_id=?,category_id=?,envelope_period_id=?,budget_id=?,amount=?,description=?,overspend_reason=?,merchant=?,payment_method=?,scope=?,owner_user_id=?,cost_share_mode=?,cost_share_json=?,row_version=?,updated_by=?,updated_at=?
    WHERE transaction_id=? AND row_version=? AND status='active'`, [next.transaction_date,next.transaction_type,next.source_account_id,next.destination_account_id,next.category_id,next.envelope_period_id,next.budget_id,next.amount,next.description,next.overspend_reason,next.merchant,next.payment_method,next.scope,next.owner_user_id,next.cost_share_mode,next.cost_share_json,next.row_version,next.updated_by,next.updated_at,current.transaction_id,current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Transaksi berubah di perangkat lain.", 409);
  await appendAudit(db, context, {
    entityType: "transaction",
    entityId: current.transaction_id,
    previous: { ...publicRow(current), ...transactionCostSharePresentation(current) },
    next: { ...publicRow(next), ...transactionCostSharePresentation(next) },
  });
  await context.enqueueMirror?.(db,"transaction",current.transaction_id);
  return { ...publicRow(next), ...transactionCostSharePresentation(next) };
};

// Normal financial deletion is a lifecycle transition, never a hard delete. Validate
// downstream balances first, then preserve the row and cancellation audit metadata.
export const cancelTransactionInternal = async (db, context, transaction, reason, { allowLinked = false, audit = true } = {}) => {
  if (!allowLinked) assertCanModify(context, transaction);
  await assertTransactionDateUnlocked(db, transaction.transaction_date);
  const cleanReason = sanitizeText(reason, 200);
  if (!cleanReason) throw appError("REASON_REQUIRED", "Alasan pembatalan wajib diisi.", 400);
  await assertAffectedBalances(db, transaction, null);
  const next = { ...transaction, status:"cancelled", cancelled_by:context.actor.user_id, cancelled_at:nowIso(), cancellation_reason:cleanReason, row_version:Number(transaction.row_version)+1, updated_by:context.actor.user_id, updated_at:nowIso() };
  const result = await db.execute("UPDATE transactions SET status='cancelled',cancelled_by=?,cancelled_at=?,cancellation_reason=?,row_version=?,updated_by=?,updated_at=? WHERE transaction_id=? AND row_version=? AND status='active'", [next.cancelled_by,next.cancelled_at,next.cancellation_reason,next.row_version,next.updated_by,next.updated_at,transaction.transaction_id,transaction.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Transaksi berubah di perangkat lain.",409);
  if (audit) await appendAudit(db, context, {
    action: context.action,
    entityType: "transaction",
    entityId: transaction.transaction_id,
    previous: { ...publicRow(transaction), ...transactionCostSharePresentation(transaction) },
    next: { ...publicRow(next), ...transactionCostSharePresentation(next) },
  });
  await context.enqueueMirror?.(db,"transaction",transaction.transaction_id);
  return { ...publicRow(next), ...transactionCostSharePresentation(next) };
};

export const cancelTransaction = async (db, context) => {
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM transactions WHERE transaction_id=? AND status='active'", [payload.transaction_id || payload.transactionId]);
  if (!current) throw appError("NOT_FOUND", "Transaksi aktif tidak ditemukan.",404);
  assertCanModify(context, current);
  assertVersion(current, context.rowVersion ?? payload.row_version ?? payload.rowVersion);
  return cancelTransactionInternal(db, context, current, payload.reason);
};

// Restore is owner-only and re-runs current validation instead of blindly reactivating
// stale data; linked recurring/goal transactions must be recovered through their owner flow.
export const restoreTransaction = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM transactions WHERE transaction_id=? AND status='cancelled'", [payload.transaction_id || payload.transactionId]);
  if (!current) throw appError("NOT_FOUND", "Transaksi cancelled tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version ?? payload.rowVersion);
  if (current.recurring_occurrence_id) throw appError("LINKED_RECURRING_TRANSACTION", "Pulihkan pembayaran rutin melalui menu Tagihan.", 409, { occurrenceId: current.recurring_occurrence_id });
  if (current.goal_id) throw appError("LINKED_GOAL_TRANSACTION", "Pulihkan mutasi target melalui menu Target.", 409, { goalId: current.goal_id });
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pemulihan transaksi wajib diisi.", 400);
  const normalized = await normalizeTransaction(db, context, { confirm_duplicate: false }, { current });
  await assertAffectedBalances(db, current, normalized);
  const next = {
    ...current,
    ...normalized,
    status: "active",
    cancelled_by: null,
    cancelled_at: null,
    cancellation_reason: "",
    row_version: Number(current.row_version) + 1,
    updated_by: context.actor.user_id,
    updated_at: nowIso(),
  };
  const result = await db.execute(`UPDATE transactions SET status='active',cancelled_by=NULL,cancelled_at=NULL,cancellation_reason='',row_version=?,updated_by=?,updated_at=?
    WHERE transaction_id=? AND row_version=? AND status='cancelled'`, [next.row_version, next.updated_by, next.updated_at, current.transaction_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Transaksi berubah di perangkat lain.", 409);
  await appendAudit(db, context, {
    entityType: "transaction",
    entityId: current.transaction_id,
    previous: { ...publicRow(current), ...transactionCostSharePresentation(current) },
    next: { ...publicRow(next), ...transactionCostSharePresentation(next), restoration_reason: reason },
  });
  await context.enqueueMirror?.(db, "transaction", current.transaction_id);
  return { ...publicRow(next), ...transactionCostSharePresentation(next) };
};

