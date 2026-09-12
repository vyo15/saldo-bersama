import { DATABASE_SCHEMA_VERSION } from "../db/schema.js";
import { callGoogleBridge, markIntegrationResult } from "../services/integrations.js";
import { nowIso, safeSpreadsheetText, sanitizeText, todayJakarta, uuid } from "../services/core.js";

const monthBoundary = (monthOffset, endOfMonth = false) => {
  const [year, month] = todayJakarta().split("-").map(Number);
  const date = endOfMonth
    ? new Date(Date.UTC(year, month - 1 + monthOffset + 1, 0))
    : new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  return date.toISOString().slice(0, 10);
};
const safeRows = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? safeSpreadsheetText(value) : value])));

const readJobBatchRows = async (db, statements) => typeof db.batch === "function"
  ? (await db.batch(statements)).map((result) => result.rows || [])
  : Promise.all(statements.map((statement) => db.all(statement.sql, statement.args || [])));

const mirrorSnapshot = async (db) => {
  const today = todayJakarta();
  const rows = await readJobBatchRows(db, [
    { sql: "SELECT account_id,name,account_type,owner_scope,initial_balance,initial_balance_date,allow_negative,status,row_version,created_at,updated_at FROM accounts WHERE owner_scope='shared' ORDER BY name", args: [] },
    { sql: "SELECT category_id,name,transaction_type,nature,status,row_version,created_at,updated_at FROM categories ORDER BY transaction_type,name", args: [] },
    { sql: "SELECT transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,amount,description,merchant,payment_method,scope,status,row_version,created_at,updated_at,cancelled_at,cancellation_reason FROM transactions WHERE scope='shared' ORDER BY transaction_date DESC,created_at DESC", args: [] },
    { sql: "SELECT budget_id,period_key,category_id,name,amount,warning_threshold,scope,status,row_version,updated_at FROM budgets WHERE scope='shared' ORDER BY period_key DESC,name", args: [] },
    { sql: `SELECT p.envelope_period_id,p.envelope_rule_id,p.name,p.period_start,p.period_end,p.allocated_amount,p.reserved_amount,p.status,p.row_version,
      r.period_type,r.scope,r.assignee_user_id,COALESCE(NULLIF(TRIM(au.name),''),NULLIF(TRIM(au.email),''),'Bersama') AS assignee_name,CASE au.role WHEN 'owner' THEN 'Administrator' WHEN 'member' THEN 'Member' ELSE NULL END AS assignee_role,
      r.rollover_policy,r.overspend_policy,r.source_account_id
      FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
      LEFT JOIN users au ON au.user_id=r.assignee_user_id
      WHERE r.scope='shared' ORDER BY p.period_start DESC,p.name`, args: [] },
    { sql: "SELECT o.occurrence_id,o.recurring_rule_id,r.name,r.kind,o.due_date,o.expected_amount,o.actual_amount,o.status,r.frequency,r.payment_method,r.scope,r.status AS rule_status FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id WHERE r.scope='shared' ORDER BY o.due_date DESC,r.name", args: [] },
    { sql: "SELECT g.goal_id,g.name,g.goal_type,g.target_amount,g.target_date,g.account_id,g.priority,g.scope,g.status,g.row_version,g.updated_at,COALESCE((SELECT SUM(CASE WHEN m.movement_type='deposit' THEN m.amount ELSE -m.amount END) FROM goal_movements m WHERE m.goal_id=g.goal_id AND m.status='active'),0) AS current_amount FROM savings_goals g WHERE g.scope='shared' ORDER BY g.status,g.target_date", args: [] },
    { sql: "SELECT r.reconciliation_id,r.reconciled_at,a.name AS account_name,r.system_balance,r.actual_balance,r.difference,r.notes,r.status,r.created_at FROM reconciliations r JOIN accounts a ON a.account_id=r.account_id WHERE a.owner_scope='shared' ORDER BY r.reconciled_at DESC", args: [] },
    { sql: `SELECT COALESCE(SUM(CASE WHEN a.initial_balance_date <= ? THEN a.initial_balance ELSE 0 END),0)
      + COALESCE((SELECT SUM(CASE
        WHEN t.transaction_type IN ('income','refund') THEN t.amount
        WHEN t.transaction_type='expense' THEN -t.amount
        WHEN t.transaction_type='adjustment' THEN t.amount
        ELSE 0 END)
        FROM transactions t
        WHERE t.status='active' AND t.scope='shared' AND t.transaction_date<=?),0) AS approximate_total
      FROM accounts a WHERE a.status='active' AND a.owner_scope='shared'`, args: [today, today] },
  ]);
  const [accounts, categories, transactions, budgets, envelopes, recurring, goals, reconciliations, totalRows] = rows;
  const total = totalRows[0] || null;
  return {
    generatedAt: nowIso(),
    schemaVersion: DATABASE_SCHEMA_VERSION,
    sheets: {
      Ringkasan: safeRows([{ generated_at: nowIso(), schema_version: DATABASE_SCHEMA_VERSION, approximate_total_balance: Number(total?.approximate_total || 0), note: "Mirror read-only. Saldo resmi berada di Turso dan aplikasi Saldo Bersama." }]),
      Transaksi: safeRows(transactions), Rekening: safeRows(accounts), Kategori: safeRows(categories), Anggaran: safeRows(budgets), Kantong: safeRows(envelopes), Tagihan: safeRows(recurring), Target: safeRows(goals), Rekonsiliasi: safeRows(reconciliations),
    },
  };
};

