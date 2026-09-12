import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { dispatchAction } from "../../api/_lib/actionDispatcher.js";
import { monthBounds, todayJakarta } from "../../api/_lib/services/core.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = {
  user_id: "batch-owner",
  uid: "batch-owner-uid",
  email: "batch-owner@example.com",
  name: "Batch Owner",
  role: "owner",
};

const signedOwner = { uid: owner.uid, email: owner.email, name: owner.name, role: owner.role };
const period = todayJakarta().slice(0, 7);

const dispatchNamed = (db, action, payload, idempotencyKey = `${action}:${crypto.randomUUID()}`) => dispatchAction({
  signedActor: signedOwner,
  action,
  payload,
  requestId: `${action}:${crypto.randomUUID()}`,
  idempotencyKey,
  database: db,
});

const dispatch = (db, payload, idempotencyKey = `budget-batch:${crypto.randomUUID()}`) => dispatchNamed(db, "budgets.batchCreate", payload, idempotencyKey);

const seed = async (db) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [owner.user_id, owner.uid, owner.email, owner.name, owner.role, "active", 1, now, now],
  );
  await db.execute(
    `INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ["batch-shared-account", "Rekening Bersama", "bank", "shared", null, 5_000_000, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now],
  );
  await db.execute(
    `INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ["batch-personal-account", "Rekening Pribadi", "bank", "personal", owner.user_id, 5_000_000, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now],
  );
  for (const [categoryId, name] of [["batch-food", "Belanja"], ["batch-electric", "Listrik"], ["batch-internet", "Internet"]]) {
    await db.execute(
      "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      [categoryId, name, "expense", "variable", "", "active", 1, owner.user_id, now, owner.user_id, now],
    );
  }
  return now;
};

const insertEnvelope = async (db, { ruleId, sourceAccountId, scope = "shared", ownerUserId = null }) => {
  const now = new Date().toISOString();
  const bounds = monthBounds(period);
  await db.execute(
    `INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,assignee_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [ruleId, "Rumah Tangga", "monthly", scope, ownerUserId, null, 0, sourceAccountId, "unallocated", "confirm", "active", 1, owner.user_id, now, owner.user_id, now],
  );
  await db.execute(
    `INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [`period-${ruleId}`, ruleId, "Rumah Tangga", bounds.start, bounds.end, 0, 0, "active", 1, owner.user_id, now, owner.user_id, now, null, null],
  );
};

const basePayload = (ruleId) => ({
  period_key: period,
  envelope_rule_id: ruleId,
  scope: "shared",
  owner_user_id: null,
});

test("batch Kebutuhan membuat beberapa budget dan jadwal dalam satu mutation idempotent", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await insertEnvelope(db, { ruleId: "batch-rule", sourceAccountId: "batch-shared-account" });
    const payload = {
      ...basePayload("batch-rule"),
      items: [
        { category_id: "batch-food", amount: 900_000, recording_mode: "flexible" },
        {
          category_id: "batch-electric",
          amount: 350_000,
          recording_mode: "scheduled",
          schedule_frequency: "monthly",
          schedule_due_day: 20,
          schedule_start_date: todayJakarta(),
          schedule_payment_method: "transfer",
        },
      ],
    };

    const first = await dispatch(db, payload, "batch-create-idempotent");
    const replay = await dispatch(db, payload, "batch-create-idempotent");
    assert.equal(first.count, 2);
    assert.deepEqual(replay, first);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM budgets WHERE envelope_rule_id='batch-rule'")).count), 2);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM recurring_rules WHERE default_account_id='batch-shared-account'")).count), 1);
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_rule_id='batch-rule'")).allocated_amount), 1_250_000);
    assert.equal(Number(first.funding?.amount || 0), 1_250_000);
  } finally {
    db.close();
  }
});

test("batch Kebutuhan menolak kategori duplikat tanpa menulis sebagian data", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await insertEnvelope(db, { ruleId: "batch-duplicate-rule", sourceAccountId: "batch-shared-account" });
    await assert.rejects(
      dispatch(db, {
        ...basePayload("batch-duplicate-rule"),
        items: [
          { category_id: "batch-food", amount: 100_000, recording_mode: "flexible" },
          { category_id: "batch-food", amount: 200_000, recording_mode: "flexible" },
        ],
      }),
      (error) => error?.code === "BUDGET_BATCH_DUPLICATE_CATEGORY" && error?.status === 409,
    );
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM budgets WHERE envelope_rule_id='batch-duplicate-rule'")).count), 0);
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_rule_id='batch-duplicate-rule'")).allocated_amount), 0);
  } finally {
    db.close();
  }
});

test("batch Kebutuhan rollback seluruh write bila jadwal tidak konsisten dengan ownership Alokasi", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await insertEnvelope(db, { ruleId: "batch-rollback-rule", sourceAccountId: "batch-personal-account", scope: "shared" });
    await assert.rejects(
      dispatch(db, {
        ...basePayload("batch-rollback-rule"),
        items: [
          { category_id: "batch-food", amount: 100_000, recording_mode: "flexible" },
          {
            category_id: "batch-internet",
            amount: 200_000,
            recording_mode: "scheduled",
            schedule_frequency: "monthly",
            schedule_due_day: 10,
            schedule_start_date: todayJakarta(),
            schedule_payment_method: "transfer",
          },
        ],
      }),
      (error) => error?.code === "BUDGET_SCHEDULE_SCOPE_MISMATCH" && error?.status === 409,
    );
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM budgets WHERE envelope_rule_id='batch-rollback-rule'")).count), 0);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM recurring_rules")).count), 0);
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_rule_id='batch-rollback-rule'")).allocated_amount), 0);
  } finally {
    db.close();
  }
});


