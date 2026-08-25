import { readBatchRows } from "../../db/readBatchRows.js";
import { ACCOUNT_TYPE_VALUES, BANK_TEMPLATE_VALUES, EWALLET_TEMPLATE_VALUES } from "../../domainConstants.js";
import { appendAudit } from "../audit.js";
import { accountBalanceAsOf, firstNegativeBalance, visibleAccounts } from "../readModels.js";
import { appError, assertOwner, assertVersion, dateValue, normalizeOwnedScope, nowIso, publicRow, sanitizeText, strictBoolean, uuid } from "../core.js";
import { newVersionStamp, nextVersionStamp } from "../versioning.js";
import { numericCounts } from "./shared.js";

const ACCOUNT_TYPES = new Set(ACCOUNT_TYPE_VALUES);
const BANK_TEMPLATES = new Set(BANK_TEMPLATE_VALUES);
const EWALLET_TEMPLATES = new Set(EWALLET_TEMPLATE_VALUES);
const ACCOUNT_NUMBER_MIN_LENGTH = 6;
const ACCOUNT_NUMBER_MAX_LENGTH = 34;

// Account lifecycle checks intentionally include historical dependencies. An account
// that was ever used is archived/recovered, not silently converted into "unused" data.
const normalizeBankTemplate = (value, accountType) => {
  const template = sanitizeText(value, 24).toLowerCase() || "generic";
  if (!BANK_TEMPLATES.has(template)) throw appError("INVALID_BANK_TEMPLATE", "Template kartu bank tidak valid.", 400);
  if (accountType !== "bank" && template !== "generic") throw appError("BANK_TEMPLATE_BANK_ONLY", "Template kartu hanya dapat dipakai untuk rekening bank.", 400);
  return accountType === "bank" ? template : "generic";
};

const normalizeEwalletTemplate = (value, accountType) => {
  const template = sanitizeText(value, 24).toLowerCase() || "generic";
  if (!EWALLET_TEMPLATES.has(template)) throw appError("INVALID_EWALLET_TEMPLATE", "Provider E-wallet tidak valid.", 400);
  if (accountType !== "ewallet" && template !== "generic") throw appError("EWALLET_TEMPLATE_EWALLET_ONLY", "Provider E-wallet hanya dapat dipakai untuk rekening E-wallet.", 400);
  return accountType === "ewallet" ? template : "generic";
};

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

export const accountAuditRow = (row) => {
  const result = publicRow(row, ["allow_negative"]);
  const accountNumber = String(result.account_number || "");
  result.account_number = accountNumber ? `••••${accountNumber.slice(-4)}` : "";
  return result;
};

const accountDependencyCounts = async (db, accountId) => numericCounts(await db.one(`SELECT
  (SELECT COUNT(*) FROM transactions WHERE source_account_id=? OR destination_account_id=?) AS transactions,
  (SELECT COUNT(*) FROM transactions WHERE status='active' AND (source_account_id=? OR destination_account_id=?)) AS active_transactions,
  (SELECT COUNT(*) FROM envelope_rules WHERE source_account_id=?) AS envelopes,
  (SELECT COUNT(*) FROM envelope_rules WHERE status='active' AND source_account_id=?) AS active_envelopes,
  (SELECT COUNT(*) FROM recurring_rules WHERE default_account_id=?) AS recurring,
  (SELECT COUNT(*) FROM recurring_rules WHERE status='active' AND default_account_id=?) AS active_recurring,
  (SELECT COUNT(*) FROM savings_goals WHERE account_id=?) AS goals,
  (SELECT COUNT(*) FROM savings_goals WHERE status IN ('active','completed') AND account_id=?) AS active_goals,
  (SELECT COUNT(*) FROM reconciliations WHERE account_id=?) AS reconciliations`, [
  accountId, accountId, accountId, accountId, accountId, accountId, accountId, accountId, accountId, accountId, accountId,
]));

