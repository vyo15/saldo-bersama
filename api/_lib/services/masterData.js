import { appendAudit } from "./audit.js";
import { accountBalanceAsOf, firstNegativeBalance, visibleAccounts } from "./readModels.js";
import { appError, assertOwner, assertVersion, dateValue, normalizeOwnedScope, nowIso, publicRow, sanitizeText, strictBoolean, uuid } from "./core.js";
import { nextVersionStamp } from "./versioning.js";

const ACCOUNT_TYPES = new Set(["cash", "bank", "ewallet", "savings", "emergency_fund", "sinking_fund", "investment", "other"]);
const BANK_TEMPLATES = new Set(["generic", "bca", "bni", "btn", "mandiri", "permata"]);
const EWALLET_TEMPLATES = new Set(["generic", "shopeepay", "dana", "gopay", "ovo", "linkaja"]);
const CATEGORY_TYPES = new Set(["income", "expense", "refund"]);
const CATEGORY_NATURES = new Set(["fixed", "variable", "unexpected", "discretionary", "emergency", "savings", "other"]);
const CURRENT_EXPENSE_CATEGORY_NATURES = new Set(["fixed", "variable", "unexpected", "discretionary", "emergency", "other"]);
const LEGACY_SAVINGS_NATURE = "savings";
const CATEGORY_ICONS = new Set([
  "wedding_ring", "savings", "target", "emergency", "money", "account", "salary", "business", "refund",
  "shopping", "food", "transport", "home", "renovation", "bill", "electricity", "internet", "education",
  "health", "travel", "entertainment", "music", "gift", "family", "partner", "other",
]);
const DEFAULT_CATEGORY_ICON_BY_TYPE = Object.freeze({ expense: "shopping", income: "salary", refund: "refund" });

const ACCOUNT_NUMBER_MIN_LENGTH = 6;
const ACCOUNT_NUMBER_MAX_LENGTH = 34;

const categoryIconValue = (value, type, { defaultWhenEmpty = true } = {}) => {
  const icon = sanitizeText(value, 40);
  if (!icon && defaultWhenEmpty) return DEFAULT_CATEGORY_ICON_BY_TYPE[type] || "other";
  if (!icon) return "";
  if (!CATEGORY_ICONS.has(icon)) throw appError("INVALID_CATEGORY_ICON", "Icon kategori tidak valid.", 400);
  return icon;
};

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

const accountAuditRow = (row) => {
  const result = publicRow(row, ["allow_negative"]);
  const accountNumber = String(result.account_number || "");
  result.account_number = accountNumber ? `••••${accountNumber.slice(-4)}` : "";
  return result;
};

const numericCounts = (row = {}) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)]));

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

