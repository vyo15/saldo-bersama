import assert from "node:assert/strict";
import test from "node:test";
import { listBudgets, upsertBudget } from "../../api/_lib/services/planning/budgets.js";
import { createEnvelope, adjustEnvelopeAllocation, listEnvelopes } from "../../api/_lib/services/planning/envelopes.js";
import { createGoal, updateGoal } from "../../api/_lib/services/planning/goals.js";
import { createRecurringRule, listRecurring, payOccurrence, updateRecurringRule } from "../../api/_lib/services/planning/recurring.js";
import { todayJakarta } from "../../api/_lib/services/core.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = { user_id: "planning-owner", firebase_uid: "firebase-planning-owner", email: "owner@example.com", name: "Owner", role: "owner", status: "active", row_version: 1 };
const member = { user_id: "planning-member", firebase_uid: "firebase-planning-member", email: "member@example.com", name: "Member", role: "member", status: "active", row_version: 1 };

const context = (actor, action, payload = {}, rowVersion = null) => ({
  actor,
  signedActor: { uid: actor.firebase_uid, email: actor.email, name: actor.name },
  action,
  payload,
  rowVersion,
  requestId: `planning:${action}:${Math.random()}`,
  idempotencyKey: `planning:${action}:${Math.random()}`,
  enqueueMirror: async () => {},
  enqueueCalendar: async () => {},
});

const seedUser = async (db, user) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [user.user_id, user.firebase_uid, user.email, user.name, user.role, user.status, 1, now, now],
  );
};

const seedAccount = async (db, { id, scope = "shared", ownerUserId = null, balance = 1_000_000 }) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, id, "bank", scope, ownerUserId, balance, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now],
  );
};

const seedCategory = async (db, { id, type = "expense" }) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    [id, id, type, type === "expense" ? "variable" : "other", "other", "active", 1, owner.user_id, now, owner.user_id, now],
  );
};

