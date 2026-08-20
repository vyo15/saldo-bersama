import assert from "node:assert/strict";
import test from "node:test";
import { closeEnvelope, listEnvelopes } from "../../api/_lib/services/planning/envelopes.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const actor = {
  user_id: "owner-continuity",
  firebase_uid: "firebase-owner-continuity",
  email: "owner-continuity@example.com",
  name: "Owner Continuity",
  role: "owner",
  status: "active",
  row_version: 1,
};

const context = (payload) => ({
  actor,
  action: "envelopes.close",
  payload,
  requestId: `test:envelopes.close:${Math.random().toString(36).slice(2)}`,
  idempotencyKey: `test-key:${Math.random().toString(36).slice(2)}`,
  enqueueMirror: async () => {},
});

const seedBase = async (db) => {
  const now = "2026-08-01T00:00:00.000Z";
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [actor.user_id, actor.firebase_uid, actor.email, actor.name, actor.role, actor.status, actor.row_version, now, now],
  );
  await db.execute(
    `INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ["account-shared", "Kas Bersama", "cash", "shared", null, 5_000_000, "2026-01-01", 0, "active", 1, actor.user_id, now, actor.user_id, now],
  );
  for (const [categoryId, name] of [["cat-electric", "Listrik"], ["cat-internet", "Internet"]]) {
    await db.execute(
      "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      [categoryId, name, "expense", "fixed", "", "active", 1, actor.user_id, now, actor.user_id, now],
    );
  }
  return now;
};

const seedEnvelope = async (db, { rolloverPolicy, allocatedAmount, suffix }) => {
  const now = await seedBase(db);
  const ruleId = `rule-${suffix}`;
  const periodId = `period-${suffix}-aug`;
  await db.execute(
    `INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,assignee_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [ruleId, "Rumah", "monthly", "shared", null, null, 500_000, "account-shared", rolloverPolicy, "confirm", "active", 1, actor.user_id, now, actor.user_id, now],
  );
  await db.execute(
    `INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [periodId, ruleId, "Rumah", "2026-08-01", "2026-08-31", allocatedAmount, 0, "active", 1, actor.user_id, now, actor.user_id, now, null, null],
  );
  return { ruleId, periodId, now };
};

const seedBudget = (db, { id, ruleId, categoryId, periodKey = "2026-08", amount = 250_000 }) => db.execute(
  "INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  [id, periodKey, categoryId, ruleId, categoryId === "cat-electric" ? "Listrik" : "Internet", amount, 80, "active", 1, actor.user_id, "2026-08-01T00:00:00.000Z", actor.user_id, "2026-08-01T00:00:00.000Z", "shared", null],
);

test("tutup Alokasi Dana unallocated selalu menyiapkan periode berikutnya Rp0 tanpa memindahkan saldo", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const { ruleId, periodId } = await seedEnvelope(db, { rolloverPolicy: "unallocated", allocatedAmount: 500_000, suffix: "unallocated" });
    const result = await closeEnvelope(db, context({ envelope_period_id: periodId, row_version: 1, reuse_needs: false }));

    assert.equal(result.period.status, "closed");
    assert.equal(result.released_amount, 500_000);
    assert.equal(result.rollover, null);
    assert.equal(result.next_period.envelope_rule_id, ruleId);
    assert.equal(result.next_period.period_start, "2026-09-01");
    assert.equal(result.next_period.period_end, "2026-09-30");
    assert.equal(result.next_period.allocated_amount, 0);
    assert.equal(result.next_period.status, "active");

    const september = await listEnvelopes(db, { actor, payload: { period: "2026-09" } });
    assert.equal(september.items.length, 1);
    assert.equal(september.items[0].envelope_rule_id, ruleId);
    assert.equal(september.items[0].allocated_amount, 0);
    assert.equal((await db.all("SELECT * FROM envelope_movements")).length, 0);
  } finally {
    db.close();
  }
});

test("carry dengan sisa Rp0 tetap membuat periode berikutnya agar rule aktif tidak menjadi zombie", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const { ruleId, periodId } = await seedEnvelope(db, { rolloverPolicy: "carry", allocatedAmount: 0, suffix: "carry-zero" });
    const result = await closeEnvelope(db, context({ envelope_period_id: periodId, row_version: 1, reuse_needs: false }));

    assert.equal(result.rollover, null);
    assert.equal(result.next_period.envelope_rule_id, ruleId);
    assert.equal(result.next_period.allocated_amount, 0);
    const active = await db.all("SELECT * FROM envelope_periods WHERE envelope_rule_id=? AND status='active'", [ruleId]);
    assert.equal(active.length, 1);
  } finally {
    db.close();
  }
});

test("carry hanya membawa sisa dan mencatat movement rollover", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const { periodId } = await seedEnvelope(db, { rolloverPolicy: "carry", allocatedAmount: 500_000, suffix: "carry" });
    const result = await closeEnvelope(db, context({ envelope_period_id: periodId, row_version: 1, reuse_needs: false }));

    assert.equal(result.released_amount, 0);
    assert.equal(result.rollover.amount, 500_000);
    assert.equal(result.next_period.allocated_amount, 500_000);
    const movements = await db.all("SELECT * FROM envelope_movements WHERE movement_type='rollover'");
    assert.equal(movements.length, 1);
    assert.equal(movements[0].amount, 500_000);
  } finally {
    db.close();
  }
});

test("Pakai lagi Kebutuhan menyalin rencana aktif tanpa menimpa Kebutuhan periode tujuan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const { ruleId, periodId } = await seedEnvelope(db, { rolloverPolicy: "unallocated", allocatedAmount: 500_000, suffix: "needs" });
    await seedBudget(db, { id: "budget-electric-aug", ruleId, categoryId: "cat-electric", amount: 300_000 });
    await seedBudget(db, { id: "budget-internet-aug", ruleId, categoryId: "cat-internet", amount: 200_000 });
    await seedBudget(db, { id: "budget-electric-sep", ruleId, categoryId: "cat-electric", periodKey: "2026-09", amount: 350_000 });

    const result = await closeEnvelope(db, context({ envelope_period_id: periodId, row_version: 1, reuse_needs: true }));
    assert.equal(result.needs_continuity.copied, 1);
    assert.equal(result.needs_continuity.skipped, 1);

    const september = await db.all("SELECT * FROM budgets WHERE period_key='2026-09' AND envelope_rule_id=? ORDER BY category_id", [ruleId]);
    assert.equal(september.length, 2);
    const electric = september.find((item) => item.category_id === "cat-electric");
    const internet = september.find((item) => item.category_id === "cat-internet");
    assert.equal(electric.amount, 350_000, "Kebutuhan yang sudah disiapkan user tidak boleh ditimpa.");
    assert.equal(internet.amount, 200_000, "Nominal rencana lama boleh dipakai lagi sebagai rencana periode baru.");
    assert.notEqual(internet.budget_id, "budget-internet-aug");
  } finally {
    db.close();
  }
});
