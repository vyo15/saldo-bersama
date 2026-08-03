import { appendAudit } from "./audit.js";
import { accountBalanceAsOf, firstNegativeBalance, visibleAccounts } from "./readModels.js";
import { appError, assertOwner, assertVersion, dateValue, normalizeOwnedScope, nowIso, publicRow, sanitizeText, strictBoolean, uuid } from "./core.js";

const ACCOUNT_TYPES = new Set(["cash", "bank", "ewallet", "savings", "emergency_fund", "sinking_fund", "investment", "other"]);
const CATEGORY_TYPES = new Set(["income", "expense", "refund"]);
const CATEGORY_NATURES = new Set(["fixed", "variable", "unexpected", "discretionary", "emergency", "savings", "other"]);

const ACCOUNT_NUMBER_MIN_LENGTH = 6;
const ACCOUNT_NUMBER_MAX_LENGTH = 34;

const normalizeAccountNumber = (value, accountType, { required = false } = {}) => {
  const raw = sanitizeText(value, 64);
  if (!raw) {
    if (required && accountType === "bank") throw appError("ACCOUNT_NUMBER_REQUIRED", "Nomor rekening bank wajib diisi.", 400);
    return "";
  }
  if (accountType !== "bank") throw appError("ACCOUNT_NUMBER_BANK_ONLY", "Nomor rekening hanya dapat disimpan untuk jenis rekening bank.", 400);
  if (!/^[0-9\s-]+$/.test(raw)) throw appError("INVALID_ACCOUNT_NUMBER", "Nomor rekening hanya boleh berisi angka, spasi, atau tanda hubung.", 400);
  const digits = raw.replace(/\D/g, "");
  if (digits.length < ACCOUNT_NUMBER_MIN_LENGTH || digits.length > ACCOUNT_NUMBER_MAX_LENGTH) {
    throw appError("INVALID_ACCOUNT_NUMBER", `Nomor rekening harus terdiri dari ${ACCOUNT_NUMBER_MIN_LENGTH}-${ACCOUNT_NUMBER_MAX_LENGTH} digit.`, 400);
  }
  return digits;
};

const accountAuditRow = (row) => {
  const result = publicRow(row, ["allow_negative"]);
  const accountNumber = String(result.account_number || "");
  result.account_number = accountNumber ? `••••${accountNumber.slice(-4)}` : "";
  return result;
};

export const listAccounts = async (db, context) => ({ items: await visibleAccounts(db, context.actor) });

