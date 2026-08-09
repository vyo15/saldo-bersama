import assert from "node:assert/strict";
import test from "node:test";
import { addDays, todayJakarta } from "../../api/_lib/services/core.js";
import { createEnvelopePeriod, createEnvelopeRule } from "../../api/_lib/services/planning/envelopes.js";
import { createGoal, goalProjection, updateGoal } from "../../api/_lib/services/planning/goals.js";
import { createRecurringRule, updateRecurringRule } from "../../api/_lib/services/planning/recurring.js";
import { reopenPeriod } from "../../api/_lib/services/reporting/periods.js";
import { deactivateUser, reactivateUser, resolveActor, upsertUser } from "../../api/_lib/services/users.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = {
  user_id: "character-owner",
  firebase_uid: "firebase-character-owner",
  email: "owner@example.com",
  name: "Owner",
  role: "owner",
  status: "active",
  row_version: 1,
};
const member = {
  user_id: "character-member",
  firebase_uid: "firebase-character-member",
  email: "member@example.com",
  name: "Member",
  role: "member",
  status: "active",
  row_version: 1,
};

const context = (actor, action, payload = {}, rowVersion = null, allowedUsers = []) => ({
  actor,
  signedActor: { uid: actor.firebase_uid, email: actor.email, name: actor.name },
  action,
  payload,
  rowVersion,
  requestId: `character:${action}`,
  idempotencyKey: `character:${action}`,
  allowedUsers,
  enqueueMirror: async () => {},
  enqueueCalendar: async () => {},
});

const seedUser = async (db, user, overrides = {}) => {
  const row = { ...user, ...overrides };
  const timestamp = new Date().toISOString();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [row.user_id, row.firebase_uid ?? null, row.email, row.name, row.role, row.status, row.row_version ?? 1, timestamp, timestamp],
  );
  return row;
};

const seedAccount = async (db, { id, ownerScope = "shared", ownerUserId = null, balance = 1_000_000 }) => {
  const timestamp = new Date().toISOString();
  await db.execute(
    "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, id, "bank", ownerScope, ownerUserId, balance, "2020-01-01", 0, "active", 1, owner.user_id, timestamp, owner.user_id, timestamp],
  );
};

const seedCategory = async (db, { id, type = "expense" }) => {
  const timestamp = new Date().toISOString();
  await db.execute(
    "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    [id, id, type, type === "expense" ? "variable" : "other", "other", "active", 1, owner.user_id, timestamp, owner.user_id, timestamp],
  );
};

test("identity bootstrap dan user lifecycle fail closed pada role, allowlist, ownership, dan concurrency", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const bootstrapped = await resolveActor(db, {
      uid: "firebase-first-owner",
      email: "first-owner@example.com",
      name: "First Owner",
      role: "owner",
      requestId: "bootstrap:first-owner",
    });
    assert.equal(bootstrapped.role, "owner");
    assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action='bootstrap.owner'"));

    await assert.rejects(
      () => resolveActor(db, { uid: "unknown", email: "unknown@example.com", name: "Unknown", role: "member" }),
      (error) => error.code === "IDENTITY_NOT_PROVISIONED",
    );

    const db2 = await createSqliteTestDatabase();
    try {
      await seedUser(db2, owner);
      await seedUser(db2, member);
      await assert.rejects(
        () => resolveActor(db2, { uid: member.firebase_uid, email: member.email, name: member.name, role: "owner" }),
        (error) => error.code === "ROLE_MISMATCH",
      );
      await assert.rejects(
        () => upsertUser(db2, context(owner, "users.upsert", { email: "bad-email", role: "member" }, null, [])),
        (error) => error.code === "INVALID_EMAIL",
      );
      await assert.rejects(
        () => upsertUser(db2, context(owner, "users.upsert", { email: "new@example.com", role: "member" }, null, [])),
        (error) => error.code === "ALLOWLIST_MISMATCH",
      );

      await seedAccount(db2, { id: "member-personal", ownerScope: "personal", ownerUserId: member.user_id });
      await assert.rejects(
        () => deactivateUser(db2, context(owner, "users.deactivate", { user_id: member.user_id, row_version: 1, reason: "Offboarding" }, 1)),
        (error) => error.code === "USER_HAS_ACTIVE_DATA" && Number(error.details?.accounts) === 1,
      );
      await db2.execute("UPDATE accounts SET status='archived' WHERE account_id='member-personal'");
      const inactive = await deactivateUser(db2, context(owner, "users.deactivate", { user_id: member.user_id, row_version: 1, reason: "Offboarding" }, 1));
      assert.equal(inactive.status, "inactive");
      await assert.rejects(
        () => reactivateUser(db2, context(owner, "users.reactivate", { user_id: member.user_id, row_version: inactive.row_version, reason: "Kembali" }, inactive.row_version, [])),
        (error) => error.code === "ALLOWLIST_MISMATCH",
      );
      const restored = await reactivateUser(db2, context(owner, "users.reactivate", { user_id: member.user_id, row_version: inactive.row_version, reason: "Kembali" }, inactive.row_version, [{ email: member.email, role: "member" }]));
      assert.equal(restored.status, "active");
    } finally {
      db2.close();
    }
  } finally {
    db.close();
  }
});

