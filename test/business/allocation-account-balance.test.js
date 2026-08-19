import assert from "node:assert/strict";
import test from "node:test";
import { cancelTransaction, createTransaction } from "../../api/_lib/services/finance.js";
import { visibleAccounts } from "../../api/_lib/services/readModels.js";
import { integrityIssues } from "../../api/_lib/services/reporting/integrity.js";
import { addDays, monthBounds, todayJakarta } from "../../api/_lib/services/core.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = {
  user_id: "allocation-owner",
  firebase_uid: "allocation-owner-uid",
  email: "allocation-owner@example.com",
  name: "Allocation Owner",
  role: "owner",
  status: "active",
  row_version: 1,
};

const context = (action, payload = {}, suffix = Math.random().toString(36).slice(2)) => ({
  actor: owner,
  action,
  payload,
  requestId: `test:${action}:${suffix}`,
  idempotencyKey: `test-key:${action}:${suffix}`,
  enqueueMirror: async () => {},
});

const seed = async (db) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [owner.user_id, owner.firebase_uid, owner.email, owner.name, owner.role, owner.status, owner.row_version, now, now],
  );
  for (const [accountId, name] of [["account-a", "BCA Bersama"], ["account-b", "Mandiri Bersama"]]) {
    await db.execute(
      `INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [accountId, name, "bank", "shared", null, 5_000_000, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now],
    );
  }
  for (const [categoryId, name, type, nature] of [
    ["category-food", "Makan", "expense", "variable"],
    ["category-income", "Pemasukan", "income", "other"],
  ]) {
    await db.execute(
      "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      [categoryId, name, type, nature, "", "active", 1, owner.user_id, now, owner.user_id, now],
    );
  }
  return now;
};

const insertEnvelope = async (db, { id, name, amount, sourceAccountId, reserved = 0 }) => {
  const now = new Date().toISOString();
  const bounds = monthBounds(todayJakarta().slice(0, 7));
  const ruleId = `rule-${id}`;
  const periodId = `period-${id}`;
  await db.execute(
    `INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,assignee_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [ruleId, name, "monthly", "shared", null, null, amount, sourceAccountId, "unallocated", "confirm", "active", 1, owner.user_id, now, owner.user_id, now],
  );
  await db.execute(
    `INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [periodId, ruleId, name, bounds.start, bounds.end, amount, reserved, "active", 1, owner.user_id, now, owner.user_id, now, null, null],
  );
  return { ruleId, periodId };
};

const createExpense = (db, { amount, accountId = "account-a", envelopePeriodId = "", description, overspendReason = "" }) => createTransaction(db, context("transactions.create", {
  transaction_type: "expense",
  transaction_date: todayJakarta(),
  source_account_id: accountId,
  category_id: "category-food",
  envelope_period_id: envelopePeriodId,
  amount,
  description,
  overspend_reason: overspendReason,
  confirm_duplicate: true,
}, description));

const accountSnapshot = async (db, accountId = "account-a") => {
  const rows = await visibleAccounts(db, owner);
  return rows.find((item) => item.account_id === accountId);
};

test("Alokasi Dana membagi saldo menjadi dana tersedia dan dana dialokasikan tanpa mengubah saldo ledger", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await insertEnvelope(db, { id: "belanja", name: "Belanja", amount: 1_500_000, sourceAccountId: "account-a" });

    let account = await accountSnapshot(db);
    assert.equal(account.balance, 5_000_000);
    assert.equal(account.allocated_remaining, 1_500_000);
    assert.equal(account.available_balance, 3_500_000);

    await db.execute("UPDATE envelope_periods SET reserved_amount=? WHERE envelope_period_id=?", [200_000, "period-belanja"]);
    account = await accountSnapshot(db);
    assert.equal(account.allocated_remaining, 1_500_000, "Dana yang dipesan di dalam Alokasi Dana tetap harus ditahan dari dana bebas.");
    assert.equal(account.available_balance, 3_500_000);
  } finally {
    db.close();
  }
});

test("pengeluaran dari Alokasi Dana menurunkan saldo dan sisa alokasi tetapi menjaga dana tersedia", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const envelope = await insertEnvelope(db, { id: "belanja", name: "Belanja", amount: 1_500_000, sourceAccountId: "account-a" });

    await createExpense(db, {
      amount: 500_000,
      envelopePeriodId: envelope.periodId,
      description: "Belanja dari Alokasi Dana",
    });

    let account = await accountSnapshot(db);
    assert.equal(account.balance, 4_500_000);
    assert.equal(account.allocated_remaining, 1_000_000);
    assert.equal(account.available_balance, 3_500_000);

    await createExpense(db, {
      amount: 200_000,
      description: "Belanja tanpa Alokasi Dana",
    });

    account = await accountSnapshot(db);
    assert.equal(account.balance, 4_300_000);
    assert.equal(account.allocated_remaining, 1_000_000);
    assert.equal(account.available_balance, 3_300_000);
  } finally {
    db.close();
  }
});

test("transaksi tanpa Alokasi Dana dan transfer tidak boleh memakai dana yang sudah dialokasikan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await insertEnvelope(db, { id: "rencana", name: "Dana rencana", amount: 4_000_000, sourceAccountId: "account-a" });

    await assert.rejects(
      createExpense(db, { amount: 1_100_000, description: "Melebihi dana bebas" }),
      (error) => error.code === "UNALLOCATED_FUNDS_INSUFFICIENT"
        && error.status === 409
        && Number(error.details?.availableAmount) === 1_000_000,
    );

    await assert.rejects(
      createTransaction(db, context("transactions.create", {
        transaction_type: "transfer",
        transaction_date: todayJakarta(),
        source_account_id: "account-a",
        destination_account_id: "account-b",
        amount: 1_100_000,
        description: "Transfer melebihi dana bebas",
        payment_method: "transfer",
      }, "transfer-too-large")),
      (error) => error.code === "UNALLOCATED_FUNDS_INSUFFICIENT"
        && error.status === 409
        && Number(error.details?.availableAmount) === 1_000_000,
    );
  } finally {
    db.close();
  }
});

test("transaksi dengan Alokasi Dana wajib memakai rekening sumber yang sama", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const envelope = await insertEnvelope(db, { id: "makan-bca", name: "Makan BCA", amount: 500_000, sourceAccountId: "account-a" });

    await assert.rejects(
      createExpense(db, {
        amount: 50_000,
        accountId: "account-b",
        envelopePeriodId: envelope.periodId,
        description: "Rekening salah",
      }),
      (error) => error.code === "ENVELOPE_SOURCE_ACCOUNT_MISMATCH" && error.status === 409,
    );
  } finally {
    db.close();
  }
});

test("transaksi Alokasi Dana bertanggal masa depan tidak melepaskan dana sebelum saldo benar-benar berkurang", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const envelope = await insertEnvelope(db, { id: "future", name: "Kebutuhan depan", amount: 1_500_000, sourceAccountId: "account-a" });
    const futureDate = addDays(todayJakarta(), 2);

    await createTransaction(db, context("transactions.create", {
      transaction_type: "expense",
      transaction_date: futureDate,
      source_account_id: "account-a",
      category_id: "category-food",
      envelope_period_id: envelope.periodId,
      amount: 500_000,
      description: "Pengeluaran mendatang",
      confirm_duplicate: true,
    }, "future-envelope-expense"));

    const current = await accountSnapshot(db);
    assert.equal(current.balance, 5_000_000);
    assert.equal(current.allocated_remaining, 1_500_000);
    assert.equal(current.available_balance, 3_500_000, "Pengeluaran masa depan belum boleh membebaskan dana Alokasi Dana hari ini.");

    const future = (await visibleAccounts(db, owner, { cutoffDate: futureDate })).find((item) => item.account_id === "account-a");
    assert.equal(future.balance, 4_500_000);
    assert.equal(future.allocated_remaining, 1_000_000);
    assert.equal(future.available_balance, 3_500_000);
  } finally {
    db.close();
  }
});

test("cancel pemasukan ditolak jika membuat saldo lebih kecil dari dana yang masih dialokasikan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const income = await createTransaction(db, context("transactions.create", {
      transaction_type: "income",
      transaction_date: todayJakarta(),
      destination_account_id: "account-a",
      category_id: "category-income",
      amount: 1_000_000,
      description: "Dana masuk untuk alokasi",
      confirm_duplicate: true,
    }, "income-before-allocation"));

    await insertEnvelope(db, { id: "after-income", name: "Alokasi setelah pemasukan", amount: 5_500_000, sourceAccountId: "account-a" });
    const beforeCancel = await accountSnapshot(db);
    assert.equal(beforeCancel.balance, 6_000_000);
    assert.equal(beforeCancel.available_balance, 500_000);

    await assert.rejects(
      cancelTransaction(db, context("transactions.cancel", {
        transaction_id: income.transaction_id,
        row_version: income.row_version,
        reason: "uji pembatalan pemasukan",
      }, "cancel-income")),
      (error) => error.code === "UNALLOCATED_FUNDS_INSUFFICIENT"
        && error.status === 409
        && Number(error.details?.accountBalance) === 5_000_000
        && Number(error.details?.allocatedRemaining) === 5_500_000,
    );
  } finally {
    db.close();
  }
});


test("integrity check mendeteksi sumber kantong invalid, transaksi beda rekening, realokasi lintas rekening, dan dana tersedia negatif", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seed(db);
    const boundA = await insertEnvelope(db, { id: "integrity-a", name: "Kantong A", amount: 500_000, sourceAccountId: "account-a" });
    const boundB = await insertEnvelope(db, { id: "integrity-b", name: "Kantong B", amount: 500_000, sourceAccountId: "account-b" });
    await insertEnvelope(db, { id: "legacy-unbound", name: "Legacy tanpa sumber", amount: 100_000, sourceAccountId: null });

    const expense = await createExpense(db, {
      amount: 50_000,
      envelopePeriodId: boundA.periodId,
      description: "Transaksi valid sebelum dirusak untuk integrity test",
    });
    await db.execute("UPDATE transactions SET source_account_id=? WHERE transaction_id=?", ["account-b", expense.transaction_id]);

    await db.execute(
      "INSERT INTO envelope_movements(movement_id,from_envelope_period_id,to_envelope_period_id,amount,movement_type,reason,status,row_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["movement-cross-account", boundA.periodId, boundB.periodId, 10_000, "reallocation", "legacy invalid movement", "active", 1, owner.user_id, now],
    );

    await db.execute("UPDATE envelope_periods SET allocated_amount=? WHERE envelope_period_id=?", [5_500_000, boundA.periodId]);

    const issues = await integrityIssues(db);
    assert.equal(issues.some((issue) => issue.code === "INVALID_ENVELOPE_SOURCE_ACCOUNT"), true);
    assert.equal(issues.some((issue) => issue.code === "ENVELOPE_TRANSACTION_SOURCE_MISMATCH"), true);
    assert.equal(issues.some((issue) => issue.code === "ENVELOPE_REALLOCATION_SOURCE_MISMATCH"), true);
    assert.equal(issues.some((issue) => issue.code === "ALLOCATED_FUNDS_EXCEED_BALANCE" && issue.accountId === "account-a"), true);
  } finally {
    db.close();
  }
});