const accountLifecycleImpact = async (db, current, cutoffDate) => {
  const dependencies = await accountDependencyCounts(db, current.account_id);
  const currentBalance = await accountBalanceAsOf(db, current, cutoffDate);
  const archiveBlockers = [];
  if (current.status !== "active") archiveBlockers.push("Rekening tidak aktif.");
  if (currentBalance !== 0) archiveBlockers.push("Saldo saat ini harus Rp0.");
  if (dependencies.active_transactions) archiveBlockers.push("Masih memiliki transaksi aktif.");
  if (dependencies.active_envelopes) archiveBlockers.push("Masih dipakai kantong aktif.");
  if (dependencies.active_recurring) archiveBlockers.push("Masih dipakai tagihan rutin aktif.");
  if (dependencies.active_goals) archiveBlockers.push("Masih dipakai target aktif atau selesai.");

  const deleteBlockers = [];
  if (current.status !== "active") deleteBlockers.push("Hanya rekening aktif yang dapat dihapus sebagai rekening belum dipakai.");
  if (Number(current.initial_balance || 0) !== 0) deleteBlockers.push("Saldo awal harus Rp0.");
  if (currentBalance !== 0) deleteBlockers.push("Saldo saat ini harus Rp0.");
  if (dependencies.transactions) deleteBlockers.push("Rekening pernah memiliki transaksi, termasuk transaksi cancelled atau archived.");
  if (dependencies.envelopes) deleteBlockers.push("Rekening pernah atau masih dipakai kantong.");
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

const categoryDependencyCounts = async (db, categoryId) => numericCounts(await db.one(`SELECT
  (SELECT COUNT(*) FROM transactions WHERE category_id=?) AS transactions,
  (SELECT COUNT(*) FROM transactions WHERE status='active' AND category_id=?) AS active_transactions,
  (SELECT COUNT(*) FROM recurring_rules WHERE category_id=?) AS recurring,
  (SELECT COUNT(*) FROM recurring_rules WHERE status='active' AND category_id=?) AS active_recurring,
  (SELECT COUNT(*) FROM budgets WHERE category_id=?) AS budgets,
  (SELECT COUNT(*) FROM budgets WHERE status='active' AND category_id=?) AS active_budgets`, [categoryId, categoryId, categoryId, categoryId, categoryId, categoryId]));

const categoryLifecycleImpact = async (db, current) => {
  const dependencies = await categoryDependencyCounts(db, current.category_id);
  const archiveBlockers = [];
  if (current.status !== "active") archiveBlockers.push("Kategori tidak aktif.");
  if (dependencies.active_recurring) archiveBlockers.push("Masih digunakan tagihan rutin aktif.");
  if (dependencies.active_budgets) archiveBlockers.push("Masih digunakan anggaran aktif.");

  const deleteBlockers = [];
  if (current.status !== "active") deleteBlockers.push("Hanya kategori aktif yang dapat dihapus sebagai data belum dipakai.");
  if (dependencies.transactions) deleteBlockers.push("Kategori pernah digunakan transaksi, termasuk transaksi cancelled atau archived.");
  if (dependencies.recurring) deleteBlockers.push("Kategori pernah atau masih digunakan tagihan rutin.");
  if (dependencies.budgets) deleteBlockers.push("Kategori pernah atau masih digunakan anggaran.");

  return {
    category: publicRow(current),
    dependencies,
    canArchive: archiveBlockers.length === 0,
    canDeleteUnused: deleteBlockers.length === 0,
    archiveBlockers,
    deleteBlockers,
  };
};

export const listAccounts = async (db, context) => ({ items: await visibleAccounts(db, context.actor) });

export const listArchivedData = async (db, context) => {
  assertOwner(context.actor);
  const [allAccounts, categories, envelopeRules, goals, recurringRules, budgets] = await Promise.all([
    visibleAccounts(db, context.actor, { includeArchived: true }),
    db.all("SELECT * FROM categories WHERE status='archived' ORDER BY updated_at DESC,name COLLATE NOCASE"),
    db.all("SELECT r.*,a.name AS source_account_name,a.status AS source_account_status FROM envelope_rules r LEFT JOIN accounts a ON a.account_id=r.source_account_id WHERE r.status='archived' ORDER BY r.updated_at DESC LIMIT 50"),
    db.all("SELECT g.*,a.name AS account_name,a.status AS account_status FROM savings_goals g JOIN accounts a ON a.account_id=g.account_id WHERE g.status='archived' ORDER BY g.updated_at DESC LIMIT 50"),
    db.all("SELECT r.*,a.name AS account_name,a.status AS account_status,c.name AS category_name,c.status AS category_status FROM recurring_rules r JOIN accounts a ON a.account_id=r.default_account_id JOIN categories c ON c.category_id=r.category_id WHERE r.status='archived' ORDER BY r.updated_at DESC LIMIT 50"),
    db.all("SELECT b.*,COALESCE(c.name,b.name) AS display_name,c.status AS category_status FROM budgets b LEFT JOIN categories c ON c.category_id=b.category_id WHERE b.status='archived' ORDER BY b.updated_at DESC LIMIT 100"),
  ]);
  return {
    accounts: allAccounts.filter((item) => item.status === "archived"),
    categories: categories.map((row) => publicRow(row)),
    envelopeRules: envelopeRules.map((row) => publicRow(row)),
    goals: goals.map((row) => publicRow(row)),
    recurringRules: recurringRules.map((row) => publicRow(row, ["auto_debit"])),
    budgets: budgets.map((row) => ({ ...publicRow(row), name: row.display_name })),
  };
};


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

const resolveCategoryNature = (payload, current, nextType) => {
  const explicitNature = payload.nature !== undefined;
  if (nextType !== "expense" && explicitNature && String(payload.nature) !== "other") {
    throw appError("CATEGORY_NATURE_NOT_APPLICABLE", "Sifat pengeluaran tidak dapat diubah untuk kategori uang masuk atau pengembalian dana.", 400);
  }
  if (nextType !== "expense") return "other";
  return explicitNature ? String(payload.nature) : current.nature;
};

const buildUpdatedCategory = (current, payload, actorUserId) => {
  const nextType = payload.transaction_type === undefined ? current.transaction_type : String(payload.transaction_type);
  const nextNature = resolveCategoryNature(payload, current, nextType);
  const rawName = payload.name === undefined ? current.name : payload.name;
  const icon = payload.icon === undefined ? current.icon : categoryIconValue(payload.icon, nextType);
  return {
    ...current,
    name: sanitizeText(rawName, 100),
    transaction_type: nextType,
    nature: nextNature,
    icon,
    ...nextVersionStamp(current, actorUserId),
  };
};

const assertCategoryUpdateShape = (current, next) => {
  if (!next.name || !CATEGORY_TYPES.has(next.transaction_type) || !CATEGORY_NATURES.has(next.nature)) {
    throw appError("INVALID_CATEGORY", "Data kategori tidak valid.", 400);
  }
  const keepsLegacySavings = current.nature === LEGACY_SAVINGS_NATURE && next.nature === LEGACY_SAVINGS_NATURE;
  if (next.transaction_type === "expense" && !CURRENT_EXPENSE_CATEGORY_NATURES.has(next.nature) && !keepsLegacySavings) {
    throw appError("SAVINGS_CATEGORY_NOT_ALLOWED", "Pemindahan dana ke tabungan sendiri harus dicatat sebagai Transfer atau Target, bukan kategori pengeluaran.", 400);
  }
};

const assertCategoryTypeChangeAllowed = async (db, current, next) => {
  if (next.transaction_type === current.transaction_type) return;
  const usage = await db.one("SELECT COUNT(*) AS count FROM transactions WHERE category_id=?", [current.category_id]);
  if (Number(usage?.count || 0)) throw appError("CATEGORY_TYPE_LOCKED", "Jenis kategori tidak dapat diubah setelah digunakan transaksi.", 409);
};

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
  const bankTemplate = normalizeBankTemplate(payload.bank_template, type);
  const ewalletTemplate = normalizeEwalletTemplate(payload.ewallet_template, type);
  const duplicate = await db.one("SELECT account_id FROM accounts WHERE lower(name)=lower(?) AND status='active' AND owner_scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'')", [name, owned.scope, owned.owner_user_id]);
  if (duplicate) throw appError("DUPLICATE_ACCOUNT", "Rekening aktif dengan nama dan kepemilikan yang sama sudah ada.", 409);
  const timestamp = nowIso();
  const record = {
    account_id: uuid(), name, account_type: type, account_number: accountNumber, bank_template: bankTemplate, ewallet_template: ewalletTemplate, owner_scope: owned.scope, owner_user_id: owned.owner_user_id,
    initial_balance: initialBalance, initial_balance_date: initialDate, allow_negative: allowNegative ? 1 : 0,
    status: "active", row_version: 1, created_by: context.actor.user_id, created_at: timestamp, updated_by: context.actor.user_id, updated_at: timestamp,
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
  const current = await db.one("SELECT * FROM accounts WHERE account_id=?", [context.payload?.account_id]);
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Rekening aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? context.payload?.row_version);
  return accountLifecycleImpact(db, current, context.today || nowIso().slice(0, 10));
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

export const deleteUnusedAccount = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM accounts WHERE account_id=?", [payload.account_id]);
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Rekening aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penghapusan rekening wajib diisi.", 400);
  if (!strictBoolean(payload.acknowledged, false)) throw appError("ACKNOWLEDGEMENT_REQUIRED", "Konfirmasi pemahaman penghapusan wajib dicentang.", 400);
  const impact = await accountLifecycleImpact(db, current, context.today || nowIso().slice(0, 10));
  if (!impact.canDeleteUnused) throw appError("ACCOUNT_DELETE_BLOCKED", "Rekening tidak memenuhi syarat sebagai rekening belum pernah digunakan.", 409, impact);
  if (String(payload.confirmation || "").trim() !== impact.deleteConfirmation) {
    throw appError("CONFIRMATION_MISMATCH", "Frasa konfirmasi penghapusan tidak sesuai.", 400, { expected: impact.deleteConfirmation });
  }
  await appendAudit(db, context, {
    entityType: "account",
    entityId: current.account_id,
    previous: accountAuditRow(current),
    next: {
      deleted: true,
      deletion_type: "unused_account_only",
      reason,
      initial_balance: impact.initialBalance,
      current_balance: impact.currentBalance,
      dependencies: impact.dependencies,
      audit_preserved: true,
    },
  });
  const result = await db.execute("DELETE FROM accounts WHERE account_id=? AND row_version=? AND status='active'", [current.account_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Rekening berubah atau baru saja digunakan di perangkat lain.", 409);
  await context.enqueueMirror?.(db, "account", current.account_id);
  return { account_id: current.account_id, deleted: true, audit_preserved: true };
};

export const listCategories = async (db) => ({ items: (await db.all("SELECT * FROM categories WHERE status='active' ORDER BY transaction_type,name COLLATE NOCASE")).map((row) => publicRow(row)) });

export const createCategory = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const name = sanitizeText(payload.name, 100);
  const type = String(payload.transaction_type || "expense");
  const explicitNature = payload.nature !== undefined;
  const nature = String(explicitNature ? payload.nature : type === "expense" ? "variable" : "other");
  if (!name) throw appError("NAME_REQUIRED", "Nama kategori wajib diisi.", 400);
  if (!CATEGORY_TYPES.has(type)) throw appError("INVALID_CATEGORY_TYPE", "Jenis kategori tidak valid.", 400);
  if (!CATEGORY_NATURES.has(nature)) throw appError("INVALID_CATEGORY_NATURE", "Sifat kategori tidak valid.", 400);
  if (type !== "expense" && nature !== "other") throw appError("CATEGORY_NATURE_NOT_APPLICABLE", "Sifat pengeluaran tidak berlaku untuk kategori uang masuk atau pengembalian dana.", 400);
  if (type === "expense" && nature === LEGACY_SAVINGS_NATURE) throw appError("SAVINGS_CATEGORY_NOT_ALLOWED", "Pemindahan dana ke tabungan sendiri harus dicatat sebagai Transfer atau Target, bukan kategori pengeluaran.", 400);
  if (type === "expense" && !CURRENT_EXPENSE_CATEGORY_NATURES.has(nature)) throw appError("INVALID_CATEGORY_NATURE", "Sifat pengeluaran tidak valid.", 400);
  const duplicate = await db.one("SELECT category_id,status FROM categories WHERE lower(name)=lower(?) AND transaction_type=?", [name,type]);
  if (duplicate?.status === "archived") throw appError("CATEGORY_RESTORE_REQUIRED", "Kategori dengan nama dan jenis yang sama berada di arsip. Pulihkan kategori tersebut agar histori tetap konsisten.", 409, { categoryId: duplicate.category_id });
  if (duplicate) throw appError("DUPLICATE_CATEGORY", "Kategori aktif dengan nama yang sama sudah ada.", 409);
  const timestamp = nowIso();
  const record = { category_id: uuid(), name, transaction_type: type, nature, icon: categoryIconValue(payload.icon, type), status: "active", row_version: 1, created_by: context.actor.user_id, created_at: timestamp, updated_by: context.actor.user_id, updated_at: timestamp };
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
  const next = buildUpdatedCategory(current, payload, context.actor.user_id);
  assertCategoryUpdateShape(current, next);
  const duplicate = await db.one("SELECT category_id FROM categories WHERE category_id<>? AND lower(name)=lower(?) AND transaction_type=? AND status='active'", [current.category_id, next.name, next.transaction_type]);
  if (duplicate) throw appError("DUPLICATE_CATEGORY", "Kategori aktif dengan nama dan jenis yang sama sudah ada.", 409);
  await assertCategoryTypeChangeAllowed(db, current, next);
  const result = await db.execute("UPDATE categories SET name=?,transaction_type=?,nature=?,icon=?,row_version=?,updated_by=?,updated_at=? WHERE category_id=? AND row_version=?", [next.name,next.transaction_type,next.nature,next.icon,next.row_version,next.updated_by,next.updated_at,current.category_id,current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Kategori berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "category", entityId: current.category_id, previous: publicRow(current), next: publicRow(next) });
  await context.enqueueMirror?.(db, "category", current.category_id);
  return publicRow(next);
};

export const previewCategoryArchive = async (db, context) => {
  assertOwner(context.actor);
  const current = await db.one("SELECT * FROM categories WHERE category_id=?", [context.payload?.category_id]);
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Kategori aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? context.payload?.row_version);
  return categoryLifecycleImpact(db, current);
};

