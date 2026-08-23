import { readBatchRows } from "../db/readBatchRows.js";
import { mapVisibleAccountRows, visibleAccountsStatement } from "./readModels.js";
import { appendAudit } from "./audit.js";
import { accountAuditRow, accountLifecycleImpact } from "./masterData/accounts.js";
import { categoryLifecycleImpact } from "./masterData/categories.js";
import { appError, assertOwner, assertVersion, nowIso, publicRow, sanitizeText, strictBoolean } from "./core.js";

// Stable master-data facade. Account/category implementation lives in focused
// child modules while archived-data aggregation stays here because it spans domains.
export {
  archiveAccount,
  createAccount,
  listAccounts,
  previewAccountLifecycle,
  restoreAccount,
  updateAccount,
} from "./masterData/accounts.js";
export {
  archiveCategory,
  createCategory,
  listCategories,
  previewCategoryArchive,
  restoreCategory,
  updateCategory,
} from "./masterData/categories.js";

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

export const listArchivedData = async (db, context) => {
  assertOwner(context.actor);
  const accountStatement = visibleAccountsStatement(context.actor, { includeArchived: true });
  const statements = [
    accountStatement,
    { sql: "SELECT * FROM categories WHERE status='archived' ORDER BY updated_at DESC,name COLLATE NOCASE", args: [] },
    { sql: "SELECT r.*,a.name AS source_account_name,a.status AS source_account_status FROM envelope_rules r LEFT JOIN accounts a ON a.account_id=r.source_account_id WHERE r.status='archived' ORDER BY r.updated_at DESC LIMIT 50", args: [] },
    { sql: "SELECT g.*,a.name AS account_name,a.status AS account_status FROM savings_goals g JOIN accounts a ON a.account_id=g.account_id WHERE g.status='archived' ORDER BY g.updated_at DESC LIMIT 50", args: [] },
    { sql: "SELECT r.*,a.name AS account_name,a.status AS account_status,c.name AS category_name,c.status AS category_status FROM recurring_rules r JOIN accounts a ON a.account_id=r.default_account_id JOIN categories c ON c.category_id=r.category_id WHERE r.status='archived' ORDER BY r.updated_at DESC LIMIT 50", args: [] },
    { sql: "SELECT b.*,COALESCE(c.name,b.name) AS display_name,c.status AS category_status FROM budgets b LEFT JOIN categories c ON c.category_id=b.category_id WHERE b.status='archived' ORDER BY b.updated_at DESC LIMIT 100", args: [] },
  ];
  const resultRows = await readBatchRows(db, statements);
  const [accountRows = [], categories = [], envelopeRules = [], goals = [], recurringRules = [], budgets = []] = resultRows;
  const allAccounts = mapVisibleAccountRows(accountRows, context.actor);
  return {
    accounts: allAccounts.filter((item) => item.status === "archived"),
    categories: categories.map((row) => publicRow(row)),
    envelopeRules: envelopeRules.map((row) => publicRow(row)),
    goals: goals.map((row) => publicRow(row)),
    recurringRules: recurringRules.map((row) => publicRow(row, ["auto_debit"])),
    budgets: budgets.map((row) => ({ ...publicRow(row), name: row.display_name })),
  };
};
