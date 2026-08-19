import assert from "node:assert/strict";
import test from "node:test";
import { createTransaction } from "../../api/_lib/services/finance.js";
import { accountAllocatedRemaining, accountBalanceAsOf } from "../../api/_lib/services/readModels.js";
import { adjustEnvelopeAllocation, createEnvelope } from "../../api/_lib/services/planning/envelopes.js";
import { upsertBudget, listBudgets } from "../../api/_lib/services/planning/budgets.js";
import { createGoal, listGoals, moveGoal } from "../../api/_lib/services/planning/goals.js";
import { dashboardOverview } from "../../api/_lib/services/reporting/dashboard.js";
import { createReconciliation } from "../../api/_lib/services/reporting/reconciliations.js";
import { todayJakarta } from "../../api/_lib/services/core.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = { user_id: "journey-owner", firebase_uid: "firebase-journey-owner", email: "owner@example.com", name: "Owner", role: "owner", status: "active", row_version: 1 };
const member = { user_id: "journey-member", firebase_uid: "firebase-journey-member", email: "member@example.com", name: "Member", role: "member", status: "active", row_version: 1 };

let requestSequence = 0;
const context = (actor, action, payload = {}, rowVersion = null) => {
  requestSequence += 1;
  return {
    actor,
    signedActor: { uid: actor.firebase_uid, email: actor.email, name: actor.name },
    action,
    payload,
    rowVersion,
    requestId: `journey:${requestSequence}:${action}`,
    idempotencyKey: `journey:${requestSequence}:${action}`,
    enqueueMirror: async () => {},
    enqueueCalendar: async () => {},
  };
};

const seedUser = async (db, user) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [user.user_id, user.firebase_uid, user.email, user.name, user.role, user.status, 1, now, now],
  );
};

const seedAccount = async (db, id, balance = 0) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [id, id, "bank", "shared", null, balance, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now],
  );
};

const seedCategory = async (db, id, type) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    [id, id, type, type === "expense" ? "variable" : "other", "other", "active", 1, owner.user_id, now, owner.user_id, now],
  );
};