const accountLifecycleResult = (current, dependencies, currentBalance) => {
  const archiveBlockers = [];
  if (current.status !== "active") archiveBlockers.push("Rekening tidak aktif.");
  if (currentBalance !== 0) archiveBlockers.push("Saldo saat ini harus Rp0.");
  if (dependencies.active_transactions) archiveBlockers.push("Masih memiliki transaksi aktif.");
  if (dependencies.active_envelopes) archiveBlockers.push("Masih dipakai Alokasi Dana aktif.");
  if (dependencies.active_recurring) archiveBlockers.push("Masih dipakai tagihan rutin aktif.");
  if (dependencies.active_goals) archiveBlockers.push("Masih dipakai target aktif atau selesai.");

  const deleteBlockers = [];
  if (current.status !== "active") deleteBlockers.push("Hanya rekening aktif yang dapat dihapus sebagai rekening belum dipakai.");
  if (Number(current.initial_balance || 0) !== 0) deleteBlockers.push("Saldo awal harus Rp0.");
  if (currentBalance !== 0) deleteBlockers.push("Saldo saat ini harus Rp0.");
  if (dependencies.transactions) deleteBlockers.push("Rekening pernah memiliki transaksi, termasuk transaksi cancelled atau archived.");
  if (dependencies.envelopes) deleteBlockers.push("Rekening pernah atau masih dipakai Alokasi Dana.");
  if (dependencies.recurring) deleteBlockers.push("Rekening pernah atau masih dipakai tagihan rutin.");
  if (dependencies.goals) deleteBlockers.push("Rekening pernah atau masih dipakai target.");
  if (dependencies.reconciliations) deleteBlockers.push("Rekening pernah direkonsiliasi.");

  return {
    account: accountAuditRow(current),
    currentBalance,
    initialBalance: Number(current.initial_balance || 0),
    dependencies,
    canArchive: archiveBlockers.length === 0,
    canDeleteUnused: deleteBlockers.length === 0,
    archiveBlockers,
    deleteBlockers,
    deleteConfirmation: `HAPUS REKENING ${String(current.name || "").trim().toUpperCase()}`,
  };
};

export const accountLifecycleImpact = async (db, current, cutoffDate) => accountLifecycleResult(
  current,
  await accountDependencyCounts(db, current.account_id),
  await accountBalanceAsOf(db, current, cutoffDate),
);

const accountLifecyclePreviewStatements = (accountId, cutoffDate) => [{
  sql: "SELECT * FROM accounts WHERE account_id=?",
  args: [accountId],
}, {
  sql: `SELECT
    (SELECT COUNT(*) FROM transactions WHERE source_account_id=? OR destination_account_id=?) AS transactions,
    (SELECT COUNT(*) FROM transactions WHERE status='active' AND (source_account_id=? OR destination_account_id=?)) AS active_transactions,
    (SELECT COUNT(*) FROM envelope_rules WHERE source_account_id=?) AS envelopes,
    (SELECT COUNT(*) FROM envelope_rules WHERE status='active' AND source_account_id=?) AS active_envelopes,
    (SELECT COUNT(*) FROM recurring_rules WHERE default_account_id=?) AS recurring,
    (SELECT COUNT(*) FROM recurring_rules WHERE status='active' AND default_account_id=?) AS active_recurring,
    (SELECT COUNT(*) FROM savings_goals WHERE account_id=?) AS goals,
    (SELECT COUNT(*) FROM savings_goals WHERE status IN ('active','completed') AND account_id=?) AS active_goals,
    (SELECT COUNT(*) FROM reconciliations WHERE account_id=?) AS reconciliations`,
  args: [accountId, accountId, accountId, accountId, accountId, accountId, accountId, accountId, accountId, accountId, accountId],
}, {
  sql: `SELECT CASE WHEN a.initial_balance_date>? THEN 0 ELSE a.initial_balance + COALESCE(SUM(CASE
      WHEN t.transaction_type IN ('income','refund') AND t.destination_account_id=a.account_id THEN t.amount
      WHEN t.transaction_type='expense' AND t.source_account_id=a.account_id THEN -t.amount
      WHEN t.transaction_type='transfer' AND t.source_account_id=a.account_id THEN -t.amount
      WHEN t.transaction_type='transfer' AND t.destination_account_id=a.account_id THEN t.amount
      WHEN t.transaction_type='adjustment' AND t.source_account_id=a.account_id THEN t.amount
      ELSE 0 END),0) END AS balance
    FROM accounts a LEFT JOIN transactions t ON t.status='active'
      AND t.transaction_date BETWEEN a.initial_balance_date AND ?
      AND (t.source_account_id=a.account_id OR t.destination_account_id=a.account_id)
    WHERE a.account_id=? GROUP BY a.account_id`,
  args: [cutoffDate, cutoffDate, accountId],
}];