export const archiveCategory = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM categories WHERE category_id=?", [payload.category_id]);
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Kategori aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan arsip kategori wajib diisi.", 400);
  const impact = await categoryLifecycleImpact(db, current);
  if (!impact.canArchive) throw appError("CATEGORY_IN_USE", "Kategori masih dipakai data aktif.", 409, impact);
  const next = { ...current, status:"archived", ...nextVersionStamp(current, context.actor.user_id) };
  const result = await db.execute("UPDATE categories SET status='archived',row_version=?,updated_by=?,updated_at=? WHERE category_id=? AND row_version=? AND status='active'", [next.row_version,next.updated_by,next.updated_at,current.category_id,current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Kategori berubah di perangkat lain.",409);
  await appendAudit(db, context, { entityType:"category", entityId:current.category_id, previous:publicRow(current), next:{ ...publicRow(next), archive_reason: reason } });
  await context.enqueueMirror?.(db,"category",current.category_id);
  return publicRow(next);
};

export const deleteUnusedCategory = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM categories WHERE category_id=?", [payload.category_id]);
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Kategori aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penghapusan kategori wajib diisi.", 400);
  const impact = await categoryLifecycleImpact(db, current);
  if (!impact.canDeleteUnused) throw appError("CATEGORY_DELETE_BLOCKED", "Kategori tidak memenuhi syarat sebagai kategori belum pernah digunakan.", 409, impact);
  await appendAudit(db, context, {
    entityType: "category",
    entityId: current.category_id,
    previous: publicRow(current),
    next: { deleted: true, deletion_type: "unused_category_only", reason, dependencies: impact.dependencies, audit_preserved: true },
  });
  const result = await db.execute("DELETE FROM categories WHERE category_id=? AND row_version=? AND status='active'", [current.category_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Kategori berubah atau baru saja digunakan di perangkat lain.", 409);
  await context.enqueueMirror?.(db, "category", current.category_id);
  return { category_id: current.category_id, deleted: true, audit_preserved: true };
};

export const restoreCategory = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pemulihan kategori wajib diisi.", 400);
  const current = await db.one("SELECT * FROM categories WHERE category_id=?", [payload.category_id]);
  if (!current || current.status !== "archived") throw appError("NOT_FOUND", "Kategori arsip tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const duplicate = await db.one("SELECT category_id FROM categories WHERE category_id<>? AND lower(name)=lower(?) AND transaction_type=? AND status='active'", [current.category_id, current.name, current.transaction_type]);
  if (duplicate) throw appError("DUPLICATE_CATEGORY", "Kategori aktif dengan nama dan jenis yang sama sudah ada.", 409);
  const next = { ...current, status: "active", ...nextVersionStamp(current, context.actor.user_id) };
  const result = await db.execute("UPDATE categories SET status='active',row_version=?,updated_by=?,updated_at=? WHERE category_id=? AND row_version=? AND status='archived'", [next.row_version, next.updated_by, next.updated_at, current.category_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Kategori berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "category", entityId: current.category_id, previous: publicRow(current), next: { ...publicRow(next), restoration_reason: reason } });
  await context.enqueueMirror?.(db, "category", current.category_id);
  return publicRow(next);
};
