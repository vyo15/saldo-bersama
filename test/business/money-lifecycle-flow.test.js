import assert from "node:assert/strict";
import test from "node:test";
import { createTransaction } from "../../api/_lib/services/finance.js";
import { accountAllocatedRemaining, accountBalanceAsOf } from "../../api/_lib/services/readModels.js";
import { createEnvelope } from "../../api/_lib/services/planning/envelopes.js";
import { archiveBudget, listBudgets, removeBudget, restoreBudget, upsertBudget } from "../../api/_lib/services/planning/budgets.js";
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

test("journey uang masuk sampai rekonsiliasi menjaga ledger, Alokasi Dana, Kebutuhan, Target, dan audit konsisten", async () => {
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
      default_amount: 0,
      allocated_amount: 0,
    }));
    assert.equal(await accountAllocatedRemaining(db, "rekening-bersama"), 0);
    assert.equal(await accountBalanceAsOf(db, sourceAccount, today), 1_500_000, "Membuat wadah Alokasi Rp0 tidak boleh mengubah saldo ledger.");

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
    assert.equal(await accountAllocatedRemaining(db, "rekening-bersama"), 500_000, "Kebutuhan otomatis mengikat Dana Tersedia tanpa mengubah saldo ledger.");
    assert.equal(await accountBalanceAsOf(db, sourceAccount, today), 1_500_000);

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
    assert.equal(await accountAllocatedRemaining(db, "rekening-bersama"), 350_000, "Expense Alokasi Dana menurunkan sisa dana Kebutuhan tanpa mengubah dana bebas lain.");

    const budgetAfterExpense = (await listBudgets(db, context(owner, "budgets.list", { period: month }))).items[0];
    assert.equal(Number(budgetAfterExpense.used_amount), 150_000);

    const archivedBudget = await archiveBudget(db, context(owner, "budgets.archive", {
      budget_id: budget.budget_id,
      row_version: budget.row_version,
      envelope_period_id: envelope.period.envelope_period_id,
      reason: "Kebutuhan selesai untuk journey test",
    }, budget.row_version));
    assert.equal(archivedBudget.status, "archived");
    assert.equal(await accountAllocatedRemaining(db, "rekening-bersama"), 0, "Mengarsipkan Kebutuhan melepas seluruh sisa dana yang belum terpakai.");
    assert.equal(await accountBalanceAsOf(db, sourceAccount, today), 1_350_000, "Release otomatis dari Kebutuhan tidak boleh membuat transaksi ledger.");

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
    for (const action of ["transactions.create", "envelopes.create", "budgets.upsert", "budgets.archive", "goals.create", "goals.move", "reconciliations.create"]) {
      assert.equal(actionSet.has(action), true, `Audit ${action} wajib tersedia.`);
    }
  } finally {
    db.close();
  }
});


test("hapus Kebutuhan menjaga transaksi dan hanya melepas sisa dana tanpa menyapu buffer Alokasi", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedAccount(db, "rekening-budget-remove", 3_000_000);
    await seedCategory(db, "arisan-remove", "expense");
    await seedCategory(db, "belanja-remove", "expense");
    await seedCategory(db, "opsional-remove", "expense");
    const today = todayJakarta();
    const month = today.slice(0, 7);
    const monthStart = `${month}-01`;
    const monthEndDate = new Date(`${monthStart}T00:00:00Z`);
    monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
    monthEndDate.setUTCDate(0);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);

    const envelope = await createEnvelope(db, context(owner, "envelopes.create", {
      name: "Rumah dengan buffer",
      source_account_id: "rekening-budget-remove",
      period_type: "monthly",
      period_start: monthStart,
      period_end: monthEnd,
      default_amount: 300_000,
      allocated_amount: 300_000,
    }));
    const arisan = await upsertBudget(db, context(owner, "budgets.upsert", {
      period_key: month,
      category_id: "arisan-remove",
      envelope_rule_id: envelope.rule.envelope_rule_id,
      amount: 500_000,
      scope: "shared",
    }));
    await upsertBudget(db, context(owner, "budgets.upsert", {
      period_key: month,
      category_id: "belanja-remove",
      envelope_rule_id: envelope.rule.envelope_rule_id,
      amount: 1_000_000,
      scope: "shared",
    }));
    const funded = await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_period_id=?", [envelope.period.envelope_period_id]);
    assert.equal(Number(funded.allocated_amount), 1_800_000, "Rp300 ribu buffer harus tetap terpisah dari total Kebutuhan Rp1,5 juta.");

    const payment = await createTransaction(db, context(owner, "transactions.create", {
      transaction_type: "expense",
      transaction_date: today,
      source_account_id: "rekening-budget-remove",
      category_id: "arisan-remove",
      envelope_period_id: envelope.period.envelope_period_id,
      budget_id: arisan.budget_id,
      amount: 300_000,
      description: "Pembayaran arisan",
    }));
    assert.equal(payment.budget_id, arisan.budget_id);

    const removed = await removeBudget(db, context(owner, "budgets.remove", {
      budget_id: arisan.budget_id,
      row_version: arisan.row_version,
      envelope_period_id: envelope.period.envelope_period_id,
      reason: "Arisan tidak dilanjutkan",
    }, arisan.row_version));
    assert.equal(removed.outcome, "ended");
    assert.equal(removed.status, "archived");
    assert.equal(Number(removed.released_amount_this_action), 200_000, "Hanya bagian Kebutuhan yang belum terpakai boleh dilepas.");

    const keptTransaction = await db.one("SELECT status,budget_id,amount FROM transactions WHERE transaction_id=?", [payment.transaction_id]);
    assert.equal(keptTransaction.status, "active");
    assert.equal(keptTransaction.budget_id, arisan.budget_id, "Relasi histori transaksi ke Kebutuhan harus tetap eksplisit.");
    assert.equal(Number(keptTransaction.amount), 300_000);
    const afterEnded = await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_period_id=?", [envelope.period.envelope_period_id]);
    assert.equal(Number(afterEnded.allocated_amount), 1_600_000, "Rp300 ribu buffer dan Rp1 juta kebutuhan lain tidak boleh ikut terlepas.");

    const optional = await upsertBudget(db, context(owner, "budgets.upsert", {
      period_key: month,
      category_id: "opsional-remove",
      envelope_rule_id: envelope.rule.envelope_rule_id,
      amount: 100_000,
      scope: "shared",
    }));
    const deleted = await removeBudget(db, context(owner, "budgets.remove", {
      budget_id: optional.budget_id,
      row_version: optional.row_version,
      envelope_period_id: envelope.period.envelope_period_id,
      reason: "Salah input dan belum pernah digunakan",
    }, optional.row_version));
    assert.equal(deleted.outcome, "deleted_unused");
    assert.equal(deleted.deleted, true);
    assert.equal(Number(deleted.released_amount), 100_000);
    assert.equal(await db.one("SELECT budget_id FROM budgets WHERE budget_id=?", [optional.budget_id]), null);
    const afterUnusedDelete = await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_period_id=?", [envelope.period.envelope_period_id]);
    assert.equal(Number(afterUnusedDelete.allocated_amount), 1_600_000);
  } finally {
    db.close();
  }
});


