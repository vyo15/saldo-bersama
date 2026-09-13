import { appendAudit } from "../audit.js";
import { createTransactionInternal } from "../finance.js";
import { appError, assertOwner, assertVersion, dateValue, nonNegativeInteger, nowIso, positiveInteger, publicRow, sanitizeText, strictBoolean, uuid, visibleScopeSql } from "../core.js";
import { newVersionStamp, nextVersionStamp } from "../versioning.js";
import { accountWithAccess, assertOperationalPlanningAccount, assertOwnedAccess, assertPlanningManageScope, dueDayValue, ruleScopeFromAccount } from "./shared.js";
import { archiveRecurringRule, createRecurringRule, updateRecurringRule } from "./recurring.js";
import { movementAmount, movementNote } from "./commitmentLedger.js";

const TYPES = new Set(["mortgage", "installment", "loan", "arisan", "other"]);
const FREQUENCIES = new Set(["daily","weekly","biweekly","monthly","bimonthly","quarterly","semiannual","annual"]);

const activeExpenseCategory = async (db, categoryId) => {
  const row = await db.one("SELECT * FROM categories WHERE category_id=? AND status='active'", [categoryId]);
  if (!row || row.transaction_type !== "expense") throw appError("INVALID_COMMITMENT_CATEGORY", "Kategori pembayaran Komitmen harus kategori pengeluaran aktif.", 400);
  return row;
};

const activeIncomeCategory = async (db, categoryId) => {
  const row = await db.one("SELECT * FROM categories WHERE category_id=? AND status='active'", [categoryId]);
  if (!row || row.transaction_type !== "income") throw appError("INVALID_COMMITMENT_RECEIPT_CATEGORY", "Kategori penerimaan Arisan harus kategori pemasukan aktif.", 400);
  return row;
};

const normalizedState = (p, type) => {
  const installmentAmount = positiveInteger(p.installment_amount, "Nominal cicilan/setoran");
  const totalInstallments = nonNegativeInteger(p.total_installments ?? 0, "Jumlah periode");
  if (type === "arisan" && totalInstallments < 1) throw appError("INVALID_ARISAN_PERIOD", "Jumlah periode Arisan wajib lebih dari 0.", 400);
  const installmentsPaid = nonNegativeInteger(p.installments_paid ?? 0, "Periode yang sudah dibayar");
  if (totalInstallments && installmentsPaid > totalInstallments) throw appError("INVALID_COMMITMENT_PROGRESS", "Periode terbayar tidak boleh melebihi jumlah periode.", 400);
  const computedTotal = installmentAmount * Math.max(1, totalInstallments || 1);
  const originalAmount = positiveInteger(p.original_amount || computedTotal, "Nilai awal");
  const defaultBalance = type === "arisan" && totalInstallments ? Math.max(0, installmentAmount * (totalInstallments - installmentsPaid)) : originalAmount;
  const openingBalance = nonNegativeInteger(p.current_balance ?? defaultBalance, "Sisa kewajiban");
  if (openingBalance < 1) throw appError("INVALID_COMMITMENT_BALANCE", "Sisa kewajiban/setoran harus lebih dari 0 saat Komitmen dibuat.", 400);
  if (type !== "arisan" && openingBalance > originalAmount) throw appError("INVALID_COMMITMENT_BALANCE", "Sisa kewajiban tidak boleh lebih besar dari nilai awal.", 400);
  return { installmentAmount, totalInstallments, installmentsPaid, originalAmount, openingBalance };
};

const recurringContext = (context, payload, rowVersion = null, action = rowVersion ? "recurring.updateRule" : "recurring.createRule") => ({ ...context, payload, rowVersion, commitmentManaged: true, action });

const payloadValue = (payload, current, key, normalize = (value) => value) => payload[key] === undefined ? current[key] : normalize(payload[key]);

