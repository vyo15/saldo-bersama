import assert from "node:assert/strict";
import test from "node:test";
import { addDays, todayJakarta } from "../../api/_lib/services/core.js";
import { createTransaction } from "../../api/_lib/services/finance.js";
import { createEnvelopePeriod, createEnvelopeRule } from "../../api/_lib/services/planning/envelopes.js";
import { createGoal, goalProjection, listGoals, moveGoal, reverseGoalMovement, updateGoal } from "../../api/_lib/services/planning/goals.js";
import { createRecurringRule, updateRecurringRule } from "../../api/_lib/services/planning/recurring.js";
import { reopenPeriod } from "../../api/_lib/services/reporting/periods.js";
import { deactivateUser, listUsers, reactivateUser, resolveActor, resolveLoginIdentity, upsertUser } from "../../api/_lib/services/users.js";
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

const context = (actor, action, payload = {}, rowVersion = null) => ({
  actor,
  signedActor: { uid: actor.firebase_uid, email: actor.email, name: actor.name },
  action,
  payload,
  rowVersion,
  requestId: `character:${action}`,
  idempotencyKey: `character:${action}`,
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

test("identity bootstrap dan user lifecycle fail closed pada registry backend, ownership, dan concurrency", async () => {
  const originalAllowlist = process.env.ALLOWED_USERS_JSON;
  process.env.ALLOWED_USERS_JSON = JSON.stringify([{ email: "first-owner@example.com", role: "administrator" }]);
  const db = await createSqliteTestDatabase();
  try {
    const bootstrapped = await resolveLoginIdentity(db, {
      uid: "firebase-first-owner",
      email: "first-owner@example.com",
      name: "First Owner",
    }, { requestId: "bootstrap:first-owner" });
    assert.equal(bootstrapped.role, "owner");
    assert.equal("firebase_uid" in bootstrapped, false, "Firebase UID tidak boleh keluar dari service user");
    assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action='bootstrap.owner'"));

    await assert.rejects(
      () => resolveLoginIdentity(db, { uid: "unknown", email: "unknown@example.com", name: "Unknown" }),
      (error) => error.code === "ACCOUNT_NOT_ALLOWED",
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
        () => upsertUser(db2, context(owner, "users.upsert", { email: "bad-email", role: "member" })),
        (error) => error.code === "INVALID_EMAIL",
      );

      const pending = await upsertUser(db2, context(owner, "users.upsert", { email: "new@example.com", name: "New Member", role: "member" }));
      assert.equal(pending.identity_status, "pending");
      assert.equal("firebase_uid" in pending, false);
      const listedPending = await listUsers(db2, context(owner, "users.list"));
      const pendingFromList = listedPending.items.find((item) => item.email === "new@example.com");
      assert.equal(pendingFromList?.identity_status, "pending");
      assert.equal("firebase_uid" in pendingFromList, false);

      const linked = await resolveLoginIdentity(db2, { uid: "firebase-new-member", email: "NEW@example.com", name: "Google New Member" }, { requestId: "login:new-member" });
      assert.equal(linked.role, "member");
      assert.equal("firebase_uid" in linked, false);
      const linkedCanonical = await db2.one("SELECT firebase_uid,row_version FROM users WHERE email=? COLLATE NOCASE", ["new@example.com"]);
      assert.equal(linkedCanonical.firebase_uid, "firebase-new-member");
      assert.equal(Number(linkedCanonical.row_version), 2);
      assert.equal(Number((await db2.one("SELECT COUNT(*) AS count FROM audit_log WHERE action='identity.firebase.bind' AND entity_id=?", [pending.user_id]))?.count), 1);
      await resolveLoginIdentity(db2, { uid: "firebase-new-member", email: "new@example.com", name: "Google New Member" }, { requestId: "login:new-member:repeat" });
      assert.equal(Number((await db2.one("SELECT COUNT(*) AS count FROM audit_log WHERE action='identity.firebase.bind' AND entity_id=?", [pending.user_id]))?.count), 1, "login ulang tidak boleh menggandakan audit binding");

      await assert.rejects(
        () => upsertUser(db2, context(owner, "users.upsert", { email: owner.email, name: owner.name, role: "member", row_version: owner.row_version }, owner.row_version)),
        (error) => error.code === "SELF_ROLE_CHANGE_DENIED",
      );

      await seedAccount(db2, { id: "member-personal", ownerScope: "personal", ownerUserId: member.user_id });
      await assert.rejects(
        () => deactivateUser(db2, context(owner, "users.deactivate", { user_id: member.user_id, row_version: 1, reason: "Offboarding" }, 1)),
        (error) => error.code === "USER_HAS_ACTIVE_DATA" && Number(error.details?.accounts) === 1,
      );
      await db2.execute("UPDATE accounts SET status='archived' WHERE account_id='member-personal'");
      const inactive = await deactivateUser(db2, context(owner, "users.deactivate", { user_id: member.user_id, row_version: 1, reason: "Offboarding" }, 1));
      assert.equal(inactive.status, "inactive");
      assert.equal("firebase_uid" in inactive, false);
      const restored = await reactivateUser(db2, context(owner, "users.reactivate", { user_id: member.user_id, row_version: inactive.row_version, reason: "Kembali" }, inactive.row_version));
      assert.equal(restored.status, "active");
      assert.equal("firebase_uid" in restored, false);
    } finally {
      db2.close();
    }
  } finally {
    db.close();
    if (originalAllowlist === undefined) delete process.env.ALLOWED_USERS_JSON;
    else process.env.ALLOWED_USERS_JSON = originalAllowlist;
  }
});

test("binding Firebase pertama idempotent saat request paralel dan tetap fail closed untuk UID berbeda", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner, { firebase_uid: null });
    const signed = { uid: "firebase-first-bind", email: owner.email, name: owner.name, role: owner.role };
    const [first, second] = await Promise.all([resolveActor(db, signed), resolveActor(db, signed)]);
    assert.equal("firebase_uid" in first, false);
    assert.equal("firebase_uid" in second, false);
    const canonical = await db.one("SELECT firebase_uid,row_version FROM users WHERE user_id = ?", [owner.user_id]);
    assert.equal(canonical.firebase_uid, signed.uid);
    assert.equal(Number(canonical.row_version), 2, "binding UID yang sama tidak boleh menaikkan versi dua kali");

    const conflictDb = await createSqliteTestDatabase();
    try {
      await seedUser(conflictDb, owner, { firebase_uid: null });
      const results = await Promise.allSettled([
        resolveActor(conflictDb, { ...signed, uid: "firebase-race-a" }),
        resolveActor(conflictDb, { ...signed, uid: "firebase-race-b" }),
      ]);
      assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
      const rejected = results.find((item) => item.status === "rejected");
      assert.equal(rejected?.reason?.code, "IDENTITY_CONFLICT");
    } finally {
      conflictDb.close();
    }

    const reusedUidDb = await createSqliteTestDatabase();
    try {
      await seedUser(reusedUidDb, owner, { firebase_uid: null });
      await seedUser(reusedUidDb, member, { firebase_uid: "firebase-already-bound" });
      await assert.rejects(
        () => resolveActor(reusedUidDb, { ...signed, uid: "firebase-already-bound" }),
        (error) => error.code === "IDENTITY_CONFLICT" && error.status === 409,
      );
      const ownerAfterConflict = await reusedUidDb.one("SELECT firebase_uid,row_version FROM users WHERE user_id = ?", [owner.user_id]);
      assert.equal(ownerAfterConflict.firebase_uid, null);
      assert.equal(Number(ownerAfterConflict.row_version), 1);
    } finally {
      reusedUidDb.close();
    }
  } finally {
    db.close();
  }
});

