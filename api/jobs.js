import webpush from "web-push";
import { getDatabase } from "./_lib/db/httpClient.js";
import { assertDatabaseReady } from "./_lib/db/schema.js";
import { fail, methodNotAllowed, ok, readJsonBody } from "./_lib/http.js";
import { attachRequestId, logEvent, requestIdFrom, sanitizeError } from "./_lib/observability.js";
import { verifyScheduledJobSignature } from "./_lib/security.js";
import { callGoogleBridge, markIntegrationResult } from "./_lib/services/integrations.js";
import { createTechnicalBackup } from "./_lib/services/maintenance.js";
import { queueNotification } from "./_lib/services/notifications.js";
import { nowIso, safeSpreadsheetText, todayJakarta, uuid } from "./_lib/services/core.js";

const monthBoundary = (monthOffset, endOfMonth = false) => {
  const [year, month] = todayJakarta().split("-").map(Number);
  const date = endOfMonth
    ? new Date(Date.UTC(year, month - 1 + monthOffset + 1, 0))
    : new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  return date.toISOString().slice(0, 10);
};
const safeRows = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? safeSpreadsheetText(value) : value])));

const mirrorSnapshot = async (db) => {
  const [accounts, categories, transactions, budgets, envelopes, recurring, goals, reconciliations] = await Promise.all([
    db.all("SELECT account_id,name,account_type,owner_scope,initial_balance,initial_balance_date,allow_negative,status,row_version,created_at,updated_at FROM accounts WHERE owner_scope='shared' ORDER BY name"),
    db.all("SELECT category_id,name,transaction_type,nature,status,row_version,created_at,updated_at FROM categories ORDER BY transaction_type,name"),
    db.all("SELECT transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,amount,description,merchant,payment_method,scope,status,row_version,created_at,updated_at,cancelled_at,cancellation_reason FROM transactions WHERE scope='shared' ORDER BY transaction_date DESC,created_at DESC"),
    db.all("SELECT budget_id,period_key,category_id,name,amount,warning_threshold,scope,status,row_version,updated_at FROM budgets WHERE scope='shared' ORDER BY period_key DESC,name"),
    db.all("SELECT p.envelope_period_id,p.envelope_rule_id,p.name,p.period_start,p.period_end,p.allocated_amount,p.reserved_amount,p.status,p.row_version,r.period_type,r.scope,r.rollover_policy,r.overspend_policy,r.source_account_id FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE r.scope='shared' ORDER BY p.period_start DESC,p.name"),
    db.all("SELECT o.occurrence_id,o.recurring_rule_id,r.name,r.kind,o.due_date,o.expected_amount,o.actual_amount,o.status,r.frequency,r.payment_method,r.scope,r.status AS rule_status FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id WHERE r.scope='shared' ORDER BY o.due_date DESC,r.name"),
    db.all("SELECT g.goal_id,g.name,g.goal_type,g.target_amount,g.target_date,g.account_id,g.priority,g.scope,g.status,g.row_version,g.updated_at,COALESCE((SELECT SUM(CASE WHEN m.movement_type='deposit' THEN m.amount ELSE -m.amount END) FROM goal_movements m WHERE m.goal_id=g.goal_id AND m.status='active'),0) AS current_amount FROM savings_goals g WHERE g.scope='shared' ORDER BY g.status,g.target_date"),
    db.all("SELECT r.reconciliation_id,r.reconciled_at,a.name AS account_name,r.system_balance,r.actual_balance,r.difference,r.notes,r.status,r.created_at FROM reconciliations r JOIN accounts a ON a.account_id=r.account_id WHERE a.owner_scope='shared' ORDER BY r.reconciled_at DESC"),
  ]);
  const total = await db.one(`SELECT COALESCE(SUM(CASE WHEN a.initial_balance_date <= ? THEN a.initial_balance ELSE 0 END),0)
    + COALESCE((SELECT SUM(CASE
      WHEN t.transaction_type IN ('income','refund') THEN t.amount
      WHEN t.transaction_type='expense' THEN -t.amount
      WHEN t.transaction_type='adjustment' THEN t.amount
      ELSE 0 END)
      FROM transactions t
      WHERE t.status='active' AND t.scope='shared' AND t.transaction_date<=?),0) AS approximate_total
    FROM accounts a WHERE a.status='active' AND a.owner_scope='shared'`, [todayJakarta(), todayJakarta()]);
  return {
    generatedAt: nowIso(),
    spreadsheetId: process.env.MIRROR_SPREADSHEET_ID || "",
    sheets: {
      Ringkasan: safeRows([{ generated_at: nowIso(), schema_version: 3, approximate_total_balance: Number(total?.approximate_total || 0), note: "Mirror read-only. Saldo resmi berada di Turso dan aplikasi Saldo Bersama." }]),
      Transaksi: safeRows(transactions), Rekening: safeRows(accounts), Kategori: safeRows(categories), Anggaran: safeRows(budgets), Kantong: safeRows(envelopes), Tagihan: safeRows(recurring), Target: safeRows(goals), Rekonsiliasi: safeRows(reconciliations),
    },
  };
};

