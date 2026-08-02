import { appendAudit } from "./audit.js";
import { firstNegativeBalance } from "./readModels.js";
import {
  appError, assertVersion, boundedInteger, dateValue, nowIso, periodKey, positiveInteger, publicRow,
  sanitizeText, scopeFromAccountPair, uuid, visibleScopeSql,
} from "./core.js";

const TRANSACTION_TYPES = new Set(["income", "expense", "transfer", "refund", "adjustment"]);
const RESERVED_FIELDS = new Set(["recurring_occurrence_id","goal_id","scope","owner_user_id","idempotency_key","created_by","created_at","updated_by","updated_at","cancelled_by","cancelled_at","cancellation_reason","status"]);

const assertNoReservedFields = (payload, allowInternalLinks = false) => {
  if (allowInternalLinks) return;
  const field = Object.keys(payload || {}).find((key) => RESERVED_FIELDS.has(key));
  if (field) throw appError("RESERVED_TRANSACTION_FIELD", `Field internal transaksi tidak boleh dikirim: ${field}.`, 400, { field });
};

const transactionLockingClosure = async (db, date) => db.one("SELECT closure_id,period_key FROM period_closures WHERE status='closed' AND period_key >= ? ORDER BY period_key LIMIT 1", [String(date).slice(0,7)]);
export const isTransactionDateLocked = async (db, date) => Boolean(await transactionLockingClosure(db, date));
export const assertTransactionDateUnlocked = async (db, date) => {
  const closure = await transactionLockingClosure(db, date);
  if (closure) throw appError("PERIOD_CLOSED", `Transaksi periode ${String(date).slice(0,7)} dikunci karena periode ${closure.period_key} sudah ditutup.`, 409, { closureId: closure.closure_id, lockingPeriod: closure.period_key });
};

const activeAccount = async (db, actor, accountId) => {
  const account = await db.one("SELECT * FROM accounts WHERE account_id=? AND status='active'", [accountId]);
  if (!account) throw appError("INVALID_ACCOUNT", "Rekening tidak ditemukan atau tidak aktif.", 400);
  if (actor.role !== "owner" && account.owner_scope === "personal" && account.owner_user_id !== actor.user_id) throw appError("FORBIDDEN_ACCOUNT", "Rekening pribadi ini bukan milik pengguna aktif.", 403);
  return account;
};

const activeCategory = async (db, categoryId, type) => {
  if (!categoryId) return null;
  const category = await db.one("SELECT * FROM categories WHERE category_id=? AND status='active'", [categoryId]);
  if (!category) throw appError("INVALID_CATEGORY", "Kategori tidak ditemukan atau tidak aktif.", 400);
  const allowedTypes = type === "refund" ? new Set(["expense", "refund"]) : new Set([type]);
  if (!allowedTypes.has(category.transaction_type)) throw appError("CATEGORY_TYPE_MISMATCH", "Kategori tidak sesuai jenis transaksi.", 400);
  return category;
};

const assertAccountDate = (account, transactionDate) => {
  if (transactionDate < account.initial_balance_date) throw appError("TRANSACTION_BEFORE_INITIAL_BALANCE", "Tanggal transaksi tidak boleh sebelum tanggal saldo awal rekening.", 409, { accountId: account.account_id, initialBalanceDate: account.initial_balance_date, transactionDate });
};

const assertCanModify = (context, transaction) => {
  if (transaction.transaction_type === "adjustment" && context.actor.role !== "owner") throw appError("ADJUSTMENT_OWNER_ONLY", "Penyesuaian saldo hanya dapat diubah owner.", 403);
  if (context.actor.role !== "owner" && transaction.created_by !== context.actor.user_id) throw appError("FORBIDDEN", "Member hanya dapat mengubah transaksi yang dibuat sendiri.", 403);
  if (transaction.recurring_occurrence_id) throw appError("LINKED_RECURRING_TRANSACTION", "Koreksi transaksi rutin harus dilakukan melalui menu Tagihan.", 409, { occurrenceId: transaction.recurring_occurrence_id });
  if (transaction.goal_id) throw appError("LINKED_GOAL_TRANSACTION", "Koreksi transaksi target harus dilakukan melalui menu Target.", 409, { goalId: transaction.goal_id });
};

