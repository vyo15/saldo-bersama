import { getDatabase } from "./_lib/db/httpClient.js";
import { assertDatabaseReady, DATABASE_SCHEMA_VERSION } from "./_lib/db/schema.js";
import { createXlsx } from "./_lib/export/xlsx.js";
import { methodNotAllowed, fail } from "./_lib/http.js";
import { attachRequestId, logEvent, requestIdFrom, sanitizeError } from "./_lib/observability.js";
import { assertAllowedOrigin, enforceBestEffortRateLimit, identityRateLimitKey, readSession } from "./_lib/security.js";
import { resolveActor } from "./_lib/services/users.js";
import { nowIso, todayJakarta } from "./_lib/services/core.js";

const exportData = async (db) => {
  const [accounts, categories, transactions, budgets, envelopes, recurring, goals, reconciliations, audit] = await Promise.all([
    db.all(`SELECT a.account_id,a.name,a.account_type,a.owner_scope,a.owner_user_id,COALESCE(NULLIF(TRIM(u.name),''),NULLIF(TRIM(u.email),''),'') AS owner_name,CASE u.role WHEN 'owner' THEN 'Administrator' WHEN 'member' THEN 'Member' ELSE NULL END AS owner_role,a.initial_balance,a.initial_balance_date,a.allow_negative,a.status,a.row_version,a.created_at,a.updated_at FROM accounts a LEFT JOIN users u ON u.user_id=a.owner_user_id ORDER BY a.name`),
    db.all("SELECT category_id,name,transaction_type,nature,status,row_version,created_at,updated_at FROM categories ORDER BY transaction_type,name"),
    db.all(`SELECT t.transaction_id,t.transaction_date,t.transaction_type,t.source_account_id,t.destination_account_id,t.category_id,t.envelope_period_id,t.amount,t.description,t.merchant,t.payment_method,t.scope,t.owner_user_id,t.cost_share_mode,t.cost_share_json,COALESCE(NULLIF(TRIM(u.name),''),NULLIF(TRIM(u.email),''),'') AS owner_name,CASE u.role WHEN 'owner' THEN 'Administrator' WHEN 'member' THEN 'Member' ELSE NULL END AS owner_role,t.status,t.row_version,t.created_at,t.updated_at,t.cancelled_at,t.cancellation_reason FROM transactions t LEFT JOIN users u ON u.user_id=t.owner_user_id ORDER BY t.transaction_date DESC,t.created_at DESC`),
    db.all(`SELECT b.budget_id,b.period_key,b.category_id,b.name,b.amount,b.warning_threshold,b.scope,b.owner_user_id,COALESCE(NULLIF(TRIM(u.name),''),NULLIF(TRIM(u.email),''),'') AS owner_name,CASE u.role WHEN 'owner' THEN 'Administrator' WHEN 'member' THEN 'Member' ELSE NULL END AS owner_role,b.status,b.row_version,b.updated_at FROM budgets b LEFT JOIN users u ON u.user_id=b.owner_user_id ORDER BY b.period_key DESC,b.name`),
    db.all(`SELECT p.envelope_period_id,p.name,p.period_start,p.period_end,p.allocated_amount,p.reserved_amount,p.status,
      r.period_type,r.scope,r.assignee_user_id,COALESCE(NULLIF(TRIM(au.name),''),NULLIF(TRIM(au.email),''),'Bersama') AS assignee_name,CASE au.role WHEN 'owner' THEN 'Administrator' WHEN 'member' THEN 'Member' ELSE NULL END AS assignee_role,
      r.rollover_policy,r.overspend_policy
      FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
      LEFT JOIN users au ON au.user_id=r.assignee_user_id
      ORDER BY p.period_start DESC,p.name`),
    db.all("SELECT o.occurrence_id,r.name,r.kind,o.due_date,o.expected_amount,o.actual_amount,o.status,r.frequency,r.payment_method,r.scope FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id ORDER BY o.due_date DESC,r.name"),
    db.all("SELECT g.goal_id,g.name,g.goal_type,g.target_amount,g.target_date,g.priority,g.scope,g.status,COALESCE((SELECT SUM(CASE WHEN m.movement_type='deposit' THEN m.amount ELSE -m.amount END) FROM goal_movements m WHERE m.goal_id=g.goal_id AND m.status='active'),0) AS current_amount FROM savings_goals g ORDER BY g.status,g.target_date"),
    db.all("SELECT r.reconciliation_id,r.reconciled_at,a.name AS account_name,r.system_balance,r.actual_balance,r.difference,r.notes,r.status FROM reconciliations r JOIN accounts a ON a.account_id=r.account_id ORDER BY r.reconciled_at DESC"),
    db.all("SELECT timestamp,actor_email,action,entity_type,entity_id,result FROM audit_log ORDER BY timestamp DESC LIMIT 10000"),
  ]);
  return { Ringkasan: [{ exported_at: nowIso(), schema_version: DATABASE_SCHEMA_VERSION, timezone: "Asia/Jakarta", currency: "IDR", note: "Excel adalah export baca, bukan file restore." }], Transaksi: transactions, Rekening: accounts, Kategori: categories, Anggaran: budgets, Kantong: envelopes, Tagihan: recurring, Target: goals, Rekonsiliasi: reconciliations, Audit: audit };
};

export default async function handler(request, response) {
  const startedAt = Date.now(); const requestId = requestIdFrom(request); attachRequestId(response, requestId);
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  try {
    assertAllowedOrigin(request);
    const session = readSession(request);
    if (!session) return fail(response, 401, "UNAUTHENTICATED", "Sesi sudah berakhir.", { requestId });
    if (session.role !== "owner") return fail(response, 403, "OWNER_ONLY", "Export lengkap hanya dapat dilakukan Administrator.", { requestId });
    enforceBestEffortRateLimit(identityRateLimitKey("export", session.uid), { limit: 5, windowMs: 60_000 });
    const db = getDatabase(); await assertDatabaseReady(db); await resolveActor(db, session);
    const data = typeof db.readTransaction === "function" ? await db.readTransaction(exportData) : await exportData(db);
    const workbook = createXlsx(data);
    const fileName = `saldo-bersama-${todayJakarta()}-${new Date().toISOString().slice(11,19).replace(/:/g, "")}.xlsx`;
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Content-Length", String(workbook.length));
    logEvent("info", "export.request.completed", { requestId, status: 200, bytes: workbook.length, durationMs: Date.now() - startedAt });
    return response.end(workbook);
  } catch (error) {
    const status = error.status || 500; logEvent("error", "export.request.failed", { requestId, status, code: error.code || "EXPORT_ERROR", durationMs: Date.now() - startedAt, error: sanitizeError(error) });
    return fail(response, status, error.code || "EXPORT_ERROR", status < 500 ? error.message : "Export Excel gagal.", { requestId });
  }
}
