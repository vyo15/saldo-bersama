import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { appError, assertOwner, assertVersion, nowIso, publicRow, sanitizeText } from "../core.js";
import { nextVersionStamp } from "../versioning.js";
import { cancelScheduledManualRemindersForEntity } from "../reminders.js";
import { adjustEnvelopeForBudgetDelta, releaseEnvelopeForBudgetRemoval } from "./budgetFunding.js";
import { retireRecurringRulesForBudget } from "./recurring.js";
import { assertEnvelopeAssigneeAccess, assertPlanningManageScope } from "./shared.js";
import { BUDGET_IDENTITY_SQL, budgetIdentityArgs, budgetUsageAmount } from "./budgetShared.js";

const budgetManageStatement = (budgetId) => ({
  sql: "SELECT * FROM budgets WHERE budget_id=?",
  args: [budgetId],
});

const assertBudgetManageAccess = (actor, current, dependencies = {}) => {
  assertPlanningManageScope(actor, current, { allowOwnedPersonal: true });
  if (current.envelope_rule_id) assertEnvelopeAssigneeAccess(actor, { assignee_user_id: dependencies.envelope_assignee_user_id || null });
};

const budgetLifecycleDependencyStatement = (budgetId) => ({
  sql: `WITH current AS (SELECT * FROM budgets WHERE budget_id=?),
    envelope AS (
      SELECT p.*,r.assignee_user_id
      FROM envelope_periods p
      JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
      JOIN current b ON b.envelope_rule_id=p.envelope_rule_id
      WHERE p.period_start<=date(b.period_key||'-01','+1 month','-1 day')
        AND p.period_end>=b.period_key||'-01'
      ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'closed' THEN 1 ELSE 2 END,p.period_start DESC
      LIMIT 1
    )
    SELECT
      (SELECT COUNT(*) FROM transactions t,current b
        LEFT JOIN envelope_periods tep ON tep.envelope_period_id=t.envelope_period_id
        WHERE t.transaction_date BETWEEN b.period_key||'-01' AND date(b.period_key||'-01','+1 month','-1 day')
          AND t.scope=b.scope
          AND COALESCE(t.owner_user_id,'')=COALESCE(b.owner_user_id,'')
          AND (t.budget_id=b.budget_id OR (t.budget_id IS NULL AND t.category_id=b.category_id
            AND NOT EXISTS (SELECT 1 FROM budgets sibling WHERE sibling.budget_id<>b.budget_id AND sibling.status='active'
              AND sibling.period_key=b.period_key AND sibling.category_id=b.category_id AND sibling.scope=b.scope
              AND COALESCE(sibling.owner_user_id,'')=COALESCE(b.owner_user_id,'')
              AND COALESCE(sibling.envelope_rule_id,'')=COALESCE(b.envelope_rule_id,''))
            AND (b.envelope_rule_id IS NULL OR tep.envelope_rule_id=b.envelope_rule_id)))) AS transactions,
      (SELECT COALESCE(SUM(t.amount),0) FROM transactions t,current b
        LEFT JOIN envelope_periods tep ON tep.envelope_period_id=t.envelope_period_id
        WHERE t.status='active' AND t.transaction_type='expense'
          AND t.transaction_date BETWEEN b.period_key||'-01' AND date(b.period_key||'-01','+1 month','-1 day')
          AND t.scope=b.scope
          AND COALESCE(t.owner_user_id,'')=COALESCE(b.owner_user_id,'')
          AND (t.budget_id=b.budget_id OR (t.budget_id IS NULL AND t.category_id=b.category_id
            AND NOT EXISTS (SELECT 1 FROM budgets sibling WHERE sibling.budget_id<>b.budget_id AND sibling.status='active'
              AND sibling.period_key=b.period_key AND sibling.category_id=b.category_id AND sibling.scope=b.scope
              AND COALESCE(sibling.owner_user_id,'')=COALESCE(b.owner_user_id,'')
              AND COALESCE(sibling.envelope_rule_id,'')=COALESCE(b.envelope_rule_id,''))
            AND (b.envelope_rule_id IS NULL OR tep.envelope_rule_id=b.envelope_rule_id)))) AS used_amount,
      (SELECT COUNT(*) FROM period_closures pc,current b WHERE pc.period_key=b.period_key) AS period_closures,
      (SELECT COUNT(*) FROM recurring_rules rr,current b WHERE rr.budget_id=b.budget_id AND rr.status='active') AS recurring_rules,
      (SELECT COUNT(*) FROM recurring_occurrences ro
        JOIN recurring_rules rr ON rr.recurring_rule_id=ro.recurring_rule_id,current b
        WHERE rr.budget_id=b.budget_id
          AND (ro.actual_amount>0 OR ro.status<>'expected' OR EXISTS(
            SELECT 1 FROM transactions t WHERE t.recurring_occurrence_id=ro.occurrence_id
          ))) AS recurring_history,
      (SELECT assignee_user_id FROM envelope) AS envelope_assignee_user_id,
      (SELECT envelope_period_id FROM envelope) AS envelope_period_id,
      (SELECT allocated_amount FROM envelope) AS envelope_allocated_amount,
      (SELECT reserved_amount FROM envelope) AS envelope_reserved_amount,
      (SELECT COALESCE(SUM(t.amount),0) FROM transactions t,envelope e
        WHERE t.status='active' AND t.transaction_type='expense' AND t.envelope_period_id=e.envelope_period_id) AS envelope_used_amount,
      (SELECT COALESCE(SUM(CASE WHEN other.amount>other_used.used_amount THEN other.amount-other_used.used_amount ELSE 0 END),0)
        FROM budgets other,current b
        JOIN (
          SELECT candidate.budget_id,
            COALESCE((SELECT SUM(t.amount) FROM transactions t
              LEFT JOIN envelope_periods tep ON tep.envelope_period_id=t.envelope_period_id
              WHERE t.status='active' AND t.transaction_type='expense'
                AND t.transaction_date BETWEEN candidate.period_key||'-01' AND date(candidate.period_key||'-01','+1 month','-1 day')
                AND t.scope=candidate.scope
                AND COALESCE(t.owner_user_id,'')=COALESCE(candidate.owner_user_id,'')
                AND (t.budget_id=candidate.budget_id OR (t.budget_id IS NULL AND t.category_id=candidate.category_id
                  AND NOT EXISTS (SELECT 1 FROM budgets sibling WHERE sibling.budget_id<>candidate.budget_id AND sibling.status='active'
                    AND sibling.period_key=candidate.period_key AND sibling.category_id=candidate.category_id AND sibling.scope=candidate.scope
                    AND COALESCE(sibling.owner_user_id,'')=COALESCE(candidate.owner_user_id,'')
                    AND COALESCE(sibling.envelope_rule_id,'')=COALESCE(candidate.envelope_rule_id,''))
                  AND (candidate.envelope_rule_id IS NULL OR tep.envelope_rule_id=candidate.envelope_rule_id)))),0) AS used_amount
          FROM budgets candidate,current cb
          WHERE candidate.status='active' AND candidate.period_key=cb.period_key
            AND COALESCE(candidate.envelope_rule_id,'')=COALESCE(cb.envelope_rule_id,'')
            AND candidate.budget_id<>cb.budget_id
        ) other_used ON other_used.budget_id=other.budget_id
        WHERE other.status='active' AND other.period_key=b.period_key
          AND COALESCE(other.envelope_rule_id,'')=COALESCE(b.envelope_rule_id,'')
          AND other.budget_id<>b.budget_id) AS other_remaining_needs
    FROM current`,
  args: [budgetId],
});

