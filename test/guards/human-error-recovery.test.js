import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveEnvelopeRule,
  restoreEnvelopeRule,
  reverseEnvelopeMovement,
} from "../../api/_lib/services/planning/envelopes.js";
import { archiveGoal, restoreGoal, updateGoal } from "../../api/_lib/services/planning/goals.js";
import { archiveRecurringRule, restoreRecurringRule, updateRecurringRule } from "../../api/_lib/services/planning/recurring.js";
import { archiveBudget, restoreBudget } from "../../api/_lib/services/planning/budgets.js";
import { createReconciliation } from "../../api/_lib/services/reporting/reconciliations.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = {
  user_id: "recovery-owner",
  firebase_uid: "firebase-recovery-owner",
  email: "recovery-owner@example.com",
  name: "Recovery Owner",
  role: "owner",
  status: "active",
  row_version: 1,
};

const context = (action, payload, rowVersion = null) => ({
  actor: owner,
  signedActor: { uid: owner.firebase_uid, email: owner.email, name: owner.name },
  action,
  payload,
  rowVersion,
  requestId: `guard:${action}`,
  idempotencyKey: `guard:${action}`,
  enqueueMirror: async () => {},
  enqueueCalendar: async () => {},
});

const seedOwner = async (db) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [owner.user_id, owner.firebase_uid, owner.email, owner.name, owner.role, owner.status, 1, now, now],
  );
  return now;
};

const seedAccount = async (db, { id, allowNegative = false, balance = 0 }) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, id, "bank", "shared", null, balance, "2020-01-01", allowNegative ? 1 : 0, "active", 1, owner.user_id, now, owner.user_id, now],
  );
};

test("aturan kantong dapat diarsipkan dan dipulihkan tanpa hard delete", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seedOwner(db);
    await seedAccount(db, { id: "account-envelope", balance: 1_000_000 });
    await db.execute(
      "INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["rule-1", "Kantong duplikat", "monthly", "shared", null, 100_000, "account-envelope", "unallocated", "confirm", "active", 1, owner.user_id, now, owner.user_id, now],
    );
    await db.execute(
      "INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["period-1", "rule-1", "Kantong duplikat", "2026-08-01", "2026-08-31", 100_000, 0, "active", 1, owner.user_id, now, owner.user_id, now, null, null],
    );
    await db.execute(
      "INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["period-old-archived", "rule-1", "Arsip historis", "2026-07-01", "2026-07-31", 50_000, 0, "archived", 2, owner.user_id, "2026-07-01T00:00:00.000Z", owner.user_id, "2026-07-31T00:00:00.000Z", null, null],
    );

    const archived = await archiveEnvelopeRule(db, context("envelopes.archiveRule", {
      envelope_rule_id: "rule-1", row_version: 1, reason: "Duplikat akibat submit ganda",
    }, 1));
    assert.equal(archived.status, "archived");
    assert.equal((await db.one("SELECT status FROM envelope_periods WHERE envelope_period_id='period-1'")).status, "archived");
    assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action='envelopes.archiveRule' AND entity_id='rule-1'"));

    const restored = await restoreEnvelopeRule(db, context("envelopes.restoreRule", {
      envelope_rule_id: "rule-1", row_version: archived.row_version, reason: "Arsip ternyata salah",
    }, archived.row_version));
    assert.equal(restored.status, "active");
    assert.equal((await db.one("SELECT status FROM envelope_periods WHERE envelope_period_id='period-1'")).status, "active");
    assert.equal((await db.one("SELECT status FROM envelope_periods WHERE envelope_period_id='period-old-archived'")).status, "archived", "Restore rule tidak boleh menghidupkan periode yang sudah diarsipkan sebelum archive rule ini.");
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM envelope_rules WHERE envelope_rule_id='rule-1'")).count), 1);
  } finally { db.close(); }
});

