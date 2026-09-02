import { readBatchRows } from "../../db/readBatchRows.js";
import { addDays, nowIso, sanitizeText, todayJakarta } from "../core.js";
import { goalProjection } from "../planning/goalMovements.js";
import { queueNotification } from "./delivery.js";

// Actionable notifications are read-model derived hints only. They never mutate
// ledger, planning balances, or completion state; source services remain authoritative.
const notificationRecipients = (users, item) => {
  if (item.assignee_user_id) return users.filter((user) => user.user_id === item.assignee_user_id);
  return item.scope === "personal"
    ? users.filter((user) => user.user_id === item.owner_user_id)
    : users;
};

const highestUsageThreshold = (percentage, customThreshold = 75) => {
  if (percentage >= 100) return 100;
  if (percentage >= 90) return 90;
  if (percentage >= customThreshold) return customThreshold;
  return 0;
};

export const notificationRupiah = (value) => `Rp${Math.max(0, Math.round(Number(value || 0))).toLocaleString("id-ID")}`;

const dueTimingLabel = (today, dueDate) => {
  if (dueDate === today) return "hari ini";
  if (dueDate === addDays(today, 1)) return "besok";
  const delta = Math.round((new Date(`${dueDate}T00:00:00+07:00`).getTime() - new Date(`${today}T00:00:00+07:00`).getTime()) / 86_400_000);
  return delta > 1 ? `${delta} hari lagi` : "segera";
};

const shortName = (value, fallback) => sanitizeText(value, 60) || fallback;