const normalizedBudgetDependencies = (dependencies = {}) => ({
  transactions: Number(dependencies.transactions || 0),
  period_closures: Number(dependencies.period_closures || 0),
  recurring_rules: Number(dependencies.recurring_rules || 0),
  recurring_history: Number(dependencies.recurring_history || 0),
});

const budgetLifecycleBlockers = (dependencies) => {
  const blockers = [];
  if (dependencies.transactions) blockers.push("Kebutuhan sudah memiliki histori transaksi.");
  if (dependencies.period_closures) blockers.push("Periode kebutuhan sudah pernah ditutup dan merupakan histori perencanaan.");
  if (dependencies.recurring_history) blockers.push("Kebutuhan sudah memiliki histori jadwal pembayaran.");
  return blockers;
};

const budgetReleasePreview = (current, dependencies = {}) => {
  if (current.status !== "active" || !current.envelope_rule_id || dependencies.envelope_period_id == null) {
    return { usedAmount: Number(dependencies.used_amount || 0), currentRemainingNeed: 0, amount: 0 };
  }
  const usedAmount = Math.max(0, Number(dependencies.used_amount || 0));
  const currentRemainingNeed = Math.max(0, Number(current.amount || 0) - usedAmount);
  const currentPool = Math.max(0,
    Number(dependencies.envelope_allocated_amount || 0)
      - Number(dependencies.envelope_reserved_amount || 0)
      - Number(dependencies.envelope_used_amount || 0));
  const otherRemainingNeeds = Math.max(0, Number(dependencies.other_remaining_needs || 0));
  const inferredBuffer = Math.max(0, currentPool - otherRemainingNeeds - currentRemainingNeed);
  const releasableWithoutTouchingOtherNeeds = Math.max(0, currentPool - otherRemainingNeeds - inferredBuffer);
  return {
    usedAmount,
    currentRemainingNeed,
    amount: Math.min(currentRemainingNeed, releasableWithoutTouchingOtherNeeds),
  };
};

