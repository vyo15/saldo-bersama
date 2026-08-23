import { appendAudit } from "../audit.js";
import { cancelTransactionInternal, createTransactionInternal } from "../finance.js";
import { appError, assertOwner, assertVersion, positiveInteger, publicRow, sanitizeText, todayJakarta } from "../core.js";
import { nextVersionTimestamp } from "../versioning.js";
import { cancelScheduledManualRemindersForEntity } from "../reminders.js";
import { accountWithAccess, assertOwnedAccess, ruleScopeFromAccount } from "./shared.js";
import { enqueueRecurringOccurrenceSync } from "./recurringSchedule.js";

// Occurrence mutations bridge planning state to canonical transaction writes. The
// transaction service remains authoritative for ledger/balance validation.
const recurringOccurrenceWithRule = (db, occurrenceId) => db.one(`SELECT o.*,r.status AS rule_status,r.scope,r.owner_user_id,r.recurring_rule_id
  FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
  WHERE o.occurrence_id=?`, [occurrenceId]);

const activeOccurrenceTransactionCount = async (db, occurrenceId) => {
  const linked = await db.one("SELECT COUNT(*) AS count FROM transactions WHERE recurring_occurrence_id=? AND status='active'", [occurrenceId]);
  return Number(linked?.count || 0);
};

const assertOccurrencePaymentAllowed = (occurrence, rule, account) => {
  if (rule.status !== "active") throw appError("RECURRING_RULE_ARCHIVED", "Aturan rutin sudah diarsipkan.", 409);
  if (occurrence.status === "cancelled") throw appError("OCCURRENCE_CANCELLED", "Occurrence ini sudah dilewati. Pulihkan periode sebelum mencatat pembayaran.", 409);
  const owned = ruleScopeFromAccount(account);
  if (owned.scope !== rule.scope || String(owned.owner_user_id || "") !== String(rule.owner_user_id || "")) {
    throw appError("ACCOUNT_SCOPE_MISMATCH", "Rekening aktual harus memiliki kepemilikan sama dengan aturan.", 409);
  }
};

const buildOccurrencePaymentTransaction = (rule, occurrence, account, payload, amount) => ({
  transaction_type: rule.kind,
  transaction_date: payload.transaction_date || todayJakarta(),
  source_account_id: rule.kind === "expense" ? account.account_id : null,
  destination_account_id: rule.kind === "income" ? account.account_id : null,
  category_id: rule.category_id,
  envelope_period_id: rule.kind === "expense" ? payload.envelope_period_id || null : null,
  amount,
  description: rule.name,
  overspend_reason: rule.kind === "expense" ? payload.overspend_reason || "" : "",
  cost_share_mode: rule.kind === "expense" ? payload.cost_share_mode || "unspecified" : "unspecified",
  cost_share_percentages: rule.kind === "expense" ? payload.cost_share_percentages || [] : [],
  payment_method: rule.payment_method,
  recurring_occurrence_id: occurrence.occurrence_id,
});

const buildPaidOccurrence = (occurrence, transactionId, amount) => {
  const ids = JSON.parse(occurrence.transaction_ids_json || "[]");
  ids.push(transactionId);
  const actual = Number(occurrence.actual_amount) + amount;
  const status = actual >= Number(occurrence.expected_amount) ? "paid" : "partial";
  return {
    next: {
      ...occurrence,
      actual_amount: actual,
      status,
      transaction_ids_json: JSON.stringify(ids),
      ...nextVersionTimestamp(occurrence),
    },
    status,
  };
};

const occurrencePaymentResponse = (rule, next, status, transaction) => ({
  occurrence: {
    ...publicRow(next),
    status: rule.kind === "income" && status === "paid" ? "received" : status,
  },
  transaction,
});