test("bootstrap owner idempotent saat dua request pertama datang paralel", async () => {
  const originalAllowlist = process.env.ALLOWED_USERS_JSON;
  process.env.ALLOWED_USERS_JSON = JSON.stringify([{ email: "bootstrap-race@example.com", role: "administrator" }]);
  const db = await createSqliteTestDatabase();
  try {
    const identity = { uid: "firebase-bootstrap-race", email: "bootstrap-race@example.com", name: "Bootstrap Race" };
    const [first, second] = await Promise.all([
      resolveLoginIdentity(db, identity, { requestId: "bootstrap-race:a" }),
      resolveLoginIdentity(db, identity, { requestId: "bootstrap-race:b" }),
    ]);
    assert.equal(first.user_id, second.user_id);
    assert.equal("firebase_uid" in first, false);
    const users = await db.all("SELECT user_id,firebase_uid,email,row_version FROM users");
    assert.equal(users.length, 1);
    assert.equal(users[0].email, identity.email);
    assert.equal(users[0].firebase_uid, identity.uid);
    const audits = await db.all("SELECT action,entity_id FROM audit_log WHERE action='bootstrap.owner'");
    assert.equal(audits.length, 1, "bootstrap paralel hanya boleh menghasilkan satu audit owner");
  } finally {
    db.close();
    if (originalAllowlist === undefined) delete process.env.ALLOWED_USERS_JSON;
    else process.env.ALLOWED_USERS_JSON = originalAllowlist;
  }
});