export const createAccount = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const name = sanitizeText(payload.name, 120);
  const type = String(payload.account_type || "bank");
  if (!name) throw appError("NAME_REQUIRED", "Nama rekening wajib diisi.", 400);
  if (!ACCOUNT_TYPES.has(type)) throw appError("INVALID_ACCOUNT_TYPE", "Jenis rekening tidak valid.", 400);
  const owned = await normalizeOwnedScope(db, context.actor, { scope: payload.owner_scope || payload.scope, owner_user_id: payload.owner_user_id });
  const initialBalance = Number(payload.initial_balance || 0);
  if (!Number.isSafeInteger(initialBalance)) throw appError("INVALID_AMOUNT", "Saldo awal harus integer Rupiah.", 400);
  const allowNegative = strictBoolean(payload.allow_negative, false);
  if (initialBalance < 0 && !allowNegative) throw appError("NEGATIVE_INITIAL_BALANCE_NOT_ALLOWED", "Saldo awal negatif hanya boleh digunakan jika rekening mengizinkan saldo minus.", 409);
  const initialDate = dateValue(payload.initial_balance_date || context.today, "Tanggal saldo awal");
  const accountNumber = normalizeAccountNumber(payload.account_number, type, { required: type === "bank" });
  const duplicate = await db.one("SELECT account_id FROM accounts WHERE lower(name)=lower(?) AND status='active' AND owner_scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'')", [name, owned.scope, owned.owner_user_id]);
  if (duplicate) throw appError("DUPLICATE_ACCOUNT", "Rekening aktif dengan nama dan kepemilikan yang sama sudah ada.", 409);
  const timestamp = nowIso();
  const record = {
    account_id: uuid(), name, account_type: type, account_number: accountNumber, owner_scope: owned.scope, owner_user_id: owned.owner_user_id,
    initial_balance: initialBalance, initial_balance_date: initialDate, allow_negative: allowNegative ? 1 : 0,
    status: "active", row_version: 1, created_by: context.actor.user_id, created_at: timestamp, updated_by: context.actor.user_id, updated_at: timestamp,
  };
  await db.execute(`INSERT INTO accounts(account_id,name,account_type,account_number,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  await appendAudit(db, context, { entityType: "account", entityId: record.account_id, next: accountAuditRow(record) });
  await context.enqueueMirror?.(db, "account", record.account_id);
  return publicRow(record, ["allow_negative"]);
};

export const updateAccount = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM accounts WHERE account_id=?", [payload.account_id]);
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Rekening aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const owned = await normalizeOwnedScope(db, context.actor, { scope: payload.owner_scope, owner_user_id: payload.owner_user_id }, { scope: current.owner_scope, owner_user_id: current.owner_user_id });
  const dependencies = await db.one(`SELECT
    (SELECT COUNT(*) FROM transactions WHERE status='active' AND (source_account_id=? OR destination_account_id=?)) AS transactions,
    (SELECT COUNT(*) FROM envelope_rules WHERE status='active' AND source_account_id=?) AS envelopes,
    (SELECT COUNT(*) FROM recurring_rules WHERE status='active' AND default_account_id=?) AS recurring,
    (SELECT COUNT(*) FROM savings_goals WHERE status='active' AND account_id=?) AS goals`, [current.account_id,current.account_id,current.account_id,current.account_id,current.account_id]);
  if ((current.owner_scope !== owned.scope || String(current.owner_user_id || "") !== String(owned.owner_user_id || "")) && Object.values(dependencies).some((value) => Number(value) > 0)) {
    throw appError("ACCOUNT_SCOPE_LOCKED", "Kepemilikan rekening tidak dapat diubah karena sudah memiliki data terkait.", 409, dependencies);
  }
  const nextAccountType = payload.account_type === undefined ? current.account_type : String(payload.account_type);
  const next = {
    ...current,
    name: sanitizeText(payload.name === undefined ? current.name : payload.name, 120),
    account_type: nextAccountType,
    account_number: payload.account_number === undefined ? String(current.account_number || "") : normalizeAccountNumber(payload.account_number, nextAccountType, { required: nextAccountType === "bank" }),
    owner_scope: owned.scope, owner_user_id: owned.owner_user_id,
    allow_negative: payload.allow_negative === undefined ? current.allow_negative : (strictBoolean(payload.allow_negative) ? 1 : 0),
    row_version: Number(current.row_version) + 1, updated_by: context.actor.user_id, updated_at: nowIso(),
  };
  if (!next.name) throw appError("NAME_REQUIRED", "Nama rekening wajib diisi.", 400);
  if (!ACCOUNT_TYPES.has(next.account_type)) throw appError("INVALID_ACCOUNT_TYPE", "Jenis rekening tidak valid.", 400);
  const duplicate = await db.one("SELECT account_id FROM accounts WHERE account_id<>? AND lower(name)=lower(?) AND status='active' AND owner_scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'')", [current.account_id, next.name, next.owner_scope, next.owner_user_id]);
  if (duplicate) throw appError("DUPLICATE_ACCOUNT", "Rekening aktif dengan nama dan kepemilikan yang sama sudah ada.", 409);
  if (Number(current.allow_negative) === 1 && Number(next.allow_negative) === 0) {
    const negative = await firstNegativeBalance(db, current, { fromDate: current.initial_balance_date });
    if (negative) throw appError("ACCOUNT_HAS_NEGATIVE_HISTORY", "Izin saldo minus tidak dapat dimatikan karena histori rekening pernah negatif.", 409, negative);
  }
  const result = await db.execute(`UPDATE accounts SET name=?,account_type=?,account_number=?,owner_scope=?,owner_user_id=?,allow_negative=?,row_version=?,updated_by=?,updated_at=?
    WHERE account_id=? AND row_version=?`, [next.name,next.account_type,next.account_number,next.owner_scope,next.owner_user_id,next.allow_negative,next.row_version,next.updated_by,next.updated_at,current.account_id,current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Rekening berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "account", entityId: current.account_id, previous: accountAuditRow(current), next: accountAuditRow(next) });
  await context.enqueueMirror?.(db, "account", current.account_id);
  return publicRow(next, ["allow_negative"]);
};

export const archiveAccount = async (db, context) => {
  assertOwner(context.actor);
  const current = await db.one("SELECT * FROM accounts WHERE account_id=?", [context.payload?.account_id]);
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Rekening aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? context.payload?.row_version);
  const dependencies = await db.one(`SELECT
    (SELECT COUNT(*) FROM transactions WHERE status='active' AND (source_account_id=? OR destination_account_id=?)) AS transactions,
    (SELECT COUNT(*) FROM envelope_rules WHERE status='active' AND source_account_id=?) AS envelopes,
    (SELECT COUNT(*) FROM recurring_rules WHERE status='active' AND default_account_id=?) AS recurring,
    (SELECT COUNT(*) FROM savings_goals WHERE status IN ('active','completed') AND account_id=?) AS goals`, [current.account_id,current.account_id,current.account_id,current.account_id,current.account_id]);
  if (Object.values(dependencies).some((value) => Number(value) > 0)) throw appError("ACCOUNT_IN_USE", "Rekening masih dipakai data aktif.", 409, dependencies);
  const currentBalance = await accountBalanceAsOf(db, current, context.today || nowIso().slice(0, 10));
  if (currentBalance !== 0) throw appError("ACCOUNT_NON_ZERO_BALANCE", "Rekening hanya dapat diarsipkan setelah saldonya menjadi nol.", 409, { currentBalance });
  const next = { ...current, status: "archived", row_version: Number(current.row_version)+1, updated_by: context.actor.user_id, updated_at: nowIso() };
  const result = await db.execute("UPDATE accounts SET status='archived',row_version=?,updated_by=?,updated_at=? WHERE account_id=? AND row_version=?", [next.row_version,next.updated_by,next.updated_at,current.account_id,current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Rekening berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "account", entityId: current.account_id, previous: accountAuditRow(current), next: accountAuditRow(next) });
  await context.enqueueMirror?.(db, "account", current.account_id);
  return publicRow(next, ["allow_negative"]);
};

export const listCategories = async (db) => ({ items: (await db.all("SELECT * FROM categories WHERE status='active' ORDER BY transaction_type,name COLLATE NOCASE")).map((row) => publicRow(row)) });

export const createCategory = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const name = sanitizeText(payload.name, 100);
  const type = String(payload.transaction_type || "expense");
  const nature = String(payload.nature || "variable");
  if (!name) throw appError("NAME_REQUIRED", "Nama kategori wajib diisi.", 400);
  if (!CATEGORY_TYPES.has(type)) throw appError("INVALID_CATEGORY_TYPE", "Jenis kategori tidak valid.", 400);
  if (!CATEGORY_NATURES.has(nature)) throw appError("INVALID_CATEGORY_NATURE", "Sifat kategori tidak valid.", 400);
  const duplicate = await db.one("SELECT category_id FROM categories WHERE lower(name)=lower(?) AND transaction_type=? AND status='active'", [name,type]);
  if (duplicate) throw appError("DUPLICATE_CATEGORY", "Kategori aktif dengan nama yang sama sudah ada.", 409);
  const timestamp = nowIso();
  const record = { category_id: uuid(), name, transaction_type: type, nature, icon: sanitizeText(payload.icon, 40), status: "active", row_version: 1, created_by: context.actor.user_id, created_at: timestamp, updated_by: context.actor.user_id, updated_at: timestamp };
  await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", Object.values(record));
  await appendAudit(db, context, { entityType: "category", entityId: record.category_id, next: publicRow(record) });
  await context.enqueueMirror?.(db, "category", record.category_id);
  return publicRow(record);
};

export const updateCategory = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM categories WHERE category_id=?", [payload.category_id]);
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Kategori aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const next = { ...current, name: sanitizeText(payload.name === undefined ? current.name : payload.name,100), transaction_type: payload.transaction_type === undefined ? current.transaction_type : String(payload.transaction_type), nature: payload.nature === undefined ? current.nature : String(payload.nature), icon: sanitizeText(payload.icon === undefined ? current.icon : payload.icon,40), row_version: Number(current.row_version)+1, updated_by: context.actor.user_id, updated_at: nowIso() };
  if (!next.name || !CATEGORY_TYPES.has(next.transaction_type) || !CATEGORY_NATURES.has(next.nature)) throw appError("INVALID_CATEGORY", "Data kategori tidak valid.", 400);
  const duplicate = await db.one("SELECT category_id FROM categories WHERE category_id<>? AND lower(name)=lower(?) AND transaction_type=? AND status='active'", [current.category_id, next.name, next.transaction_type]);
  if (duplicate) throw appError("DUPLICATE_CATEGORY", "Kategori aktif dengan nama dan jenis yang sama sudah ada.", 409);
  if (next.transaction_type !== current.transaction_type) {
    const usage = await db.one("SELECT COUNT(*) AS count FROM transactions WHERE category_id=?", [current.category_id]);
    if (Number(usage?.count || 0)) throw appError("CATEGORY_TYPE_LOCKED", "Jenis kategori tidak dapat diubah setelah digunakan transaksi.", 409);
  }
  const result = await db.execute("UPDATE categories SET name=?,transaction_type=?,nature=?,icon=?,row_version=?,updated_by=?,updated_at=? WHERE category_id=? AND row_version=?", [next.name,next.transaction_type,next.nature,next.icon,next.row_version,next.updated_by,next.updated_at,current.category_id,current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Kategori berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "category", entityId: current.category_id, previous: publicRow(current), next: publicRow(next) });
  await context.enqueueMirror?.(db, "category", current.category_id);
  return publicRow(next);
};

export const archiveCategory = async (db, context) => {
  assertOwner(context.actor);
  const current = await db.one("SELECT * FROM categories WHERE category_id=?", [context.payload?.category_id]);
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Kategori aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? context.payload?.row_version);
  const dependencies = await db.one(`SELECT
    (SELECT COUNT(*) FROM transactions WHERE status='active' AND category_id=?) AS transactions,
    (SELECT COUNT(*) FROM recurring_rules WHERE status='active' AND category_id=?) AS recurring,
    (SELECT COUNT(*) FROM budgets WHERE status='active' AND category_id=?) AS budgets`, [current.category_id,current.category_id,current.category_id]);
  if (Object.values(dependencies).some((value) => Number(value)>0)) throw appError("CATEGORY_IN_USE", "Kategori masih dipakai data aktif.", 409, dependencies);
  const next = { ...current, status:"archived", row_version:Number(current.row_version)+1, updated_by:context.actor.user_id, updated_at:nowIso() };
  const result = await db.execute("UPDATE categories SET status='archived',row_version=?,updated_by=?,updated_at=? WHERE category_id=? AND row_version=?", [next.row_version,next.updated_by,next.updated_at,current.category_id,current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Kategori berubah di perangkat lain.",409);
  await appendAudit(db, context, { entityType:"category", entityId:current.category_id, previous:publicRow(current), next:publicRow(next) });
  await context.enqueueMirror?.(db,"category",current.category_id);
  return publicRow(next);
};