export const listAccounts = async (db, context) => ({ items: await visibleAccounts(db, context.actor) });

const accountScopeChanged = (current, owned) => current.owner_scope !== owned.scope
  || String(current.owner_user_id || "") !== String(owned.owner_user_id || "");

const hasActiveAccountDependencies = (dependencies) => Object.values(dependencies).some((value) => Number(value) > 0);

const buildUpdatedAccount = (current, payload, owned, actorUserId) => {
  const nextAccountType = payload.account_type === undefined ? current.account_type : String(payload.account_type);
  const rawName = payload.name === undefined ? current.name : payload.name;
  const rawAccountNumber = payload.account_number === undefined ? current.account_number : payload.account_number;
  const rawBankTemplate = payload.bank_template === undefined ? current.bank_template : payload.bank_template;
  const rawEwalletTemplate = payload.ewallet_template === undefined ? current.ewallet_template : payload.ewallet_template;
  const allowNegative = payload.allow_negative === undefined
    ? current.allow_negative
    : (strictBoolean(payload.allow_negative) ? 1 : 0);
  return {
    ...current,
    name: sanitizeText(rawName, 120),
    account_type: nextAccountType,
    account_number: payload.account_number === undefined
      ? String(rawAccountNumber || "")
      : normalizeAccountNumber(rawAccountNumber, nextAccountType, { required: nextAccountType === "bank" }),
    bank_template: normalizeBankTemplate(rawBankTemplate, nextAccountType),
    ewallet_template: normalizeEwalletTemplate(rawEwalletTemplate, nextAccountType),
    owner_scope: owned.scope,
    owner_user_id: owned.owner_user_id,
    allow_negative: allowNegative,
    ...nextVersionStamp(current, actorUserId),
  };
};

const assertAccountUpdateValid = async (db, current, next) => {
  if (!next.name) throw appError("NAME_REQUIRED", "Nama rekening wajib diisi.", 400);
  if (!ACCOUNT_TYPES.has(next.account_type)) throw appError("INVALID_ACCOUNT_TYPE", "Jenis rekening tidak valid.", 400);
  const duplicate = await db.one("SELECT account_id FROM accounts WHERE account_id<>? AND lower(name)=lower(?) AND status='active' AND owner_scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'')", [current.account_id, next.name, next.owner_scope, next.owner_user_id]);
  if (duplicate) throw appError("DUPLICATE_ACCOUNT", "Rekening aktif dengan nama dan kepemilikan yang sama sudah ada.", 409);
  if (Number(current.allow_negative) !== 1 || Number(next.allow_negative) !== 0) return;
  const negative = await firstNegativeBalance(db, current, { fromDate: current.initial_balance_date });
  if (negative) throw appError("ACCOUNT_HAS_NEGATIVE_HISTORY", "Izin saldo minus tidak dapat dimatikan karena histori rekening pernah negatif.", 409, negative);
};

