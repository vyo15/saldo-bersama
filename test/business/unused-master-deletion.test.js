import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveCategory,
  createAccount,
  createCategory,
  deleteUnusedCategory,
  previewCategoryArchive,
} from "../../api/_lib/services/masterData.js";
import { cancelTransactionInternal, createTransactionInternal } from "../../api/_lib/services/finance.js";
import {
  createEnvelope,
  deleteUnusedEnvelopeRule,
  previewEnvelopeRuleLifecycle,
} from "../../api/_lib/services/planning/envelopes.js";
import {
  createGoal,
  deleteUnusedGoal,
  previewGoalLifecycle,
  reverseGoalMovement,
} from "../../api/_lib/services/planning/goals.js";
import {
  archiveRecurringRule,
  createRecurringRule,
  deleteUnusedRecurringRule,
  previewRecurringRuleLifecycle,
} from "../../api/_lib/services/planning/recurring.js";
import {
  deleteUnusedBudget,
  previewBudgetLifecycle,
  upsertBudget,
} from "../../api/_lib/services/planning/budgets.js";
import { periodKey, todayJakarta } from "../../api/_lib/services/core.js";
import { accountBalanceAsOf } from "../../api/_lib/services/readModels.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = {
  user_id: "delete-owner",
  firebase_uid: "firebase-delete-owner",
  email: "delete-owner@example.com",
  name: "Delete Owner",
  role: "owner",
  status: "active",
  row_version: 1,
};

const context = (action, payload = {}, rowVersion = null) => ({
  actor: owner,
  signedActor: { uid: owner.firebase_uid, email: owner.email, name: owner.name },
  action,
  payload,
  rowVersion,
  requestId: `delete-policy:${action}:${Math.random()}`,
  idempotencyKey: `delete-policy:${action}:${Math.random()}`,
  today: todayJakarta(),
  enqueueMirror: async () => {},
  enqueueCalendar: async () => {},
});

const seedOwner = async (db) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [owner.user_id, owner.firebase_uid, owner.email, owner.name, owner.role, owner.status, 1, now, now],
  );
};

const createSharedAccount = (db, name = "Rekening Delete Test") => createAccount(db, context("accounts.create", {
  name,
  account_type: "cash",
  owner_scope: "shared",
  initial_balance: 1_000_000,
  initial_balance_date: todayJakarta(),
}));

const createExpenseCategory = (db, name) => createCategory(db, context("categories.create", {
  name,
  transaction_type: "expense",
  nature: "variable",
  icon: "shopping",
}));

test("kategori unused dapat hard-delete, tetapi histori cancelled tetap memblokir delete dan hanya boleh archive", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedOwner(db);
    const account = await createSharedAccount(db);
    const unused = await createExpenseCategory(db, "Unused Category");
    const unusedPreview = await previewCategoryArchive(db, context("categories.previewArchive", { category_id: unused.category_id, row_version: unused.row_version }, unused.row_version));
    assert.equal(unusedPreview.canDeleteUnused, true);
    await deleteUnusedCategory(db, context("categories.deleteUnused", { category_id: unused.category_id, row_version: unused.row_version, reason: "Salah input" }, unused.row_version));
    assert.equal(await db.one("SELECT category_id FROM categories WHERE category_id=?", [unused.category_id]), null);
    assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action='categories.deleteUnused' AND entity_id=?", [unused.category_id]));

    const used = await createExpenseCategory(db, "Used Category");
    const transaction = await createTransactionInternal(db, context("transactions.create"), {
      transaction_type: "expense",
      transaction_date: todayJakarta(),
      source_account_id: account.account_id,
      category_id: used.category_id,
      amount: 10_000,
      description: "Histori kategori",
    });
    const activePreview = await previewCategoryArchive(db, context("categories.previewArchive", { category_id: used.category_id, row_version: used.row_version }, used.row_version));
    assert.equal(activePreview.canDeleteUnused, false);
    assert.equal(activePreview.canArchive, true, "Transaksi aktif adalah histori tetapi tidak boleh memblokir archive kategori.");
    const cancelled = await cancelTransactionInternal(db, context("transactions.cancel"), transaction, "Salah input");
    assert.equal(cancelled.status, "cancelled");
    const usedPreview = await previewCategoryArchive(db, context("categories.previewArchive", { category_id: used.category_id, row_version: used.row_version }, used.row_version));
    assert.equal(usedPreview.canDeleteUnused, false);
    assert.equal(usedPreview.canArchive, true, "Transaksi historis tidak boleh memblokir archive kategori.");
    await assert.rejects(
      () => deleteUnusedCategory(db, context("categories.deleteUnused", { category_id: used.category_id, row_version: used.row_version, reason: "Tidak dipakai lagi" }, used.row_version)),
      (error) => error.code === "CATEGORY_DELETE_BLOCKED",
    );
    const archived = await archiveCategory(db, context("categories.archive", { category_id: used.category_id, row_version: used.row_version, reason: "Tidak dipakai lagi" }, used.row_version));
    assert.equal(archived.status, "archived");
  } finally { db.close(); }
});

