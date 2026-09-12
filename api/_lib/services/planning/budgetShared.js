import { monthBounds } from "../core.js";

export const BUDGET_IDENTITY_SQL = "period_key=? AND lower(trim(name))=lower(trim(?)) AND scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'') AND COALESCE(envelope_rule_id,'')=COALESCE(?,'')";

export const budgetIdentityArgs = ({ period_key, name, scope, owner_user_id, envelope_rule_id }) => [period_key, name, scope, owner_user_id, envelope_rule_id || null];

const hasAmbiguousUnlinkedUsage = async (db, budget) => {
  const row = await db.one(`SELECT COUNT(*) AS count FROM budgets other
    WHERE other.budget_id<>?
      AND other.status='active'
      AND other.period_key=?
      AND other.category_id=?
      AND other.scope=?
      AND COALESCE(other.owner_user_id,'')=COALESCE(?,'')
      AND COALESCE(other.envelope_rule_id,'')=COALESCE(?,'')`, [
    budget.budget_id,
    budget.period_key,
    budget.category_id,
    budget.scope,
    budget.owner_user_id,
    budget.envelope_rule_id || null,
  ]);
  return Number(row?.count || 0) > 0;
};

export const budgetUsageAmount = async (db, budget) => {
  const bounds = monthBounds(budget.period_key);
  const allowLegacyFallback = !(await hasAmbiguousUnlinkedUsage(db, budget));
  const row = await db.one(`SELECT COALESCE(SUM(t.amount),0) AS used
    FROM transactions t
    LEFT JOIN envelope_periods ep ON ep.envelope_period_id=t.envelope_period_id
    WHERE t.status='active'
      AND t.transaction_type='expense'
      AND t.transaction_date BETWEEN ? AND ?
      AND t.category_id=?
      AND t.scope=?
      AND COALESCE(t.owner_user_id,'')=COALESCE(?,'')
      AND (t.budget_id=? OR (t.budget_id IS NULL AND ?=1 AND (? IS NULL OR ep.envelope_rule_id=?)))`, [
    bounds.start, bounds.end, budget.category_id, budget.scope, budget.owner_user_id, budget.budget_id,
    allowLegacyFallback ? 1 : 0, budget.envelope_rule_id || null, budget.envelope_rule_id || null,
  ]);
  return Math.max(0, Number(row?.used || 0));
};