const budgetLifecycleResult = (current, dependencies = {}) => {
  const normalizedDependencies = normalizedBudgetDependencies(dependencies);
  const release = budgetReleasePreview(current, dependencies);
  const canDeleteUnused = current.status === "active"
    && normalizedDependencies.transactions === 0
    && normalizedDependencies.period_closures === 0
    && normalizedDependencies.recurring_history === 0;
  return {
    budget_id: current.budget_id,
    status: current.status,
    row_version: current.row_version,
    canDeleteUnused,
    canArchive: current.status === "active",
    dependencies: normalizedDependencies,
    used_amount: release.usedAmount,
    remaining_amount: release.currentRemainingNeed,
    releasable_amount: release.amount,
    blockers: canDeleteUnused ? [] : budgetLifecycleBlockers(normalizedDependencies),
  };
};

const budgetLifecycleImpact = async (db, current) => {
  const rows = await db.all(budgetLifecycleDependencyStatement(current.budget_id).sql, [current.budget_id]);
  return budgetLifecycleResult(current, rows[0] || {});
};

export const previewBudgetLifecycle = async (db, context) => {
  const p = context.payload || {};
  const budgetId = p.budget_id;
  const [currentRows, dependencyRows] = await readBatchRows(db, [budgetManageStatement(budgetId), budgetLifecycleDependencyStatement(budgetId)]);
  const current = currentRows[0] || null;
  if (!current) throw appError("NOT_FOUND", "Kebutuhan tidak ditemukan.", 404);
  const dependencies = dependencyRows[0] || {};
  assertBudgetManageAccess(context.actor, current, dependencies);
  assertVersion(current, context.rowVersion ?? p.row_version);
  return budgetLifecycleResult(current, dependencies);
};