test("kantong hanya hard-delete ketika hanya memiliki initial empty period", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedOwner(db);
    const account = await createSharedAccount(db, "Account Envelope Delete");
    const created = await createEnvelope(db, context("envelopes.create", {
      name: "Kantong Salah",
      default_amount: 100_000,
      allocated_amount: 100_000,
      source_account_id: account.account_id,
      period_type: "monthly",
      period_start: `${periodKey()}-01`,
      period_end: `${periodKey()}-28`,
      rollover_policy: "unallocated",
      overspend_policy: "confirm",
    }));
    const preview = await previewEnvelopeRuleLifecycle(db, context("envelopes.previewRuleLifecycle", { envelope_rule_id: created.rule.envelope_rule_id, row_version: created.rule.row_version }, created.rule.row_version));
    assert.equal(preview.canDeleteUnused, true);
    await deleteUnusedEnvelopeRule(db, context("envelopes.deleteUnusedRule", {
      envelope_rule_id: created.rule.envelope_rule_id,
      row_version: created.rule.row_version,
      reason: "Duplikat",
      acknowledged: true,
    }, created.rule.row_version));
    assert.equal(await db.one("SELECT envelope_rule_id FROM envelope_rules WHERE envelope_rule_id=?", [created.rule.envelope_rule_id]), null);
    assert.equal(await db.one("SELECT envelope_period_id FROM envelope_periods WHERE envelope_period_id=?", [created.period.envelope_period_id]), null);

    const used = await createEnvelope(db, context("envelopes.create", {
      name: "Kantong Historis",
      default_amount: 50_000,
      allocated_amount: 50_000,
      source_account_id: account.account_id,
      period_type: "monthly",
      period_start: `${periodKey()}-01`,
      period_end: `${periodKey()}-28`,
      rollover_policy: "unallocated",
      overspend_policy: "confirm",
    }));
    await db.execute("UPDATE envelope_periods SET status='closed',closed_by=?,closed_at=? WHERE envelope_period_id=?", [owner.user_id, new Date().toISOString(), used.period.envelope_period_id]);
    const usedPreview = await previewEnvelopeRuleLifecycle(db, context("envelopes.previewRuleLifecycle", { envelope_rule_id: used.rule.envelope_rule_id, row_version: used.rule.row_version }, used.rule.row_version));
    assert.equal(usedPreview.canDeleteUnused, false);
  } finally { db.close(); }
});

