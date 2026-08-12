import assert from "node:assert/strict";
import test from "node:test";
import { listTransactions } from "../../api/_lib/services/finance.js";
import { listGoals } from "../../api/_lib/services/planning/goals.js";
import { listBudgets } from "../../api/_lib/services/planning/budgets.js";
import { monthlyReport } from "../../api/_lib/services/reporting/dashboard.js";
import { notificationPreferences, queueActionableNotifications, updateNotificationPreference } from "../../api/_lib/services/notifications.js";
import { addDays, todayJakarta } from "../../api/_lib/services/core.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = {
  user_id: "user-owner",
  firebase_uid: "firebase-owner",
  email: "owner@example.com",
  name: "Owner",
  role: "owner",
  status: "active",
  row_version: 1,
};

const member = {
  user_id: "user-member",
  firebase_uid: "firebase-member",
  email: "member@example.com",
  name: "Partner",
  role: "member",
  status: "active",
  row_version: 1,
};

const periodOffset = (period, offset) => {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const seed = async (db) => {
  const now = new Date().toISOString();
  for (const user of [owner, member]) {
    await db.execute(
      "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [user.user_id, user.firebase_uid, user.email, user.name, user.role, user.status, 1, now, now],
    );
  }
  await db.execute(
    "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["account-bank", "Bank Bersama", "bank", "shared", null, 5_000_000, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now],
  );
  await db.execute(
    "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["account-cash", "Tunai Bersama", "cash", "shared", null, 500_000, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now],
  );
  await db.execute(
    "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ["category-food", "Makan", "expense", "variable", "", "active", 1, owner.user_id, now, owner.user_id, now],
  );
  await db.execute(
    "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ["category-salary", "Gaji", "income", "fixed", "", "active", 1, owner.user_id, now, owner.user_id, now],
  );
  return now;
};

const insertTransaction = async (db, {
  id,
  date,
  type,
  amount,
  source = null,
  destination = null,
  category = null,
  creator = owner.user_id,
  envelope = null,
}) => {
  const now = new Date().toISOString();
  await db.execute(`INSERT INTO transactions(
    transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,recurring_occurrence_id,goal_id,
    amount,description,overspend_reason,merchant,payment_method,scope,owner_user_id,status,row_version,idempotency_key,created_by,created_at,updated_by,updated_at,
    cancelled_by,cancelled_at,cancellation_reason
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    id, date, type, source, destination, category, envelope, null, null,
    amount, id, "", "", "", "shared", null, "active", 1, `idem-${id}`, creator, now, creator, now,
    null, null, "",
  ]);
};

test("filter transaksi mendukung rekening, kategori, dan pencatat tanpa melewati scope", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const period = todayJakarta().slice(0, 7);
    const date = `${period}-02`;
    await insertTransaction(db, { id: "expense-owner", date, type: "expense", amount: 50_000, source: "account-bank", category: "category-food" });
    await insertTransaction(db, { id: "expense-member", date, type: "expense", amount: 25_000, source: "account-cash", category: "category-food", creator: member.user_id });

    const result = await listTransactions(db, {
      actor: owner,
      payload: {
        period,
        account_id: "account-cash",
        category_id: "category-food",
        created_by: member.user_id,
        limit: 20,
      },
    });

    assert.deepEqual(result.items.map((item) => item.transaction_id), ["expense-member"]);
    assert.ok(result.filterOptions.accounts.some((item) => item.account_id === "account-bank"));
    assert.ok(result.filterOptions.accounts.some((item) => item.account_id === "account-cash"));
    assert.ok(result.filterOptions.creators.some((item) => item.user_id === member.user_id));
  } finally {
    db.close();
  }
});

test("anggaran Bersama dan personal menghitung transaksi sesuai ownership ledger masing-masing", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seed(db);
    const period = todayJakarta().slice(0, 7);
    const date = `${period}-02`;
    await db.execute(
      "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["account-member-budget", "Budget Member", "bank", "personal", member.user_id, 500_000, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now],
    );
    await insertTransaction(db, { id: "budget-shared-expense", date, type: "expense", amount: 80_000, source: "account-bank", category: "category-food" });
    const txNow = new Date().toISOString();
    await db.execute(`INSERT INTO transactions(
      transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,recurring_occurrence_id,goal_id,
      amount,description,overspend_reason,merchant,payment_method,scope,owner_user_id,status,row_version,idempotency_key,created_by,created_at,updated_by,updated_at,
      cancelled_by,cancelled_at,cancellation_reason
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      "budget-personal-expense", date, "expense", "account-member-budget", null, "category-food", null, null, null,
      30_000, "Personal", "", "", "", "personal", member.user_id, "active", 1, "idem-budget-personal", member.user_id, txNow, member.user_id, txNow, null, null, "",
    ]);
    const insertBudget = "INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    await db.execute(insertBudget, ["budget-shared", period, "category-food", null, "Makan Bersama", 500_000, 80, "active", 1, owner.user_id, now, owner.user_id, now, "shared", null]);
    await db.execute(insertBudget, ["budget-member", period, "category-food", null, "Makan Member", 200_000, 80, "active", 1, owner.user_id, now, owner.user_id, now, "personal", member.user_id]);

    const adminList = await listBudgets(db, { actor: owner, payload: { period } });
    assert.equal(adminList.items.find((item) => item.budget_id === "budget-shared")?.used_amount, 80_000);
    const personal = adminList.items.find((item) => item.budget_id === "budget-member");
    assert.equal(personal.used_amount, 30_000);
    assert.equal(personal.owner_name, member.name);
    assert.equal(personal.owner_role, "member");

    const memberList = await listBudgets(db, { actor: member, payload: { period } });
    assert.deepEqual(memberList.items.map((item) => item.budget_id).sort(), ["budget-member", "budget-shared"]);
  } finally {
    db.close();
  }
});

