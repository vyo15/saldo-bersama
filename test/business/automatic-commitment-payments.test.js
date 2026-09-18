import assert from "node:assert/strict";
import test from "node:test";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { createCommitment } from "../../api/_lib/services/planning/commitments.js";
import { payOccurrence } from "../../api/_lib/services/planning/recurring.js";
import { processFundedCommitmentPayments } from "../../api/_lib/services/planning/automaticCommitmentPayments.js";
import { resolveRecurringBudgetForPeriod } from "../../api/_lib/services/planning/recurringBudgetLink.js";
import { addDays, todayJakarta } from "../../api/_lib/services/core.js";

const owner = { user_id: "auto-commit-owner", firebase_uid: "firebase-auto-commit-owner", email: "owner@example.com", name: "Owner", role: "owner", status: "active", row_version: 1 };
const context = (action, payload = {}, rowVersion = null) => ({
  actor: owner,
  signedActor: { uid: owner.firebase_uid, email: owner.email, name: owner.name },
  action,
  payload,
  rowVersion,
  requestId: `auto-commit:${action}:${Math.random()}`,
  idempotencyKey: `auto-commit:${action}:${Math.random()}`,
  enqueueMirror: async () => {},
  enqueueCalendar: async () => {},
});

const monthBounds = (period) => {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${period}-01`, end: `${period}-${String(lastDay).padStart(2, "0")}` };
};

const seed = async (db) => {
  const now = new Date().toISOString();
  await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [owner.user_id, owner.firebase_uid, owner.email, owner.name, owner.role, owner.status, 1, now, now]);
  await db.execute("INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["bank-main", "BCA", "bank", "shared", null, 1_000_000_000, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now]);
  await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["expense-home", "Cicilan Rumah", "expense", "fixed", "home", "active", 1, owner.user_id, now, owner.user_id, now]);
};

const seedFundedNeed = async (db, { amount = 3_750_000, budgetId = "budget-home", period = todayJakarta().slice(0, 7), name = "KPR Rumah" } = {}) => {
  const now = new Date().toISOString();
  const bounds = monthBounds(period);
  const ruleId = `envelope-${period}`;
  const periodId = `period-${period}`;
  const existingRule = await db.one("SELECT envelope_rule_id FROM envelope_rules WHERE envelope_rule_id=?", [ruleId]);
  if (!existingRule) {
    await db.execute("INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,assignee_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [ruleId, "Rumah", "monthly", "shared", null, null, amount, "bank-main", "unallocated", "block", "active", 1, owner.user_id, now, owner.user_id, now]);
    await db.execute("INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [periodId, ruleId, "Rumah", bounds.start, bounds.end, amount, 0, "active", 1, owner.user_id, now, owner.user_id, now, null, null]);
  }
  await db.execute("INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [budgetId, period, "expense-home", ruleId, name, amount, 80, "active", 1, owner.user_id, now, owner.user_id, now, "shared", null]);
  return { budgetId, ruleId, periodId };
};

test("KPR yang sudah berjalan memakai saldo sekarang tanpa membuat histori palsu dan tidak menebak pokok flat", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const created = await createCommitment(db, context("commitments.create", {
      commitment_type: "mortgage",
      name: "KPR Rumah",
      provider: "BTN",
      original_amount: 300_000_000,
      current_balance: 287_500_000,
      installment_amount: 3_750_000,
      total_installments: 120,
      default_account_id: "bank-main",
      category_id: "expense-home",
      due_day: 10,
      start_date: todayJakarta(),
    }));
    assert.equal(created.installments_paid, 0, "pembayaran lama tidak direkonstruksi sebagai histori aplikasi");
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM commitment_movements WHERE commitment_id=?", [created.commitment_id])).count), 0);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM transactions WHERE commitment_id=?", [created.commitment_id])).count), 0);

    const rule = await db.one("SELECT * FROM recurring_rules WHERE commitment_id=?", [created.commitment_id]);
    const occurrence = await db.one("SELECT * FROM recurring_occurrences WHERE recurring_rule_id=? ORDER BY due_date LIMIT 1", [rule.recurring_rule_id]);
    const paid = await payOccurrence(db, context("recurring.payOccurrence", {
      occurrence_id: occurrence.occurrence_id,
      row_version: occurrence.row_version,
      account_id: "bank-main",
      amount: 3_750_000,
      transaction_date: todayJakarta(),
    }, occurrence.row_version));
    assert.equal(paid.commitment.current_balance, 287_500_000, "saldo pokok KPR tidak boleh ditebak dari rumus flat");
    assert.equal(paid.commitment.installments_paid, 1);
    const movement = await db.one("SELECT * FROM commitment_movements WHERE transaction_id=?", [paid.transaction.transaction_id]);
    assert.equal(movement.principal_amount, 0);
    assert.equal(movement.interest_amount, 0);
    assert.equal(movement.principal_known, 0);
  } finally {
    db.close();
  }
});

test("Kewajiban yang Kebutuhannya sudah didanai dicatat otomatis tepat sekali saat jatuh tempo", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const funded = await seedFundedNeed(db);
    const today = todayJakarta();
    const dueDay = Number(today.slice(-2));
    const created = await createCommitment(db, context("commitments.create", {
      commitment_type: "mortgage",
      name: "KPR Rumah",
      provider: "BTN",
      original_amount: 300_000_000,
      current_balance: 287_500_000,
      installment_amount: 3_750_000,
      total_installments: 120,
      default_account_id: "bank-main",
      category_id: "expense-home",
      budget_id: funded.budgetId,
      due_day: dueDay,
      start_date: today,
    }));
    const managedRule = await db.one("SELECT * FROM recurring_rules WHERE commitment_id=?", [created.commitment_id]);
    await db.execute("UPDATE recurring_rules SET row_version=7 WHERE recurring_rule_id=?", [managedRule.recurring_rule_id]);
    const first = await processFundedCommitmentPayments(db, { today });
    assert.equal(first.settled, 1, "scheduler memakai row-version occurrence, bukan row-version rule yang dapat berbeda");
    assert.equal(first.amount, 3_750_000);
    const transaction = await db.one("SELECT * FROM transactions WHERE commitment_id=? AND status='active'", [created.commitment_id]);
    assert.ok(transaction);
    assert.equal(transaction.amount, 3_750_000);
    assert.equal(transaction.budget_id, funded.budgetId);
    assert.equal(transaction.envelope_period_id, funded.periodId);
    const current = await db.one("SELECT current_balance FROM commitments WHERE commitment_id=?", [created.commitment_id]);
    assert.equal(current.current_balance, 287_500_000, "pembayaran otomatis KPR tidak menebak penurunan pokok");

    const second = await processFundedCommitmentPayments(db, { today });
    assert.equal(second.settled, 0, "scheduler tidak boleh mendebit occurrence yang sama dua kali");
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM transactions WHERE commitment_id=? AND status='active'", [created.commitment_id])).count), 1);
  } finally {
    db.close();
  }
});

test("otomatisasi tidak membayar bila dana Kebutuhan/Alokasi belum cukup", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const funded = await seedFundedNeed(db, { amount: 2_000_000 });
    const today = todayJakarta();
    const created = await createCommitment(db, context("commitments.create", {
      commitment_type: "loan",
      name: "Pinjaman",
      original_amount: 30_000_000,
      current_balance: 30_000_000,
      installment_amount: 3_750_000,
      total_installments: 12,
      default_account_id: "bank-main",
      category_id: "expense-home",
      budget_id: funded.budgetId,
      due_day: Number(today.slice(-2)),
      start_date: today,
    }));
    const result = await processFundedCommitmentPayments(db, { today });
    assert.equal(result.settled, 0);
    assert.equal(result.skipped, 1);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM transactions WHERE commitment_id=?", [created.commitment_id])).count), 0);
  } finally {
    db.close();
  }
});

test("tautan Kebutuhan managed menemukan salinan bulan berjalan tanpa mengganti identity jadwal", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const currentPeriod = todayJakarta().slice(0, 7);
    const oldPeriod = currentPeriod.endsWith("-01") ? `${Number(currentPeriod.slice(0, 4)) - 1}-12` : `${currentPeriod.slice(0, 5)}${String(Number(currentPeriod.slice(5)) - 1).padStart(2, "0")}`;
    const now = new Date().toISOString();
    const ruleId = "continuity-envelope";
    await db.execute("INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,assignee_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [ruleId, "Rumah", "monthly", "shared", null, null, 4_000_000, "bank-main", "unallocated", "block", "active", 1, owner.user_id, now, owner.user_id, now]);
    await db.execute("INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["budget-old", oldPeriod, "expense-home", ruleId, "KPR Rumah", 4_000_000, 80, "archived", 1, owner.user_id, now, owner.user_id, now, "shared", null]);
    await db.execute("INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["budget-current", currentPeriod, "expense-home", ruleId, "KPR Rumah", 4_000_000, 80, "active", 1, owner.user_id, now, owner.user_id, now, "shared", null]);
    const resolved = await resolveRecurringBudgetForPeriod(db, { budget_id: "budget-old" }, currentPeriod);
    assert.equal(resolved?.budget_id, "budget-current");
  } finally {
    db.close();
  }
});

test("projection Jadwal Rutin memakai rolling horizon agar kewajiban panjang tetap ringan tetapi tidak berhenti setelah 24 bulan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const created = await createCommitment(db, context("commitments.create", {
      commitment_type: "mortgage",
      name: "KPR Panjang",
      provider: "BTN",
      original_amount: 600_000_000,
      current_balance: 600_000_000,
      installment_amount: 5_000_000,
      total_installments: 240,
      default_account_id: "bank-main",
      category_id: "expense-home",
      due_day: 10,
      start_date: todayJakarta(),
    }));
    const rule = await db.one("SELECT * FROM recurring_rules WHERE commitment_id=?", [created.commitment_id]);
    const furthest = await db.one("SELECT * FROM recurring_occurrences WHERE recurring_rule_id=? ORDER BY due_date DESC LIMIT 1", [rule.recurring_rule_id]);
    assert.ok(furthest?.occurrence_id);
    await db.execute("DELETE FROM recurring_occurrences WHERE occurrence_id=?", [furthest.occurrence_id]);

    const first = await processFundedCommitmentPayments(db, { today: todayJakarta() });
    assert.equal(first.projection.refreshed, true);
    assert.ok(await db.one("SELECT occurrence_id FROM recurring_occurrences WHERE recurring_rule_id=? AND due_date=?", [rule.recurring_rule_id, furthest.due_date]), "rolling refresh harus mengembalikan projection horizon yang hilang");

    const second = await processFundedCommitmentPayments(db, { today: todayJakarta() });
    assert.equal(second.projection.refreshed, false, "projection cukup direfresh sekali per bulan");
  } finally {
    db.close();
  }
});


test("Kewajiban overdue ikut dibayar otomatis saat Alokasi baru siap setelah jatuh tempo", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const today = todayJakarta();
    const overdueDate = addDays(today, -1);
    const funded = await seedFundedNeed(db, { amount: 3_750_000, period: overdueDate.slice(0, 7), budgetId: "budget-overdue" });
    const created = await createCommitment(db, context("commitments.create", {
      commitment_type: "mortgage",
      name: "KPR Overdue",
      provider: "BTN",
      original_amount: 300_000_000,
      current_balance: 287_500_000,
      installment_amount: 3_750_000,
      total_installments: 120,
      default_account_id: "bank-main",
      category_id: "expense-home",
      budget_id: funded.budgetId,
      due_day: Number(overdueDate.slice(-2)),
      start_date: overdueDate,
    }));
    const rule = await db.one("SELECT * FROM recurring_rules WHERE commitment_id=?", [created.commitment_id]);
    const overdue = await db.one("SELECT * FROM recurring_occurrences WHERE recurring_rule_id=? AND due_date=?", [rule.recurring_rule_id, overdueDate]);
    assert.ok(overdue, "occurrence jatuh tempo kemarin harus tersedia");
    assert.equal(overdue.status, "overdue");

    const result = await processFundedCommitmentPayments(db, { today });
    assert.equal(result.settled, 1, "scheduler hari ini harus mengejar kewajiban overdue yang dananya sudah siap");
    const transaction = await db.one("SELECT * FROM transactions WHERE commitment_id=? AND status='active'", [created.commitment_id]);
    assert.equal(transaction?.amount, 3_750_000);
  } finally {
    db.close();
  }
});

test("cicilan flat non-KPR tetap membatasi pembayaran terakhir ke sisa pokok plus bunga bulan itu", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const today = todayJakarta();
    const funded = await seedFundedNeed(db, { amount: 1_100_000, budgetId: "budget-final", name: "Cicilan Final" });
    const created = await createCommitment(db, context("commitments.create", {
      commitment_type: "installment",
      name: "Cicilan Final",
      provider: "Leasing",
      original_amount: 10_000_000,
      current_balance: 500_000,
      installment_amount: 1_100_000,
      total_installments: 10,
      default_account_id: "bank-main",
      category_id: "expense-home",
      budget_id: funded.budgetId,
      due_day: Number(today.slice(-2)),
      start_date: today,
    }));

    const result = await processFundedCommitmentPayments(db, { today });
    assert.equal(result.settled, 1);
    assert.equal(result.amount, 600_000, "final normal payment = sisa pokok 500 ribu + bunga flat 100 ribu");
    const transaction = await db.one("SELECT * FROM transactions WHERE commitment_id=? AND status='active'", [created.commitment_id]);
    assert.equal(transaction?.amount, 600_000);
    const current = await db.one("SELECT current_balance,status FROM commitments WHERE commitment_id=?", [created.commitment_id]);
    assert.equal(current.current_balance, 0);
    assert.equal(current.status, "completed");
  } finally {
    db.close();
  }
});