test("target unused dapat dihapus dan reverse movement menolak client row_version stale", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedOwner(db);
    const account = await createSharedAccount(db, "Account Goal Delete");
    const goal = await createGoal(db, context("goals.create", {
      name: "Target Salah",
      goal_type: "savings",
      target_amount: 500_000,
      account_id: account.account_id,
      priority: "normal",
    }));
    const preview = await previewGoalLifecycle(db, context("goals.previewLifecycle", { goal_id: goal.goal_id, row_version: goal.row_version }, goal.row_version));
    assert.equal(preview.canDeleteUnused, true);
    await deleteUnusedGoal(db, context("goals.deleteUnused", { goal_id: goal.goal_id, row_version: goal.row_version, reason: "Duplikat", acknowledged: true }, goal.row_version));
    assert.equal(await db.one("SELECT goal_id FROM savings_goals WHERE goal_id=?", [goal.goal_id]), null);

    const historicalGoal = await createGoal(db, context("goals.create", {
      name: "Target Historical",
      goal_type: "savings",
      target_amount: 600_000,
      account_id: account.account_id,
      priority: "normal",
    }));
    const now = new Date().toISOString();
    await db.execute(
      "INSERT INTO goal_movements(goal_movement_id,goal_id,transaction_id,movement_type,amount,reason,status,row_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["goal-move-stale", historicalGoal.goal_id, null, "deposit", 10_000, "Test", "active", 2, owner.user_id, now],
    );
    const historicalPreview = await previewGoalLifecycle(db, context("goals.previewLifecycle", { goal_id: historicalGoal.goal_id, row_version: historicalGoal.row_version }, historicalGoal.row_version));
    assert.equal(historicalPreview.canDeleteUnused, false);
    await assert.rejects(
      () => reverseGoalMovement(db, context("goals.reverseMovement", { goal_movement_id: "goal-move-stale", row_version: 1, reason: "Stale" }, 1)),
      (error) => error.code === "CONFLICT",
    );
    assert.equal((await db.one("SELECT status FROM goal_movements WHERE goal_movement_id='goal-move-stale'")).status, "active");
  } finally { db.close(); }
});

test("recurring rule hanya dapat hard-delete bila occurrence-nya murni projection masa depan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedOwner(db);
    const account = await createSharedAccount(db, "Account Recurring Delete");
    const category = await createExpenseCategory(db, "Recurring Category");
    const rule = await createRecurringRule(db, context("recurring.createRule", {
      name: "Recurring Salah",
      kind: "expense",
      category_id: category.category_id,
      expected_amount: 50_000,
      frequency: "monthly",
      due_day: 20,
      default_account_id: account.account_id,
      payment_method: "transfer",
      start_date: todayJakarta(),
      priority: "normal",
    }));
    const preview = await previewRecurringRuleLifecycle(db, context("recurring.previewRuleLifecycle", { recurring_rule_id: rule.recurring_rule_id, row_version: rule.row_version }, rule.row_version));
    assert.equal(preview.canDeleteUnused, true);
    await deleteUnusedRecurringRule(db, context("recurring.deleteUnusedRule", { recurring_rule_id: rule.recurring_rule_id, row_version: rule.row_version, reason: "Duplikat", acknowledged: true }, rule.row_version));
    assert.equal(await db.one("SELECT recurring_rule_id FROM recurring_rules WHERE recurring_rule_id=?", [rule.recurring_rule_id]), null);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM recurring_occurrences WHERE recurring_rule_id=?", [rule.recurring_rule_id])).count), 0);

    const historical = await createRecurringRule(db, context("recurring.createRule", {
      name: "Recurring Histori",
      kind: "expense",
      category_id: category.category_id,
      expected_amount: 70_000,
      frequency: "monthly",
      due_day: 21,
      default_account_id: account.account_id,
      payment_method: "transfer",
      start_date: todayJakarta(),
      priority: "normal",
    }));
    const occurrence = await db.one("SELECT * FROM recurring_occurrences WHERE recurring_rule_id=? ORDER BY due_date LIMIT 1", [historical.recurring_rule_id]);
    await db.execute("UPDATE recurring_occurrences SET status='cancelled',row_version=row_version+1 WHERE occurrence_id=?", [occurrence.occurrence_id]);
    const historyPreview = await previewRecurringRuleLifecycle(db, context("recurring.previewRuleLifecycle", { recurring_rule_id: historical.recurring_rule_id, row_version: historical.row_version }, historical.row_version));
    assert.equal(historyPreview.canDeleteUnused, false);
    await assert.rejects(
      () => deleteUnusedRecurringRule(db, context("recurring.deleteUnusedRule", { recurring_rule_id: historical.recurring_rule_id, row_version: historical.row_version, reason: "Tidak dipakai", acknowledged: true }, historical.row_version)),
      (error) => error.code === "RECURRING_RULE_HAS_HISTORY",
    );
    await archiveRecurringRule(db, context("recurring.archiveRule", { recurring_rule_id: historical.recurring_rule_id, row_version: historical.row_version, reason: "Tidak dipakai lagi" }, historical.row_version));
    assert.ok(await db.one("SELECT occurrence_id FROM recurring_occurrences WHERE occurrence_id=? AND status='cancelled'", [occurrence.occurrence_id]), "Cancelled occurrence wajib tetap menjadi histori.");

    const anomalous = await createRecurringRule(db, context("recurring.createRule", {
      name: "Recurring Status Historis",
      kind: "expense",
      category_id: category.category_id,
      expected_amount: 80_000,
      frequency: "monthly",
      due_day: 22,
      default_account_id: account.account_id,
      payment_method: "transfer",
      start_date: todayJakarta(),
      priority: "normal",
    }));
    const anomalousOccurrence = await db.one("SELECT * FROM recurring_occurrences WHERE recurring_rule_id=? ORDER BY due_date LIMIT 1", [anomalous.recurring_rule_id]);
    await db.execute("UPDATE recurring_occurrences SET status='partial',row_version=row_version+1 WHERE occurrence_id=?", [anomalousOccurrence.occurrence_id]);
    const anomalousPreview = await previewRecurringRuleLifecycle(db, context("recurring.previewRuleLifecycle", { recurring_rule_id: anomalous.recurring_rule_id, row_version: anomalous.row_version }, anomalous.row_version));
    assert.equal(anomalousPreview.canDeleteUnused, false, "Hanya occurrence future berstatus expected yang boleh dianggap projection reproducible.");
    await archiveRecurringRule(db, context("recurring.archiveRule", { recurring_rule_id: anomalous.recurring_rule_id, row_version: anomalous.row_version, reason: "Status historis wajib dipertahankan" }, anomalous.row_version));
    assert.ok(await db.one("SELECT occurrence_id FROM recurring_occurrences WHERE occurrence_id=? AND status='partial'", [anomalousOccurrence.occurrence_id]), "Occurrence non-expected tidak boleh ikut cleanup projection.");
  } finally { db.close(); }
});