const buildCommitmentUpdate = (current, payload, account, category, actorId) => {
  const name = sanitizeText(payloadValue(payload, current, "name"), 100);
  if (!name) throw appError("INVALID_COMMITMENT_NAME", "Nama Komitmen wajib diisi.", 400);
  const installmentAmount = payloadValue(payload, current, "installment_amount", (value) => positiveInteger(value, "Nominal cicilan/setoran"));
  const totalInstallments = payloadValue(payload, current, "total_installments", (value) => nonNegativeInteger(value, "Jumlah periode"));
  if (totalInstallments && Number(current.installments_paid) > totalInstallments) throw appError("INVALID_COMMITMENT_PROGRESS", "Jumlah periode tidak boleh lebih kecil dari yang sudah dibayar.", 400);
  if (current.commitment_type === "arisan" && totalInstallments < 1) throw appError("INVALID_ARISAN_PERIOD", "Jumlah periode Arisan wajib lebih dari 0.", 400);
  const startDate = payloadValue(payload, current, "start_date", (value) => dateValue(value, "Tanggal mulai"));
  const endDate = payload.end_date === undefined ? current.end_date : (payload.end_date ? dateValue(payload.end_date, "Tanggal akhir") : null);
  const frequency = String(payloadValue(payload, current, "frequency"));
  if (!FREQUENCIES.has(frequency) || (endDate && endDate < startDate)) throw appError("INVALID_COMMITMENT_SCHEDULE", "Jadwal Komitmen tidak valid.", 400);
  return {
    ...current,
    name,
    provider: sanitizeText(payloadValue(payload, current, "provider"), 100),
    installment_amount: installmentAmount,
    total_installments: totalInstallments,
    default_account_id: account.account_id,
    category_id: category.category_id,
    frequency,
    due_day: payloadValue(payload, current, "due_day", dueDayValue),
    payment_method: sanitizeText(payloadValue(payload, current, "payment_method"), 40),
    auto_debit: payloadValue(payload, current, "auto_debit", (value) => strictBoolean(value) ? 1 : 0),
    start_date: startDate,
    end_date: endDate,
    notes: sanitizeText(payloadValue(payload, current, "notes"), 500),
    ...nextVersionStamp(current, actorId),
  };
};

export const listCommitments = async (db, context) => {
  const access = visibleScopeSql(context.actor, "c");
  const rows = await db.all(`SELECT c.*,rr.recurring_rule_id,rr.row_version AS recurring_row_version,rr.status AS recurring_status,
      rr.expected_amount AS recurring_expected_amount,rr.due_day AS recurring_due_day,
      a.name AS account_name,a.account_type,cg.name AS category_name,
      (SELECT cm.principal_known FROM commitment_movements cm WHERE cm.commitment_id=c.commitment_id AND cm.status='active' AND cm.movement_type='payment' ORDER BY cm.created_at DESC,cm.commitment_movement_id DESC LIMIT 1) AS latest_principal_known,
      (SELECT cm.created_at FROM commitment_movements cm WHERE cm.commitment_id=c.commitment_id AND cm.status='active' ORDER BY cm.created_at DESC,cm.commitment_movement_id DESC LIMIT 1) AS last_movement_at
    FROM commitments c
    LEFT JOIN recurring_rules rr ON rr.commitment_id=c.commitment_id
    LEFT JOIN accounts a ON a.account_id=c.default_account_id
    LEFT JOIN categories cg ON cg.category_id=c.category_id
    WHERE ${access.sql} AND c.status<>'archived'
    ORDER BY CASE c.status WHEN 'active' THEN 0 ELSE 1 END,c.due_day,c.name COLLATE NOCASE`, access.args);
  const items = rows.map((row) => ({
    ...publicRow(row, ["auto_debit"]),
    can_manage: context.actor.role === "owner" || row.scope === "shared" || row.owner_user_id === context.actor.user_id,
    can_archive: context.actor.role === "owner" && row.status !== "archived",
    can_record_receipt: row.commitment_type === "arisan" && row.status !== "archived" && Number(row.received_amount || 0) < Number(row.original_amount || 0),
    balance_needs_update: ["mortgage","installment","loan","other"].includes(row.commitment_type) && row.last_movement_at && Number(row.latest_principal_known || 0) === 0,
    progress_percent: row.commitment_type === "arisan"
      ? (Number(row.total_installments || 0) ? Math.min(100, Math.round(Number(row.installments_paid || 0) / Number(row.total_installments) * 100)) : 0)
      : Math.min(100, Math.max(0, Math.round((Number(row.original_amount || 0) - Number(row.current_balance || 0)) / Math.max(1, Number(row.original_amount || 1)) * 100))),
  }));
  return { items };
};

