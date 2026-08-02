import { appendAudit } from "./audit.js";
import { appError, nowIso, publicRow, sanitizeText, todayJakarta, uuid } from "./core.js";
import { goalProjection } from "./planning/goals.js";

export const registerPush = async (db, context) => {
  const p = context.payload || {};
  if (!/^https:\/\//.test(String(p.endpoint || "")) || !p.keys?.p256dh || !p.keys?.auth) throw appError("INVALID_SUBSCRIPTION", "Push subscription tidak valid.", 400);
  const existing = await db.one("SELECT * FROM push_subscriptions WHERE endpoint=?", [p.endpoint]);
  if (existing && existing.user_id !== context.actor.user_id) throw appError("PUSH_ENDPOINT_OWNERSHIP_CONFLICT", "Perangkat ini masih terhubung ke akun lain.", 409);
  const timestamp = nowIso();
  let next;
  if (existing) {
    next = { ...existing, p256dh: String(p.keys.p256dh), auth: String(p.keys.auth), user_agent: sanitizeText(p.userAgent, 250), status: "active", updated_at: timestamp };
    await db.execute("UPDATE push_subscriptions SET p256dh=?,auth=?,user_agent=?,status='active',updated_at=? WHERE subscription_id=?", [next.p256dh, next.auth, next.user_agent, next.updated_at, existing.subscription_id]);
  } else {
    next = { subscription_id: uuid(), user_id: context.actor.user_id, endpoint: String(p.endpoint), p256dh: String(p.keys.p256dh), auth: String(p.keys.auth), user_agent: sanitizeText(p.userAgent, 250), status: "active", created_at: timestamp, updated_at: timestamp };
    await db.execute("INSERT INTO push_subscriptions(subscription_id,user_id,endpoint,p256dh,auth,user_agent,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", Object.values(next));
  }
  await appendAudit(db, context, { entityType: "push_subscription", entityId: next.subscription_id, previous: existing ? { status: existing.status } : null, next: { status: next.status } });
  return { registered: true, subscriptionId: next.subscription_id };
};

export const unregisterPush = async (db, context) => {
  const endpoint = String(context.payload?.endpoint || "");
  const current = await db.one("SELECT * FROM push_subscriptions WHERE endpoint=? AND user_id=?", [endpoint, context.actor.user_id]);
  if (!current) throw appError("NOT_FOUND", "Subscription tidak ditemukan.", 404);
  await db.execute("UPDATE push_subscriptions SET status='inactive',updated_at=? WHERE subscription_id=?", [nowIso(), current.subscription_id]);
  await appendAudit(db, context, { entityType: "push_subscription", entityId: current.subscription_id, previous: { status: current.status }, next: { status: "inactive" } });
  return { unregistered: true };
};

export const queueNotification = async (db, { userId, type, title, body, targetPath = "/", scheduledAt = nowIso(), dedupeKey }) => {
  const safeDedupeKey = sanitizeText(dedupeKey, 200);
  if (!safeDedupeKey) throw appError("NOTIFICATION_DEDUPE_REQUIRED", "Dedupe key notifikasi wajib diisi.", 500);
  const id = uuid();
  const result = await db.execute("INSERT OR IGNORE INTO notification_queue(notification_id,user_id,notification_type,title,body,target_path,scheduled_at,status,attempt_count,last_attempt_at,locked_by,dedupe_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", [id, userId, sanitizeText(type, 60), sanitizeText(title, 80), sanitizeText(body, 180), String(targetPath).startsWith("/") ? targetPath : "/", scheduledAt, "pending", 0, null, null, safeDedupeKey, nowIso()]);
  if (result.rowsAffected === 1) return { notificationId: id, created: true };
  const existing = await db.one("SELECT notification_id FROM notification_queue WHERE dedupe_key=?", [safeDedupeKey]);
  if (!existing) throw appError("NOTIFICATION_QUEUE_CONFLICT", "Notifikasi tidak dapat diantrikan secara idempotent.", 409);
  return { notificationId: existing.notification_id, created: false };
};

export const listSubscriptionsForUser = async (db, userId) => (await db.all("SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=? AND status='active'", [userId])).map((row) => publicRow(row));


const notificationRecipients = (users, item) => item.scope === "personal"
  ? users.filter((user) => user.user_id === item.owner_user_id)
  : users;

const highestUsageThreshold = (percentage, customThreshold = 75) => {
  if (percentage >= 100) return 100;
  if (percentage >= 90) return 90;
  if (percentage >= customThreshold) return customThreshold;
  return 0;
};

const queueForRecipients = async (db, users, item, notification) => {
  let queued = 0;
  for (const user of notificationRecipients(users, item)) {
    const result = await queueNotification(db, {
      userId: user.user_id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      targetPath: notification.targetPath,
      scheduledAt: nowIso(),
      dedupeKey: `${notification.dedupeKey}:${user.user_id}`,
    });
    if (result.created) queued += 1;
  }
  return queued;
};

export const queueActionableNotifications = async (db) => {
  const today = todayJakarta();
  const period = today.slice(0, 7);
  const dueEnd = new Date(`${today}T00:00:00+07:00`);
  dueEnd.setUTCDate(dueEnd.getUTCDate() + 3);
  const dueEndDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(dueEnd);
  const users = await db.all("SELECT user_id FROM users WHERE status='active'");
  let queued = 0;

  const recurring = await db.all(`SELECT o.occurrence_id,o.due_date,o.expected_amount,o.actual_amount,r.name,r.kind,r.scope,r.owner_user_id
    FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
    WHERE r.status='active' AND o.status NOT IN ('paid','cancelled') AND o.due_date BETWEEN ? AND ?`, [today, dueEndDate]);
  for (const item of recurring) {
    queued += await queueForRecipients(db, users, item, {
      type: "recurring_due",
      title: item.kind === "income" ? "Pemasukan terjadwal" : "Tagihan mendekati jatuh tempo",
      body: `${item.name} · ${item.due_date}`,
      targetPath: "/tagihan",
      dedupeKey: `recurring:${item.occurrence_id}:${item.due_date}`,
    });
  }

  const budgets = await db.all(`SELECT b.*,COALESCE((SELECT SUM(t.amount) FROM transactions t
      WHERE t.status='active' AND t.transaction_type='expense' AND t.category_id=b.category_id
        AND substr(t.transaction_date,1,7)=b.period_key
        AND ((b.scope='shared' AND t.scope='shared') OR (b.scope='personal' AND t.scope='personal' AND t.owner_user_id=b.owner_user_id))),0) AS used_amount
    FROM budgets b WHERE b.period_key=? AND b.status='active'`, [period]);
  for (const item of budgets) {
    const percentage = Number(item.amount || 0) > 0 ? Math.round((Number(item.used_amount || 0) / Number(item.amount)) * 100) : 0;
    const threshold = highestUsageThreshold(percentage, Number(item.warning_threshold || 80));
    if (!threshold) continue;
    queued += await queueForRecipients(db, users, item, {
      type: "budget_threshold",
      title: percentage >= 100 ? "Budget terlampaui" : "Budget mendekati batas",
      body: `${item.name} · ${percentage}% terpakai`,
      targetPath: "/laporan",
      dedupeKey: `budget:${item.budget_id}:${period}:${threshold}`,
    });
  }

  const envelopes = await db.all(`SELECT p.envelope_period_id,p.name,p.allocated_amount,p.reserved_amount,r.scope,r.owner_user_id,
      COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.status='active' AND t.transaction_type='expense' AND t.envelope_period_id=p.envelope_period_id),0) AS used_amount
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    WHERE p.status='active' AND r.status='active' AND p.period_start<=? AND p.period_end>=?`, [today, today]);
  for (const item of envelopes) {
    const allocated = Number(item.allocated_amount || 0);
    const percentage = allocated > 0 ? Math.round(((Number(item.used_amount || 0) + Number(item.reserved_amount || 0)) / allocated) * 100) : 0;
    const threshold = highestUsageThreshold(percentage, 75);
    if (!threshold) continue;
    queued += await queueForRecipients(db, users, item, {
      type: "envelope_threshold",
      title: percentage >= 100 ? "Kantong habis" : "Kantong mendekati batas",
      body: `${item.name} · ${percentage}% terpakai`,
      targetPath: "/alokasi",
      dedupeKey: `envelope:${item.envelope_period_id}:${threshold}`,
    });
  }

  const goals = await db.all(`SELECT g.*,COALESCE((SELECT SUM(CASE WHEN m.movement_type='deposit' THEN m.amount WHEN m.movement_type='withdrawal' THEN -m.amount ELSE m.amount END)
      FROM goal_movements m WHERE m.goal_id=g.goal_id AND m.status='active'),0) AS current_amount
    FROM savings_goals g WHERE g.status='active' AND g.target_date IS NOT NULL`);
  for (const item of goals) {
    const projection = goalProjection(item, Number(item.current_amount || 0));
    if (projection.pace_status !== "behind" && projection.pace_status !== "overdue") continue;
    queued += await queueForRecipients(db, users, item, {
      type: "goal_behind",
      title: projection.pace_status === "overdue" ? "Target melewati tenggat" : "Target tertinggal",
      body: `${item.name} perlu ditinjau agar kembali sesuai rencana.`,
      targetPath: "/target",
      dedupeKey: `goal:${item.goal_id}:${period}:${projection.pace_status}`,
    });
  }

  const unallocated = await db.all(`SELECT scope,owner_user_id,COUNT(*) AS count
    FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id IS NULL AND substr(transaction_date,1,7)=?
    GROUP BY scope,owner_user_id`, [period]);
  for (const item of unallocated) {
    if (Number(item.count || 0) < 1) continue;
    queued += await queueForRecipients(db, users, item, {
      type: "unallocated_expense",
      title: "Transaksi belum dialokasikan",
      body: `${Number(item.count)} transaksi perlu dilengkapi sebelum tutup periode.`,
      targetPath: "/transaksi",
      dedupeKey: `unallocated:${item.scope}:${item.owner_user_id || "shared"}:${today}`,
    });
  }

  return queued;
};