test("mutasi alokasi dapat dibalik satu kali tanpa menghapus histori", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seedOwner(db);
    for (const [ruleId, ruleName] of [["rule-move-from", "Rule Dari"], ["rule-move-to", "Rule Ke"]]) {
      await db.execute(
        "INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [ruleId, ruleName, "monthly", "shared", null, 100_000, null, "unallocated", "confirm", "active", 1, owner.user_id, now, owner.user_id, now],
      );
    }
    for (const [id, ruleId, name, amount] of [["period-from", "rule-move-from", "Dari", 50_000], ["period-to", "rule-move-to", "Ke", 150_000]]) {
      await db.execute(
        "INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [id, ruleId, name, "2026-08-01", "2026-08-31", amount, 0, "active", 1, owner.user_id, now, owner.user_id, now, null, null],
      );
    }
    await db.execute(
      "INSERT INTO envelope_movements(movement_id,from_envelope_period_id,to_envelope_period_id,amount,movement_type,reason,status,row_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["move-1", "period-from", "period-to", 50_000, "reallocation", "Salah pindah", "active", 1, owner.user_id, now],
    );

    const reversed = await reverseEnvelopeMovement(db, context("envelopes.reverseMovement", {
      movement_id: "move-1", row_version: 1, from_row_version: 1, to_row_version: 1, reason: "Batalkan salah pindah",
    }, 1));
    assert.equal(reversed.status, "reversed");
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_period_id='period-from'")).allocated_amount), 100_000);
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_period_id='period-to'")).allocated_amount), 100_000);
    await assert.rejects(
      () => reverseEnvelopeMovement(db, context("envelopes.reverseMovement", {
        movement_id: "move-1", row_version: 2, from_row_version: 2, to_row_version: 2, reason: "Tidak boleh dua kali",
      }, 2)),
      (error) => error.code === "NOT_FOUND",
    );
  } finally { db.close(); }
});


test("arsip target dan aturan rutin memakai aksi eksplisit beralasan, bukan status magic pada update", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seedOwner(db);
    await seedAccount(db, { id: "account-archive", balance: 1_000_000 });
    await db.execute(
      "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ["category-archive", "Rumah", "expense", "fixed", "home", "active", 1, owner.user_id, now, owner.user_id, now],
    );
    await db.execute(
      "INSERT INTO savings_goals(goal_id,name,goal_type,target_amount,target_date,account_id,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["goal-active", "Dana rumah", "savings", 500_000, "2026-12-31", "account-archive", "normal", "active", 1, owner.user_id, now, owner.user_id, now, "shared", null],
    );
    await assert.rejects(
      () => updateGoal(db, context("goals.update", { goal_id: "goal-active", row_version: 1, status: "archived" }, 1)),
      (error) => error.code === "INVALID_GOAL",
    );
    await assert.rejects(
      () => archiveGoal(db, context("goals.archive", { goal_id: "goal-active", row_version: 1, reason: "" }, 1)),
      (error) => error.code === "REASON_REQUIRED",
    );
    const archivedGoal = await archiveGoal(db, context("goals.archive", { goal_id: "goal-active", row_version: 1, reason: "Duplikat akibat submit ganda" }, 1));
    assert.equal(archivedGoal.status, "archived");
    await assert.rejects(
      () => updateGoal(db, context("goals.update", { goal_id: "goal-active", row_version: archivedGoal.row_version, status: "active" }, archivedGoal.row_version)),
      (error) => error.code === "GOAL_ARCHIVED_LOCKED",
    );
    const restoredGoal = await restoreGoal(db, context("goals.restore", { goal_id: "goal-active", row_version: archivedGoal.row_version, reason: "Arsip salah" }, archivedGoal.row_version));
    assert.equal(restoredGoal.status, "active");

    await db.execute(
      "INSERT INTO recurring_rules(recurring_rule_id,name,kind,category_id,expected_amount,frequency,due_day,default_account_id,payment_method,auto_debit,start_date,end_date,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["recurring-active", "Bayar rumah", "expense", "category-archive", 300_000, "monthly", 7, "account-archive", "transfer", 0, "2026-01-01", null, "high", "active", 1, owner.user_id, now, owner.user_id, now, "shared", null],
    );
    await assert.rejects(
      () => updateRecurringRule(db, context("recurring.updateRule", { recurring_rule_id: "recurring-active", row_version: 1, status: "archived" }, 1)),
      (error) => error.code === "INVALID_STATUS",
    );
    await assert.rejects(
      () => archiveRecurringRule(db, context("recurring.archiveRule", { recurring_rule_id: "recurring-active", row_version: 1, reason: "" }, 1)),
      (error) => error.code === "REASON_REQUIRED",
    );
    const archivedRule = await archiveRecurringRule(db, context("recurring.archiveRule", { recurring_rule_id: "recurring-active", row_version: 1, reason: "Duplikat akibat submit ganda" }, 1));
    assert.equal(archivedRule.status, "archived");
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM recurring_occurrences WHERE recurring_rule_id='recurring-active' AND status='expected'")).count), 0);
    const restoredRule = await restoreRecurringRule(db, context("recurring.restoreRule", { recurring_rule_id: "recurring-active", row_version: archivedRule.row_version, reason: "Arsip salah" }, archivedRule.row_version));
    assert.equal(restoredRule.status, "active");
    assert.ok(Number((await db.one("SELECT COUNT(*) AS count FROM recurring_occurrences WHERE recurring_rule_id='recurring-active'")).count) >= 1);

    await db.execute(
      "INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["budget-active", "2026-08", "category-archive", null, "Anggaran rumah", 400_000, 80, "active", 1, owner.user_id, now, owner.user_id, now, "shared", null],
    );
    await assert.rejects(
      () => archiveBudget(db, context("budgets.archive", { budget_id: "budget-active", row_version: 1, reason: "" }, 1)),
      (error) => error.code === "REASON_REQUIRED",
    );
    const archivedBudget = await archiveBudget(db, context("budgets.archive", { budget_id: "budget-active", row_version: 1, reason: "Duplikat akibat submit ganda" }, 1));
    assert.equal(archivedBudget.status, "archived");
    const restoredBudget = await restoreBudget(db, context("budgets.restore", { budget_id: "budget-active", row_version: archivedBudget.row_version, reason: "Arsip salah" }, archivedBudget.row_version));
    assert.equal(restoredBudget.status, "active");

    for (const action of ["goals.archive", "goals.restore", "recurring.archiveRule", "recurring.restoreRule", "budgets.archive", "budgets.restore"]) {
      assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action=? LIMIT 1", [action]), `${action} wajib tercatat di audit.`);
    }
  } finally { db.close(); }
});