export const prepareAccountCreatePayload = async (db, actor, payload = {}, { today = nowIso().slice(0, 10) } = {}) => {
  const name = sanitizeText(payload.name, 120);
  const type = String(payload.account_type || "bank");
  if (!name) throw appError("NAME_REQUIRED", "Nama rekening wajib diisi.", 400);
  if (!ACCOUNT_TYPES.has(type)) throw appError("INVALID_ACCOUNT_TYPE", "Jenis rekening tidak valid.", 400);
  const owned = await normalizeOwnedScope(db, actor, { scope: payload.owner_scope || payload.scope, owner_user_id: payload.owner_user_id });
  const initialBalance = Number(payload.initial_balance || 0);
  if (!Number.isSafeInteger(initialBalance)) throw appError("INVALID_AMOUNT", "Saldo awal harus integer Rupiah.", 400);
  const allowNegative = strictBoolean(payload.allow_negative, false);
  if (initialBalance < 0 && !allowNegative) throw appError("NEGATIVE_INITIAL_BALANCE_NOT_ALLOWED", "Saldo awal negatif hanya boleh digunakan jika rekening mengizinkan saldo minus.", 409);
  const initialDate = dateValue(payload.initial_balance_date || today, "Tanggal saldo awal");
  const accountNumber = normalizeAccountNumber(payload.account_number, type, { required: type === "bank" });
  const bankTemplate = normalizeBankTemplate(payload.bank_template, type);
  const ewalletTemplate = normalizeEwalletTemplate(payload.ewallet_template, type);
  const duplicate = await db.one("SELECT account_id FROM accounts WHERE lower(name)=lower(?) AND status='active' AND owner_scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'')", [name, owned.scope, owned.owner_user_id]);
  if (duplicate) throw appError("DUPLICATE_ACCOUNT", "Rekening aktif dengan nama dan kepemilikan yang sama sudah ada.", 409);
  return {
    name,
    account_type: type,
    account_number: accountNumber,
    bank_template: bankTemplate,
    ewallet_template: ewalletTemplate,
    owner_scope: owned.scope,
    owner_user_id: owned.owner_user_id,
    initial_balance: initialBalance,
    initial_balance_date: initialDate,
    allow_negative: allowNegative,
  };
};