test("laporan menampilkan tren, breakdown, peringatan, dan proyeksi target dari data yang sudah ada", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seed(db);
    const period = todayJakarta().slice(0, 7);
    const previous = periodOffset(period, -1);
    await insertTransaction(db, { id: "income-prev", date: `${previous}-03`, type: "income", amount: 1_000_000, destination: "account-bank", category: "category-salary" });
    await insertTransaction(db, { id: "expense-current", date: `${period}-02`, type: "expense", amount: 95_000, source: "account-bank", category: "category-food", creator: member.user_id });
    await db.execute(
      "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["account-member-personal", "Tabungan pasangan", "bank", "personal", member.user_id, 750_000, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now],
    );
    await insertTransaction(db, { id: "expense-personal", date: `${period}-03`, type: "expense", amount: 35_000, source: "account-member-personal", category: "category-food", creator: member.user_id });

    await db.execute(
      "INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["budget-food", period, "category-food", null, "Makan", 100_000, 80, "active", 1, owner.user_id, now, owner.user_id, now, "shared", null],
    );
    const targetDate = `${Number(period.slice(0, 4)) + 1}-${period.slice(5)}-01`;
    await db.execute(
      "INSERT INTO savings_goals(goal_id,name,goal_type,target_amount,target_date,account_id,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["goal-wedding", "Tabungan nikah", "savings", 12_000_000, targetDate, "account-bank", "high", "active", 1, owner.user_id, "2025-01-01T00:00:00.000Z", owner.user_id, now, "shared", null],
    );

    const report = await monthlyReport(db, { actor: owner, payload: { period, trend_months: 3 } });
    await assert.rejects(
      monthlyReport(db, { actor: owner, payload: { period, trend_months: 4 } }),
      (error) => error.code === "INVALID_TREND_RANGE" && error.status === 400,
    );
    assert.equal(report.trend.months, 3);
    assert.equal(report.trend.items.length, 3);
    assert.equal(report.accountExpenses[0].account_id, "account-bank");
    const personalBreakdown = report.accountExpenses.find((item) => item.account_id === "account-member-personal");
    assert.equal(personalBreakdown.label, "Tabungan pasangan · Pribadi · Partner");
    const memberReport = await monthlyReport(db, { actor: member, payload: { period, trend_months: 3 } });
    assert.equal(memberReport.accountExpenses.some((item) => item.account_id === "account-bank"), true);
    assert.equal(memberReport.accountExpenses.find((item) => item.account_id === "account-member-personal")?.label, "Tabungan pasangan · Pribadi · Partner");
    assert.equal(memberReport.overview.alerts.some((item) => item.title.includes("Tabungan pasangan · Pribadi · Partner")), true);
    assert.equal(report.creatorExpenses[0].user_id, member.user_id);
    assert.equal(report.natureExpenses[0].nature, "variable");
    assert.ok(report.overview.alerts.some((item) => item.type === "budget_threshold"));

    const goals = await listGoals(db, { actor: owner, payload: {} });
    assert.equal(goals.items[0].remaining_amount, 12_000_000);
    assert.ok(goals.items[0].required_monthly_amount > 0);
    assert.ok(["behind", "on_track", "overdue"].includes(goals.items[0].pace_status));
  } finally {
    db.close();
  }
});