test("journey uang masuk sampai rekonsiliasi menjaga ledger, alokasi, budget, target, dan audit konsisten", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedUser(db, member);
    await seedAccount(db, "rekening-bersama", 1_000_000);
    await seedAccount(db, "rekening-target", 0);
    await seedCategory(db, "gaji", "income");
    await seedCategory(db, "makan", "expense");
    const today = todayJakarta();
    const month = today.slice(0, 7);
    const monthStart = `${month}-01`;
    const monthEndDate = new Date(`${monthStart}T00:00:00Z`);
    monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
    monthEndDate.setUTCDate(0);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);

    const income = await createTransaction(db, context(owner, "transactions.create", {
      transaction_type: "income",
      transaction_date: today,
      destination_account_id: "rekening-bersama",
      category_id: "gaji",
      amount: 500_000,
      description: "Pemasukan bulanan",
    }));
    assert.equal(income.amount, 500_000);
    const sourceAccount = await db.one("SELECT * FROM accounts WHERE account_id='rekening-bersama'");
    assert.equal(await accountBalanceAsOf(db, sourceAccount, today), 1_500_000);

    const envelope = await createEnvelope(db, context(owner, "envelopes.create", {
      name: "Makan",
      source_account_id: "rekening-bersama",
      period_type: "monthly",
      period_start: monthStart,
      period_end: monthEnd,
      default_amount: 100_000,
      allocated_amount: 100_000,
    }));
    const topUp = await adjustEnvelopeAllocation(db, context(owner, "envelopes.adjustAllocation", {
      envelope_period_id: envelope.period.envelope_period_id,
      direction: "fund",
      amount: 300_000,
      row_version: envelope.period.row_version,
    }, envelope.period.row_version));
    assert.equal(topUp.period.allocated_amount, 400_000);
    assert.equal(await accountAllocatedRemaining(db, "rekening-bersama"), 400_000);
    assert.equal(await accountBalanceAsOf(db, sourceAccount, today), 1_500_000, "Alokasi tidak boleh mengubah saldo ledger.");

    const budget = await upsertBudget(db, context(owner, "budgets.upsert", {
      period_key: month,
      category_id: "makan",
      envelope_rule_id: envelope.rule.envelope_rule_id,
      name: "Makan",
      amount: 500_000,
      warning_threshold: 80,
      scope: "shared",
    }));
    assert.equal(budget.amount, 500_000);

    const expense = await createTransaction(db, context(member, "transactions.create", {
      transaction_type: "expense",
      transaction_date: today,
      source_account_id: "rekening-bersama",
      category_id: "makan",
      envelope_period_id: envelope.period.envelope_period_id,
      amount: 150_000,
      description: "Makan bersama",
      cost_share_mode: "equal",
    }));
    assert.equal(expense.cost_share_mode, "equal");
    assert.equal(expense.cost_share.reduce((sum, item) => sum + item.share_amount, 0), 150_000);
    assert.equal(await accountBalanceAsOf(db, sourceAccount, today), 1_350_000);
    assert.equal(await accountAllocatedRemaining(db, "rekening-bersama"), 250_000, "Expense Kantong menurunkan sisa alokasi tanpa mengubah dana bebas sebelum release.");

    const budgetAfterExpense = (await listBudgets(db, context(owner, "budgets.list", { period: month }))).items[0];
    assert.equal(Number(budgetAfterExpense.used_amount), 150_000);

    const release = await adjustEnvelopeAllocation(db, context(owner, "envelopes.adjustAllocation", {
      envelope_period_id: envelope.period.envelope_period_id,
      direction: "release",
      amount: 100_000,
      row_version: topUp.period.row_version,
    }, topUp.period.row_version));
    assert.equal(release.period.allocated_amount, 300_000);
    assert.equal(await accountAllocatedRemaining(db, "rekening-bersama"), 150_000);
    assert.equal(await accountBalanceAsOf(db, sourceAccount, today), 1_350_000, "Release alokasi juga tidak boleh membuat transaksi ledger.");

    const goal = await createGoal(db, context(member, "goals.create", {
      name: "Liburan",
      account_id: "rekening-target",
      target_amount: 1_000_000,
    }));
    const goalDeposit = await moveGoal(db, context(member, "goals.move", {
      goal_id: goal.goal_id,
      movement_type: "deposit",
      amount: 200_000,
      source_account_id: "rekening-bersama",
      destination_account_id: "rekening-target",
      transaction_date: today,
      reason: "Setor sisa dana",
    }));
    assert.equal(goalDeposit.goal.current_amount, 200_000);
    const goalView = (await listGoals(db, context(owner, "goals.list", {}))).items.find((item) => item.goal_id === goal.goal_id);
    assert.equal(goalView.current_amount, 200_000);

    const sourceAfterGoal = await db.one("SELECT * FROM accounts WHERE account_id='rekening-bersama'");
    const sourceSystemBalance = await accountBalanceAsOf(db, sourceAfterGoal, today);
    assert.equal(sourceSystemBalance, 1_150_000);
    const reconciliation = await createReconciliation(db, context(owner, "reconciliations.create", {
      account_id: "rekening-bersama",
      actual_balance: sourceSystemBalance,
      notes: "Journey test",
    }));
    assert.equal(reconciliation.status, "matched");
    assert.equal(reconciliation.difference, 0);

    const dashboard = await dashboardOverview(db, context(owner, "dashboard.overview", { period: month }));
    assert.equal(dashboard.unallocatedCount, 0);
    assert.equal(dashboard.unallocatedExpenseAmount, 0);
    assert.ok(dashboard.unallocatedFunds >= 0);

    const auditActions = await db.all("SELECT action FROM audit_log ORDER BY timestamp");
    const actionSet = new Set(auditActions.map((item) => item.action));
    for (const action of ["transactions.create", "envelopes.create", "envelopes.adjustAllocation", "budgets.upsert", "goals.create", "goals.move", "reconciliations.create"]) {
      assert.equal(actionSet.has(action), true, `Audit ${action} wajib tersedia.`);
    }
  } finally {
    db.close();
  }
});