const calendarSnapshot = async (db) => {
  const items = await db.all(`SELECT o.occurrence_id,r.name,r.kind,o.due_date,o.expected_amount,o.actual_amount,o.status
    FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
    WHERE r.scope='shared' AND r.status='active' AND o.status<>'cancelled' AND o.due_date BETWEEN ? AND ? ORDER BY o.due_date,r.name`, [monthBoundary(-1), monthBoundary(12, true)]);
  return { calendarId: process.env.GOOGLE_CALENDAR_ID || "", items: items.map((item) => ({ entityId: item.occurrence_id, title: `${Number(item.actual_amount) >= Number(item.expected_amount) ? "✓ " : ""}${item.kind === "income" ? "Periksa pemasukan" : "Periksa tagihan"}: ${item.name}`, date: item.due_date, description: "Buka aplikasi Saldo Bersama untuk detail. Kalender bukan sumber status pembayaran.", status: item.status })) };
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

const consumeScheduledNonce = async (db, nonce) => db.transaction(async (tx) => {
  const timestamp = nowIso();
  await tx.execute("DELETE FROM request_nonces WHERE expires_at<?", [timestamp]);
  const existing = await tx.one("SELECT nonce FROM request_nonces WHERE nonce=?", [nonce]);
  if (existing) throw Object.assign(new Error("Request scheduler sudah pernah dipakai."), { status: 409, code: "REPLAY_DENIED" });
  await tx.execute("INSERT INTO request_nonces(nonce,channel,expires_at,created_at) VALUES(?,'scheduled_job',?,?)", [nonce, new Date(Date.now() + 5 * 60_000).toISOString(), timestamp]);
});

const processIntegrations = async (db) => {
  const workerId = `job:${uuid()}`;
  const rows = await claimOutbox(db, workerId);
  const summary = { claimed: rows.length, completed: 0, failed: 0 };
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
      for (const row of group) if (await markIntegrationResult(db, row, error)) summary.failed += 1;
    }
  }
  for (const row of rows.filter((item) => !["sheets", "calendar"].includes(item.provider))) {
    if (await markIntegrationResult(db, row, Object.assign(new Error("Provider job tidak didukung."), { code: "PROVIDER_UNSUPPORTED" }))) summary.failed += 1;
  }
  return summary;
};

const queueDueNotifications = async (db) => {
  const end = new Date(`${todayJakarta()}T00:00:00+07:00`); end.setUTCDate(end.getUTCDate() + 3);
  const endDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(end);
  const rows = await db.all(`SELECT o.occurrence_id,o.due_date,o.expected_amount,o.actual_amount,r.name,r.kind,r.scope,r.owner_user_id
    FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
    WHERE r.status='active' AND o.status NOT IN ('paid','cancelled') AND o.due_date BETWEEN ? AND ?`, [todayJakarta(), endDate]);
  const users = await db.all("SELECT user_id FROM users WHERE status='active'");
  let queued = 0;
  for (const item of rows) {
    const recipients = item.scope === "personal" ? users.filter((user) => user.user_id === item.owner_user_id) : users;
    for (const user of recipients) {
      const queuedNotification = await queueNotification(db, { userId: user.user_id, type: "recurring_due", title: item.kind === "income" ? "Pemasukan terjadwal" : "Tagihan mendekati jatuh tempo", body: `${item.name} · ${item.due_date}`, targetPath: "/recurring", scheduledAt: nowIso(), dedupeKey: `recurring:${item.occurrence_id}:${user.user_id}:${item.due_date}` });
      if (queuedNotification.created) queued += 1;
    }
  }
  return queued;
};