test("rekonsiliasi menerima saldo negatif hanya pada rekening yang mengizinkannya", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedOwner(db);
    await seedAccount(db, { id: "account-normal", allowNegative: false, balance: 0 });
    await seedAccount(db, { id: "account-negative", allowNegative: true, balance: 0 });

    await assert.rejects(
      () => createReconciliation(db, context("reconciliations.create", { account_id: "account-normal", actual_balance: -10_000, notes: "Tidak valid" })),
      (error) => error.code === "INVALID_AMOUNT",
    );
    const result = await createReconciliation(db, context("reconciliations.create", { account_id: "account-negative", actual_balance: -10_000, notes: "Overdraft valid" }));
    assert.equal(result.actual_balance, -10_000);
    assert.equal(result.difference, -10_000);
  } finally { db.close(); }
});

test("target, aturan rutin, dan anggaran arsip dapat dipulihkan secara guarded", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seedOwner(db);
    await seedAccount(db, { id: "account-planning", balance: 2_000_000 });
    await db.execute(
      "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ["category-planning", "Rumah", "expense", "fixed", "home", "active", 1, owner.user_id, now, owner.user_id, now],
    );
    await db.execute(
      "INSERT INTO savings_goals(goal_id,name,goal_type,target_amount,target_date,account_id,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["goal-archived", "Dana rumah", "savings", 500_000, "2026-12-31", "account-planning", "normal", "archived", 2, owner.user_id, now, owner.user_id, now, "shared", null],
    );
    await db.execute(
      "INSERT INTO recurring_rules(recurring_rule_id,name,kind,category_id,expected_amount,frequency,due_day,default_account_id,payment_method,auto_debit,start_date,end_date,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["recurring-archived", "Bayar rumah", "expense", "category-planning", 300_000, "monthly", 7, "account-planning", "transfer", 0, "2026-01-01", null, "high", "archived", 2, owner.user_id, now, owner.user_id, now, "shared", null],
    );
    await db.execute(
      "INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["budget-archived", "2026-08", "category-planning", null, "Anggaran rumah", 400_000, 80, "archived", 2, owner.user_id, now, owner.user_id, now, "shared", null],
    );

    const restoredGoal = await restoreGoal(db, context("goals.restore", { goal_id: "goal-archived", row_version: 2, reason: "Salah arsip" }, 2));
    assert.equal(restoredGoal.status, "active");

    const restoredRecurring = await restoreRecurringRule(db, context("recurring.restoreRule", { recurring_rule_id: "recurring-archived", row_version: 2, reason: "Salah arsip" }, 2));
    assert.equal(restoredRecurring.status, "active");
    assert.ok(Number((await db.one("SELECT COUNT(*) AS count FROM recurring_occurrences WHERE recurring_rule_id='recurring-archived'")).count) >= 1);

    const restoredBudget = await restoreBudget(db, context("budgets.restore", { budget_id: "budget-archived", row_version: 2, reason: "Salah arsip" }, 2));
    assert.equal(restoredBudget.status, "active");

    for (const action of ["goals.restore", "recurring.restoreRule", "budgets.restore"]) {
      assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action=? LIMIT 1", [action]), `${action} wajib tercatat di audit.`);
    }
  } finally { db.close(); }
});
