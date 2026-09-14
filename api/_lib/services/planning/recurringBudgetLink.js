const normalizedOwner = (value) => String(value || "");

const sourceBudget = async (db, budgetId) => {
  if (!budgetId) return null;
  const activeOrArchived = await db.one("SELECT budget_id,period_key,category_id,envelope_rule_id,name,scope,owner_user_id,status FROM budgets WHERE budget_id=?", [budgetId]);
  if (activeOrArchived) return activeOrArchived;
  return db.one("SELECT budget_id,period_key,category_id,envelope_rule_id,name,scope,owner_user_id,final_status AS status FROM budget_history WHERE budget_id=?", [budgetId]);
};

export const resolveRecurringBudgetForPeriod = async (db, rule, targetPeriodKey) => {
  if (!rule?.budget_id) return null;
  const periodKey = String(targetPeriodKey || "");
  const exact = await db.one("SELECT * FROM budgets WHERE budget_id=? AND period_key=? AND status='active'", [rule.budget_id, periodKey]);
  if (exact) return exact;

  const source = await sourceBudget(db, rule.budget_id);
  if (!source) return null;
  const candidates = await db.all(`SELECT * FROM budgets
    WHERE period_key=? AND status='active' AND category_id=?
      AND COALESCE(envelope_rule_id,'')=COALESCE(?,'')
      AND lower(trim(name))=lower(trim(?))
      AND scope=? AND COALESCE(owner_user_id,'')=?
    ORDER BY updated_at DESC,budget_id`, [
    periodKey,
    source.category_id,
    source.envelope_rule_id || null,
    source.name,
    source.scope,
    normalizedOwner(source.owner_user_id),
  ]);
  return candidates.length === 1 ? candidates[0] : null;
};

export const resolveBudgetEnvelopePeriodForDate = async (db, budget, transactionDate, accountId = null) => {
  if (!budget?.envelope_rule_id) return null;
  return db.one(`SELECT p.*,r.source_account_id,r.scope,r.owner_user_id,r.assignee_user_id,r.overspend_policy
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    WHERE p.envelope_rule_id=? AND p.status='active' AND r.status='active'
      AND ? BETWEEN p.period_start AND p.period_end
      AND (? IS NULL OR r.source_account_id=?)
    ORDER BY p.period_start DESC,p.envelope_period_id LIMIT 1`, [budget.envelope_rule_id, transactionDate, accountId, accountId]);
};

export const fundedBudgetCapacity = async (db, budget, envelopePeriod) => {
  if (!budget || !envelopePeriod) return { ready: false, budgetRemaining: 0, envelopeRemaining: 0 };
  const [budgetUsage, envelopeUsage] = await Promise.all([
    db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND budget_id=?", [budget.budget_id]),
    db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?", [envelopePeriod.envelope_period_id]),
  ]);
  const budgetRemaining = Math.max(0, Number(budget.amount || 0) - Number(budgetUsage?.used || 0));
  const envelopeRemaining = Math.max(0, Number(envelopePeriod.allocated_amount || 0) - Number(envelopePeriod.reserved_amount || 0) - Number(envelopeUsage?.used || 0));
  return { ready: true, budgetRemaining, envelopeRemaining };
};