test("transfer dan Target shared/personal fleksibel tanpa memberi Member akses ke rekening personal pasangan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedUser(db, member);
    await seedAccount(db, { id: "boundary-shared", balance: 1_000_000 });
    await seedAccount(db, { id: "boundary-owner-personal", ownerScope: "personal", ownerUserId: owner.user_id, balance: 500_000 });
    await seedAccount(db, { id: "boundary-member-personal", ownerScope: "personal", ownerUserId: member.user_id, balance: 400_000 });

    const ownerTransfer = await createTransaction(db, context(owner, "transactions.create", {
      transaction_type: "transfer",
      transaction_date: todayJakarta(),
      source_account_id: "boundary-shared",
      destination_account_id: "boundary-owner-personal",
      amount: 25_000,
      description: "Pindah dana shared ke personal owner",
    }));
    assert.equal(ownerTransfer.scope, "shared");
    assert.equal(ownerTransfer.owner_user_id, "");

    const memberTransferContext = context(member, "transactions.create", {
      transaction_type: "transfer",
      transaction_date: todayJakarta(),
      source_account_id: "boundary-member-personal",
      destination_account_id: "boundary-shared",
      amount: 20_000,
      description: "Pindah dana personal member ke shared",
    });
    memberTransferContext.requestId = "character:boundary:member-transfer";
    memberTransferContext.idempotencyKey = "character:boundary:member-transfer";
    const memberTransfer = await createTransaction(db, memberTransferContext);
    assert.equal(memberTransfer.scope, "personal");
    assert.equal(memberTransfer.owner_user_id, member.user_id);

    await assert.rejects(
      () => createTransaction(db, context(member, "transactions.create", {
        transaction_type: "transfer",
        transaction_date: todayJakarta(),
        source_account_id: "boundary-owner-personal",
        destination_account_id: "boundary-shared",
        amount: 10_000,
      })),
      (error) => error.code === "FORBIDDEN_ACCOUNT",
    );
    const ownerToMemberContext = context(owner, "transactions.create", {
      transaction_type: "transfer",
      transaction_date: todayJakarta(),
      source_account_id: "boundary-owner-personal",
      destination_account_id: "boundary-member-personal",
      amount: 10_000,
    });
    ownerToMemberContext.requestId = "character:boundary:owner-to-member";
    ownerToMemberContext.idempotencyKey = "character:boundary:owner-to-member";
    const ownerToMember = await createTransaction(db, ownerToMemberContext);
    assert.equal(ownerToMember.scope, "personal");
    assert.equal(ownerToMember.owner_user_id, owner.user_id);

    const goal = await createGoal(db, context(owner, "goals.create", {
      name: "Target Bersama Boundary",
      goal_type: "savings",
      account_id: "boundary-shared",
      target_amount: 200_000,
      priority: "normal",
    }));
    const memberGoalView = (await listGoals(db, { actor: member, payload: {} })).items.find((item) => item.goal_id === goal.goal_id);
    assert.equal(memberGoalView.can_deposit, true, "Member boleh mendanai Target shared dari rekening shared atau personal miliknya yang operable.");

    const goalMoveContext = context(member, "goals.move", {
      goal_id: goal.goal_id,
      movement_type: "deposit",
      amount: 15_000,
      source_account_id: "boundary-member-personal",
      destination_account_id: "boundary-shared",
      transaction_date: todayJakarta(),
      reason: "Kontribusi personal ke target bersama",
    });
    goalMoveContext.requestId = "character:boundary:goal-move";
    goalMoveContext.idempotencyKey = "character:boundary:goal-move";
    const moved = await moveGoal(db, goalMoveContext);
    assert.equal(moved.transaction.scope, "personal");
    assert.equal(moved.transaction.owner_user_id, member.user_id);

    await assert.rejects(
      () => moveGoal(db, context(member, "goals.move", {
        goal_id: goal.goal_id,
        movement_type: "deposit",
        amount: 5_000,
        source_account_id: "boundary-owner-personal",
        destination_account_id: "boundary-shared",
        transaction_date: todayJakarta(),
        reason: "Tidak boleh memakai rekening pasangan",
      })),
      (error) => error.code === "FORBIDDEN_ACCOUNT",
    );
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

test("goal lifecycle mengunci setoran saat target tercapai, tetap mengizinkan penarikan, dan mencegah overfund", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedAccount(db, { id: "goal-lifecycle-target", balance: 0 });
    await seedAccount(db, { id: "goal-lifecycle-source", balance: 1_000_000 });
    const goal = await createGoal(db, context(owner, "goals.create", {
      name: "Dana Laptop",
      goal_type: "savings",
      account_id: "goal-lifecycle-target",
      target_amount: 100_000,
      target_date: addDays(todayJakarta(), 90),
      priority: "normal",
    }));

    const initial = (await listGoals(db, { actor: owner, payload: {} })).items[0];
    assert.equal(initial.can_deposit, true);
    assert.equal(initial.can_withdraw, false);
    assert.equal(initial.can_complete, false);

    await assert.rejects(
      () => moveGoal(db, context(owner, "goals.move", {
        goal_id: goal.goal_id,
        movement_type: "deposit",
        amount: 100_001,
        source_account_id: "goal-lifecycle-source",
        destination_account_id: "goal-lifecycle-target",
        transaction_date: todayJakarta(),
        reason: "Setoran terlalu besar",
      })),
      (error) => error.code === "GOAL_OVERFUND" && Number(error.details?.remainingAmount) === 100_000,
    );

    const movementResult = await moveGoal(db, context(owner, "goals.move", {
      goal_id: goal.goal_id,
      movement_type: "deposit",
      amount: 100_000,
      source_account_id: "goal-lifecycle-source",
      destination_account_id: "goal-lifecycle-target",
      transaction_date: todayJakarta(),
      reason: "Setoran target penuh",
    }));
    const reached = (await listGoals(db, { actor: owner, payload: {} })).items[0];
    assert.equal(reached.current_amount, 100_000);
    assert.equal(reached.can_deposit, false);
    assert.equal(reached.can_withdraw, true);
    assert.equal(reached.can_complete, true);
    assert.equal(reached.can_reverse, true);

    const completed = await updateGoal(db, context(owner, "goals.update", {
      goal_id: goal.goal_id,
      row_version: reached.row_version,
      status: "completed",
    }, reached.row_version));
    const locked = (await listGoals(db, { actor: owner, payload: {} })).items[0];
    assert.equal(locked.status, "completed");
    assert.equal(locked.can_reopen, true);
    assert.equal(locked.can_update, false);
    assert.equal(locked.can_reverse, false);

    await assert.rejects(
      () => updateGoal(db, context(owner, "goals.update", {
        goal_id: goal.goal_id,
        row_version: completed.row_version,
        name: "Edit terlarang",
      }, completed.row_version)),
      (error) => error.code === "GOAL_COMPLETED_LOCKED",
    );
    await assert.rejects(
      () => reverseGoalMovement(db, context(owner, "goals.reverseMovement", {
        goal_movement_id: movementResult.movement.goal_movement_id,
        row_version: movementResult.movement.row_version,
        reason: "Reverse saat selesai",
      }, movementResult.movement.row_version)),
      (error) => error.code === "GOAL_COMPLETED_LOCKED",
    );

    const reopened = await updateGoal(db, context(owner, "goals.update", {
      goal_id: goal.goal_id,
      row_version: completed.row_version,
      status: "active",
    }, completed.row_version));
    const stillReached = (await listGoals(db, { actor: owner, payload: {} })).items[0];
    assert.equal(stillReached.can_deposit, false);
    assert.equal(stillReached.can_withdraw, true);
    assert.equal(stillReached.can_complete, true);
    assert.equal(stillReached.can_update, true);

    const withdrawalContext = context(owner, "goals.move", {
      goal_id: goal.goal_id,
      movement_type: "withdrawal",
      amount: 10_000,
      source_account_id: "goal-lifecycle-target",
      destination_account_id: "goal-lifecycle-source",
      transaction_date: todayJakarta(),
      reason: "Tarik sebagian setelah target dibuka kembali",
    });
    withdrawalContext.requestId = "character:goals.move:withdrawal";
    withdrawalContext.idempotencyKey = "character:goals.move:withdrawal";
    await moveGoal(db, withdrawalContext);
    const withdrawn = (await listGoals(db, { actor: owner, payload: {} })).items[0];
    assert.equal(withdrawn.current_amount, 90_000);
    assert.equal(withdrawn.can_complete, false);
    assert.equal(withdrawn.can_deposit, true);
    assert.equal(withdrawn.can_withdraw, true);

    await assert.rejects(
      () => updateGoal(db, context(owner, "goals.update", {
        goal_id: goal.goal_id,
        row_version: reopened.row_version,
        target_amount: 80_000,
      }, reopened.row_version)),
      (error) => error.code === "GOAL_TARGET_BELOW_PROGRESS" && Number(error.details?.currentAmount) === 90_000,
    );

    await updateGoal(db, context(owner, "goals.update", {
      goal_id: goal.goal_id,
      row_version: reopened.row_version,
      target_amount: 120_000,
    }, reopened.row_version));
    const raised = (await listGoals(db, { actor: owner, payload: {} })).items[0];
    assert.equal(raised.remaining_amount, 30_000);
    assert.equal(raised.can_deposit, true);
    assert.equal(raised.can_withdraw, true);
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

test("recurring rule menjaga scope, kategori, due day, status lifecycle, dan occurrence generation", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedUser(db, member);
    await seedAccount(db, { id: "recurring-account" });
    await seedCategory(db, { id: "recurring-expense", type: "expense" });
    await seedCategory(db, { id: "recurring-income", type: "income" });

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