const transactionCapabilities = async (db, context, transaction) => {
  const active = transaction.status === "active";
  const linked = Boolean(transaction.recurring_occurrence_id || transaction.goal_id);
  const ownerOrCreator = context.actor.role === "owner" || transaction.created_by === context.actor.user_id;
  const adjustmentAllowed = transaction.transaction_type !== "adjustment" || context.actor.role === "owner";
  const periodOpen = !(await isTransactionDateLocked(db, transaction.transaction_date));
  return {
    can_edit: Boolean(active && periodOpen && !linked && ownerOrCreator && adjustmentAllowed),
    can_cancel: Boolean(active && periodOpen && !linked && ownerOrCreator && adjustmentAllowed),
    period_closed: Boolean(active && !periodOpen),
    managed_by: transaction.recurring_occurrence_id ? "recurring" : transaction.goal_id ? "goal" : "",
  };
};

const validateEnvelope = async (db, context, transaction, { excludeTransactionId = null } = {}) => {
  if (transaction.transaction_type !== "expense" || !transaction.envelope_period_id) return;
  const row = await db.one(`SELECT p.*,r.scope,r.owner_user_id,r.overspend_policy,r.source_account_id
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    WHERE p.envelope_period_id=? AND p.status='active' AND r.status='active'`, [transaction.envelope_period_id]);
  if (!row) throw appError("INVALID_ENVELOPE", "Kantong tidak ditemukan atau tidak aktif.", 400);
  if (transaction.transaction_date < row.period_start || transaction.transaction_date > row.period_end) throw appError("ENVELOPE_DATE_MISMATCH", "Tanggal transaksi berada di luar periode kantong.", 409);
  if (row.scope !== transaction.scope || String(row.owner_user_id || "") !== String(transaction.owner_user_id || "")) throw appError("ENVELOPE_SCOPE_MISMATCH", "Kantong dan rekening transaksi harus memiliki kepemilikan yang sama.", 409);
  const usage = await db.one(`SELECT COALESCE(SUM(amount),0) AS used FROM transactions
    WHERE status='active' AND transaction_type='expense' AND envelope_period_id=? ${excludeTransactionId ? "AND transaction_id<>?" : ""}`, [row.envelope_period_id, ...(excludeTransactionId ? [excludeTransactionId] : [])]);
  const remaining = Number(row.allocated_amount) - Number(row.reserved_amount) - Number(usage?.used || 0);
  if (transaction.amount > remaining) {
    if (row.overspend_policy === "block") throw appError("ENVELOPE_LIMIT", "Nominal melebihi sisa kantong.", 409, { remainingAmount: remaining });
    if (row.overspend_policy === "confirm" && !transaction.overspend_reason) throw appError("OVERSPEND_REASON_REQUIRED", "Alasan melebihi alokasi wajib diisi.", 409, { remainingAmount: remaining });
  }
};

const duplicateTransaction = async (db, transaction, excludeTransactionId = null) => db.one(`SELECT transaction_id FROM transactions
  WHERE status='active' AND transaction_date=? AND transaction_type=? AND COALESCE(source_account_id,'')=COALESCE(?,'')
    AND COALESCE(destination_account_id,'')=COALESCE(?,'') AND amount=? AND lower(description)=lower(?)
    ${excludeTransactionId ? "AND transaction_id<>?" : ""} LIMIT 1`, [transaction.transaction_date, transaction.transaction_type, transaction.source_account_id, transaction.destination_account_id, transaction.amount, transaction.description, ...(excludeTransactionId ? [excludeTransactionId] : [])]);

const assertSufficientBalance = async (db, account, transaction, excludeTransactionId = null) => {
  if (!account || Boolean(account.allow_negative)) return;
  const issue = await firstNegativeBalance(db, account, { excludeTransactionId, candidate: transaction, fromDate: transaction.transaction_date });
  if (issue) throw appError("INSUFFICIENT_BALANCE", `Saldo rekening tidak mencukupi pada proyeksi tanggal ${issue.date}.`, 409, { accountId: account.account_id, offendingDate: issue.date, balanceAfter: issue.balance });
};

export const assertAffectedBalances = async (db, current, candidate = null) => {
  const accountIds = [...new Set([
    current?.source_account_id, current?.destination_account_id,
    candidate?.source_account_id, candidate?.destination_account_id,
  ].filter(Boolean))];
  const fromDate = [current?.transaction_date, candidate?.transaction_date].filter(Boolean).sort()[0];
  for (const accountId of accountIds) {
    const account = await db.one("SELECT * FROM accounts WHERE account_id=?", [accountId]);
    if (!account || Boolean(account.allow_negative)) continue;
    const issue = await firstNegativeBalance(db, account, {
      excludeTransactionId: current?.transaction_id || null,
      candidate: candidate ? {
        ...candidate,
        status: "active",
        created_at: current?.created_at || candidate.created_at,
        transaction_id: current?.transaction_id || candidate.transaction_id,
      } : null,
      fromDate: fromDate || account.initial_balance_date,
    });
    if (issue) throw appError("INSUFFICIENT_BALANCE", `Perubahan membuat saldo rekening negatif pada ${issue.date}.`, 409, { accountId, offendingDate: issue.date, balanceAfter: issue.balance });
  }
};

