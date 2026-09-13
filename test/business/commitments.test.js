import assert from "node:assert/strict";
import test from "node:test";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { createCommitment, listCommitments, recordCommitmentReceipt, updateCommitment } from "../../api/_lib/services/planning/commitments.js";
import { listRecurring, payOccurrence, reverseOccurrencePayment, updateRecurringRule } from "../../api/_lib/services/planning/recurring.js";
import { todayJakarta } from "../../api/_lib/services/core.js";

const owner = { user_id: "commitment-owner", firebase_uid: "firebase-commitment-owner", email: "owner@example.com", name: "Owner", role: "owner", status: "active", row_version: 1 };
const context = (action, payload = {}, rowVersion = null) => ({
  actor: owner,
  signedActor: { uid: owner.firebase_uid, email: owner.email, name: owner.name },
  action,
  payload,
  rowVersion,
  requestId: `commitment:${action}:${Math.random()}`,
  idempotencyKey: `commitment:${action}:${Math.random()}`,
  enqueueMirror: async () => {},
  enqueueCalendar: async () => {},
});

const seed = async (db) => {
  const now = new Date().toISOString();
  await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [owner.user_id, owner.firebase_uid, owner.email, owner.name, owner.role, owner.status, 1, now, now]);
  await db.execute("INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["bank-main", "BCA", "bank", "shared", null, 1_000_000_000, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now]);
  await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["expense-home", "Cicilan Rumah", "expense", "fixed", "home", "active", 1, owner.user_id, now, owner.user_id, now]);
  await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["expense-arisan", "Setoran Arisan", "expense", "fixed", "users", "active", 1, owner.user_id, now, owner.user_id, now]);
  await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["income-arisan", "Penerimaan Arisan", "income", "other", "users", "active", 1, owner.user_id, now, owner.user_id, now]);
};

const seedFundedNeed = async (db) => {
  const now = new Date().toISOString();
  const period = todayJakarta().slice(0, 7);
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  await db.execute(
    "INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,assignee_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["commitment-rule-home", "Rumah Tangga", "monthly", "shared", null, null, 5_750_000, "bank-main", "unallocated", "confirm", "active", 1, owner.user_id, now, owner.user_id, now],
  );
  await db.execute(
    "INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["commitment-period-home", "commitment-rule-home", "Rumah Tangga", `${period}-01`, `${period}-${String(lastDay).padStart(2, "0")}`, 5_750_000, 0, "active", 1, owner.user_id, now, owner.user_id, now, null, null],
  );
  await db.execute(
    "INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["commitment-budget-home", period, "expense-home", "commitment-rule-home", "Cicilan Rumah", 5_750_000, 80, "active", 1, owner.user_id, now, owner.user_id, now, "shared", null],
  );
};