test("goal projection dan mutation menjaga target, ownership, status, dan account lock", async () => {
  const today = todayJakarta();
  assert.equal(goalProjection({ target_amount: 100_000, status: "active", target_date: null }, 10_000).pace_status, "no_target_date");
  assert.equal(goalProjection({ target_amount: 100_000, status: "completed", target_date: null }, 100_000).pace_status, "completed");
  assert.equal(goalProjection({ target_amount: 100_000, status: "active", target_date: "2000-01-01", created_at: "1999-01-01" }, 1_000).pace_status, "overdue");
  assert.equal(goalProjection({ target_amount: 100_000, status: "active", target_date: addDays(today, 365), created_at: today }, 0).pace_status, "on_track");

  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedUser(db, member);
    await seedAccount(db, { id: "goal-account" });
    await seedAccount(db, { id: "goal-account-2" });

    await assert.rejects(
      () => createGoal(db, context(member, "goals.create", { name: "Tidak boleh", account_id: "goal-account", target_amount: 100_000 })),
      (error) => error.code === "OWNER_ONLY",
    );
    await assert.rejects(
      () => createGoal(db, context(owner, "goals.create", { name: "Invalid", goal_type: "crypto", account_id: "goal-account", target_amount: 100_000 })),
      (error) => error.code === "INVALID_GOAL",
    );

    const goal = await createGoal(db, context(owner, "goals.create", {
      name: "Dana Liburan",
      goal_type: "savings",
      account_id: "goal-account",
      target_amount: 1_000_000,
      target_date: addDays(today, 180),
      priority: "high",
    }));
    await assert.rejects(
      () => updateGoal(db, context(owner, "goals.update", { goal_id: goal.goal_id, row_version: 1, status: "completed" }, 1)),
      (error) => error.code === "GOAL_NOT_REACHED",
    );

    await db.execute(
      "INSERT INTO goal_movements(goal_movement_id,goal_id,transaction_id,movement_type,amount,reason,status,row_version,created_by,created_at,reversed_by,reversed_at,reversal_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["goal-lock-move", goal.goal_id, null, "deposit", 10_000, "Characterization", "active", 1, owner.user_id, new Date().toISOString(), null, null, ""],
    );
    await assert.rejects(
      () => updateGoal(db, context(owner, "goals.update", { goal_id: goal.goal_id, row_version: 1, account_id: "goal-account-2" }, 1)),
      (error) => error.code === "GOAL_ACCOUNT_LOCKED",
    );
  } finally {
    db.close();
  }
});

test("envelope creation menolak enum, range, duplicate period, dan alokasi melebihi dana tersedia", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedUser(db, member);
    await seedAccount(db, { id: "envelope-account", balance: 200_000 });

    await assert.rejects(
      () => createEnvelopeRule(db, context(member, "envelopes.create", { name: "No", default_amount: 10_000 })),
      (error) => error.code === "OWNER_ONLY",
    );
    await assert.rejects(
      () => createEnvelopeRule(db, context(owner, "envelopes.create", { name: "Bad", period_type: "yearly", default_amount: 10_000 })),
      (error) => error.code === "INVALID_ENVELOPE_RULE",
    );

    const rule = await createEnvelopeRule(db, context(owner, "envelopes.create", {
      name: "Belanja",
      period_type: "monthly",
      source_account_id: "envelope-account",
      default_amount: 100_000,
    }));
    await assert.rejects(
      () => createEnvelopePeriod(db, context(owner, "envelopes.create", {
        envelope_rule_id: rule.envelope_rule_id,
        period_start: "2026-08-31",
        period_end: "2026-08-01",
      })),
      (error) => error.code === "INVALID_PERIOD_RANGE",
    );
    const period = await createEnvelopePeriod(db, context(owner, "envelopes.create", {
      envelope_rule_id: rule.envelope_rule_id,
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      allocated_amount: 100_000,
    }));
    assert.equal(period.allocated_amount, 100_000);
    await assert.rejects(
      () => createEnvelopePeriod(db, context(owner, "envelopes.create", {
        envelope_rule_id: rule.envelope_rule_id,
        period_start: "2026-08-01",
        period_end: "2026-08-31",
        allocated_amount: 100_000,
      })),
      (error) => error.code === "DUPLICATE_ENVELOPE_PERIOD",
    );
    await assert.rejects(
      () => createEnvelopePeriod(db, context(owner, "envelopes.create", {
        envelope_rule_id: rule.envelope_rule_id,
        period_start: "2026-09-01",
        period_end: "2026-09-30",
        allocated_amount: 150_000,
      })),
      (error) => error.code === "ALLOCATION_EXCEEDS_AVAILABLE",
    );
  } finally {
    db.close();
  }
});

