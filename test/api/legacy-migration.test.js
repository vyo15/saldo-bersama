import assert from "node:assert/strict";
import test from "node:test";
import { transformLegacyPayload } from "../../scripts/legacy-migration.mjs";

const basePayload = () => ({
  schemaVersion: "2",
  data: {
    Users: [{ user_id: "u1", email: "owner@example.com", name: "Owner", role: "owner", status: "active", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
    Accounts: [], Categories: [], Envelope_Rules: [], Envelope_Periods: [], Recurring_Rules: [],
    Recurring_Occurrences: [{ occurrence_id: "o1", recurring_rule_id: "r1", period_key: "2026-08", due_date: "2026-08-01", expected_amount: "10000", actual_amount: 0, status: "expected", transaction_ids: "[]", row_version: 1, created_at: "x", updated_at: "x" }],
    Savings_Goals: [],
    Transactions: [{ transaction_id: "t1", transaction_date: "2026-08-01", transaction_type: "income", source_account_id: "", destination_account_id: "a1", category_id: "c1", envelope_period_id: "", recurring_occurrence_id: "", goal_id: "", amount: "10000", description: "Gaji", overspend_reason: "", merchant: "", payment_method: "", scope: "shared", owner_user_id: "", status: "active", row_version: 1, created_by: "u1", created_at: "x", updated_by: "u1", updated_at: "x", cancelled_by: "", cancelled_at: "", cancellation_reason: "" }],
    Budgets: [], Envelope_Movements: [],
    Goal_Movements: [{ goal_movement_id: "gm1", goal_id: "g1", transaction_id: "t1", movement_type: "contribution", amount: 10000, reason: "setor", status: "cancelled", created_by: "u1", created_at: "x" }],
    Reconciliations: [],
    Period_Closures: [{ closure_id: "p1", period_key: "2026-07", scope: "shared", status: "closed", reason: "ok", row_version: 1, closed_by: "u1", closed_at: "x", reopened_by: "", reopened_at: "" }],
    Audit_Log: [{ audit_id: "a1", request_id: "req", timestamp: "x", actor_email: "owner@example.com", action: "test", entity_type: "transaction", entity_id: "t1", result: "success" }],
    Idempotency: [{ idempotency_key: "old" }], Push_Subscriptions: [{ subscription_id: "s1" }],
  },
});

test("transform migrasi legacy mengisi field wajib dan menormalkan enum", () => {
  const result = transformLegacyPayload(basePayload());
  const byTarget = Object.fromEntries(result.records.map((item) => [item.target, item.rows]));
  assert.equal(byTarget.users[0].firebase_uid, null);
  assert.equal(byTarget.users[0].row_version, 1);
  assert.equal(byTarget.transactions[0].idempotency_key, "legacy:t1");
  assert.equal(byTarget.transactions[0].source_account_id, null);
  assert.equal(byTarget.recurring_occurrences[0].transaction_ids_json, "[]");
  assert.equal(byTarget.goal_movements[0].movement_type, "deposit");
  assert.equal(byTarget.goal_movements[0].status, "reversed");
  assert.match(byTarget.period_closures[0].snapshot_json, /legacySnapshotUnavailable/);
  assert.equal(byTarget.period_closures[0].snapshot_hash.length, 64);
  assert.equal(byTarget.audit_log[0].actor_id, "u1");
  assert.deepEqual(result.skipped.map((item) => item.name).sort(), ["Idempotency", "Push_Subscriptions"]);
});

test("migrasi menolak schema lama yang tidak didukung dan actor audit tanpa user", () => {
  const v1 = basePayload(); v1.schemaVersion = "1";
  assert.throws(() => transformLegacyPayload(v1), /tidak didukung/);
  const missing = basePayload(); missing.data.Audit_Log[0].actor_email = "missing@example.com";
  assert.throws(() => transformLegacyPayload(missing), /tidak cocok/);
});