test("notifikasi aksi penting idempotent untuk budget dan transaksi belum dialokasikan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seed(db);
    const period = todayJakarta().slice(0, 7);
    await insertTransaction(db, { id: "expense-alert", date: `${period}-02`, type: "expense", amount: 95_000, source: "account-bank", category: "category-food" });
    await db.execute(
      "INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["budget-alert", period, "category-food", null, "Makan", 100_000, 80, "active", 1, owner.user_id, now, owner.user_id, now, "shared", null],
    );

    const first = await queueActionableNotifications(db);
    const second = await queueActionableNotifications(db);
    assert.ok(first >= 2);
    assert.equal(second, 0);
    const queued = await db.all("SELECT notification_type,dedupe_key FROM notification_queue ORDER BY notification_type,dedupe_key");
    assert.ok(queued.some((item) => item.notification_type === "budget_threshold"));
    assert.ok(queued.some((item) => item.notification_type === "unallocated_expense"));
  } finally {
    db.close();
  }
});

test("notifikasi ambang Alokasi assigned hanya dikirim kepada penerima jatah", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seed(db);
    const today = todayJakarta();
    await db.execute(
      "INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,assignee_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["rule-member-alert", "Jatah Makan Member", "monthly", "shared", null, member.user_id, 100_000, "account-bank", "unallocated", "confirm", "active", 1, owner.user_id, now, owner.user_id, now],
    );
    await db.execute(
      "INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["period-member-alert", "rule-member-alert", "Jatah Makan Member", today, today, 100_000, 0, "active", 1, owner.user_id, now, owner.user_id, now, null, null],
    );
    await insertTransaction(db, { id: "expense-member-alert", date: today, type: "expense", amount: 80_000, source: "account-bank", category: "category-food", envelope: "period-member-alert", creator: member.user_id });

    await queueActionableNotifications(db);
    const recipients = await db.all("SELECT user_id FROM notification_queue WHERE notification_type='envelope_threshold' ORDER BY user_id");
    assert.deepEqual(recipients.map((item) => item.user_id), [member.user_id]);
  } finally {
    db.close();
  }
});

test("preferensi notifikasi default aktif, per pengguna, row-version guarded, dan mencegah queue baru untuk jenis yang dimute", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seed(db);
    const period = todayJakarta().slice(0, 7);
    const defaults = await notificationPreferences(db, { actor: owner, payload: {} });
    assert.equal(defaults.items.length, 7);
    assert.equal(defaults.items.every((item) => item.enabled === true && item.row_version === null), true);

    const muted = await updateNotificationPreference(db, {
      actor: owner,
      action: "notifications.updatePreference",
      requestId: "preference-mute-budget",
      payload: { notification_type: "budget_threshold", enabled: false },
    });
    assert.equal(muted.enabled, false);
    assert.equal(muted.row_version, 1);
    await updateNotificationPreference(db, {
      actor: owner,
      action: "notifications.updatePreference",
      requestId: "preference-payload-user-ignored",
      rowVersion: muted.row_version,
      payload: { notification_type: "budget_threshold", enabled: false, row_version: muted.row_version, user_id: member.user_id },
    });
    assert.equal(await db.one("SELECT COUNT(*) AS count FROM notification_preferences WHERE user_id=? AND notification_type='budget_threshold'", [member.user_id]).then((row) => Number(row.count)), 0, "payload user_id tidak boleh mengubah preference pasangan");
    const ownerPreferenceAfterIgnoredUser = await db.one("SELECT row_version FROM notification_preferences WHERE user_id=? AND notification_type='budget_threshold'", [owner.user_id]);

    await db.execute(
      "INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["budget-preference", period, "category-food", null, "Makan", 100_000, 80, "active", 1, owner.user_id, now, owner.user_id, now, "shared", null],
    );
    await insertTransaction(db, { id: "expense-preference", date: `${period}-02`, type: "expense", amount: 95_000, source: "account-bank", category: "category-food" });
    await queueActionableNotifications(db);
    const budgetRecipients = await db.all("SELECT user_id FROM notification_queue WHERE notification_type='budget_threshold' ORDER BY user_id");
    assert.deepEqual(budgetRecipients.map((item) => item.user_id), [member.user_id], "mute owner tidak boleh mematikan alert pasangan");
    const unallocatedRecipients = await db.all("SELECT user_id FROM notification_queue WHERE notification_type='unallocated_expense' ORDER BY user_id");
    assert.deepEqual(unallocatedRecipients.map((item) => item.user_id).sort(), [member.user_id, owner.user_id].sort(), "jenis notifikasi lain tetap aktif");

    await assert.rejects(
      updateNotificationPreference(db, { actor: owner, action: "notifications.updatePreference", requestId: "stale-preference", rowVersion: 99, payload: { notification_type: "budget_threshold", enabled: true, row_version: 99 } }),
      (error) => error?.code === "CONFLICT",
    );
    const enabled = await updateNotificationPreference(db, {
      actor: owner,
      action: "notifications.updatePreference",
      requestId: "preference-enable-budget",
      rowVersion: Number(ownerPreferenceAfterIgnoredUser.row_version),
      payload: { notification_type: "budget_threshold", enabled: true, row_version: Number(ownerPreferenceAfterIgnoredUser.row_version) },
    });
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.row_version, 3);
  } finally { db.close(); }
});