test("KPR membuat Jadwal Rutin terkelola, pembayaran memisahkan pokok/bunga, dan reverse mengembalikan progres", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await seedFundedNeed(db);
    const created = await createCommitment(db, context("commitments.create", {
      commitment_type: "mortgage",
      name: "KPR Rumah",
      provider: "BTN",
      original_amount: 600_000_000,
      current_balance: 487_500_000,
      installment_amount: 5_750_000,
      total_installments: 180,
      installments_paid: 24,
      default_account_id: "bank-main",
      category_id: "expense-home",
      budget_id: "commitment-budget-home",
      frequency: "monthly",
      due_day: 10,
      auto_debit: true,
      payment_method: "transfer",
      start_date: todayJakarta(),
    }));
    assert.equal(created.current_balance, 487_500_000);

    const rule = await db.one("SELECT * FROM recurring_rules WHERE commitment_id=?", [created.commitment_id]);
    assert.ok(rule);
    assert.equal(rule.budget_id, "commitment-budget-home");
    assert.equal(rule.auto_debit, 0, "write baru tidak boleh mengaktifkan flag autodebet legacy");
    const listedCommitment = (await listCommitments(db, context("commitments.list"))).items.find((item) => item.commitment_id === created.commitment_id);
    assert.equal(listedCommitment.budget_id, "commitment-budget-home");
    const listedRecurring = await listRecurring(db, context("recurring.list", { period: String((await db.one("SELECT period_key FROM recurring_occurrences WHERE recurring_rule_id=? ORDER BY due_date LIMIT 1", [rule.recurring_rule_id])).period_key) }));
    const recurringItem = listedRecurring.items.find((item) => item.commitment_id === created.commitment_id);
    assert.equal(recurringItem.can_edit_rule, false);
    assert.equal(recurringItem.can_archive_rule, false);
    assert.equal(recurringItem.commitment_auto_debit, false);

    await assert.rejects(
      () => updateRecurringRule(db, context("recurring.updateRule", { recurring_rule_id: rule.recurring_rule_id, row_version: rule.row_version, expected_amount: 6_000_000 }, rule.row_version)),
      (error) => error.code === "COMMITMENT_SCHEDULE_MANAGED" && error.status === 409,
    );

    const occurrence = await db.one("SELECT * FROM recurring_occurrences WHERE recurring_rule_id=? ORDER BY due_date LIMIT 1", [rule.recurring_rule_id]);
    const paid = await payOccurrence(db, context("recurring.payOccurrence", {
      occurrence_id: occurrence.occurrence_id,
      row_version: occurrence.row_version,
      account_id: "bank-main",
      amount: 5_750_000,
      transaction_date: todayJakarta(),
      remaining_principal: 484_300_000,
    }, occurrence.row_version));
    assert.equal(paid.transaction.commitment_id, created.commitment_id);
    assert.equal(paid.transaction.commitment_flow, "payment");
    assert.equal(paid.commitment.current_balance, 484_300_000);
    assert.equal(paid.commitment.installments_paid, 25);
    const movement = await db.one("SELECT * FROM commitment_movements WHERE transaction_id=?", [paid.transaction.transaction_id]);
    assert.equal(movement.principal_amount, 3_200_000);
    assert.equal(movement.interest_amount, 2_550_000);
    assert.equal(movement.principal_known, 1);

    const reversed = await reverseOccurrencePayment(db, context("recurring.reversePayment", {
      occurrence_id: paid.occurrence.occurrence_id,
      transaction_id: paid.transaction.transaction_id,
      row_version: paid.occurrence.row_version,
      reason: "Koreksi pengujian",
    }, paid.occurrence.row_version));
    assert.equal(reversed.commitment.current_balance, 487_500_000);
    assert.equal(reversed.commitment.installments_paid, 24);
    assert.equal((await db.one("SELECT status FROM commitment_movements WHERE transaction_id=?", [paid.transaction.transaction_id])).status, "reversed");

    const current = (await listCommitments(db, context("commitments.list"))).items.find((item) => item.commitment_id === created.commitment_id);
    const updated = await updateCommitment(db, context("commitments.update", {
      commitment_id: current.commitment_id,
      row_version: current.row_version,
      installment_amount: 5_900_000,
      due_day: 11,
    }, current.row_version));
    assert.equal(updated.installment_amount, 5_900_000);
    const updatedRule = await db.one("SELECT expected_amount,budget_id,auto_debit FROM recurring_rules WHERE commitment_id=?", [created.commitment_id]);
    assert.equal(updatedRule.expected_amount, 5_900_000);
    assert.equal(updatedRule.budget_id, "commitment-budget-home", "edit tanpa budget_id mempertahankan link Kebutuhan");
    assert.equal(updatedRule.auto_debit, 0);
  } finally {
    db.close();
  }
});