const processPush = async (db) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY; const privateKey = process.env.VAPID_PRIVATE_KEY; const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return { sent: 0, failed: 0, skipped: true };
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const timestamp = nowIso();
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const workerId = `push:${uuid()}`;
  await db.execute("UPDATE notification_queue SET status='failed',locked_by=NULL WHERE status='processing' AND last_attempt_at<?", [staleBefore]);
  const notifications = await db.all("SELECT * FROM notification_queue WHERE status IN ('pending','failed') AND scheduled_at<=? ORDER BY scheduled_at LIMIT 50", [timestamp]);
  let sent = 0; let failed = 0; let claimed = 0;
  for (const item of notifications) {
    const claim = await db.execute("UPDATE notification_queue SET status='processing',last_attempt_at=?,locked_by=? WHERE notification_id=? AND status IN ('pending','failed')", [nowIso(), workerId, item.notification_id]);
    if (claim.rowsAffected !== 1) continue;
    claimed += 1;
    const subscriptions = await db.all("SELECT * FROM push_subscriptions WHERE user_id=? AND status='active'", [item.user_id]);
    let delivered = false;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title: item.title, body: item.body, targetPath: item.target_path, notificationId: item.notification_id }), { TTL: 3600 });
        delivered = true;
      } catch (error) {
        if ([404, 410].includes(Number(error?.statusCode || 0))) await db.execute("UPDATE push_subscriptions SET status='inactive',updated_at=? WHERE subscription_id=?", [nowIso(), sub.subscription_id]);
      }
    }
    const attempts = Number(item.attempt_count || 0) + 1;
    const terminal = !delivered && attempts >= 5;
    const update = await db.execute("UPDATE notification_queue SET status=?,attempt_count=?,last_attempt_at=?,locked_by=NULL WHERE notification_id=? AND status='processing' AND locked_by=?", [delivered ? "sent" : terminal ? "dead_letter" : "failed", attempts, nowIso(), item.notification_id, workerId]);
    if (update.rowsAffected !== 1) continue;
    if (delivered) sent += 1; else failed += 1;
  }
  return { claimed, sent, failed, skipped: false };
};

const maybeDailyBackup = async (db) => {
  const latest = await db.one("SELECT created_at FROM backup_runs WHERE backup_type='scheduled' AND status='verified' ORDER BY created_at DESC LIMIT 1");
  if (latest && Date.now() - new Date(latest.created_at).getTime() < 20 * 60 * 60_000) return { skipped: true };
  const owner = await db.one("SELECT * FROM users WHERE role='owner' AND status='active' ORDER BY created_at LIMIT 1");
  if (!owner) return { skipped: true, reason: "NO_OWNER" };
  const context = { actor: owner, action: "backup.create", payload: { type: "scheduled" }, requestId: `job-${uuid()}`, idempotencyKey: `scheduled-backup:${todayJakarta()}` };
  return createTechnicalBackup(db, context, { type: "scheduled", audit: true });
};

export default async function handler(request, response) {
  const startedAt = Date.now(); const requestId = requestIdFrom(request); attachRequestId(response, requestId);
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  try {
    const body = await readJsonBody(request, 100_000);
    const message = verifyScheduledJobSignature(body);
    if (!message) return fail(response, 401, "INVALID_SIGNATURE", "Signature scheduler tidak valid.", { requestId });
    const db = getDatabase(); await assertDatabaseReady(db);
    await consumeScheduledNonce(db, String(message.nonce));
    const integration = await processIntegrations(db);
    const queued = await queueDueNotifications(db);
    const push = await processPush(db);
    const backup = message.includeBackup === false ? { skipped: true } : await maybeDailyBackup(db);
    logEvent("info", "jobs.request.completed", { requestId, status: 200, durationMs: Date.now() - startedAt, integration, queued, push });
    return ok(response, { integration, notificationsQueued: queued, push, backup, timestamp: nowIso() });
  } catch (error) {
    const status = error.status || 500; const code = error.code || "JOBS_ERROR";
    logEvent("error", "jobs.request.failed", { requestId, status, code, durationMs: Date.now() - startedAt, error: sanitizeError(error) });
    return fail(response, status, code, status < 500 ? error.message : "Scheduled job gagal.", { requestId });
  }
}
