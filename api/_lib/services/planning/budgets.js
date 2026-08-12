import { appendAudit } from "../audit.js";
import { appError, assertOwner, assertVersion, monthBounds, normalizeOwnedScope, nowIso, periodKey, positiveInteger, publicRow, sanitizeText, uuid, visibleScopeSql } from "../core.js";
import { nextVersionStamp } from "../versioning.js";
export const budgetListStatement = (context) => {
  const period = periodKey(context.payload?.period);
  const access = visibleScopeSql(context.actor, "b");
  const bounds = monthBounds(period);
  return {
    sql: `WITH usage AS (
      SELECT t.category_id,t.scope,t.owner_user_id,SUM(t.amount) AS used_amount
      FROM transactions t
      WHERE t.status='active' AND t.transaction_type='expense' AND t.transaction_date BETWEEN ? AND ?
      GROUP BY t.category_id,t.scope,t.owner_user_id
    )
    SELECT b.*,COALESCE(c.name,b.name) AS display_name,COALESCE(u.used_amount,0) AS used_amount,
      bu.name AS owner_name,bu.role AS owner_role
    FROM budgets b
    LEFT JOIN categories c ON c.category_id=b.category_id
    LEFT JOIN users bu ON bu.user_id=b.owner_user_id
    LEFT JOIN usage u ON u.category_id=b.category_id
      AND u.scope=b.scope
      AND COALESCE(u.owner_user_id,'')=COALESCE(b.owner_user_id,'')
    WHERE b.period_key=? AND b.status='active' AND ${access.sql}
    ORDER BY display_name`,
    args: [bounds.start, bounds.end, period, ...access.args],
  };
};

export const mapBudgetListRows = (rows) => ({
  items: rows.map((row) => ({ ...publicRow(row), name: row.display_name })),
});

export const listBudgets = async (db, context) => {
  const statement = budgetListStatement(context);
  return mapBudgetListRows(await db.all(statement.sql, statement.args));
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
      ...nextVersionStamp(current, context.actor.user_id, now)
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
const budgetLifecycleImpact = async (db, current) => {
  const bounds = monthBounds(current.period_key);
  const transactionCount = current.category_id
    ? await db.one(`SELECT COUNT(*) AS count FROM transactions
        WHERE category_id=?
          AND transaction_date BETWEEN ? AND ?
          AND scope=?
          AND COALESCE(owner_user_id,'')=COALESCE(?,'')`, [current.category_id, bounds.start, bounds.end, current.scope, current.owner_user_id])
    : await db.one(`SELECT COUNT(*) AS count FROM transactions
        WHERE envelope_period_id IN (
          SELECT envelope_period_id FROM envelope_periods
          WHERE envelope_rule_id=?
        )
          AND transaction_date BETWEEN ? AND ?
          AND scope=?
          AND COALESCE(owner_user_id,'')=COALESCE(?,'')`, [current.envelope_rule_id, bounds.start, bounds.end, current.scope, current.owner_user_id]);
  const closures = await db.one("SELECT COUNT(*) AS count FROM period_closures WHERE period_key=?", [current.period_key]);
  const dependencies = {
    transactions: Number(transactionCount?.count || 0),
    period_closures: Number(closures?.count || 0)
  };
  const canDeleteUnused = current.status === "active"
    && dependencies.transactions === 0
    && dependencies.period_closures === 0;
  return {
    budget_id: current.budget_id,
    status: current.status,
    row_version: current.row_version,
    canDeleteUnused,
    canArchive: current.status === "active",
    dependencies,
    blockers: canDeleteUnused ? [] : [
      ...(dependencies.transactions ? ["Anggaran sudah berada pada periode/kategori yang memiliki histori transaksi."] : []),
      ...(dependencies.period_closures ? ["Periode anggaran sudah pernah ditutup dan merupakan histori perencanaan."] : [])
    ]
  };
};

export const previewBudgetLifecycle = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM budgets WHERE budget_id=?", [p.budget_id]);
  if (!current) throw appError("NOT_FOUND", "Anggaran tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  return budgetLifecycleImpact(db, current);
};

export const deleteUnusedBudget = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM budgets WHERE budget_id=? AND status='active'", [p.budget_id]);
  if (!current) throw appError("NOT_FOUND", "Anggaran aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penghapusan anggaran wajib diisi.", 400);
  const impact = await budgetLifecycleImpact(db, current);
  if (!impact.canDeleteUnused) throw appError("BUDGET_HAS_HISTORY", "Anggaran sudah menjadi bagian histori dan hanya dapat diarsipkan.", 409, { lifecycle: impact });
  await appendAudit(db, context, {
    entityType: "budget",
    entityId: current.budget_id,
    previous: publicRow(current),
    next: {
      deleted: true,
      deletion_type: "unused_budget_only",
      reason,
      dependencies: impact.dependencies,
      audit_preserved: true
    }
  });
  const deleted = await db.execute("DELETE FROM budgets WHERE budget_id=? AND row_version=? AND status='active'", [current.budget_id, current.row_version]);
  if (deleted.rowsAffected !== 1) throw appError("CONFLICT", "Anggaran berubah di perangkat lain.", 409);
  await context.enqueueMirror?.(db, "budget", current.budget_id);
  return { budget_id: current.budget_id, deleted: true, audit_preserved: true };
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
    ...nextVersionStamp(current, context.actor.user_id)
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
  const next = { ...current, status: "active", ...nextVersionStamp(current, context.actor.user_id) };
  const update = await db.execute("UPDATE budgets SET status='active',row_version=?,updated_by=?,updated_at=? WHERE budget_id=? AND row_version=? AND status='archived'", [next.row_version, next.updated_by, next.updated_at, current.budget_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Anggaran berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "budget", entityId: current.budget_id, previous: publicRow(current), next: { ...publicRow(next), restore_reason: reason } });
  await context.enqueueMirror?.(db, "budget", current.budget_id);
  return publicRow(next);
};