test("Arisan mencatat setoran sebagai Komitmen dan penerimaan sebagai transaksi masuk terhubung", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const arisan = await createCommitment(db, context("commitments.create", {
      commitment_type: "arisan",
      name: "Arisan Keluarga",
      provider: "Keluarga",
      installment_amount: 1_000_000,
      total_installments: 12,
      installments_paid: 4,
      default_account_id: "bank-main",
      category_id: "expense-arisan",
      frequency: "monthly",
      due_day: 15,
      start_date: todayJakarta(),
    }));
    assert.equal(arisan.current_balance, 8_000_000);

    const rule = await db.one("SELECT * FROM recurring_rules WHERE commitment_id=?", [arisan.commitment_id]);
    const occurrence = await db.one("SELECT * FROM recurring_occurrences WHERE recurring_rule_id=? ORDER BY due_date LIMIT 1", [rule.recurring_rule_id]);
    const paid = await payOccurrence(db, context("recurring.payOccurrence", {
      occurrence_id: occurrence.occurrence_id,
      row_version: occurrence.row_version,
      account_id: "bank-main",
      amount: 1_000_000,
      transaction_date: todayJakarta(),
    }, occurrence.row_version));
    assert.equal(paid.commitment.current_balance, 7_000_000);
    assert.equal(paid.commitment.installments_paid, 5);

    const received = await recordCommitmentReceipt(db, context("commitments.recordReceipt", {
      commitment_id: paid.commitment.commitment_id,
      row_version: paid.commitment.row_version,
      amount: 12_000_000,
      account_id: "bank-main",
      category_id: "income-arisan",
      transaction_date: todayJakarta(),
      payment_method: "transfer",
    }, paid.commitment.row_version));
    assert.equal(received.transaction.commitment_flow, "receipt");
    assert.equal(received.transaction.commitment_id, arisan.commitment_id);
    assert.equal(received.commitment.received_amount, 12_000_000);
    assert.equal((await db.one("SELECT movement_type FROM commitment_movements WHERE transaction_id=?", [received.transaction.transaction_id])).movement_type, "receipt");
    await assert.rejects(
      () => recordCommitmentReceipt(db, context("commitments.recordReceipt", {
        commitment_id: arisan.commitment_id, row_version: received.commitment.row_version, amount: 1_000_000, account_id: "bank-main", category_id: "income-arisan", transaction_date: todayJakarta(),
      }, received.commitment.row_version)),
      (error) => error.code === "COMMITMENT_RECEIPT_COMPLETE" && error.status === 409,
    );
  } finally {
    db.close();
  }
});

test("pembayaran pelunasan menghentikan jadwal dan reversal mengaktifkannya kembali", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const commitment = await createCommitment(db, context("commitments.create", {
      commitment_type: "loan",
      name: "Pinjaman Uji",
      provider: "Bank Uji",
      original_amount: 5_000_000,
      current_balance: 500_000,
      installment_amount: 1_000_000,
      total_installments: 5,
      installments_paid: 4,
      default_account_id: "bank-main",
      category_id: "expense-home",
      frequency: "monthly",
      due_day: 10,
      start_date: todayJakarta(),
    }));
    const rule = await db.one("SELECT * FROM recurring_rules WHERE commitment_id=?", [commitment.commitment_id]);
    const occurrence = await db.one("SELECT * FROM recurring_occurrences WHERE recurring_rule_id=? ORDER BY due_date LIMIT 1", [rule.recurring_rule_id]);
    const paid = await payOccurrence(db, context("recurring.payOccurrence", {
      occurrence_id: occurrence.occurrence_id,
      row_version: occurrence.row_version,
      account_id: "bank-main",
      amount: 500_000,
      transaction_date: todayJakarta(),
      remaining_principal: 0,
    }, occurrence.row_version));
    assert.equal(paid.occurrence.status, "paid");
    assert.equal(paid.commitment.status, "completed");
    assert.equal(paid.commitment.current_balance, 0);
    assert.equal((await db.one("SELECT status FROM recurring_rules WHERE recurring_rule_id=?", [rule.recurring_rule_id])).status, "archived");

    const reversed = await reverseOccurrencePayment(db, context("recurring.reversePayment", {
      occurrence_id: paid.occurrence.occurrence_id,
      transaction_id: paid.transaction.transaction_id,
      row_version: paid.occurrence.row_version,
      reason: "Pelunasan dibatalkan untuk koreksi",
    }, paid.occurrence.row_version));
    assert.equal(reversed.commitment.status, "active");
    assert.equal(reversed.commitment.current_balance, 500_000);
    assert.equal((await db.one("SELECT status FROM recurring_rules WHERE recurring_rule_id=?", [rule.recurring_rule_id])).status, "active");
  } finally {
    db.close();
  }
});