const calendarSnapshot = async (db) => {
  const items = await db.all(`SELECT o.occurrence_id,r.name,r.kind,o.due_date,o.expected_amount,o.actual_amount,o.status
    FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
    WHERE r.scope='shared' AND r.status='active' AND o.status<>'cancelled' AND o.due_date BETWEEN ? AND ? ORDER BY o.due_date,r.name`, [monthBoundary(-1), monthBoundary(12, true)]);
  return { items: items.map((item) => ({ entityId: item.occurrence_id, title: `${Number(item.actual_amount) >= Number(item.expected_amount) ? "✓ " : ""}${item.kind === "income" ? "Periksa pemasukan" : "Periksa tagihan"}: ${item.name}`, date: item.due_date, description: "Buka aplikasi Saldo Bersama untuk detail. Kalender bukan sumber status pembayaran.", status: item.status })) };
};

const claimOutbox = async (db, workerId) => db.transaction(async (tx) => {
  const timestamp = nowIso();
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const rows = await tx.all(`SELECT * FROM integration_outbox
    WHERE ((status IN ('pending','failed') AND next_attempt_at<=?) OR (status='processing' AND locked_at<?))
    ORDER BY created_at LIMIT 25`, [timestamp, staleBefore]);
  if (!rows.length) return [];
  const claimed = [];
  for (const row of rows) {
    const result = await tx.execute(`UPDATE integration_outbox
      SET status='processing',locked_at=?,locked_by=?,updated_at=?
      WHERE outbox_id=? AND ((status IN ('pending','failed') AND next_attempt_at<=?) OR (status='processing' AND locked_at<?))`,
    [timestamp, workerId, timestamp, row.outbox_id, timestamp, staleBefore]);
    if (result.rowsAffected === 1) claimed.push({ ...row, status: "processing", locked_at: timestamp, locked_by: workerId });
  }
  return claimed;
});

export const consumeScheduledNonce = async (db, nonce) => db.transaction(async (tx) => {
  const timestamp = nowIso();
  await tx.execute("DELETE FROM request_nonces WHERE expires_at<?", [timestamp]);
  const existing = await tx.one("SELECT nonce FROM request_nonces WHERE nonce=?", [nonce]);
  if (existing) throw Object.assign(new Error("Request scheduler sudah pernah dipakai."), { status: 409, code: "REPLAY_DENIED" });
  await tx.execute("INSERT INTO request_nonces(nonce,channel,expires_at,created_at) VALUES(?,'scheduled_job',?,?)", [nonce, new Date(Date.now() + 5 * 60_000).toISOString(), timestamp]);
});

export const processIntegrations = async (db) => {
  const workerId = `job:${uuid()}`;
  const rows = await claimOutbox(db, workerId);
  const summary = { claimed: rows.length, completed: 0, failed: 0, errorCode: "" };
  for (const provider of ["sheets", "calendar"]) {
    const group = rows.filter((row) => row.provider === provider);
    if (!group.length) continue;
    try {
      if (provider === "sheets") {
        const snapshot = typeof db.readTransaction === "function" ? await db.readTransaction(mirrorSnapshot) : await mirrorSnapshot(db);
        await callGoogleBridge("mirror.rebuild", snapshot);
      } else {
        const snapshot = typeof db.readTransaction === "function" ? await db.readTransaction(calendarSnapshot) : await calendarSnapshot(db);
        await callGoogleBridge("calendar.rebuild", snapshot);
      }
      for (const row of group) if (await markIntegrationResult(db, row)) summary.completed += 1;
    } catch (error) {
      if (!summary.errorCode) summary.errorCode = sanitizeText(error?.code || "INTEGRATION_FAILED", 60);
      for (const row of group) if (await markIntegrationResult(db, row, error)) summary.failed += 1;
    }
  }
  for (const row of rows.filter((item) => !["sheets", "calendar"].includes(item.provider))) {
    if (!summary.errorCode) summary.errorCode = "PROVIDER_UNSUPPORTED";
    if (await markIntegrationResult(db, row, Object.assign(new Error("Provider job tidak didukung."), { code: "PROVIDER_UNSUPPORTED" }))) summary.failed += 1;
  }
  return summary;
};