const queueForRecipients = async (db, users, item, notification, disabledPreferences = new Set()) => {
  let queued = 0;
  for (const user of notificationRecipients(users, item)) {
    if (disabledPreferences.has(`${user.user_id}:${notification.type}`)) continue;
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

const actionableNotificationReadPlan = ({ today, dueEndDate, period }) => {
  const statements = [];
  const indexes = {};
  const add = (key, statement) => {
    indexes[key] = statements.length;
    statements.push(statement);
  };
  add("users", { sql: "SELECT user_id FROM users WHERE status='active'", args: [] });
  add("preferences", { sql: "SELECT user_id,notification_type FROM notification_preferences WHERE enabled=0", args: [] });
  add("recurringDue", {
    sql: `SELECT o.occurrence_id,o.due_date,o.expected_amount,o.actual_amount,o.status,o.updated_at,
      r.name,r.kind,r.scope,r.owner_user_id,r.default_account_id,
      a.account_id,a.name AS account_name,a.status AS account_status
    FROM recurring_occurrences o
    JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
    JOIN accounts a ON a.account_id=r.default_account_id
    WHERE r.status='active' AND o.status NOT IN ('paid','cancelled') AND o.due_date BETWEEN ? AND ?`,
    args: [today, dueEndDate],
  });
  add("recurringCompleted", {
    sql: `SELECT o.occurrence_id,o.due_date,o.expected_amount,o.actual_amount,o.updated_at,r.name,r.kind,r.scope,r.owner_user_id
      FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
      WHERE r.status='active' AND o.status='paid' AND substr(o.updated_at,1,10) BETWEEN ? AND ?`,
    args: [addDays(today, -3), today],
  });
  add("budgets", {
    sql: `SELECT b.*,COALESCE((SELECT SUM(t.amount) FROM transactions t
      WHERE t.status='active' AND t.transaction_type='expense' AND t.category_id=b.category_id
        AND substr(t.transaction_date,1,7)=b.period_key
        AND ((b.scope='shared' AND t.scope='shared') OR (b.scope='personal' AND t.scope='personal' AND t.owner_user_id=b.owner_user_id))),0) AS used_amount
    FROM budgets b WHERE b.period_key=? AND b.status='active'`,
    args: [period],
  });
  add("envelopes", {
    sql: `SELECT p.envelope_period_id,p.name,p.allocated_amount,p.reserved_amount,r.scope,r.owner_user_id,r.assignee_user_id,
      COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.status='active' AND t.transaction_type='expense' AND t.envelope_period_id=p.envelope_period_id),0) AS used_amount
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    WHERE p.status='active' AND r.status='active' AND p.period_start<=? AND p.period_end>=?`,
    args: [today, today],
  });
  add("goals", {
    sql: `SELECT g.*,COALESCE((SELECT SUM(CASE WHEN m.movement_type='deposit' THEN m.amount WHEN m.movement_type='withdrawal' THEN -m.amount ELSE m.amount END)
      FROM goal_movements m WHERE m.goal_id=g.goal_id AND m.status='active'),0) AS current_amount
    FROM savings_goals g WHERE g.status='active' AND g.target_date IS NOT NULL`,
    args: [],
  });
  add("unallocated", {
    sql: `SELECT scope,owner_user_id,COUNT(*) AS count,SUM(amount) AS total_amount
      FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id IS NULL AND substr(transaction_date,1,7)=?
      GROUP BY scope,owner_user_id`,
    args: [period],
  });
  add("accountBalances", {
    sql: `SELECT a.account_id,
      CASE WHEN a.initial_balance_date<=? THEN a.initial_balance ELSE 0 END + COALESCE((SELECT SUM(CASE
        WHEN t.transaction_type IN ('income','refund') AND t.destination_account_id=a.account_id THEN t.amount
        WHEN t.transaction_type='expense' AND t.source_account_id=a.account_id THEN -t.amount
        WHEN t.transaction_type='transfer' AND t.source_account_id=a.account_id THEN -t.amount
        WHEN t.transaction_type='transfer' AND t.destination_account_id=a.account_id THEN t.amount
        WHEN t.transaction_type='adjustment' AND t.source_account_id=a.account_id THEN t.amount
        ELSE 0 END)
      FROM transactions t WHERE t.status='active'
        AND t.transaction_date BETWEEN a.initial_balance_date AND ?
        AND (t.source_account_id=a.account_id OR t.destination_account_id=a.account_id)),0)
      + COALESCE((SELECT SUM(e.cash_effect) FROM investment_account_events e
        WHERE e.account_id=a.account_id AND e.event_date BETWEEN a.initial_balance_date AND ?),0) AS balance
      FROM accounts a WHERE a.status='active'`,
    args: [today, today, today],
  });
  return { statements, indexes };
};

const queueRecurringDueNotifications = async (db, state, recurring) => {
  const { today, users, disabledPreferences, accountBalances } = state;
  let queued = 0;
  for (const item of recurring) {
    queued += await queueForRecipients(db, users, item, {
      type: "recurring_due",
      title: `${shortName(item.name, item.kind === "income" ? "Pemasukan rutin" : "Tagihan")} ${item.kind === "income" ? "dijadwalkan" : "jatuh tempo"} ${dueTimingLabel(today, item.due_date)}`,
      body: item.kind === "income"
        ? `${notificationRupiah(Math.max(0, Number(item.expected_amount || 0) - Number(item.actual_amount || 0)))} dijadwalkan masuk ke ${shortName(item.account_name, "rekening tujuan")}.`
        : `${notificationRupiah(Math.max(0, Number(item.expected_amount || 0) - Number(item.actual_amount || 0)))} perlu dibayar dari ${shortName(item.account_name, "rekening sumber")}.`,
      targetPath: "/perencanaan/jadwal",
      dedupeKey: `recurring:${item.occurrence_id}:${item.due_date}`,
    }, disabledPreferences);
    const remaining = Math.max(0, Number(item.expected_amount || 0) - Number(item.actual_amount || 0));
    if (item.kind !== "expense" || remaining <= 0 || item.account_status !== "active" || item.due_date > addDays(today, 2)) continue;
    const balance = Number(accountBalances.get(item.account_id) || 0);
    if (balance >= remaining) continue;
    queued += await queueForRecipients(db, users, item, {
      type: "recurring_funding_shortage",
      title: `Dana ${shortName(item.name, "pembayaran")} belum cukup`,
      body: `Masih kurang ${notificationRupiah(remaining - balance)} dari kebutuhan ${notificationRupiah(remaining)} di ${shortName(item.account_name, "rekening sumber")}.`,
      targetPath: "/perencanaan/jadwal",
      dedupeKey: `recurring-shortage:${item.occurrence_id}:${item.due_date}`,
    }, disabledPreferences);
  }
  return queued;
};

const queueRecurringCompletedNotifications = async (db, state, items) => {
  const { users, disabledPreferences } = state;
  let queued = 0;
  for (const item of items) {
    queued += await queueForRecipients(db, users, item, {
      type: "recurring_completed",
      title: `${shortName(item.name, "Jadwal rutin")} berhasil dicatat`,
      body: `${notificationRupiah(Number(item.actual_amount || item.expected_amount || 0))} sudah tercatat sebagai ${item.kind === "income" ? "pemasukan" : "pembayaran"} rutin.`,
      targetPath: "/perencanaan/jadwal",
      dedupeKey: `recurring-completed:${item.occurrence_id}`,
    }, disabledPreferences);
  }
  return queued;
};

const queueBudgetNotifications = async (db, state, budgets) => {
  const { period, users, disabledPreferences } = state;
  let queued = 0;
  for (const item of budgets) {
    const percentage = Number(item.amount || 0) > 0 ? Math.round((Number(item.used_amount || 0) / Number(item.amount)) * 100) : 0;
    const threshold = highestUsageThreshold(percentage, Number(item.warning_threshold || 80));
    if (!threshold) continue;
    queued += await queueForRecipients(db, users, item, {
      type: "budget_threshold",
      title: `Batas ${shortName(item.name, "bulan ini")} sudah ${threshold}%`,
      body: `Terpakai ${notificationRupiah(item.used_amount)} dari ${notificationRupiah(item.amount)}. Sisa ${notificationRupiah(Math.max(0, Number(item.amount || 0) - Number(item.used_amount || 0)))}.`,
      targetPath: "/perencanaan/kantong",
      dedupeKey: `budget:${item.budget_id}:${period}:${threshold}`,
    }, disabledPreferences);
  }
  return queued;
};

const queueEnvelopeNotifications = async (db, state, envelopes) => {
  const { users, disabledPreferences } = state;
  let queued = 0;
  for (const item of envelopes) {
    const allocated = Number(item.allocated_amount || 0);
    const percentage = allocated > 0 ? Math.round(((Number(item.used_amount || 0) + Number(item.reserved_amount || 0)) / allocated) * 100) : 0;
    const threshold = highestUsageThreshold(percentage, 75);
    if (!threshold) continue;
    queued += await queueForRecipients(db, users, item, {
      type: "envelope_threshold",
      title: `Alokasi Dana ${shortName(item.name, "aktif")} sudah ${threshold}%`,
      body: `Terpakai + dipesan ${notificationRupiah(Number(item.used_amount || 0) + Number(item.reserved_amount || 0))} dari ${notificationRupiah(item.allocated_amount)}. Sisa ${notificationRupiah(Math.max(0, allocated - Number(item.used_amount || 0) - Number(item.reserved_amount || 0)))}.`,
      targetPath: "/perencanaan/kantong",
      dedupeKey: `envelope:${item.envelope_period_id}:${threshold}`,
    }, disabledPreferences);
  }
  return queued;
};

const queueGoalNotifications = async (db, state, goals) => {
  const { period, users, disabledPreferences } = state;
  let queued = 0;
  for (const item of goals) {
    const projection = goalProjection(item, Number(item.current_amount || 0));
    if (projection.pace_status !== "behind" && projection.pace_status !== "overdue") continue;
    queued += await queueForRecipients(db, users, item, {
      type: "goal_behind",
      title: `Target ${shortName(item.name, "keuangan")} ${projection.pace_status === "overdue" ? "melewati tenggat" : "tertinggal"}`,
      body: projection.pace_status === "overdue"
        ? `Masih kurang ${notificationRupiah(projection.remaining_amount)} dari target ${notificationRupiah(item.target_amount)}.`
        : `Masih kurang ${notificationRupiah(projection.remaining_amount)}. Kebutuhan rata-rata ${notificationRupiah(projection.required_monthly_amount)} per bulan.`,
      targetPath: "/target",
      dedupeKey: `goal:${item.goal_id}:${period}:${projection.pace_status}`,
    }, disabledPreferences);
  }
  return queued;
};

const queueUnallocatedExpenseNotifications = async (db, state, items) => {
  const { today, users, disabledPreferences } = state;
  let queued = 0;
  for (const item of items) {
    if (Number(item.count || 0) < 1) continue;
    queued += await queueForRecipients(db, users, item, {
      type: "unallocated_expense",
      title: `${Number(item.count || 0)} pengeluaran belum dialokasikan`,
      body: `Total ${notificationRupiah(item.total_amount)} belum masuk Alokasi Dana. Rapikan agar laporan bulan ini tetap akurat.`,
      targetPath: "/transaksi",
      dedupeKey: `unallocated:${item.scope}:${item.owner_user_id || "shared"}:${today}`,
    }, disabledPreferences);
  }
  return queued;
};

export const queueActionableNotifications = async (db) => {
  const today = todayJakarta();
  const dueEnd = new Date(`${today}T00:00:00+07:00`);
  dueEnd.setUTCDate(dueEnd.getUTCDate() + 3);
  const period = today.slice(0, 7);
  const dueEndDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(dueEnd);
  const plan = actionableNotificationReadPlan({ today, dueEndDate, period });
  const rows = await readBatchRows(db, plan.statements);
  const at = (key) => rows[plan.indexes[key]] || [];
  const state = {
    today,
    period,
    dueEndDate,
    users: at("users"),
    disabledPreferences: new Set(at("preferences").map((row) => `${row.user_id}:${row.notification_type}`)),
    accountBalances: new Map(at("accountBalances").map((row) => [row.account_id, Number(row.balance || 0)])),
  };

  let queued = 0;
  queued += await queueRecurringDueNotifications(db, state, at("recurringDue"));
  queued += await queueRecurringCompletedNotifications(db, state, at("recurringCompleted"));
  queued += await queueBudgetNotifications(db, state, at("budgets"));
  queued += await queueEnvelopeNotifications(db, state, at("envelopes"));
  queued += await queueGoalNotifications(db, state, at("goals"));
  queued += await queueUnallocatedExpenseNotifications(db, state, at("unallocated"));
  return queued;
};