test("Member dapat mengelola planning Bersama dan Kebutuhan personal miliknya sendiri", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedUser(db, member);
    await seedAccount(db, { id: "shared-source" });
    await seedAccount(db, { id: "shared-target" });
    await seedAccount(db, { id: "member-personal", scope: "personal", ownerUserId: member.user_id });
    await seedCategory(db, { id: "shared-expense", type: "expense" });

    const envelope = await createEnvelope(db, context(member, "envelopes.create", {
      name: "Belanja Bersama",
      source_account_id: "shared-source",
      assignee_user_id: member.user_id,
      period_type: "monthly",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      default_amount: 100_000,
      allocated_amount: 100_000,
    }));
    assert.equal(envelope.rule.scope, "shared");
    assert.equal(envelope.rule.assignee_user_id, member.user_id);

    const adjusted = await adjustEnvelopeAllocation(db, context(member, "envelopes.adjustAllocation", {
      envelope_period_id: envelope.period.envelope_period_id,
      direction: "fund",
      amount: 50_000,
      row_version: envelope.period.row_version,
    }, envelope.period.row_version));
    assert.equal(adjusted.period.allocated_amount, 150_000);

    const budget = await upsertBudget(db, context(member, "budgets.upsert", {
      period_key: "2026-08",
      category_id: "shared-expense",
      envelope_rule_id: envelope.rule.envelope_rule_id,
      name: "Belanja Bersama",
      amount: 300_000,
      warning_threshold: 80,
      scope: "shared",
    }));
    assert.equal(budget.scope, "shared");

    const personalEnvelope = await createEnvelope(db, context(owner, "envelopes.create", {
      name: "Belanja Member",
      source_account_id: "member-personal",
      period_type: "monthly",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      default_amount: 100_000,
      allocated_amount: 100_000,
    }));
    assert.equal(personalEnvelope.rule.scope, "personal");
    assert.equal(personalEnvelope.rule.owner_user_id, member.user_id);

    const personalBudget = await upsertBudget(db, context(member, "budgets.upsert", {
      period_key: "2026-08",
      category_id: "shared-expense",
      envelope_rule_id: personalEnvelope.rule.envelope_rule_id,
      name: "Belanja Pribadi Member",
      amount: 125_000,
      warning_threshold: 80,
      scope: "personal",
    }));
    assert.equal(personalBudget.scope, "personal");
    assert.equal(personalBudget.owner_user_id, member.user_id);

    const goal = await createGoal(db, context(member, "goals.create", {
      name: "Liburan Bersama",
      account_id: "shared-target",
      target_amount: 1_000_000,
    }));
    assert.equal(goal.scope, "shared");
    const goalUpdated = await updateGoal(db, context(member, "goals.update", {
      goal_id: goal.goal_id,
      row_version: goal.row_version,
      target_amount: 1_100_000,
    }, goal.row_version));
    assert.equal(goalUpdated.target_amount, 1_100_000);

    const recurring = await createRecurringRule(db, context(member, "recurring.createRule", {
      name: "Internet Bersama",
      kind: "expense",
      category_id: "shared-expense",
      default_account_id: "shared-source",
      expected_amount: 250_000,
      frequency: "monthly",
      due_day: 10,
      start_date: todayJakarta(),
    }));
    assert.equal(recurring.scope, "shared");
    const recurringUpdated = await updateRecurringRule(db, context(member, "recurring.updateRule", {
      recurring_rule_id: recurring.recurring_rule_id,
      row_version: recurring.row_version,
      expected_amount: 275_000,
    }, recurring.row_version));
    assert.equal(recurringUpdated.expected_amount, 275_000);

    const occurrence = await db.one("SELECT * FROM recurring_occurrences WHERE recurring_rule_id=? ORDER BY due_date LIMIT 1", [recurring.recurring_rule_id]);
    assert.ok(occurrence);
    const paid = await payOccurrence(db, context(member, "recurring.payOccurrence", {
      occurrence_id: occurrence.occurrence_id,
      row_version: occurrence.row_version,
      account_id: "shared-source",
      amount: 275_000,
      transaction_date: todayJakarta(),
      cost_share_mode: "equal",
    }, occurrence.row_version));
    assert.equal(paid.transaction.cost_share_mode, "equal");
    assert.equal(paid.transaction.cost_share.length, 2);
    assert.equal(paid.transaction.cost_share.reduce((sum, item) => sum + item.share_amount, 0), 275_000);

    const memberPersonalEnvelope = await createEnvelope(db, context(member, "envelopes.create", {
      name: "Personal Member",
      source_account_id: "member-personal",
      period_type: "monthly",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      default_amount: 10_000,
      allocated_amount: 10_000,
    }));
    assert.equal(memberPersonalEnvelope.rule.scope, "personal");
    assert.equal(memberPersonalEnvelope.rule.owner_user_id, member.user_id);
    const adjustedPersonal = await adjustEnvelopeAllocation(db, context(member, "envelopes.adjustAllocation", {
      envelope_period_id: memberPersonalEnvelope.period.envelope_period_id,
      direction: "fund",
      amount: 5_000,
      row_version: memberPersonalEnvelope.period.row_version,
    }, memberPersonalEnvelope.period.row_version));
    assert.equal(adjustedPersonal.period.allocated_amount, 15_000);

    await assert.rejects(
      () => createGoal(db, context(member, "goals.create", {
        name: "Personal",
        account_id: "member-personal",
        target_amount: 10_000,
      })),
      (error) => error.code === "GOAL_SHARED_ACCOUNT_REQUIRED" && error.status === 409,
    );

    const memberPersonalRecurring = await createRecurringRule(db, context(member, "recurring.createRule", {
      name: "Personal Member",
      kind: "expense",
      category_id: "shared-expense",
      default_account_id: "member-personal",
      expected_amount: 10_000,
      frequency: "monthly",
      due_day: 1,
      start_date: todayJakarta(),
    }));
    assert.equal(memberPersonalRecurring.scope, "personal");
    assert.equal(memberPersonalRecurring.owner_user_id, member.user_id);
    const memberPersonalRecurringUpdated = await updateRecurringRule(db, context(member, "recurring.updateRule", {
      recurring_rule_id: memberPersonalRecurring.recurring_rule_id,
      row_version: memberPersonalRecurring.row_version,
      expected_amount: 12_000,
    }, memberPersonalRecurring.row_version));
    assert.equal(memberPersonalRecurringUpdated.expected_amount, 12_000);

    const personalEnvelopeList = await listEnvelopes(db, { actor: member, payload: { period: "2026-09" } });
    const listedPersonalEnvelope = personalEnvelopeList.items.find((item) => item.envelope_rule_id === memberPersonalEnvelope.rule.envelope_rule_id);
    assert.equal(listedPersonalEnvelope?.can_manage, true);
    assert.equal(listedPersonalEnvelope?.can_adjust, true);
    assert.equal(listedPersonalEnvelope?.can_manage_needs, true);
    assert.equal(listedPersonalEnvelope?.can_record_expense, true);

    const budgetList = await listBudgets(db, { actor: member, payload: { period: "2026-08" } });
    const listedPersonalBudget = budgetList.items.find((item) => item.budget_id === personalBudget.budget_id);
    assert.equal(listedPersonalBudget?.can_manage, true);

    const personalOccurrence = await db.one("SELECT period_key FROM recurring_occurrences WHERE recurring_rule_id=? ORDER BY due_date LIMIT 1", [memberPersonalRecurring.recurring_rule_id]);
    assert.ok(personalOccurrence?.period_key);
    const recurringList = await listRecurring(db, { actor: member, payload: { period: personalOccurrence.period_key } });
    const listedPersonalRecurring = recurringList.items.find((item) => item.recurring_rule_id === memberPersonalRecurring.recurring_rule_id);
    assert.equal(listedPersonalRecurring?.can_edit_rule, true);
    assert.equal(listedPersonalRecurring?.can_pay, true);
    assert.equal(listedPersonalRecurring?.can_set_reminder, true);
    assert.equal(Object.hasOwn(listedPersonalRecurring || {}, "can_pause_rule"), false);
    assert.equal(Object.hasOwn(listedPersonalRecurring || {}, "can_delete_rule"), false);
  } finally {
    db.close();
  }
});