test("batch Kebutuhan menjelaskan kekurangan dana dan rollback tanpa partial write", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await db.execute("UPDATE accounts SET initial_balance=300000 WHERE account_id='batch-shared-account'");
    await insertEnvelope(db, { ruleId: "batch-insufficient-rule", sourceAccountId: "batch-shared-account" });
    await assert.rejects(
      dispatch(db, {
        ...basePayload("batch-insufficient-rule"),
        items: [
          { category_id: "batch-food", amount: 200_000, recording_mode: "flexible" },
          { category_id: "batch-internet", amount: 250_000, recording_mode: "flexible" },
        ],
      }),
      (error) => error?.code === "BUDGET_FUNDING_INSUFFICIENT"
        && error?.status === 409
        && Number(error?.details?.shortageAmount || 0) === 150_000
        && Number(error?.details?.availableAmount || 0) === 300_000,
    );
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM budgets WHERE envelope_rule_id='batch-insufficient-rule'")).count), 0);
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_rule_id='batch-insufficient-rule'")).allocated_amount), 0);
  } finally {
    db.close();
  }
});


test("edit, arsip, pulihkan, dan hapus Kebutuhan menyesuaikan dana Alokasi otomatis", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await insertEnvelope(db, { ruleId: "budget-lifecycle-rule", sourceAccountId: "batch-shared-account" });
    const base = {
      period_key: period,
      envelope_rule_id: "budget-lifecycle-rule",
      envelope_period_id: "period-budget-lifecycle-rule",
      category_id: "batch-food",
      scope: "shared",
      owner_user_id: null,
      warning_threshold: 80,
    };

    const created = await dispatchNamed(db, "budgets.upsert", { ...base, amount: 200_000 });
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_rule_id='budget-lifecycle-rule'")).allocated_amount), 200_000);

    const increased = await dispatchNamed(db, "budgets.upsert", { ...base, amount: 250_000, row_version: created.row_version });
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_rule_id='budget-lifecycle-rule'")).allocated_amount), 250_000);

    const reduced = await dispatchNamed(db, "budgets.upsert", { ...base, amount: 100_000, row_version: increased.row_version });
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_rule_id='budget-lifecycle-rule'")).allocated_amount), 100_000);

    const archived = await dispatchNamed(db, "budgets.archive", {
      budget_id: reduced.budget_id,
      row_version: reduced.row_version,
      envelope_period_id: base.envelope_period_id,
      reason: "Uji pengembalian dana otomatis",
    });
    assert.equal(archived.status, "archived");
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_rule_id='budget-lifecycle-rule'")).allocated_amount), 0);

    const restored = await dispatchNamed(db, "budgets.restore", {
      budget_id: reduced.budget_id,
      row_version: archived.row_version,
      envelope_period_id: base.envelope_period_id,
      reason: "Uji pendanaan ulang otomatis",
    });
    assert.equal(restored.status, "active");
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_rule_id='budget-lifecycle-rule'")).allocated_amount), 100_000);

    await dispatchNamed(db, "budgets.deleteUnused", {
      budget_id: reduced.budget_id,
      row_version: restored.row_version,
      envelope_period_id: base.envelope_period_id,
      reason: "Uji hapus dan pengembalian dana",
    });
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_rule_id='budget-lifecycle-rule'")).allocated_amount), 0);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM budgets WHERE budget_id=?", [reduced.budget_id])).count), 0);
  } finally {
    db.close();
  }
});


test("Kebutuhan yang sudah terpakai hanya mengembalikan sisa aman saat diarsipkan dan tidak dapat diturunkan di bawah pemakaian", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seed(db);
    await insertEnvelope(db, { ruleId: "budget-used-rule", sourceAccountId: "batch-shared-account" });
    const base = {
      period_key: period,
      envelope_rule_id: "budget-used-rule",
      envelope_period_id: "period-budget-used-rule",
      category_id: "batch-food",
      scope: "shared",
      owner_user_id: null,
      warning_threshold: 80,
    };

    const created = await dispatchNamed(db, "budgets.upsert", { ...base, amount: 250_000 });
    await db.execute(`INSERT INTO transactions(transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,recurring_occurrence_id,goal_id,amount,description,overspend_reason,merchant,payment_method,scope,owner_user_id,status,row_version,idempotency_key,created_by,created_at,updated_by,updated_at,cancelled_by,cancelled_at,cancellation_reason)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      "tx-budget-used", todayJakarta(), "expense", "batch-shared-account", null, "batch-food", "period-budget-used-rule", null, null, 100_000,
      "Pemakaian sebagian", "", "", "transfer", "shared", null, "active", 1, "tx-budget-used-key", owner.user_id, now, owner.user_id, now, null, null, "",
    ]);

    await assert.rejects(
      dispatchNamed(db, "budgets.upsert", { ...base, amount: 50_000, row_version: created.row_version }),
      (error) => error?.code === "BUDGET_AMOUNT_BELOW_USED" && Number(error?.details?.usedAmount || 0) === 100_000,
    );
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_rule_id='budget-used-rule'")).allocated_amount), 250_000);

    const archived = await dispatchNamed(db, "budgets.archive", {
      budget_id: created.budget_id,
      row_version: created.row_version,
      envelope_period_id: base.envelope_period_id,
      reason: "Arsip setelah sebagian terpakai",
    });
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_rule_id='budget-used-rule'")).allocated_amount), 100_000);

    const restored = await dispatchNamed(db, "budgets.restore", {
      budget_id: created.budget_id,
      row_version: archived.row_version,
      envelope_period_id: base.envelope_period_id,
      reason: "Pulihkan sisa kebutuhan",
    });
    assert.equal(restored.status, "active");
    assert.equal(Number((await db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_rule_id='budget-used-rule'")).allocated_amount), 250_000);
  } finally {
    db.close();
  }
});
