import assert from "node:assert/strict";
import test from "node:test";
import { addDays, todayJakarta } from "../../api/_lib/services/core.js";
import { archiveBudget } from "../../api/_lib/services/planning/budgets.js";
import { integrityIssues } from "../../api/_lib/services/reporting/integrity.js";
import {
  cancelManualReminder,
  getManualReminder,
  manualReminderInstant,
  queueDueManualReminders,
  upsertManualReminder,
} from "../../api/_lib/services/reminders.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = {
  user_id: "reminder-owner",
  firebase_uid: "firebase-reminder-owner",
  email: "owner-reminder@example.com",
  name: "Owner Reminder",
  role: "owner",
  status: "active",
  row_version: 1,
};

const member = {
  user_id: "reminder-member",
  firebase_uid: "firebase-reminder-member",
  email: "member-reminder@example.com",
  name: "Member Reminder",
  role: "member",
  status: "active",
  row_version: 1,
};

const context = (actor, action, payload, rowVersion = null) => ({
  actor,
  action,
  payload,
  rowVersion,
  requestId: `test:${action}:${Math.random()}`,
});

const futureLocal = (days = 2, hour = "08:00") => `${addDays(todayJakarta(), days)}T${hour}`;

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
    ["reminder-account", "BCA Utama", "bank", "shared", null, 2_000_000, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now],
  );
  await db.execute(
    "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ["reminder-category", "Makan", "expense", "variable", "", "active", 1, owner.user_id, now, owner.user_id, now],
  );
  const period = todayJakarta().slice(0, 7);
  await db.execute(
    "INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["reminder-budget", period, "reminder-category", null, "Makan", 1_500_000, 80, "active", 1, owner.user_id, now, owner.user_id, now, "shared", null],
  );
  await db.execute(
    "INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["reminder-budget-owner", period, "reminder-category", null, "Pribadi Owner", 500_000, 80, "active", 1, owner.user_id, now, owner.user_id, now, "personal", owner.user_id],
  );
  await db.execute(
    "INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,assignee_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["reminder-envelope-rule", "Belanja", "monthly", "shared", null, owner.user_id, 1_000_000, "reminder-account", "unallocated", "confirm", "active", 1, owner.user_id, now, owner.user_id, now],
  );
  await db.execute(
    "INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["reminder-envelope", "reminder-envelope-rule", "Belanja", `${period}-01`, addDays(todayJakarta(), 10), 1_000_000, 0, "active", 1, owner.user_id, now, owner.user_id, now, null, null],
  );
  await db.execute(
    "INSERT INTO recurring_rules(recurring_rule_id,name,kind,category_id,expected_amount,frequency,due_day,default_account_id,payment_method,auto_debit,start_date,end_date,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["reminder-rule", "Internet Rumah", "expense", "reminder-category", 325_000, "monthly", 20, "reminder-account", "transfer", 0, todayJakarta(), null, "normal", "active", 1, owner.user_id, now, owner.user_id, now, "shared", null],
  );
  const due = addDays(todayJakarta(), 5);
  await db.execute(
    "INSERT INTO recurring_occurrences(occurrence_id,recurring_rule_id,period_key,due_date,expected_amount,actual_amount,status,transaction_ids_json,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ["reminder-occurrence", "reminder-rule", due.slice(0, 7), due, 325_000, 0, "expected", "[]", 1, now, now],
  );
  await db.execute(
    "INSERT INTO savings_goals(goal_id,name,goal_type,target_amount,target_date,account_id,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["reminder-goal", "Dana Darurat", "emergency_fund", 12_000_000, addDays(todayJakarta(), 60), "reminder-account", "high", "active", 1, owner.user_id, now, owner.user_id, now, "shared", null],
  );
};

test("waktu pengingat manual wajib valid, future, dan maksimal satu tahun", () => {
  const now = new Date("2026-08-17T05:00:00.000Z");
  assert.equal(manualReminderInstant("2026-08-18T08:00", now), "2026-08-18T01:00:00.000Z");
  assert.throws(() => manualReminderInstant("2026-08-17T11:00", now), (error) => error.code === "REMINDER_TIME_PAST");
  assert.throws(() => manualReminderInstant("2027-09-01T08:00", now), (error) => error.code === "REMINDER_TIME_TOO_FAR");
  assert.throws(() => manualReminderInstant("2026-02-30T08:00", now), (error) => error.code === "INVALID_REMINDER_TIME");
});