test("notifikasi recurring memberi peringatan dana kurang H-2 dan status selesai tanpa membocorkan detail finansial", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seed(db);
    const today = todayJakarta();
    const dueDate = addDays(today, 2);
    await db.execute(
      "INSERT INTO recurring_rules(recurring_rule_id,name,kind,category_id,expected_amount,frequency,due_day,default_account_id,payment_method,auto_debit,start_date,end_date,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["recurring-house", "Pembayaran Rumah", "expense", "category-food", 6_000_000, "monthly", Number(dueDate.slice(-2)), "account-bank", "transfer", 0, today, null, "high", "active", 1, owner.user_id, now, owner.user_id, now, "shared", null],
    );
    await db.execute(
      "INSERT INTO recurring_occurrences(occurrence_id,recurring_rule_id,period_key,due_date,expected_amount,actual_amount,status,transaction_ids_json,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ["occurrence-house", "recurring-house", dueDate.slice(0, 7), dueDate, 6_000_000, 0, "expected", "[]", 1, now, now],
    );
    await db.execute(
      "INSERT INTO recurring_occurrences(occurrence_id,recurring_rule_id,period_key,due_date,expected_amount,actual_amount,status,transaction_ids_json,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ["occurrence-skipped", "recurring-house", addDays(today, 1).slice(0, 7), addDays(today, 1), 6_000_000, 0, "cancelled", "[]", 1, now, now],
    );

    const first = await queueActionableNotifications(db);
    assert.equal(first, 4, "shared due + shortage harus dibuat untuk dua user");
    const shortage = await db.all("SELECT user_id,notification_type,title,body,target_path,dedupe_key FROM notification_queue WHERE notification_type='recurring_funding_shortage' ORDER BY user_id");
    assert.equal(shortage.length, 2);
    assert.deepEqual(shortage.map((item) => item.user_id).sort(), [member.user_id, owner.user_id].sort());
    for (const item of shortage) {
      assert.equal(item.target_path, "/tagihan");
      assert.doesNotMatch(item.body, /Pembayaran Rumah|6[.]?000[.]?000|Bank Bersama/i);
      assert.doesNotMatch(item.title, /Pembayaran Rumah|Rp/i);
    }
    assert.equal(await queueActionableNotifications(db), 0, "dedupe mencegah push berulang untuk occurrence yang sama");

    await db.execute("UPDATE recurring_occurrences SET status='paid',actual_amount=expected_amount,row_version=row_version+1,updated_at=? WHERE occurrence_id=?", [new Date().toISOString(), "occurrence-house"]);
    const completionQueued = await queueActionableNotifications(db);
    assert.equal(completionQueued, 2, "completion shared dikirim sekali ke dua user");
    const completed = await db.all("SELECT user_id,title,body,target_path FROM notification_queue WHERE notification_type='recurring_completed'");
    assert.equal(completed.length, 2);
    for (const item of completed) {
      assert.equal(item.target_path, "/tagihan");
      assert.doesNotMatch(item.body, /Pembayaran Rumah|6[.]?000[.]?000|Bank Bersama/i);
    }
  } finally { db.close(); }
});
