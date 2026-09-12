import { appError, nowIso, periodKey } from "../core.js";
import { cancelScheduledManualRemindersForEntity } from "../reminders.js";
import { budgetUsageAmount } from "./budgetShared.js";

export const compactBudgetsForClosedPeriod = async (db, context, periodValue) => {
  const period = periodKey(periodValue);
  const rows = await db.all(`SELECT b.*,COALESCE(c.name,b.name) AS category_name,COALESCE(er.name,'') AS envelope_name
    FROM budgets b LEFT JOIN categories c ON c.category_id=b.category_id LEFT JOIN envelope_rules er ON er.envelope_rule_id=b.envelope_rule_id
    WHERE b.period_key=? ORDER BY b.budget_id`, [period]);
  const timestamp = nowIso();
  for (const budget of rows) {
    const usedAmount = await budgetUsageAmount(db, budget);
    await db.execute(`INSERT INTO budget_history(
      budget_id,period_key,category_id,category_name,envelope_rule_id,envelope_name,name,amount,warning_threshold,recording_mode,used_amount,released_amount,final_status,ended_reason,ended_by,ended_at,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id,compacted_by,compacted_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(budget_id) DO UPDATE SET category_name=excluded.category_name,envelope_name=excluded.envelope_name,name=excluded.name,amount=excluded.amount,warning_threshold=excluded.warning_threshold,recording_mode=excluded.recording_mode,used_amount=excluded.used_amount,released_amount=excluded.released_amount,final_status=excluded.final_status,ended_reason=excluded.ended_reason,ended_by=excluded.ended_by,ended_at=excluded.ended_at,row_version=excluded.row_version,updated_by=excluded.updated_by,updated_at=excluded.updated_at,compacted_by=excluded.compacted_by,compacted_at=excluded.compacted_at`, [
      budget.budget_id, budget.period_key, budget.category_id, budget.category_name, budget.envelope_rule_id, budget.envelope_name, budget.name,
      Number(budget.amount), Number(budget.warning_threshold || 80), budget.recording_mode || "flexible", usedAmount, Number(budget.released_amount || 0),
      budget.status === "archived" ? "ended" : "closed", budget.ended_reason || "", budget.ended_by || null, budget.ended_at || null,
      Number(budget.row_version || 1), budget.created_by, budget.created_at, budget.updated_by, budget.updated_at, budget.scope, budget.owner_user_id,
      context.actor.user_id, timestamp,
    ]);
    await cancelScheduledManualRemindersForEntity(db, context, "budget", budget.budget_id, "PERIOD_CLOSED");
  }
  if (rows.length) await db.execute("DELETE FROM budgets WHERE period_key=?", [period]);
  return { compacted: rows.length };
};

export const restoreCompactedBudgetsForPeriod = async (db, context, periodValue) => {
  const period = periodKey(periodValue);
  const rows = await db.all("SELECT * FROM budget_history WHERE period_key=? ORDER BY budget_id", [period]);
  for (const history of rows) {
    const existing = await db.one("SELECT budget_id FROM budgets WHERE budget_id=?", [history.budget_id]);
    if (existing) throw appError("BUDGET_RESTORE_CONFLICT", "Kebutuhan histori sudah memiliki row operasional dan periode tidak aman dibuka kembali.", 409, { budgetId: history.budget_id });
    await db.execute(`INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,recording_mode,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id,released_amount,ended_reason,ended_by,ended_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      history.budget_id, history.period_key, history.category_id, history.envelope_rule_id, history.name, Number(history.amount), Number(history.warning_threshold || 80), history.recording_mode || "flexible",
      history.final_status === "ended" ? "archived" : "active", Number(history.row_version || 1), history.created_by, history.created_at, history.updated_by, history.updated_at,
      history.scope, history.owner_user_id, Number(history.released_amount || 0), history.ended_reason || "", history.ended_by || null, history.ended_at || null,
    ]);
  }
  if (rows.length) await db.execute("DELETE FROM budget_history WHERE period_key=?", [period]);
  return { restored: rows.length };
};