const deleteUnusedBudgetRow = async (db, context, current, impact, funding, schedules, reason) => {
  await appendAudit(db, context, {
    entityType: "budget",
    entityId: current.budget_id,
    previous: publicRow(current),
    next: {
      deleted: true,
      deletion_type: "unused_budget_only",
      reason,
      released_amount: Number(funding.amount || 0),
      dependencies: impact.dependencies,
      stopped_schedules: schedules,
      audit_preserved: true,
    },
  });
  const deleted = await db.execute("DELETE FROM budgets WHERE budget_id=? AND row_version=? AND status='active'", [current.budget_id, current.row_version]);
  if (deleted.rowsAffected !== 1) throw appError("CONFLICT", "Kebutuhan berubah di perangkat lain.", 409);
  await context.enqueueMirror?.(db, "budget", current.budget_id);
  return {
    budget_id: current.budget_id,
    outcome: "deleted_unused",
    deleted: true,
    released_amount: Number(funding.amount || 0),
    stopped_schedules: schedules,
    audit_preserved: true,
  };
};

const archiveBudgetRow = async (db, context, current, funding, schedules, reason) => {
  const timestamp = nowIso();
  const next = {
    ...current,
    status: "archived",
    released_amount: Number(current.released_amount || 0) + Number(funding.amount || 0),
    ended_reason: reason,
    ended_by: context.actor.user_id,
    ended_at: timestamp,
    ...nextVersionStamp(current, context.actor.user_id, timestamp),
  };
  const result = await db.execute(`UPDATE budgets SET status='archived',released_amount=?,ended_reason=?,ended_by=?,ended_at=?,row_version=?,updated_by=?,updated_at=?
    WHERE budget_id=? AND row_version=? AND status='active'`, [next.released_amount, next.ended_reason, next.ended_by, next.ended_at, next.row_version, next.updated_by, next.updated_at, current.budget_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Kebutuhan berubah di perangkat lain.", 409);
  await appendAudit(db, context, {
    entityType: "budget",
    entityId: current.budget_id,
    previous: publicRow(current),
    next: { ...publicRow(next), lifecycle_reason: reason, released_amount: Number(funding.amount || 0), stopped_schedules: schedules },
  });
  await context.enqueueMirror?.(db, "budget", current.budget_id);
  return { ...publicRow(next), outcome: "ended", released_amount_this_action: Number(funding.amount || 0), stopped_schedules: schedules };
};

const endBudget = async (db, context, current, options = {}) => {
  const { reason, envelopePeriodId = "", forceDeleteUnused = false, forceArchive = false } = options;
  const impact = await budgetLifecycleImpact(db, current);
  if (forceDeleteUnused && !impact.canDeleteUnused) {
    throw appError("BUDGET_HAS_HISTORY", "Kebutuhan sudah menjadi bagian histori dan tidak dapat dihapus permanen.", 409, { lifecycle: impact });
  }
  const releaseReason = impact.canDeleteUnused
    ? "Dana Kebutuhan yang dihapus dikembalikan otomatis"
    : "Sisa dana Kebutuhan yang dihentikan dikembalikan otomatis";
  const funding = await releaseEnvelopeForBudgetRemoval(db, context, { budget: current, envelopePeriodId, reason: releaseReason });
  const schedules = await retireRecurringRulesForBudget(db, context, current.budget_id, reason);
  const reminderReason = impact.canDeleteUnused ? "ENTITY_DELETED" : "ENTITY_ARCHIVED";
  await cancelScheduledManualRemindersForEntity(db, context, "budget", current.budget_id, reminderReason);
  if (impact.canDeleteUnused && !forceArchive) return deleteUnusedBudgetRow(db, context, current, impact, funding, schedules, reason);
  return archiveBudgetRow(db, context, current, funding, schedules, reason);
};

export const removeBudget = async (db, context) => {
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM budgets WHERE budget_id=?", [p.budget_id]);
  if (!current || current.status !== "active") throw appError("NOT_FOUND", "Kebutuhan aktif tidak ditemukan.", 404);
  const dependencyRows = await db.all(budgetLifecycleDependencyStatement(current.budget_id).sql, [current.budget_id]);
  assertBudgetManageAccess(context.actor, current, dependencyRows[0] || {});
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan menghapus kebutuhan wajib diisi.", 400);
  return endBudget(db, context, current, { reason, envelopePeriodId: sanitizeText(p.envelope_period_id, 100) });
};

export const deleteUnusedBudget = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM budgets WHERE budget_id=? AND status='active'", [p.budget_id]);
  if (!current) throw appError("NOT_FOUND", "Kebutuhan aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penghapusan kebutuhan wajib diisi.", 400);
  return endBudget(db, context, current, { reason, envelopePeriodId: sanitizeText(p.envelope_period_id, 100), forceDeleteUnused: true });
};

export const archiveBudget = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM budgets WHERE budget_id=? AND status='active'", [p.budget_id]);
  if (!current) throw appError("NOT_FOUND", "Kebutuhan aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penghentian kebutuhan wajib diisi.", 400);
  return endBudget(db, context, current, { reason, envelopePeriodId: sanitizeText(p.envelope_period_id, 100), forceArchive: true });
};

