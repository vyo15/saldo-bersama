import assert from "node:assert/strict";
import test from "node:test";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { createTransaction } from "../../api/_lib/services/finance.js";
import { createRecurringRule } from "../../api/_lib/services/planning/recurring.js";
import { createReconciliation, diagnoseReconciliation } from "../../api/_lib/services/reporting/reconciliations.js";
import { todayJakarta } from "../../api/_lib/services/core.js";

const owner = { user_id: "reconcile-owner", firebase_uid: "firebase-reconcile-owner", email: "owner@example.com", name: "Owner", role: "owner", status: "active", row_version: 1 };
let sequence = 0;
const context = (action, payload = {}, rowVersion = null) => ({
  actor: owner,
  signedActor: { uid: owner.firebase_uid, email: owner.email, name: owner.name },
  action,
  payload,
  rowVersion,
  requestId: `reconcile-diagnosis:${++sequence}:${action}`,
  idempotencyKey: `reconcile-diagnosis:${sequence}:${action}`,
  enqueueMirror: async () => {},
  enqueueCalendar: async () => {},
});

const seed = async (db) => {
  const now = new Date().toISOString();
  await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [owner.user_id, owner.firebase_uid, owner.email, owner.name, owner.role, owner.status, 1, now, now]);
  await db.execute("INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["bank-main", "BCA", "bank", "shared", null, 1_000_000, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now]);
  await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["internet", "Internet", "expense", "fixed", "internet", "active", 1, owner.user_id, now, owner.user_id, now]);
};

test("diagnosis rekonsiliasi meranking Jadwal Rutin yang menjelaskan selisih dan menghitung ulang setelah perbaikan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const today = todayJakarta();
    const rule = await createRecurringRule(db, context("recurring.createRule", {
      name: "Internet Rumah",
      kind: "expense",
      category_id: "internet",
      expected_amount: 150_000,
      frequency: "monthly",
      due_day: Number(today.slice(-2)),
      default_account_id: "bank-main",
      start_date: today,
    }));
    const reconciliation = await createReconciliation(db, context("reconciliations.create", {
      account_id: "bank-main",
      actual_balance: 850_000,
    }));
    const diagnosis = await diagnoseReconciliation(db, context("reconciliations.diagnose", { reconciliation_id: reconciliation.reconciliation_id }));
    assert.equal(diagnosis.difference, -150_000);
    assert.equal(diagnosis.resolved, false);
    assert.equal(diagnosis.candidates[0]?.kind, "recurring");
    assert.equal(diagnosis.candidates[0]?.recurring_rule_id, rule.recurring_rule_id);
    assert.equal(diagnosis.candidates[0]?.confidence, "strong");

    await createTransaction(db, context("transactions.create", {
      transaction_type: "expense",
      transaction_date: today,
      source_account_id: "bank-main",
      category_id: "internet",
      amount: 150_000,
      description: "Internet Rumah",
    }));
    const resolved = await diagnoseReconciliation(db, context("reconciliations.diagnose", { reconciliation_id: reconciliation.reconciliation_id }));
    assert.equal(resolved.system_balance, 850_000);
    assert.equal(resolved.difference, 0);
    assert.equal(resolved.resolved, true);
  } finally {
    db.close();
  }
});