test("anggaran unused dapat hard-delete, sedangkan transaksi cancelled dan period closure memblokirnya", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedOwner(db);
    const account = await createSharedAccount(db, "Account Budget Delete");
    const category = await createExpenseCategory(db, "Budget Category");
    const budget = await upsertBudget(db, context("budgets.upsert", { period_key: periodKey(), category_id: category.category_id, amount: 200_000, warning_threshold: 80, scope: "shared" }));
    const preview = await previewBudgetLifecycle(db, context("budgets.previewLifecycle", { budget_id: budget.budget_id, row_version: budget.row_version }, budget.row_version));
    assert.equal(preview.canDeleteUnused, true);
    await deleteUnusedBudget(db, context("budgets.deleteUnused", { budget_id: budget.budget_id, row_version: budget.row_version, reason: "Duplikat" }, budget.row_version));
    assert.equal(await db.one("SELECT budget_id FROM budgets WHERE budget_id=?", [budget.budget_id]), null);

    const usedCategory = await createExpenseCategory(db, "Budget Used Category");
    const usedBudget = await upsertBudget(db, context("budgets.upsert", { period_key: periodKey(), category_id: usedCategory.category_id, amount: 250_000, warning_threshold: 80, scope: "shared" }));
    const transaction = await createTransactionInternal(db, context("transactions.create"), {
      transaction_type: "expense",
      transaction_date: todayJakarta(),
      source_account_id: account.account_id,
      category_id: usedCategory.category_id,
      amount: 15_000,
      description: "Budget history",
    });
    await cancelTransactionInternal(db, context("transactions.cancel"), transaction, "Koreksi");
    const usedPreview = await previewBudgetLifecycle(db, context("budgets.previewLifecycle", { budget_id: usedBudget.budget_id, row_version: usedBudget.row_version }, usedBudget.row_version));
    assert.equal(usedPreview.canDeleteUnused, false, "Cancelled transaction tetap histori penggunaan budget.");

    const closureCategory = await createExpenseCategory(db, "Budget Closure Category");
    const closureBudget = await upsertBudget(db, context("budgets.upsert", { period_key: periodKey(), category_id: closureCategory.category_id, amount: 300_000, warning_threshold: 80, scope: "shared" }));
    const now = new Date().toISOString();
    await db.execute(
      "INSERT INTO period_closures(closure_id,period_key,scope,status,snapshot_json,snapshot_hash,reason,row_version,closed_by,closed_at,reopened_by,reopened_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      ["closure-delete-test", periodKey(), "shared", "reopened", "{}", "hash", "Test historical closure", 2, owner.user_id, now, owner.user_id, now],
    );
    const closurePreview = await previewBudgetLifecycle(db, context("budgets.previewLifecycle", { budget_id: closureBudget.budget_id, row_version: closureBudget.row_version }, closureBudget.row_version));
    assert.equal(closurePreview.canDeleteUnused, false, "Periode yang pernah ditutup tetap historis walaupun reopened.");
  } finally { db.close(); }
});