export const restoreBudget = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM budgets WHERE budget_id=? AND status='archived'", [p.budget_id]);
  if (!current) throw appError("NOT_FOUND", "Kebutuhan yang dihentikan tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pemulihan kebutuhan wajib diisi.", 400);
  const category = await db.one("SELECT status,transaction_type FROM categories WHERE category_id=?", [current.category_id]);
  if (!category || category.status !== "active" || category.transaction_type !== "expense") throw appError("CATEGORY_INACTIVE", "Kategori pengeluaran harus aktif sebelum kebutuhan dipulihkan.", 409);
  if (current.envelope_rule_id) {
    const envelope = await db.one("SELECT status,scope,owner_user_id FROM envelope_rules WHERE envelope_rule_id=?", [current.envelope_rule_id]);
    if (!envelope || envelope.status !== "active") throw appError("ENVELOPE_INACTIVE", "Alokasi Dana terkait harus aktif sebelum kebutuhan dipulihkan.", 409);
    if (envelope.scope !== current.scope || String(envelope.owner_user_id || "") !== String(current.owner_user_id || "")) throw appError("BUDGET_ENVELOPE_SCOPE_MISMATCH", "Alokasi Dana dan kebutuhan harus memiliki kepemilikan yang sama.", 409);
  }
  const duplicate = await db.one(`SELECT budget_id FROM budgets WHERE budget_id<>? AND ${BUDGET_IDENTITY_SQL} AND status='active' LIMIT 1`, [current.budget_id, ...budgetIdentityArgs(current)]);
  if (duplicate) throw appError("DUPLICATE_BUDGET", "Sudah ada Kebutuhan aktif dengan nama yang sama pada periode dan Alokasi Dana tersebut.", 409);
  if (current.envelope_rule_id) {
    const usedAmount = await budgetUsageAmount(db, current);
    const remainingNeed = Math.max(0, Number(current.amount || 0) - usedAmount);
    await adjustEnvelopeForBudgetDelta(db, context, {
      envelopeRuleId: current.envelope_rule_id,
      envelopePeriodId: sanitizeText(p.envelope_period_id, 100),
      periodKey: current.period_key,
      delta: remainingNeed,
      reason: "Pendanaan otomatis Kebutuhan yang dipulihkan",
    });
  }
  const timestamp = nowIso();
  const next = {
    ...current,
    status: "active",
    released_amount: 0,
    ended_reason: "",
    ended_by: null,
    ended_at: null,
    ...nextVersionStamp(current, context.actor.user_id, timestamp),
  };
  const update = await db.execute(`UPDATE budgets SET status='active',released_amount=0,ended_reason='',ended_by=NULL,ended_at=NULL,row_version=?,updated_by=?,updated_at=?
    WHERE budget_id=? AND row_version=? AND status='archived'`, [next.row_version, next.updated_by, next.updated_at, current.budget_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Kebutuhan berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "budget", entityId: current.budget_id, previous: publicRow(current), next: { ...publicRow(next), restore_reason: reason } });
  await context.enqueueMirror?.(db, "budget", current.budget_id);
  return publicRow(next);
};