export const createAccount = async (db, context) => {
  assertOwner(context.actor);
  const prepared = await prepareAccountCreatePayload(db, context.actor, context.payload || {}, { today: context.today });
  const timestamp = nowIso();
  const record = {
    account_id: uuid(), ...prepared, allow_negative: prepared.allow_negative ? 1 : 0,
    status: "active", ...newVersionStamp(context.actor.user_id, timestamp),
  };
  await db.execute(`INSERT INTO accounts(account_id,name,account_type,account_number,bank_template,ewallet_template,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
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
  if (payload.account_type !== undefined && String(payload.account_type) !== current.account_type) {
    throw appError("ACCOUNT_TYPE_IMMUTABLE", "Jenis rekening tidak dapat diubah setelah rekening dibuat.", 409);
  }
  const owned = await normalizeOwnedScope(
    db,
    context.actor,
    { scope: payload.owner_scope, owner_user_id: payload.owner_user_id },
    { scope: current.owner_scope, owner_user_id: current.owner_user_id },
  );
  const dependencies = await db.one(`SELECT
    (SELECT COUNT(*) FROM transactions WHERE status='active' AND (source_account_id=? OR destination_account_id=?)) AS transactions,
    (SELECT COUNT(*) FROM envelope_rules WHERE status='active' AND source_account_id=?) AS envelopes,
    (SELECT COUNT(*) FROM recurring_rules WHERE status='active' AND default_account_id=?) AS recurring,
    (SELECT COUNT(*) FROM savings_goals WHERE status='active' AND account_id=?) AS goals`, [current.account_id,current.account_id,current.account_id,current.account_id,current.account_id]);
  if (accountScopeChanged(current, owned) && hasActiveAccountDependencies(dependencies)) {
    throw appError("ACCOUNT_SCOPE_LOCKED", "Kepemilikan rekening tidak dapat diubah karena sudah memiliki data terkait.", 409, dependencies);
  }
  const next = buildUpdatedAccount(current, payload, owned, context.actor.user_id);
  await assertAccountUpdateValid(db, current, next);
  const result = await db.execute(`UPDATE accounts SET name=?,account_type=?,account_number=?,bank_template=?,ewallet_template=?,owner_scope=?,owner_user_id=?,allow_negative=?,row_version=?,updated_by=?,updated_at=?
    WHERE account_id=? AND row_version=?`, [next.name,next.account_type,next.account_number,next.bank_template,next.ewallet_template,next.owner_scope,next.owner_user_id,next.allow_negative,next.row_version,next.updated_by,next.updated_at,current.account_id,current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Rekening berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "account", entityId: current.account_id, previous: accountAuditRow(current), next: accountAuditRow(next) });
  await context.enqueueMirror?.(db, "account", current.account_id);
  return publicRow(next, ["allow_negative"]);
};

export const previewAccountLifecycle = async (db, context) => {
  assertOwner(context.actor);
  const accountId = context.payload?.account_id;
  const cutoffDate = context.today || nowIso().slice(0, 10);
  const [currentRows, dependencyRows, balanceRows] = await readBatchRows(db, accountLifecyclePreviewStatements(accountId, cutoffDate));
  const current = currentRows[0] || null;
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Rekening aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? context.payload?.row_version);
  return accountLifecycleResult(current, numericCounts(dependencyRows[0] || {}), Number(balanceRows[0]?.balance || 0));
};

export const archiveAccount = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM accounts WHERE account_id=?", [payload.account_id]);
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Rekening aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan arsip rekening wajib diisi.", 400);
  const impact = await accountLifecycleImpact(db, current, context.today || nowIso().slice(0, 10));
  if (impact.dependencies.active_transactions || impact.dependencies.active_envelopes || impact.dependencies.active_recurring || impact.dependencies.active_goals) {
    throw appError("ACCOUNT_IN_USE", "Rekening masih dipakai data aktif.", 409, impact);
  }
  if (impact.currentBalance !== 0) throw appError("ACCOUNT_NON_ZERO_BALANCE", "Rekening hanya dapat diarsipkan setelah saldonya menjadi nol.", 409, { currentBalance: impact.currentBalance });
  if (!impact.canArchive) throw appError("ACCOUNT_ARCHIVE_BLOCKED", "Rekening belum dapat diarsipkan.", 409, impact);
  const next = { ...current, status: "archived", ...nextVersionStamp(current, context.actor.user_id) };
  const result = await db.execute("UPDATE accounts SET status='archived',row_version=?,updated_by=?,updated_at=? WHERE account_id=? AND row_version=?", [next.row_version,next.updated_by,next.updated_at,current.account_id,current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Rekening berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "account", entityId: current.account_id, previous: accountAuditRow(current), next: { ...accountAuditRow(next), archive_reason: reason } });
  await context.enqueueMirror?.(db, "account", current.account_id);
  return publicRow(next, ["allow_negative"]);
};

export const restoreAccount = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pemulihan rekening wajib diisi.", 400);
  const current = await db.one("SELECT * FROM accounts WHERE account_id=?", [payload.account_id]);
  if (!current || current.status !== "archived") throw appError("NOT_FOUND", "Rekening arsip tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const duplicate = await db.one("SELECT account_id FROM accounts WHERE account_id<>? AND lower(name)=lower(?) AND status='active' AND owner_scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'')", [current.account_id, current.name, current.owner_scope, current.owner_user_id]);
  if (duplicate) throw appError("DUPLICATE_ACCOUNT", "Rekening aktif dengan nama dan kepemilikan yang sama sudah ada.", 409);
  if (current.owner_scope === "personal") {
    const owner = await db.one("SELECT user_id FROM users WHERE user_id=? AND status='active'", [current.owner_user_id]);
    if (!owner) throw appError("ACCOUNT_OWNER_INACTIVE", "Pemilik rekening personal belum aktif.", 409);
  }
  const next = { ...current, status: "active", ...nextVersionStamp(current, context.actor.user_id) };
  const result = await db.execute("UPDATE accounts SET status='active',row_version=?,updated_by=?,updated_at=? WHERE account_id=? AND row_version=? AND status='archived'", [next.row_version, next.updated_by, next.updated_at, current.account_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Rekening berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "account", entityId: current.account_id, previous: accountAuditRow(current), next: { ...accountAuditRow(next), restoration_reason: reason } });
  await context.enqueueMirror?.(db, "account", current.account_id);
  return publicRow(next, ["allow_negative"]);
};