export const normalizeTransaction = async (db, context, payload, { current = null, allowInternalLinks = false } = {}) => {
  assertNoReservedFields(payload, allowInternalLinks);
  const type = String(payload.transaction_type ?? current?.transaction_type ?? "expense");
  if (!TRANSACTION_TYPES.has(type)) throw appError("INVALID_TRANSACTION_TYPE", "Jenis transaksi tidak valid.", 400);
  if (type === "adjustment") {
    if (context.actor.role !== "owner") throw appError("ADJUSTMENT_OWNER_ONLY", "Penyesuaian saldo hanya dapat dibuat owner.", 403);
    if (!sanitizeText(payload.description ?? current?.description, 250)) throw appError("ADJUSTMENT_REASON_REQUIRED", "Alasan penyesuaian saldo wajib diisi.", 400);
  }
  if (current && type !== current.transaction_type && (type === "adjustment" || current.transaction_type === "adjustment")) throw appError("ADJUSTMENT_TYPE_IMMUTABLE", "Jenis adjustment tidak dapat diubah. Batalkan lalu buat koreksi baru.", 409);
  const transactionDate = dateValue(payload.transaction_date ?? current?.transaction_date ?? context.today, "Tanggal transaksi");
  await assertTransactionDateUnlocked(db, transactionDate);
  if (current) await assertTransactionDateUnlocked(db, current.transaction_date);
  const amount = positiveInteger(payload.amount ?? current?.amount, "Nominal transaksi");
  const sourceId = String(payload.source_account_id ?? current?.source_account_id ?? "") || null;
  const destinationId = String(payload.destination_account_id ?? current?.destination_account_id ?? "") || null;
  let source = null; let destination = null;
  if (!["income", "refund"].includes(type)) source = await activeAccount(db, context.actor, sourceId);
  if (["income", "refund", "transfer"].includes(type)) destination = await activeAccount(db, context.actor, destinationId);
  if (type === "transfer" && source.account_id === destination.account_id) throw appError("SAME_TRANSFER_ACCOUNT", "Rekening sumber dan tujuan harus berbeda.", 400);
  if (source) assertAccountDate(source, transactionDate);
  if (destination) assertAccountDate(destination, transactionDate);
  const owned = scopeFromAccountPair(source, destination);
  const categoryId = ["transfer", "adjustment"].includes(type) ? null : String(payload.category_id ?? current?.category_id ?? "") || null;
  if (["income", "expense", "refund"].includes(type) && !categoryId) throw appError("CATEGORY_REQUIRED", "Kategori transaksi wajib dipilih.", 400);
  await activeCategory(db, categoryId, type);
  const record = {
    transaction_date: transactionDate, transaction_type: type,
    source_account_id: source?.account_id || null, destination_account_id: destination?.account_id || null,
    category_id: categoryId, envelope_period_id: type === "expense" ? (String(payload.envelope_period_id ?? current?.envelope_period_id ?? "") || null) : null,
    recurring_occurrence_id: allowInternalLinks ? (String(payload.recurring_occurrence_id ?? current?.recurring_occurrence_id ?? "") || null) : current?.recurring_occurrence_id || null,
    goal_id: allowInternalLinks ? (String(payload.goal_id ?? current?.goal_id ?? "") || null) : current?.goal_id || null,
    amount, description: sanitizeText(payload.description ?? current?.description, 250),
    overspend_reason: sanitizeText(payload.overspend_reason ?? current?.overspend_reason, 180),
    merchant: sanitizeText(payload.merchant ?? current?.merchant, 120),
    payment_method: sanitizeText(payload.payment_method ?? current?.payment_method, 40),
    scope: owned.scope, owner_user_id: owned.owner_user_id,
  };
  await validateEnvelope(db, context, record, { excludeTransactionId: current?.transaction_id || null });
  await assertSufficientBalance(db, source, { ...record, status: "active" }, current?.transaction_id || null);
  const duplicate = await duplicateTransaction(db, record, current?.transaction_id || null);
  if (duplicate && payload.confirm_duplicate !== true) throw appError("POSSIBLE_DUPLICATE", "Transaksi mirip sudah tercatat. Konfirmasi diperlukan.", 409, { transactionId: duplicate.transaction_id });
  return record;
};