export const createCommitment = async (db, context) => {
  const p = context.payload || {};
  const type = String(p.commitment_type || "");
  if (!TYPES.has(type)) throw appError("INVALID_COMMITMENT_TYPE", "Jenis Komitmen tidak valid.", 400);
  const name = sanitizeText(p.name, 100);
  if (!name) throw appError("INVALID_COMMITMENT_NAME", "Nama Komitmen wajib diisi.", 400);
  const account = await accountWithAccess(db, context.actor, p.default_account_id);
  assertOperationalPlanningAccount(account, "Komitmen");
  const owned = ruleScopeFromAccount(account);
  assertPlanningManageScope(context.actor, owned, { allowOwnedPersonal: true });
  const category = await activeExpenseCategory(db, p.category_id);
  const frequency = String(p.frequency || "monthly");
  if (!FREQUENCIES.has(frequency)) throw appError("INVALID_COMMITMENT_FREQUENCY", "Frekuensi Komitmen tidak valid.", 400);
  const state = normalizedState(p, type);
  const startDate = dateValue(p.start_date, "Tanggal mulai");
  const endDate = p.end_date ? dateValue(p.end_date, "Tanggal akhir") : null;
  if (endDate && endDate < startDate) throw appError("INVALID_DATE_RANGE", "Tanggal akhir sebelum tanggal mulai.", 400);
  const now = nowIso();
  const row = {
    commitment_id: uuid(), name, commitment_type: type, provider: sanitizeText(p.provider, 100), original_amount: state.originalAmount,
    opening_balance: state.openingBalance, current_balance: state.openingBalance, installment_amount: state.installmentAmount,
    total_installments: state.totalInstallments, installments_paid: state.installmentsPaid, received_amount: 0, received_at: null,
    default_account_id: account.account_id, category_id: category.category_id, frequency, due_day: dueDayValue(p.due_day),
    payment_method: sanitizeText(p.payment_method || "transfer", 40), auto_debit: strictBoolean(p.auto_debit, false) ? 1 : 0,
    start_date: startDate, end_date: endDate, notes: sanitizeText(p.notes, 500), status: state.openingBalance === 0 ? "completed" : "active",
    ...newVersionStamp(context.actor.user_id, now), scope: owned.scope, owner_user_id: owned.owner_user_id,
  };
  await db.execute(`INSERT INTO commitments(commitment_id,name,commitment_type,provider,original_amount,opening_balance,current_balance,installment_amount,total_installments,installments_paid,received_amount,received_at,default_account_id,category_id,frequency,due_day,payment_method,auto_debit,start_date,end_date,notes,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(row));
  const recurring = await createRecurringRule(db, recurringContext(context, {
    name, kind: "expense", category_id: category.category_id, expected_amount: state.installmentAmount, frequency, due_day: row.due_day,
    default_account_id: account.account_id, payment_method: row.payment_method, auto_debit: Boolean(row.auto_debit), start_date: startDate, end_date: endDate,
    priority: ["mortgage","loan"].includes(type) ? "high" : "normal",
  }));
  await db.execute("UPDATE recurring_rules SET commitment_id=? WHERE recurring_rule_id=?", [row.commitment_id, recurring.recurring_rule_id]);
  await appendAudit(db, context, { entityType: "commitment", entityId: row.commitment_id, next: { ...publicRow(row, ["auto_debit"]), recurring_rule_id: recurring.recurring_rule_id } });
  return { ...publicRow(row, ["auto_debit"]), recurring_rule_id: recurring.recurring_rule_id };
};

export const updateCommitment = async (db, context) => {
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM commitments WHERE commitment_id=?", [p.commitment_id]);
  if (!current) throw appError("COMMITMENT_NOT_FOUND", "Komitmen tidak ditemukan.", 404);
  assertOwnedAccess(context.actor, current);
  assertPlanningManageScope(context.actor, current, { allowOwnedPersonal: true });
  assertVersion(current, context.rowVersion ?? p.row_version);
  if (current.status !== "active") throw appError("COMMITMENT_NOT_ACTIVE", "Hanya Komitmen aktif yang dapat diubah.", 409);
  const account = await accountWithAccess(db, context.actor, payloadValue(p, current, "default_account_id"));
  assertOperationalPlanningAccount(account, "Komitmen");
  const owned = ruleScopeFromAccount(account);
  if (owned.scope !== current.scope || String(owned.owner_user_id || "") !== String(current.owner_user_id || "")) throw appError("COMMITMENT_SCOPE_LOCKED", "Kepemilikan Komitmen tidak dapat diubah setelah dibuat.", 409);
  const category = await activeExpenseCategory(db, payloadValue(p, current, "category_id"));
  const next = buildCommitmentUpdate(current, p, account, category, context.actor.user_id);
  const rule = await db.one("SELECT * FROM recurring_rules WHERE commitment_id=?", [current.commitment_id]);
  if (!rule) throw appError("COMMITMENT_SCHEDULE_MISSING", "Jadwal Rutin Komitmen tidak ditemukan.", 409);
  await updateRecurringRule(db, recurringContext(context, { recurring_rule_id: rule.recurring_rule_id, row_version: rule.row_version, name: next.name, kind: "expense", category_id: next.category_id,
    expected_amount: next.installment_amount, frequency: next.frequency, due_day: next.due_day, default_account_id: next.default_account_id, payment_method: next.payment_method,
    auto_debit: Boolean(next.auto_debit), start_date: next.start_date, end_date: next.end_date, priority: ["mortgage","loan"].includes(next.commitment_type) ? "high" : "normal" }, rule.row_version));
  const updated = await db.execute(`UPDATE commitments SET name=?,provider=?,installment_amount=?,total_installments=?,default_account_id=?,category_id=?,frequency=?,due_day=?,payment_method=?,auto_debit=?,start_date=?,end_date=?,notes=?,row_version=?,updated_by=?,updated_at=? WHERE commitment_id=? AND row_version=?`,
    [next.name,next.provider,next.installment_amount,next.total_installments,next.default_account_id,next.category_id,next.frequency,next.due_day,next.payment_method,next.auto_debit,next.start_date,next.end_date,next.notes,next.row_version,next.updated_by,next.updated_at,current.commitment_id,current.row_version]);
  if (updated.rowsAffected !== 1) throw appError("CONFLICT", "Komitmen berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "commitment", entityId: current.commitment_id, previous: publicRow(current, ["auto_debit"]), next: publicRow(next, ["auto_debit"]) });
  return publicRow(next, ["auto_debit"]);
};

export const archiveCommitment = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM commitments WHERE commitment_id=?", [p.commitment_id]);
  if (!current) throw appError("COMMITMENT_NOT_FOUND", "Komitmen tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  if (current.status === "archived") return publicRow(current, ["auto_debit"]);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pengarsipan wajib diisi.", 400);
  const rule = await db.one("SELECT * FROM recurring_rules WHERE commitment_id=?", [current.commitment_id]);
  if (rule?.status === "active") await archiveRecurringRule(db, recurringContext(context, { recurring_rule_id: rule.recurring_rule_id, row_version: rule.row_version, reason }, rule.row_version, "recurring.archiveRule"));
  const next = { ...current, status: "archived", ...nextVersionStamp(current, context.actor.user_id) };
  const updated = await db.execute("UPDATE commitments SET status='archived',row_version=?,updated_by=?,updated_at=? WHERE commitment_id=? AND row_version=?", [next.row_version,next.updated_by,next.updated_at,current.commitment_id,current.row_version]);
  if (updated.rowsAffected !== 1) throw appError("CONFLICT", "Komitmen berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "commitment", entityId: current.commitment_id, previous: publicRow(current, ["auto_debit"]), next: { ...publicRow(next, ["auto_debit"]), archive_reason: reason } });
  return publicRow(next, ["auto_debit"]);
};

export const recordCommitmentReceipt = async (db, context) => {
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM commitments WHERE commitment_id=?", [p.commitment_id]);
  if (!current) throw appError("COMMITMENT_NOT_FOUND", "Komitmen tidak ditemukan.", 404);
  assertOwnedAccess(context.actor, current);
  assertPlanningManageScope(context.actor, current, { allowOwnedPersonal: true });
  assertVersion(current, context.rowVersion ?? p.row_version);
  if (current.commitment_type !== "arisan" || current.status === "archived") throw appError("COMMITMENT_RECEIPT_NOT_ALLOWED", "Penerimaan hanya tersedia untuk Arisan aktif/selesai.", 409);
  const account = await accountWithAccess(db, context.actor, p.account_id);
  assertOperationalPlanningAccount(account, "penerimaan Arisan");
  const owned = ruleScopeFromAccount(account);
  if (owned.scope !== current.scope || String(owned.owner_user_id || "") !== String(current.owner_user_id || "")) throw appError("COMMITMENT_SCOPE_MISMATCH", "Rekening penerima harus memiliki kepemilikan yang sama dengan Arisan.", 409);
  const category = await activeIncomeCategory(db, p.category_id);
  const amount = movementAmount(p.amount, "Nominal penerimaan");
  const receiptRemaining = Math.max(0, Number(current.original_amount || 0) - Number(current.received_amount || 0));
  if (!receiptRemaining) throw appError("COMMITMENT_RECEIPT_COMPLETE", "Penerimaan Arisan sudah tercatat penuh.", 409);
  if (amount > receiptRemaining) throw appError("COMMITMENT_RECEIPT_EXCEEDS_EXPECTED", "Nominal penerimaan melebihi sisa hak Arisan.", 409);
  const transactionDate = dateValue(p.transaction_date, "Tanggal penerimaan");
  const transaction = await createTransactionInternal(db, { ...context, action: "commitments.recordReceipt" }, {
    transaction_type: "income", transaction_date: transactionDate, destination_account_id: account.account_id, category_id: category.category_id, amount,
    description: `Penerimaan ${current.name}`, payment_method: sanitizeText(p.payment_method || "transfer", 40), commitment_id: current.commitment_id, commitment_flow: "receipt",
  }, { allowInternalLinks: true, audit: false });
  const next = { ...current, received_amount: Number(current.received_amount || 0) + amount, received_at: transactionDate, ...nextVersionStamp(current, context.actor.user_id) };
  const updated = await db.execute("UPDATE commitments SET received_amount=?,received_at=?,row_version=?,updated_by=?,updated_at=? WHERE commitment_id=? AND row_version=?", [next.received_amount,next.received_at,next.row_version,next.updated_by,next.updated_at,current.commitment_id,current.row_version]);
  if (updated.rowsAffected !== 1) throw appError("CONFLICT", "Komitmen berubah di perangkat lain.", 409);
  const movement = { commitment_movement_id: uuid(), commitment_id: current.commitment_id, movement_type: "receipt", recurring_occurrence_id: null, transaction_id: transaction.transaction_id,
    amount, principal_amount: 0, interest_amount: 0, balance_before: Number(current.current_balance), balance_after: Number(current.current_balance), installments_delta: 0, principal_known: 1,
    status: "active", note: movementNote(p.note), created_by: context.actor.user_id, created_at: nowIso(), reversed_by: null, reversed_at: null };
  await db.execute(`INSERT INTO commitment_movements(commitment_movement_id,commitment_id,movement_type,recurring_occurrence_id,transaction_id,amount,principal_amount,interest_amount,balance_before,balance_after,installments_delta,principal_known,status,note,created_by,created_at,reversed_by,reversed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(movement));
  await appendAudit(db, context, { entityType: "commitment", entityId: current.commitment_id, previous: publicRow(current, ["auto_debit"]), next: { ...publicRow(next, ["auto_debit"]), receipt_transaction_id: transaction.transaction_id } });
  return { commitment: publicRow(next, ["auto_debit"]), transaction };
};