test("recurring rule menjaga owner-only, kategori, due day, status lifecycle, dan occurrence generation", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedUser(db, member);
    await seedAccount(db, { id: "recurring-account" });
    await seedCategory(db, { id: "recurring-expense", type: "expense" });
    await seedCategory(db, { id: "recurring-income", type: "income" });

    await assert.rejects(
      () => createRecurringRule(db, context(member, "recurring.create", { name: "No" })),
      (error) => error.code === "OWNER_ONLY",
    );
    await assert.rejects(
      () => createRecurringRule(db, context(owner, "recurring.create", {
        name: "Bad frequency",
        kind: "expense",
        frequency: "hourly",
      })),
      (error) => error.code === "INVALID_RECURRING_RULE",
    );
    await assert.rejects(
      () => createRecurringRule(db, context(owner, "recurring.create", {
        name: "Wrong category",
        kind: "expense",
        frequency: "monthly",
        category_id: "recurring-income",
        default_account_id: "recurring-account",
        expected_amount: 100_000,
      })),
      (error) => error.code === "INVALID_CATEGORY",
    );
    await assert.rejects(
      () => createRecurringRule(db, context(owner, "recurring.create", {
        name: "Bad due day",
        kind: "expense",
        frequency: "monthly",
        category_id: "recurring-expense",
        default_account_id: "recurring-account",
        expected_amount: 100_000,
        due_day: 32,
      })),
      (error) => error.code === "INVALID_DUE_DAY",
    );

    const rule = await createRecurringRule(db, context(owner, "recurring.create", {
      name: "Internet",
      kind: "expense",
      frequency: "annual",
      category_id: "recurring-expense",
      default_account_id: "recurring-account",
      expected_amount: 350_000,
      due_day: 15,
      start_date: todayJakarta(),
      priority: "high",
      auto_debit: false,
    }));
    assert.equal(rule.status, "active");
    assert.ok(Number((await db.one("SELECT COUNT(*) AS count FROM recurring_occurrences WHERE recurring_rule_id=?", [rule.recurring_rule_id])).count) >= 1);

    await assert.rejects(
      () => updateRecurringRule(db, context(owner, "recurring.update", { recurring_rule_id: rule.recurring_rule_id, row_version: 1, status: "archived" }, 1)),
      (error) => error.code === "INVALID_STATUS",
    );
  } finally {
    db.close();
  }
});

test("reopen period hanya boleh dari periode tertutup paling akhir dan wajib alasan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    const timestamp = new Date().toISOString();
    for (const [id, period] of [["closure-june", "2026-06"], ["closure-july", "2026-07"]]) {
      await db.execute(
        "INSERT INTO period_closures(closure_id,period_key,scope,status,snapshot_json,snapshot_hash,reason,row_version,closed_by,closed_at,reopened_by,reopened_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        [id, period, "shared", "closed", "{}", `hash-${period}`, "close", 1, owner.user_id, timestamp, null, null],
      );
    }
    await assert.rejects(
      () => reopenPeriod(db, context(owner, "periods.reopen", { closure_id: "closure-june", row_version: 1, reason: "Salah" }, 1)),
      (error) => error.code === "LATER_PERIOD_CLOSED" && error.details?.latestClosedPeriod === "2026-07",
    );
    await assert.rejects(
      () => reopenPeriod(db, context(owner, "periods.reopen", { closure_id: "closure-july", row_version: 1, reason: "" }, 1)),
      (error) => error.code === "REASON_REQUIRED",
    );
    const reopened = await reopenPeriod(db, context(owner, "periods.reopen", { closure_id: "closure-july", row_version: 1, reason: "Koreksi transaksi" }, 1));
    assert.equal(reopened.status, "reopened");
    assert.equal(reopened.row_version, 2);
    assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action='periods.reopen' AND entity_id='closure-july'"));
  } finally {
    db.close();
  }
});