test("penyesuaian alokasi menjaga row_version, dana tersedia, dan dana terpakai", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedAccount(db, { id: "allocation-source", balance: 500_000 });
    const envelope = await createEnvelope(db, context(owner, "envelopes.create", {
      name: "Makan",
      source_account_id: "allocation-source",
      period_type: "monthly",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      default_amount: 200_000,
      allocated_amount: 200_000,
    }));

    const funded = await adjustEnvelopeAllocation(db, context(owner, "envelopes.adjustAllocation", {
      envelope_period_id: envelope.period.envelope_period_id,
      direction: "fund",
      amount: 250_000,
      row_version: envelope.period.row_version,
    }, envelope.period.row_version));
    assert.equal(funded.period.allocated_amount, 450_000);

    await assert.rejects(
      () => adjustEnvelopeAllocation(db, context(owner, "envelopes.adjustAllocation", {
        envelope_period_id: envelope.period.envelope_period_id,
        direction: "fund",
        amount: 1,
        row_version: envelope.period.row_version,
      }, envelope.period.row_version)),
      (error) => error.code === "CONFLICT",
    );

    await assert.rejects(
      () => adjustEnvelopeAllocation(db, context(owner, "envelopes.adjustAllocation", {
        envelope_period_id: envelope.period.envelope_period_id,
        direction: "fund",
        amount: 100_000,
        row_version: funded.period.row_version,
      }, funded.period.row_version)),
      (error) => error.code === "ALLOCATION_EXCEEDS_AVAILABLE",
    );

    await db.execute("UPDATE envelope_periods SET reserved_amount=100000 WHERE envelope_period_id=?", [envelope.period.envelope_period_id]);
    const fresh = await db.one("SELECT row_version FROM envelope_periods WHERE envelope_period_id=?", [envelope.period.envelope_period_id]);
    await assert.rejects(
      () => adjustEnvelopeAllocation(db, context(owner, "envelopes.adjustAllocation", {
        envelope_period_id: envelope.period.envelope_period_id,
        direction: "release",
        amount: 351_000,
        row_version: fresh.row_version,
      }, fresh.row_version)),
      (error) => error.code === "INSUFFICIENT_ENVELOPE" && Number(error.details?.removableAmount) === 350_000,
    );

    const released = await adjustEnvelopeAllocation(db, context(owner, "envelopes.adjustAllocation", {
      envelope_period_id: envelope.period.envelope_period_id,
      direction: "release",
      amount: 100_000,
      row_version: fresh.row_version,
    }, fresh.row_version));
    assert.equal(released.period.allocated_amount, 350_000);
    assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action='envelopes.adjustAllocation' AND entity_id=?", [envelope.period.envelope_period_id]));
  } finally {
    db.close();
  }
});
