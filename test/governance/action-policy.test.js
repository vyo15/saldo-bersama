import assert from "node:assert/strict";
import test from "node:test";
import { ACTION_POLICIES, actionNames, requiresIdempotencyKey } from "../../api/_lib/actions/policy.js";
import { ACTION_REGISTRY } from "../../api/_lib/actions/registry.js";
import { ACTION_PERMISSIONS } from "../../api/_lib/security.js";

test("action policy, handler registry, dan authorization tetap satu-ke-satu", () => {
  const policyNames = actionNames().sort();
  assert.deepEqual(Object.keys(ACTION_REGISTRY).sort(), policyNames);
  const permitted = new Set([...ACTION_PERMISSIONS.owner, ...ACTION_PERMISSIONS.member]);
  assert.deepEqual([...permitted].sort(), policyNames);
  for (const action of policyNames) {
    assert.equal(typeof ACTION_REGISTRY[action].handler, "function", `${action} wajib memiliki handler`);
    assert.ok(["read", "write", "external"].includes(ACTION_POLICIES[action].mode), `${action} mode invalid`);
  }
});

test("read action tidak meminta idempotency dan perubahan kritis tetap guarded", () => {
  for (const [action, policy] of Object.entries(ACTION_POLICIES)) {
    if (policy.mode === "read") assert.equal(requiresIdempotencyKey(action), false, action);
  }
  for (const action of [
    "transactions.create", "transactions.update", "transactions.cancel",
    "envelopes.move", "recurring.payOccurrence", "goals.move",
    "backup.create", "import.apply", "restore.apply",
  ]) assert.equal(requiresIdempotencyKey(action), true, action);
  assert.equal(requiresIdempotencyKey("integrity.run"), false);
});