test("kategori kebutuhan yang sama dapat dipakai pada dua Alokasi Dana dalam periode yang sama", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedAccount(db, "rekening-budget-multi", 1_000_000);
    await seedCategory(db, "transportasi", "expense");
    const month = todayJakarta().slice(0, 7);
    const monthStart = `${month}-01`;
    const monthEndDate = new Date(`${monthStart}T00:00:00Z`);
    monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
    monthEndDate.setUTCDate(0);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);

    const education = await createEnvelope(db, context(owner, "envelopes.create", {
      name: "Pendidikan",
      source_account_id: "rekening-budget-multi",
      period_type: "monthly",
      period_start: monthStart,
      period_end: monthEnd,
      default_amount: 100_000,
      allocated_amount: 100_000,
    }));
    const partner = await createEnvelope(db, context(owner, "envelopes.create", {
      name: "Pasangan",
      source_account_id: "rekening-budget-multi",
      period_type: "monthly",
      period_start: monthStart,
      period_end: monthEnd,
      default_amount: 100_000,
      allocated_amount: 100_000,
    }));

    const educationNeed = await upsertBudget(db, context(owner, "budgets.upsert", {
      period_key: month,
      category_id: "transportasi",
      envelope_rule_id: education.rule.envelope_rule_id,
      amount: 75_000,
      scope: "shared",
    }));
    const partnerNeed = await upsertBudget(db, context(owner, "budgets.upsert", {
      period_key: month,
      category_id: "transportasi",
      envelope_rule_id: partner.rule.envelope_rule_id,
      amount: 50_000,
      scope: "shared",
    }));

    assert.notEqual(educationNeed.budget_id, partnerNeed.budget_id);
    assert.equal(educationNeed.category_id, partnerNeed.category_id);
    assert.equal(educationNeed.envelope_rule_id, education.rule.envelope_rule_id);
    assert.equal(partnerNeed.envelope_rule_id, partner.rule.envelope_rule_id);
    const listed = (await listBudgets(db, context(owner, "budgets.list", { period: month }))).items;
    assert.equal(listed.filter((item) => item.category_id === "transportasi").length, 2);

    const archivedEducationNeed = await archiveBudget(db, context(owner, "budgets.archive", {
      budget_id: educationNeed.budget_id,
      row_version: educationNeed.row_version,
      reason: "Uji lifecycle kebutuhan",
    }, educationNeed.row_version));
    assert.equal(archivedEducationNeed.status, "archived");

    const restoredEducationNeed = await restoreBudget(db, context(owner, "budgets.restore", {
      budget_id: educationNeed.budget_id,
      row_version: archivedEducationNeed.row_version,
      reason: "Pulihkan kebutuhan",
    }, archivedEducationNeed.row_version));
    assert.equal(restoredEducationNeed.status, "active");
    assert.equal(restoredEducationNeed.envelope_rule_id, education.rule.envelope_rule_id);
    assert.equal((await listBudgets(db, context(owner, "budgets.list", { period: month }))).items.filter((item) => item.category_id === "transportasi").length, 2);
  } finally {
    db.close();
  }
});