export const createTransactionInternal = async (db, context, payload, { allowInternalLinks = false, audit = true } = {}) => {
  const normalized = await normalizeTransaction(db, context, payload, { allowInternalLinks });
  const timestamp = nowIso();
  const record = {
    transaction_id: uuid(), ...normalized, status: "active", row_version: 1, idempotency_key: context.idempotencyKey || `internal:${uuid()}`,
    created_by: context.actor.user_id, created_at: timestamp, updated_by: context.actor.user_id, updated_at: timestamp,
    cancelled_by: null, cancelled_at: null, cancellation_reason: "",
  };
  await db.execute(`INSERT INTO transactions(transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,recurring_occurrence_id,goal_id,amount,description,overspend_reason,merchant,payment_method,scope,owner_user_id,status,row_version,idempotency_key,created_by,created_at,updated_by,updated_at,cancelled_by,cancelled_at,cancellation_reason)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  if (audit) await appendAudit(db, context, { entityType: "transaction", entityId: record.transaction_id, next: publicRow(record) });
  await context.enqueueMirror?.(db, "transaction", record.transaction_id);
  return publicRow(record);
};

export const createTransaction = (db, context) => createTransactionInternal(db, context, context.payload || {});

export const updateTransaction = async (db, context) => {
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM transactions WHERE transaction_id=? AND status='active'", [payload.transaction_id]);
  if (!current) throw appError("NOT_FOUND", "Transaksi aktif tidak ditemukan.", 404);
  assertCanModify(context, current);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const normalized = await normalizeTransaction(db, context, payload, { current });
  await assertAffectedBalances(db, current, normalized);
  const next = { ...current, ...normalized, row_version: Number(current.row_version)+1, updated_by: context.actor.user_id, updated_at: nowIso() };
  const result = await db.execute(`UPDATE transactions SET transaction_date=?,transaction_type=?,source_account_id=?,destination_account_id=?,category_id=?,envelope_period_id=?,amount=?,description=?,overspend_reason=?,merchant=?,payment_method=?,scope=?,owner_user_id=?,row_version=?,updated_by=?,updated_at=?
    WHERE transaction_id=? AND row_version=? AND status='active'`, [next.transaction_date,next.transaction_type,next.source_account_id,next.destination_account_id,next.category_id,next.envelope_period_id,next.amount,next.description,next.overspend_reason,next.merchant,next.payment_method,next.scope,next.owner_user_id,next.row_version,next.updated_by,next.updated_at,current.transaction_id,current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Transaksi berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType:"transaction", entityId:current.transaction_id, previous:publicRow(current), next:publicRow(next) });
  await context.enqueueMirror?.(db,"transaction",current.transaction_id);
  return publicRow(next);
};

export const cancelTransactionInternal = async (db, context, transaction, reason, { allowLinked = false, audit = true } = {}) => {
  if (!allowLinked) assertCanModify(context, transaction);
  await assertTransactionDateUnlocked(db, transaction.transaction_date);
  const cleanReason = sanitizeText(reason, 200);
  if (!cleanReason) throw appError("REASON_REQUIRED", "Alasan pembatalan wajib diisi.", 400);
  await assertAffectedBalances(db, transaction, null);
  const next = { ...transaction, status:"cancelled", cancelled_by:context.actor.user_id, cancelled_at:nowIso(), cancellation_reason:cleanReason, row_version:Number(transaction.row_version)+1, updated_by:context.actor.user_id, updated_at:nowIso() };
  const result = await db.execute("UPDATE transactions SET status='cancelled',cancelled_by=?,cancelled_at=?,cancellation_reason=?,row_version=?,updated_by=?,updated_at=? WHERE transaction_id=? AND row_version=? AND status='active'", [next.cancelled_by,next.cancelled_at,next.cancellation_reason,next.row_version,next.updated_by,next.updated_at,transaction.transaction_id,transaction.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Transaksi berubah di perangkat lain.",409);
  if (audit) await appendAudit(db, context, { action:context.action, entityType:"transaction", entityId:transaction.transaction_id, previous:publicRow(transaction), next:publicRow(next) });
  await context.enqueueMirror?.(db,"transaction",transaction.transaction_id);
  return publicRow(next);
};

export const cancelTransaction = async (db, context) => {
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM transactions WHERE transaction_id=? AND status='active'", [payload.transaction_id || payload.transactionId]);
  if (!current) throw appError("NOT_FOUND", "Transaksi aktif tidak ditemukan.",404);
  assertVersion(current, context.rowVersion ?? payload.row_version ?? payload.rowVersion);
  return cancelTransactionInternal(db, context, current, payload.reason);
};

export const listTransactions = async (db, context) => {
  const payload = context.payload || {};
  const period = periodKey(payload.period);
  const limit = boundedInteger(payload.limit, 20, 1, 200, "Limit transaksi");
  const offset = boundedInteger(payload.offset, 0, 0, 100000, "Offset transaksi");
  const query = sanitizeText(payload.query, 100).toLowerCase();
  const type = String(payload.transaction_type || "all");
  const allocation = String(payload.allocation || "all");
  const accountId = sanitizeText(payload.account_id, 100);
  const categoryId = sanitizeText(payload.category_id, 100);
  const createdBy = sanitizeText(payload.created_by, 100);

  if (!["all", ...TRANSACTION_TYPES].includes(type)) throw appError("INVALID_TRANSACTION_TYPE", "Filter jenis transaksi tidak valid.", 400);
  if (!["all", "allocated", "unallocated"].includes(allocation)) throw appError("INVALID_ALLOCATION_FILTER", "Filter alokasi tidak valid.", 400);

  const access = visibleScopeSql(context.actor, "t");
  const baseConditions = ["substr(t.transaction_date,1,7)=?", access.sql];
  const baseArgs = [period, ...access.args];
  const conditions = [...baseConditions];
  const args = [...baseArgs];

  if (type !== "all") {
    conditions.push("t.transaction_type=?");
    args.push(type);
  }
  if (allocation === "allocated") conditions.push("(t.transaction_type<>'expense' OR t.envelope_period_id IS NOT NULL)");
  if (allocation === "unallocated") conditions.push("t.transaction_type='expense' AND t.envelope_period_id IS NULL");
  if (accountId && accountId !== "all") {
    conditions.push("(t.source_account_id=? OR t.destination_account_id=?)");
    args.push(accountId, accountId);
  }
  if (categoryId && categoryId !== "all") {
    conditions.push("t.category_id=?");
    args.push(categoryId);
  }
  if (createdBy && createdBy !== "all") {
    conditions.push("t.created_by=?");
    args.push(createdBy === "me" ? context.actor.user_id : createdBy);
  }
  if (query) {
    conditions.push("(lower(t.description) LIKE ? OR lower(t.merchant) LIKE ? OR lower(COALESCE(c.name,'')) LIKE ?)");
    args.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }

  const [count, rows, filterAccounts, filterCategories, filterCreators] = await Promise.all([
    db.one(`SELECT COUNT(*) AS total FROM transactions t LEFT JOIN categories c ON c.category_id=t.category_id WHERE ${conditions.join(" AND ")}`, args),
    db.all(`SELECT t.* FROM transactions t LEFT JOIN categories c ON c.category_id=t.category_id WHERE ${conditions.join(" AND ")}
      ORDER BY t.transaction_date DESC,t.created_at DESC LIMIT ? OFFSET ?`, [...args, limit, offset]),
    db.all(`SELECT DISTINCT a.account_id,a.name
      FROM accounts a JOIN transactions t ON t.source_account_id=a.account_id OR t.destination_account_id=a.account_id
      WHERE ${baseConditions.join(" AND ")} ORDER BY a.name COLLATE NOCASE`, baseArgs),
    db.all(`SELECT DISTINCT c.category_id,c.name
      FROM categories c JOIN transactions t ON t.category_id=c.category_id
      WHERE ${baseConditions.join(" AND ")} ORDER BY c.name COLLATE NOCASE`, baseArgs),
    db.all(`SELECT DISTINCT u.user_id,u.name
      FROM users u JOIN transactions t ON t.created_by=u.user_id
      WHERE ${baseConditions.join(" AND ")} ORDER BY u.name COLLATE NOCASE`, baseArgs),
  ]);

  const items = [];
  for (const row of rows) items.push({ ...publicRow(row), ...(await transactionCapabilities(db, context, row)) });
  const total = Number(count?.total || 0);
  return {
    items,
    total,
    offset,
    limit,
    hasMore: offset + items.length < total,
    nextOffset: offset + items.length,
    periodLocked: await isTransactionDateLocked(db, `${period}-01`),
    filterOptions: {
      accounts: filterAccounts.map((row) => publicRow(row)),
      categories: filterCategories.map((row) => publicRow(row)),
      creators: filterCreators.map((row) => publicRow(row)),
    },
  };
};
