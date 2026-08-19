import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { appError, assertOwner, assertVersion, monthBounds, normalizeOwnedScope, nowIso, periodKey, positiveInteger, publicRow, sanitizeText, uuid, visibleScopeSql } from "../core.js";
import { newVersionStamp, nextVersionStamp } from "../versioning.js";
import { assertPlanningManageScope } from "./shared.js";
import { cancelScheduledManualRemindersForEntity } from "../reminders.js";
export const budgetListStatement = (context) => {
  const period = periodKey(context.payload?.period);
  const access = visibleScopeSql(context.actor, "b");
  const bounds = monthBounds(period);
  return {
    sql: `SELECT b.*,COALESCE(c.name,b.name) AS display_name,
      COALESCE((
        SELECT SUM(t.amount)
        FROM transactions t
        LEFT JOIN envelope_periods ep ON ep.envelope_period_id=t.envelope_period_id
        WHERE t.status='active'
          AND t.transaction_type='expense'
          AND t.transaction_date BETWEEN ? AND ?
          AND t.category_id=b.category_id
          AND t.scope=b.scope
          AND COALESCE(t.owner_user_id,'')=COALESCE(b.owner_user_id,'')
          AND (b.envelope_rule_id IS NULL OR ep.envelope_rule_id=b.envelope_rule_id)
      ),0) AS used_amount,
      bu.name AS owner_name,bu.role AS owner_role,
      er.name AS envelope_name,er.source_account_id AS envelope_source_account_id
    FROM budgets b
    LEFT JOIN categories c ON c.category_id=b.category_id
    LEFT JOIN users bu ON bu.user_id=b.owner_user_id
    LEFT JOIN envelope_rules er ON er.envelope_rule_id=b.envelope_rule_id
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

const resolveBudgetEnvelope = async (db, envelopeRuleId, owned) => {
  if (!envelopeRuleId) return null;
  const envelope = await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='active'", [envelopeRuleId]);
  if (!envelope) throw appError("INVALID_ENVELOPE", "Kantong Dana untuk batas pengeluaran tidak valid atau sudah diarsipkan.", 400);
  if (envelope.scope !== owned.scope || String(envelope.owner_user_id || "") !== String(owned.owner_user_id || "")) {
    throw appError("BUDGET_ENVELOPE_SCOPE_MISMATCH", "Kantong Dana dan batas pengeluaran harus memiliki kepemilikan yang sama.", 409);
  }
  return envelope;
};

export const upsertBudget = async (db, context) => {
  const p = context.payload || {};
  const period = periodKey(p.period_key);
  const category = await db.one("SELECT * FROM categories WHERE category_id=? AND status='active' AND transaction_type='expense'", [p.category_id]);
  if (!category) throw appError("INVALID_CATEGORY", "Kategori pengeluaran tidak valid.", 400);
  const owned = await normalizeOwnedScope(db, context.actor, p);
  assertPlanningManageScope(context.actor, owned);
  const envelopeRuleId = sanitizeText(p.envelope_rule_id, 100) || null;
  await resolveBudgetEnvelope(db, envelopeRuleId, owned);
  const current = await db.one("SELECT * FROM budgets WHERE period_key=? AND category_id=? AND scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'')", [period, category.category_id, owned.scope, owned.owner_user_id]);
  const amount = positiveInteger(p.amount, "Batas pengeluaran");
  const threshold = Math.min(100, Math.max(1, Number(p.warning_threshold || 80)));
  const now = nowIso();
  let next;
  if (current) {
    assertVersion(current, context.rowVersion ?? p.row_version);
    next = {
      ...current,
      envelope_rule_id: envelopeRuleId,
      name: sanitizeText(p.name || category.name, 100),
      amount,
      warning_threshold: threshold,
      status: "active",
      ...nextVersionStamp(current, context.actor.user_id, now)
    };
    const result = await db.execute("UPDATE budgets SET envelope_rule_id=?,name=?,amount=?,warning_threshold=?,status='active',row_version=?,updated_by=?,updated_at=? WHERE budget_id=? AND row_version=?", [next.envelope_rule_id, next.name, amount, threshold, next.row_version, next.updated_by, next.updated_at, current.budget_id, current.row_version]);
    if (result.rowsAffected !== 1) throw appError("CONFLICT", "Batas pengeluaran berubah di perangkat lain.", 409);
  } else {
    next = {
      budget_id: uuid(),
      period_key: period,
      category_id: category.category_id,
      envelope_rule_id: envelopeRuleId,
      name: sanitizeText(p.name || category.name, 100),
      amount,
      warning_threshold: threshold,
      status: "active",
      ...newVersionStamp(context.actor.user_id, now),
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
const budgetLifecycleResult = (current, dependencies) => {
  const normalizedDependencies = {
    transactions: Number(dependencies?.transactions || 0),
    period_closures: Number(dependencies?.period_closures || 0),
  };
  const canDeleteUnused = current.status === "active"
    && normalizedDependencies.transactions === 0
    && normalizedDependencies.period_closures === 0;
  return {
    budget_id: current.budget_id,
    status: current.status,
    row_version: current.row_version,
    canDeleteUnused,
    canArchive: current.status === "active",
    dependencies: normalizedDependencies,
    blockers: canDeleteUnused ? [] : [
      ...(normalizedDependencies.transactions ? ["Batas pengeluaran sudah berada pada periode/kategori yang memiliki histori transaksi."] : []),
      ...(normalizedDependencies.period_closures ? ["Periode batas pengeluaran sudah pernah ditutup dan merupakan histori perencanaan."] : [])
    ]
  };
};

const budgetLifecycleImpact = async (db, current) => {
  const bounds = monthBounds(current.period_key);
  const envelopeClause = current.envelope_rule_id
    ? " AND envelope_period_id IN (SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=?)"
    : "";
  const transactionCount = await db.one(`SELECT COUNT(*) AS count FROM transactions
      WHERE category_id=?
        AND transaction_date BETWEEN ? AND ?
        AND scope=?
        AND COALESCE(owner_user_id,'')=COALESCE(?,'')${envelopeClause}`,
    [current.category_id, bounds.start, bounds.end, current.scope, current.owner_user_id, ...(current.envelope_rule_id ? [current.envelope_rule_id] : [])]);
  const closures = await db.one("SELECT COUNT(*) AS count FROM period_closures WHERE period_key=?", [current.period_key]);
  return budgetLifecycleResult(current, {
    transactions: Number(transactionCount?.count || 0),
    period_closures: Number(closures?.count || 0),
  });
};

const budgetLifecycleDependencyStatement = (budgetId) => ({
  sql: `WITH current AS (SELECT * FROM budgets WHERE budget_id=?)
    SELECT (
      SELECT COUNT(*) FROM transactions t
      WHERE t.category_id=b.category_id
        AND t.transaction_date BETWEEN b.period_key||'-01' AND date(b.period_key||'-01','+1 month','-1 day')
        AND t.scope=b.scope
        AND COALESCE(t.owner_user_id,'')=COALESCE(b.owner_user_id,'')
        AND (b.envelope_rule_id IS NULL OR t.envelope_period_id IN (
          SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=b.envelope_rule_id
        ))
    ) AS transactions,
    (SELECT COUNT(*) FROM period_closures pc WHERE pc.period_key=b.period_key) AS period_closures
    FROM current b`,
  args: [budgetId],
});

export const previewBudgetLifecycle = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const budgetId = p.budget_id;
  const [currentRows, dependencyRows] = await readBatchRows(db, [{
    sql: "SELECT * FROM budgets WHERE budget_id=?",
    args: [budgetId],
  }, budgetLifecycleDependencyStatement(budgetId)]);
  const current = currentRows[0] || null;
  if (!current) throw appError("NOT_FOUND", "Batas pengeluaran tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  return budgetLifecycleResult(current, dependencyRows[0] || {});
};

export const deleteUnusedBudget = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM budgets WHERE budget_id=? AND status='active'", [p.budget_id]);
  if (!current) throw appError("NOT_FOUND", "Batas pengeluaran aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penghapusan batas pengeluaran wajib diisi.", 400);
  const impact = await budgetLifecycleImpact(db, current);
  if (!impact.canDeleteUnused) throw appError("BUDGET_HAS_HISTORY", "Batas pengeluaran sudah menjadi bagian histori dan hanya dapat diarsipkan.", 409, { lifecycle: impact });
  await cancelScheduledManualRemindersForEntity(db, context, "budget", current.budget_id, "ENTITY_DELETED");
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
  if (deleted.rowsAffected !== 1) throw appError("CONFLICT", "Batas pengeluaran berubah di perangkat lain.", 409);
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
  await cancelScheduledManualRemindersForEntity(db, context, "budget", current.budget_id, "ENTITY_ARCHIVED");
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
  if (!current) throw appError("NOT_FOUND", "Batas pengeluaran arsip tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pemulihan anggaran wajib diisi.", 400);
  const category = await db.one("SELECT status,transaction_type FROM categories WHERE category_id=?", [current.category_id]);
  if (!category || category.status !== "active" || category.transaction_type !== "expense") throw appError("CATEGORY_INACTIVE", "Kategori pengeluaran harus aktif sebelum anggaran dipulihkan.", 409);
  if (current.envelope_rule_id) {
    const envelope = await db.one("SELECT status,scope,owner_user_id FROM envelope_rules WHERE envelope_rule_id=?", [current.envelope_rule_id]);
    if (!envelope || envelope.status !== "active") throw appError("ENVELOPE_INACTIVE", "Kantong Dana terkait harus aktif sebelum batas pengeluaran dipulihkan.", 409);
    if (envelope.scope !== current.scope || String(envelope.owner_user_id || "") !== String(current.owner_user_id || "")) throw appError("BUDGET_ENVELOPE_SCOPE_MISMATCH", "Kantong Dana dan batas pengeluaran harus memiliki kepemilikan yang sama.", 409);
  }
  const duplicate = await db.one("SELECT budget_id FROM budgets WHERE budget_id<>? AND period_key=? AND category_id=? AND scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'') AND status='active' LIMIT 1", [current.budget_id, current.period_key, current.category_id, current.scope, current.owner_user_id]);
  if (duplicate) throw appError("DUPLICATE_BUDGET", "Sudah ada anggaran aktif untuk kategori, periode, dan kepemilikan yang sama.", 409);
  const next = { ...current, status: "active", ...nextVersionStamp(current, context.actor.user_id) };
  const update = await db.execute("UPDATE budgets SET status='active',row_version=?,updated_by=?,updated_at=? WHERE budget_id=? AND row_version=? AND status='archived'", [next.row_version, next.updated_by, next.updated_at, current.budget_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Batas pengeluaran berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "budget", entityId: current.budget_id, previous: publicRow(current), next: { ...publicRow(next), restore_reason: reason } });
  await context.enqueueMirror?.(db, "budget", current.budget_id);
  return publicRow(next);
};