export const cancelOccurrence = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const occurrence = await recurringOccurrenceWithRule(db, p.occurrence_id);
  if (!occurrence) throw appError("NOT_FOUND", "Occurrence rutin tidak ditemukan.", 404);
  assertVersion(occurrence, context.rowVersion ?? p.row_version);
  if (occurrence.rule_status !== "active") throw appError("RECURRING_RULE_ARCHIVED", "Aturan rutin sudah diarsipkan.", 409);
  if (occurrence.status === "cancelled") throw appError("OCCURRENCE_ALREADY_CANCELLED", "Occurrence ini sudah dilewati.", 409);
  const transactionIds = JSON.parse(occurrence.transaction_ids_json || "[]");
  if (Number(occurrence.actual_amount) !== 0 || transactionIds.length) {
    throw appError("OCCURRENCE_HAS_PAYMENT", "Occurrence yang sudah memiliki pembayaran harus dibalik terlebih dahulu sebelum dilewati.", 409);
  }
  if (await activeOccurrenceTransactionCount(db, occurrence.occurrence_id) > 0) throw appError("OCCURRENCE_HAS_PAYMENT", "Occurrence masih memiliki transaksi aktif. Balikkan pembayaran terlebih dahulu sebelum melewati periode.", 409);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan melewati periode wajib diisi.", 400);
  const next = { ...occurrence, status: "cancelled", ...nextVersionTimestamp(occurrence) };
  const update = await db.execute("UPDATE recurring_occurrences SET status='cancelled',row_version=?,updated_at=? WHERE occurrence_id=? AND row_version=? AND status<>'cancelled' AND actual_amount=0 AND transaction_ids_json='[]'", [next.row_version, next.updated_at, occurrence.occurrence_id, occurrence.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Occurrence berubah di perangkat lain.", 409);
  const response = { ...publicRow(next), skip_reason: reason };
  await cancelScheduledManualRemindersForEntity(db, context, "recurring_occurrence", occurrence.occurrence_id, "ENTITY_CANCELLED");
  await appendAudit(db, context, { entityType: "recurring_occurrence", entityId: occurrence.occurrence_id, previous: publicRow(occurrence), next: response });
  await enqueueRecurringOccurrenceSync(db, context, occurrence);
  return response;
};

export const restoreOccurrence = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const occurrence = await recurringOccurrenceWithRule(db, p.occurrence_id);
  if (!occurrence) throw appError("NOT_FOUND", "Occurrence rutin tidak ditemukan.", 404);
  assertVersion(occurrence, context.rowVersion ?? p.row_version);
  if (occurrence.rule_status !== "active") throw appError("RECURRING_RULE_ARCHIVED", "Pulihkan aturan rutin terlebih dahulu sebelum memulihkan periode.", 409);
  if (occurrence.status !== "cancelled") throw appError("OCCURRENCE_NOT_CANCELLED", "Occurrence ini tidak berstatus dilewati.", 409);
  if (Number(occurrence.actual_amount) !== 0 || JSON.parse(occurrence.transaction_ids_json || "[]").length) {
    throw appError("INTEGRITY_ERROR", "Occurrence dilewati memiliki pembayaran terkait dan tidak aman dipulihkan.", 409);
  }
  if (await activeOccurrenceTransactionCount(db, occurrence.occurrence_id) > 0) {
    throw appError("INTEGRITY_ERROR", "Occurrence dilewati masih memiliki transaksi aktif dan tidak aman dipulihkan.", 409);
  }
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pemulihan periode wajib diisi.", 400);
  const status = occurrence.due_date < todayJakarta() ? "overdue" : "expected";
  const next = { ...occurrence, status, ...nextVersionTimestamp(occurrence) };
  const update = await db.execute("UPDATE recurring_occurrences SET status=?,row_version=?,updated_at=? WHERE occurrence_id=? AND row_version=? AND status='cancelled'", [next.status, next.row_version, next.updated_at, occurrence.occurrence_id, occurrence.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Occurrence berubah di perangkat lain.", 409);
  const response = { ...publicRow(next), restore_reason: reason };
  await appendAudit(db, context, { entityType: "recurring_occurrence", entityId: occurrence.occurrence_id, previous: publicRow(occurrence), next: response });
  await enqueueRecurringOccurrenceSync(db, context, occurrence);
  return response;
};

export const payOccurrence = async (db, context) => {
  const p = context.payload || {};
  const occurrence = await db.one("SELECT * FROM recurring_occurrences WHERE occurrence_id=?", [p.occurrence_id]);
  if (!occurrence) throw appError("NOT_FOUND", "Occurrence rutin tidak ditemukan.", 404);
  const rule = await db.one("SELECT * FROM recurring_rules WHERE recurring_rule_id=?", [occurrence.recurring_rule_id]);
  if (!rule) throw appError("INTEGRITY_ERROR", "Aturan rutin untuk occurrence tidak ditemukan.", 409);
  assertOwnedAccess(context.actor, rule);
  assertVersion(occurrence, context.rowVersion ?? p.row_version);
  const account = await accountWithAccess(db, context.actor, p.account_id || rule.default_account_id);
  assertOccurrencePaymentAllowed(occurrence, rule, account);
  const amount = positiveInteger(p.amount, "Nominal aktual");
  const remaining = Math.max(0, Number(occurrence.expected_amount) - Number(occurrence.actual_amount));
  if (!remaining) throw appError("OCCURRENCE_ALREADY_COMPLETE", "Occurrence sudah selesai dibayar.", 409);
  const transaction = await createTransactionInternal(db, { ...context, action: "recurring.payOccurrence" },
    buildOccurrencePaymentTransaction(rule, occurrence, account, p, amount),
    { allowInternalLinks: true, audit: false });
  const { next, status } = buildPaidOccurrence(occurrence, transaction.transaction_id, amount);
  const result = await db.execute("UPDATE recurring_occurrences SET actual_amount=?,status=?,transaction_ids_json=?,row_version=?,updated_at=? WHERE occurrence_id=? AND row_version=?", [next.actual_amount, next.status, next.transaction_ids_json, next.row_version, next.updated_at, occurrence.occurrence_id, occurrence.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Occurrence berubah di perangkat lain.", 409);
  const response = occurrencePaymentResponse(rule, next, status, transaction);
  if (next.status === "paid") {
    await cancelScheduledManualRemindersForEntity(db, context, "recurring_occurrence", occurrence.occurrence_id, "ENTITY_COMPLETED");
  }
  await appendAudit(db, context, { entityType: "recurring_occurrence", entityId: occurrence.occurrence_id, previous: publicRow(occurrence), next: response });
  await enqueueRecurringOccurrenceSync(db, context, occurrence);
  return response;
};

export const reverseOccurrencePayment = async (db, context) => {
  const p = context.payload || {};
  const occurrence = await db.one(`SELECT o.*,r.scope,r.owner_user_id,r.recurring_rule_id FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id WHERE o.occurrence_id=?`, [p.occurrence_id]);
  if (!occurrence) throw appError("NOT_FOUND", "Occurrence rutin tidak ditemukan.", 404);
  assertOwnedAccess(context.actor, occurrence);
  assertVersion(occurrence, context.rowVersion ?? p.row_version);
  const transaction = await db.one("SELECT * FROM transactions WHERE transaction_id=? AND recurring_occurrence_id=? AND status='active'", [p.transaction_id, occurrence.occurrence_id]);
  if (!transaction) throw appError("NOT_FOUND", "Transaksi rutin aktif tidak ditemukan.", 404);
  if (context.actor.role !== "owner" && transaction.created_by !== context.actor.user_id) throw appError("FORBIDDEN", "Member hanya dapat membatalkan pembayaran rutin yang dibuat sendiri.", 403);
  const cancelledTransaction = await cancelTransactionInternal(db, context, transaction, p.reason, {
    allowLinked: true,
    audit: false
  });
  const ids = JSON.parse(occurrence.transaction_ids_json || "[]").filter(id => id !== transaction.transaction_id);
  const active = ids.length ? await db.all(`SELECT amount FROM transactions WHERE status='active' AND transaction_id IN (${ids.map(() => "?").join(",")})`, ids) : [];
  const actual = active.reduce((sum, row) => sum + Number(row.amount), 0);
  const status = actual >= Number(occurrence.expected_amount) ? "paid" : actual > 0 ? "partial" : occurrence.due_date < todayJakarta() ? "overdue" : "expected";
  const next = {
    ...occurrence,
    actual_amount: actual,
    status,
    transaction_ids_json: JSON.stringify(ids),
    ...nextVersionTimestamp(occurrence)
  };
  const update = await db.execute("UPDATE recurring_occurrences SET actual_amount=?,status=?,transaction_ids_json=?,row_version=?,updated_at=? WHERE occurrence_id=? AND row_version=?", [actual, status, next.transaction_ids_json, next.row_version, next.updated_at, occurrence.occurrence_id, occurrence.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Occurrence berubah di perangkat lain.", 409);
  const response = {
    occurrence: publicRow(next),
    transaction: cancelledTransaction
  };
  await appendAudit(db, context, {
    entityType: "recurring_occurrence",
    entityId: occurrence.occurrence_id,
    previous: publicRow(occurrence),
    next: response
  });
  await enqueueRecurringOccurrenceSync(db, context, occurrence);
  return response;
};