test("delete-unused mewajibkan owner, reason, acknowledgement sesuai risiko, dan row_version terbaru", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedOwner(db);
    const account = await createSharedAccount(db, "Account Human Error Guard");
    const category = await createExpenseCategory(db, "Category Human Error Guard");

    await assert.rejects(
      () => deleteUnusedCategory(db, { ...context("categories.deleteUnused", { category_id: category.category_id, row_version: category.row_version, reason: "Test" }, category.row_version), actor: { ...owner, role: "member" } }),
      (error) => error.code === "OWNER_ONLY",
    );
    await assert.rejects(
      () => deleteUnusedCategory(db, context("categories.deleteUnused", { category_id: category.category_id, row_version: category.row_version, reason: "" }, category.row_version)),
      (error) => error.code === "REASON_REQUIRED",
    );
    await assert.rejects(
      () => deleteUnusedCategory(db, context("categories.deleteUnused", { category_id: category.category_id, row_version: category.row_version + 1, reason: "Stale" }, category.row_version + 1)),
      (error) => error.code === "CONFLICT",
    );

    const envelope = await createEnvelope(db, context("envelopes.create", {
      name: "Kantong Guard",
      default_amount: 50_000,
      allocated_amount: 50_000,
      source_account_id: account.account_id,
      period_type: "monthly",
      period_start: `${periodKey()}-01`,
      period_end: `${periodKey()}-28`,
      rollover_policy: "unallocated",
      overspend_policy: "confirm",
    }));
    await assert.rejects(
      () => deleteUnusedEnvelopeRule(db, context("envelopes.deleteUnusedRule", {
        envelope_rule_id: envelope.rule.envelope_rule_id,
        row_version: envelope.rule.row_version,
        reason: "Duplikat",
        acknowledged: false,
      }, envelope.rule.row_version)),
      (error) => error.code === "ACKNOWLEDGEMENT_REQUIRED",
    );

    const goal = await createGoal(db, context("goals.create", {
      name: "Target Guard",
      goal_type: "savings",
      target_amount: 500_000,
      account_id: account.account_id,
      priority: "normal",
    }));
    await assert.rejects(
      () => deleteUnusedGoal(db, context("goals.deleteUnused", {
        goal_id: goal.goal_id,
        row_version: goal.row_version,
        reason: "Duplikat",
        acknowledged: false,
      }, goal.row_version)),
      (error) => error.code === "ACKNOWLEDGEMENT_REQUIRED",
    );

    const recurring = await createRecurringRule(db, context("recurring.createRule", {
      name: "Recurring Guard",
      kind: "expense",
      category_id: category.category_id,
      expected_amount: 25_000,
      frequency: "monthly",
      due_day: 20,
      default_account_id: account.account_id,
      payment_method: "transfer",
      start_date: todayJakarta(),
      priority: "normal",
    }));
    await assert.rejects(
      () => deleteUnusedRecurringRule(db, context("recurring.deleteUnusedRule", {
        recurring_rule_id: recurring.recurring_rule_id,
        row_version: recurring.row_version,
        reason: "Duplikat",
        acknowledged: false,
      }, recurring.row_version)),
      (error) => error.code === "ACKNOWLEDGEMENT_REQUIRED",
    );

    const budget = await upsertBudget(db, context("budgets.upsert", {
      period_key: periodKey(),
      category_id: category.category_id,
      amount: 100_000,
      warning_threshold: 80,
      scope: "shared",
    }));
    await assert.rejects(
      () => deleteUnusedBudget(db, context("budgets.deleteUnused", {
        budget_id: budget.budget_id,
        row_version: budget.row_version,
        reason: "   ",
      }, budget.row_version)),
      (error) => error.code === "REASON_REQUIRED",
    );
  } finally { db.close(); }
});

