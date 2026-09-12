import { monthBounds, periodKey, publicRow, visibleScopeSql } from "../core.js";

const unlinkedUsageUnambiguousSql = (alias) => `NOT EXISTS (
  SELECT 1 FROM budgets other
  WHERE other.budget_id<>${alias}.budget_id
    AND other.status='active'
    AND other.period_key=${alias}.period_key
    AND other.category_id=${alias}.category_id
    AND other.scope=${alias}.scope
    AND COALESCE(other.owner_user_id,'')=COALESCE(${alias}.owner_user_id,'')
    AND COALESCE(other.envelope_rule_id,'')=COALESCE(${alias}.envelope_rule_id,'')
)`;

export const budgetListStatement = (context) => {
  const period = periodKey(context.payload?.period);
  const access = visibleScopeSql(context.actor, "b");
  const bounds = monthBounds(period);
  return {
    sql: `SELECT b.*,c.name AS category_name,
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
          AND (t.budget_id=b.budget_id OR (t.budget_id IS NULL
            AND ${unlinkedUsageUnambiguousSql("b")}
            AND (b.envelope_rule_id IS NULL OR ep.envelope_rule_id=b.envelope_rule_id)))
      ),0) AS used_amount,
      bu.name AS owner_name,bu.role AS owner_role,
      er.name AS envelope_name,er.source_account_id AS envelope_source_account_id,
      er.assignee_user_id AS envelope_assignee_user_id
    FROM budgets b
    LEFT JOIN categories c ON c.category_id=b.category_id
    LEFT JOIN users bu ON bu.user_id=b.owner_user_id
    LEFT JOIN envelope_rules er ON er.envelope_rule_id=b.envelope_rule_id
    WHERE b.period_key=? AND b.status='active' AND ${access.sql}
    ORDER BY b.name,b.budget_id`,
    args: [bounds.start, bounds.end, period, ...access.args],
  };
};

const canManageBudget = (actor, row) => {
  if (!actor || !row) return false;
  const scopeAllowed = actor.role === "owner"
    || (row.scope === "shared" && !row.owner_user_id)
    || (row.scope === "personal" && row.owner_user_id === actor.user_id);
  if (!scopeAllowed) return false;
  return actor.role === "owner" || !row.envelope_assignee_user_id || row.envelope_assignee_user_id === actor.user_id;
};

export const mapBudgetListRows = (rows, context) => ({
  items: rows.map((row) => ({
    ...publicRow(row),
    name: row.name,
    category_name: row.category_name || "",
    can_manage: canManageBudget(context?.actor, row),
  })),
});

export const listBudgets = async (db, context) => {
  const statement = budgetListStatement(context);
  return mapBudgetListRows(await db.all(statement.sql, statement.args), context);
};

export const budgetReportStatement = (context) => {
  const period = periodKey(context.payload?.period);
  const access = visibleScopeSql(context.actor, "b");
  const historyAccess = visibleScopeSql(context.actor, "h");
  const bounds = monthBounds(period);
  return {
    sql: `SELECT * FROM (
      SELECT b.budget_id,b.period_key,b.category_id,b.envelope_rule_id,b.name,b.amount,b.warning_threshold,b.recording_mode,
        CASE WHEN b.status='archived' THEN 'ended' ELSE b.status END AS status,b.row_version,b.created_by,b.created_at,b.updated_by,b.updated_at,b.scope,b.owner_user_id,
        b.released_amount,b.ended_reason,b.ended_by,b.ended_at,
        c.name AS category_name,b.name AS display_name,
        COALESCE((SELECT SUM(t.amount) FROM transactions t LEFT JOIN envelope_periods ep ON ep.envelope_period_id=t.envelope_period_id
          WHERE t.status='active' AND t.transaction_type='expense' AND t.transaction_date BETWEEN ? AND ?
            AND t.category_id=b.category_id AND t.scope=b.scope AND COALESCE(t.owner_user_id,'')=COALESCE(b.owner_user_id,'')
            AND (t.budget_id=b.budget_id OR (t.budget_id IS NULL AND ${unlinkedUsageUnambiguousSql("b")}
              AND (b.envelope_rule_id IS NULL OR ep.envelope_rule_id=b.envelope_rule_id)))),0) AS used_amount,
        er.name AS envelope_name
      FROM budgets b LEFT JOIN categories c ON c.category_id=b.category_id LEFT JOIN envelope_rules er ON er.envelope_rule_id=b.envelope_rule_id
      WHERE b.period_key=? AND ${access.sql}
      UNION ALL
      SELECT h.budget_id,h.period_key,h.category_id,h.envelope_rule_id,h.name,h.amount,h.warning_threshold,h.recording_mode,h.final_status AS status,h.row_version,h.created_by,h.created_at,h.updated_by,h.updated_at,h.scope,h.owner_user_id,
        h.released_amount,h.ended_reason,h.ended_by,h.ended_at,h.category_name,h.name AS display_name,h.used_amount,h.envelope_name
      FROM budget_history h WHERE h.period_key=? AND ${historyAccess.sql}
    ) q ORDER BY display_name,budget_id`,
    args: [bounds.start, bounds.end, period, ...access.args, period, ...historyAccess.args],
  };
};

export const mapBudgetReportRows = (rows) => ({ items: rows.map((row) => ({ ...publicRow(row), name: row.display_name, category_name: row.category_name || "" })) });