test("pengingat manual per pengguna mendukung create, update row-version, get, cancel, dan audit", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const created = await upsertManualReminder(db, context(owner, "reminders.upsert", {
      entity_type: "budget",
      entity_id: "reminder-budget",
      scheduled_local: futureLocal(2),
    }));
    assert.equal(created.item.status, "scheduled");
    assert.equal(created.item.row_version, 1);

    const read = await getManualReminder(db, context(owner, "reminders.get", { entity_type: "budget", entity_id: "reminder-budget" }));
    assert.equal(read.item.reminder_id, created.item.reminder_id);
    assert.equal(read.entity.name, "Makan");

    await assert.rejects(
      upsertManualReminder(db, context(owner, "reminders.upsert", {
        entity_type: "budget",
        entity_id: "reminder-budget",
        scheduled_local: futureLocal(3),
        row_version: 99,
      }, 99)),
      (error) => error.code === "CONFLICT" && error.status === 409,
    );

    const updated = await upsertManualReminder(db, context(owner, "reminders.upsert", {
      entity_type: "budget",
      entity_id: "reminder-budget",
      scheduled_local: futureLocal(3),
      row_version: created.item.row_version,
    }, created.item.row_version));
    assert.equal(updated.item.row_version, 2);

    const cancelled = await cancelManualReminder(db, context(owner, "reminders.cancel", {
      reminder_id: updated.item.reminder_id,
      row_version: updated.item.row_version,
    }, updated.item.row_version));
    assert.equal(cancelled.item.status, "cancelled");
    assert.equal(cancelled.item.row_version, 3);
    assert.equal((await getManualReminder(db, context(owner, "reminders.get", { entity_type: "budget", entity_id: "reminder-budget" }))).item, null);

    const audit = await db.all("SELECT action FROM audit_log WHERE entity_type='manual_reminder' ORDER BY rowid");
    assert.deepEqual(audit.map((item) => item.action), ["reminders.upsert", "reminders.upsert", "reminders.cancel"]);
  } finally {
    db.close();
  }
});

test("backend menolak pengingat manual pada objek personal atau jatah pengguna lain", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await assert.rejects(
      upsertManualReminder(db, context(member, "reminders.upsert", {
        entity_type: "budget",
        entity_id: "reminder-budget-owner",
        scheduled_local: futureLocal(2),
      })),
      (error) => error.code === "FORBIDDEN_REMINDER_ENTITY" && error.status === 403,
    );
    await assert.rejects(
      upsertManualReminder(db, context(member, "reminders.upsert", {
        entity_type: "envelope_period",
        entity_id: "reminder-envelope",
        scheduled_local: futureLocal(2),
      })),
      (error) => error.code === "FORBIDDEN_REMINDER_ENTITY" && error.status === 403,
    );
  } finally {
    db.close();
  }
});

