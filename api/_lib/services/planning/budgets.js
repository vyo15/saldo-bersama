import { appendAudit } from "../audit.js";
import { appError, assertOwner, assertVersion, normalizeOwnedScope, nowIso, periodKey, positiveInteger, publicRow, sanitizeText, uuid, visibleScopeSql } from "../core.js";
export const listBudgets = async (db, context) => {
  const period = periodKey(context.payload?.period);
  const access = visibleScopeSql(context.actor, "b");
  const rows = await db.all(`SELECT b.*,COALESCE(c.name,b.name) AS display_name,COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.status='active' AND t.transaction_type='expense' AND t.category_id=b.category_id AND substr(t.transaction_date,1,7)=b.period_key AND ((b.scope='shared' AND t.scope='shared') OR (b.scope='personal' AND t.scope='personal' AND t.owner_user_id=b.owner_user_id))),0) AS used_amount FROM budgets b LEFT JOIN categories c ON c.category_id=b.category_id WHERE b.period_key=? AND b.status='active' AND ${access.sql} ORDER BY display_name`, [period, ...access.args]);
  return {
    items: rows.map(row => ({
      ...publicRow(row),
      name: row.display_name
    }))
  };
};
export const upsertBudget = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const period = periodKey(p.period_key);
  const category = await db.one("SELECT * FROM categories WHERE category_id=? AND status='active' AND transaction_type='expense'", [p.category_id]);
  if (!category) throw appError("INVALID_CATEGORY", "Kategori pengeluaran tidak valid.", 400);
  const owned = await normalizeOwnedScope(db, context.actor, p);
  const current = await db.one("SELECT * FROM budgets WHERE period_key=? AND category_id=? AND scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'')", [period, category.category_id, owned.scope, owned.owner_user_id]);
  const amount = positiveInteger(p.amount, "Nominal budget");
  const threshold = Math.min(100, Math.max(1, Number(p.warning_threshold || 80)));
  const now = nowIso();
  let next;
  if (current) {
    assertVersion(current, context.rowVersion ?? p.row_version);
    next = {
      ...current,
      name: sanitizeText(p.name || category.name, 100),
      amount,
      warning_threshold: threshold,
      status: "active",
      row_version: Number(current.row_version) + 1,
      updated_by: context.actor.user_id,
      updated_at: now
    };
    const result = await db.execute("UPDATE budgets SET name=?,amount=?,warning_threshold=?,status='active',row_version=?,updated_by=?,updated_at=? WHERE budget_id=? AND row_version=?", [next.name, amount, threshold, next.row_version, next.updated_by, next.updated_at, current.budget_id, current.row_version]);
    if (result.rowsAffected !== 1) throw appError("CONFLICT", "Budget berubah di perangkat lain.", 409);
  } else {
    next = {
      budget_id: uuid(),
      period_key: period,
      category_id: category.category_id,
      envelope_rule_id: null,
      name: sanitizeText(p.name || category.name, 100),
      amount,
      warning_threshold: threshold,
      status: "active",
      row_version: 1,
      created_by: context.actor.user_id,
      created_at: now,
      updated_by: context.actor.user_id,
      updated_at: now,
      scope: owned.scope,
      owner_user_id: owned.owner_user_id
    };
    await db.execute("INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", Object.values(next));
  }
  await appendAudit(db, context, {
    entityType: "budget",
    entityId: next.budget_id,
    previous: current ? publicRow(current) : null,
    next: publicRow(next)
  });
  await context.enqueueMirror?.(db, "budget", next.budget_id);
  return publicRow(next);
};
export const archiveBudget = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM budgets WHERE budget_id=? AND status='active'", [p.budget_id]);
  if (!current) throw appError("NOT_FOUND", "Budget aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan arsip anggaran wajib diisi.", 400);
  const next = {
    ...current,
    status: "archived",
    row_version: Number(current.row_version) + 1,
    updated_by: context.actor.user_id,
    updated_at: nowIso()
  };
  const r = await db.execute("UPDATE budgets SET status='archived',row_version=?,updated_by=?,updated_at=? WHERE budget_id=? AND row_version=?", [next.row_version, next.updated_by, next.updated_at, current.budget_id, current.row_version]);
  if (r.rowsAffected !== 1) throw appError("CONFLICT", "Budget berubah di perangkat lain.", 409);
  await appendAudit(db, context, {
    entityType: "budget",
    entityId: current.budget_id,
    previous: publicRow(current),
    next: { ...publicRow(next), archive_reason: reason }
  });
  await context.enqueueMirror?.(db, "budget", current.budget_id);
  return publicRow(next);
};
export const restoreBudget = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM budgets WHERE budget_id=? AND status='archived'", [p.budget_id]);
  if (!current) throw appError("NOT_FOUND", "Anggaran arsip tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pemulihan anggaran wajib diisi.", 400);
  const category = await db.one("SELECT status,transaction_type FROM categories WHERE category_id=?", [current.category_id]);
  if (!category || category.status !== "active" || category.transaction_type !== "expense") throw appError("CATEGORY_INACTIVE", "Kategori pengeluaran harus aktif sebelum anggaran dipulihkan.", 409);
  const duplicate = await db.one("SELECT budget_id FROM budgets WHERE budget_id<>? AND period_key=? AND category_id=? AND scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'') AND status='active' LIMIT 1", [current.budget_id, current.period_key, current.category_id, current.scope, current.owner_user_id]);
  if (duplicate) throw appError("DUPLICATE_BUDGET", "Sudah ada anggaran aktif untuk kategori, periode, dan kepemilikan yang sama.", 409);
  const next = { ...current, status: "active", row_version: Number(current.row_version) + 1, updated_by: context.actor.user_id, updated_at: nowIso() };
  const update = await db.execute("UPDATE budgets SET status='active',row_version=?,updated_by=?,updated_at=? WHERE budget_id=? AND row_version=? AND status='archived'", [next.row_version, next.updated_by, next.updated_at, current.budget_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Anggaran berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "budget", entityId: current.budget_id, previous: publicRow(current), next: { ...publicRow(next), restore_reason: reason } });
  await context.enqueueMirror?.(db, "budget", current.budget_id);
  return publicRow(next);
};
