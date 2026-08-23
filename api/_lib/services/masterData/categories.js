import { readBatchRows } from "../../db/readBatchRows.js";
import { CATEGORY_ICON_VALUES, CATEGORY_NATURE_VALUES, CATEGORY_TYPE_VALUES, CURRENT_EXPENSE_CATEGORY_NATURE_VALUES, DEFAULT_CATEGORY_ICON_BY_TYPE } from "../../domainConstants.js";
import { appendAudit } from "../audit.js";
import { appError, assertOwner, assertVersion, nowIso, publicRow, sanitizeText, uuid } from "../core.js";
import { newVersionStamp, nextVersionStamp } from "../versioning.js";
import { numericCounts } from "./shared.js";

const CATEGORY_TYPES = new Set(CATEGORY_TYPE_VALUES);
const CATEGORY_NATURES = new Set(CATEGORY_NATURE_VALUES);
const CURRENT_EXPENSE_CATEGORY_NATURES = new Set(CURRENT_EXPENSE_CATEGORY_NATURE_VALUES);
const LEGACY_SAVINGS_NATURE = "savings";
const CATEGORY_ICONS = new Set(CATEGORY_ICON_VALUES);

// Category type/nature changes are constrained by historical usage so reports keep
// their original semantic meaning after master-data maintenance.
const categoryIconValue = (value, type, { defaultWhenEmpty = true } = {}) => {
  const icon = sanitizeText(value, 40);
  if (!icon && defaultWhenEmpty) return DEFAULT_CATEGORY_ICON_BY_TYPE[type] || "other";
  if (!icon) return "";
  if (!CATEGORY_ICONS.has(icon)) throw appError("INVALID_CATEGORY_ICON", "Icon kategori tidak valid.", 400);
  return icon;
};

const categoryDependencyCounts = async (db, categoryId) => numericCounts(await db.one(`SELECT
  (SELECT COUNT(*) FROM transactions WHERE category_id=?) AS transactions,
  (SELECT COUNT(*) FROM transactions WHERE status='active' AND category_id=?) AS active_transactions,
  (SELECT COUNT(*) FROM recurring_rules WHERE category_id=?) AS recurring,
  (SELECT COUNT(*) FROM recurring_rules WHERE status='active' AND category_id=?) AS active_recurring,
  (SELECT COUNT(*) FROM budgets WHERE category_id=?) AS budgets,
  (SELECT COUNT(*) FROM budgets WHERE status='active' AND category_id=?) AS active_budgets`, [categoryId, categoryId, categoryId, categoryId, categoryId, categoryId]));

const categoryLifecycleResult = (current, dependencies) => {
  const archiveBlockers = [];
  if (current.status !== "active") archiveBlockers.push("Kategori tidak aktif.");
  if (dependencies.active_recurring) archiveBlockers.push("Masih digunakan tagihan rutin aktif.");
  if (dependencies.active_budgets) archiveBlockers.push("Masih digunakan Kebutuhan aktif.");

  const deleteBlockers = [];
  if (current.status !== "active") deleteBlockers.push("Hanya kategori aktif yang dapat dihapus sebagai data belum dipakai.");
  if (dependencies.transactions) deleteBlockers.push("Kategori pernah digunakan transaksi, termasuk transaksi cancelled atau archived.");
  if (dependencies.recurring) deleteBlockers.push("Kategori pernah atau masih digunakan tagihan rutin.");
  if (dependencies.budgets) deleteBlockers.push("Kategori pernah atau masih digunakan Kebutuhan.");

  return {
    category: publicRow(current),
    dependencies,
    canArchive: archiveBlockers.length === 0,
    canDeleteUnused: deleteBlockers.length === 0,
    archiveBlockers,
    deleteBlockers,
  };
};

export const categoryLifecycleImpact = async (db, current) => categoryLifecycleResult(
  current,
  await categoryDependencyCounts(db, current.category_id),
);

const categoryLifecyclePreviewStatements = (categoryId) => [{
  sql: "SELECT * FROM categories WHERE category_id=?",
  args: [categoryId],
}, {
  sql: `SELECT
    (SELECT COUNT(*) FROM transactions WHERE category_id=?) AS transactions,
    (SELECT COUNT(*) FROM transactions WHERE status='active' AND category_id=?) AS active_transactions,
    (SELECT COUNT(*) FROM recurring_rules WHERE category_id=?) AS recurring,
    (SELECT COUNT(*) FROM recurring_rules WHERE status='active' AND category_id=?) AS active_recurring,
    (SELECT COUNT(*) FROM budgets WHERE category_id=?) AS budgets,
    (SELECT COUNT(*) FROM budgets WHERE status='active' AND category_id=?) AS active_budgets`,
  args: [categoryId, categoryId, categoryId, categoryId, categoryId, categoryId],
}];

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
  const record = { category_id: uuid(), name, transaction_type: type, nature, icon: categoryIconValue(payload.icon, type), status: "active", ...newVersionStamp(context.actor.user_id, timestamp) };
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
  const categoryId = context.payload?.category_id;
  const [currentRows, dependencyRows] = await readBatchRows(db, categoryLifecyclePreviewStatements(categoryId));
  const current = currentRows[0] || null;
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Kategori aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? context.payload?.row_version);
  return categoryLifecycleResult(current, numericCounts(dependencyRows[0] || {}));
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