test("scheduler mengantrikan pengingat manual sekali, mengekspos status dispatch, dan membatalkan objek yang sudah tidak aktif", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const recurring = await upsertManualReminder(db, context(owner, "reminders.upsert", {
      entity_type: "recurring_occurrence",
      entity_id: "reminder-occurrence",
      scheduled_local: futureLocal(2),
    }));
    const goal = await upsertManualReminder(db, context(owner, "reminders.upsert", {
      entity_type: "goal",
      entity_id: "reminder-goal",
      scheduled_local: futureLocal(2),
    }));
    const due = new Date(Date.now() - 60_000).toISOString();
    await db.execute("UPDATE manual_reminders SET scheduled_at=? WHERE reminder_id IN (?,?)", [due, recurring.item.reminder_id, goal.item.reminder_id]);
    await db.execute("UPDATE savings_goals SET status='archived',row_version=row_version+1,updated_at=? WHERE goal_id='reminder-goal'", [new Date().toISOString()]);

    assert.equal(await queueDueManualReminders(db), 1);
    assert.equal(await queueDueManualReminders(db), 0);

    const queue = await db.one("SELECT user_id,notification_type,title,body,target_path,dedupe_key FROM notification_queue WHERE notification_type='manual_reminder'");
    assert.equal(queue.user_id, owner.user_id);
    assert.equal(queue.target_path, "/perencanaan/jadwal");
    assert.match(queue.title, /Internet Rumah/);
    assert.match(queue.body, /Rp325[.]000/);
    assert.match(queue.body, /BCA Utama/);
    assert.match(queue.dedupe_key, /^manual-reminder:/);

    assert.equal((await db.one("SELECT status FROM manual_reminders WHERE reminder_id=?", [recurring.item.reminder_id])).status, "queued");
    assert.equal((await db.one("SELECT status FROM manual_reminders WHERE reminder_id=?", [goal.item.reminder_id])).status, "cancelled");
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM audit_log WHERE action='reminders.autoCancel'")).count), 1);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM audit_log WHERE action='reminders.dispatch'")).count), 1);

    const dispatched = await getManualReminder(db, context(owner, "reminders.get", { entity_type: "recurring_occurrence", entity_id: "reminder-occurrence" }));
    assert.equal(dispatched.item, null);
    assert.equal(dispatched.lastDispatch.status, "pending");
    await assert.rejects(
      upsertManualReminder(db, context(owner, "reminders.upsert", {
        entity_type: "recurring_occurrence",
        entity_id: "reminder-occurrence",
        scheduled_local: futureLocal(3),
      })),
      (error) => error.code === "REMINDER_DELIVERY_PENDING" && error.status === 409,
    );

    const legacyCancelledAt = new Date(Date.now() + 1_000).toISOString();
    await db.execute(
      "INSERT INTO manual_reminders(reminder_id,user_id,entity_type,entity_id,scheduled_at,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      ["legacy-later-cancelled", owner.user_id, "recurring_occurrence", "reminder-occurrence", new Date(Date.now() + (4 * 86_400_000)).toISOString(), "cancelled", 1, legacyCancelledAt, legacyCancelledAt],
    );
    const legacyState = await getManualReminder(db, context(owner, "reminders.get", { entity_type: "recurring_occurrence", entity_id: "reminder-occurrence" }));
    assert.equal(legacyState.lastDispatch.status, "pending");
    await assert.rejects(
      upsertManualReminder(db, context(owner, "reminders.upsert", {
        entity_type: "recurring_occurrence",
        entity_id: "reminder-occurrence",
        scheduled_local: futureLocal(3),
      })),
      (error) => error.code === "REMINDER_DELIVERY_PENDING" && error.status === 409,
    );

    await db.execute("UPDATE notification_queue SET status='sent' WHERE notification_type='manual_reminder' AND user_id=?", [owner.user_id]);
    const replacementReminder = await upsertManualReminder(db, context(owner, "reminders.upsert", {
      entity_type: "recurring_occurrence",
      entity_id: "reminder-occurrence",
      scheduled_local: futureLocal(3),
    }));
    assert.equal(replacementReminder.item.status, "scheduled");
  } finally {
    db.close();
  }
});

test("archive objek membatalkan semua reminder scheduled terkait tanpa menghidupkannya kembali", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await upsertManualReminder(db, context(owner, "reminders.upsert", { entity_type: "budget", entity_id: "reminder-budget", scheduled_local: futureLocal(2) }));
    await upsertManualReminder(db, context(member, "reminders.upsert", { entity_type: "budget", entity_id: "reminder-budget", scheduled_local: futureLocal(2) }));
    await archiveBudget(db, context(owner, "budgets.archive", { budget_id: "reminder-budget", row_version: 1, reason: "Budget selesai diuji" }, 1));
    const reminders = await db.all("SELECT user_id,status FROM manual_reminders WHERE entity_type='budget' AND entity_id='reminder-budget' ORDER BY user_id");
    assert.deepEqual(reminders.map((row) => ({ ...row })), [
      { user_id: member.user_id, status: "cancelled" },
      { user_id: owner.user_id, status: "cancelled" },
    ]);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM audit_log WHERE action='reminders.autoCancel'")).count), 2);
  } finally {
    db.close();
  }
});

test("integrity check mendeteksi reminder scheduled yang menunjuk entity hilang", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const now = new Date().toISOString();
    await db.execute(
      "INSERT INTO manual_reminders(reminder_id,user_id,entity_type,entity_id,scheduled_at,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      ["dangling-reminder", owner.user_id, "budget", "missing-budget", new Date(Date.now() + 86_400_000).toISOString(), "scheduled", 1, now, now],
    );
    const issues = await integrityIssues(db);
    assert.equal(issues.some((issue) => issue.code === "REMINDER_ENTITY_MISSING" && Number(issue.count) === 1), true);
  } finally {
    db.close();
  }
});