test("rantai master yang seluruhnya belum dipakai dapat dibersihkan berurutan tanpa mengubah saldo atau ledger", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedOwner(db);
    const account = await createSharedAccount(db, "Account Cleanup Chain");
    const category = await createExpenseCategory(db, "Category Cleanup Chain");
    const envelope = await createEnvelope(db, context("envelopes.create", {
      name: "Envelope Cleanup Chain",
      default_amount: 75_000,
      allocated_amount: 75_000,
      source_account_id: account.account_id,
      period_type: "monthly",
      period_start: `${periodKey()}-01`,
      period_end: `${periodKey()}-28`,
      rollover_policy: "unallocated",
      overspend_policy: "confirm",
    }));
    const goal = await createGoal(db, context("goals.create", {
      name: "Goal Cleanup Chain",
      goal_type: "savings",
      target_amount: 800_000,
      account_id: account.account_id,
      priority: "normal",
    }));
    const recurring = await createRecurringRule(db, context("recurring.createRule", {
      name: "Recurring Cleanup Chain",
      kind: "expense",
      category_id: category.category_id,
      expected_amount: 40_000,
      frequency: "monthly",
      due_day: 20,
      default_account_id: account.account_id,
      payment_method: "transfer",
      start_date: todayJakarta(),
      priority: "normal",
    }));
    const budget = await upsertBudget(db, context("budgets.upsert", {
      period_key: periodKey(),
      category_id: category.category_id,
      amount: 150_000,
      warning_threshold: 80,
      scope: "shared",
    }));

    const beforeBalance = await accountBalanceAsOf(db, account, todayJakarta());
    assert.equal((await previewCategoryArchive(db, context("categories.previewArchive", { category_id: category.category_id, row_version: category.row_version }, category.row_version))).canDeleteUnused, false, "Kategori belum boleh dihapus selama unused child masih ada.");

    await deleteUnusedBudget(db, context("budgets.deleteUnused", { budget_id: budget.budget_id, row_version: budget.row_version, reason: "Cleanup duplicate" }, budget.row_version));
    await deleteUnusedRecurringRule(db, context("recurring.deleteUnusedRule", { recurring_rule_id: recurring.recurring_rule_id, row_version: recurring.row_version, reason: "Cleanup duplicate", acknowledged: true }, recurring.row_version));
    await deleteUnusedEnvelopeRule(db, context("envelopes.deleteUnusedRule", { envelope_rule_id: envelope.rule.envelope_rule_id, row_version: envelope.rule.row_version, reason: "Cleanup duplicate", acknowledged: true }, envelope.rule.row_version));
    await deleteUnusedGoal(db, context("goals.deleteUnused", { goal_id: goal.goal_id, row_version: goal.row_version, reason: "Cleanup duplicate", acknowledged: true }, goal.row_version));

    const categoryPreview = await previewCategoryArchive(db, context("categories.previewArchive", { category_id: category.category_id, row_version: category.row_version }, category.row_version));
    assert.equal(categoryPreview.canDeleteUnused, true, "Setelah seluruh child history-free dibersihkan, kategori kembali eligible sebagai unused.");
    await deleteUnusedCategory(db, context("categories.deleteUnused", { category_id: category.category_id, row_version: category.row_version, reason: "Cleanup duplicate" }, category.row_version));

    const afterBalance = await accountBalanceAsOf(db, account, todayJakarta());
    assert.equal(afterBalance, beforeBalance, "Delete-unused master tidak boleh mengubah saldo rekening.");
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM transactions")).count), 0, "Delete-unused tidak boleh membuat atau menghapus ledger transaction.");
  } finally { db.close(); }
});
