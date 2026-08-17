import assert from "node:assert/strict";
import test from "node:test";
import { ACTION_POLICIES, actionNames, isSnapshotReadAction, requiresIdempotencyKey } from "../../api/_lib/actions/policy.js";
import { ACTION_REGISTRY } from "../../api/_lib/actions/registry.js";
import { ACTION_PERMISSIONS } from "../../api/_lib/security.js";
import { READ_CACHE_TTL_MS } from "../../frontend/src/services/api/cache.js";

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
    else assert.equal(requiresIdempotencyKey(action), true, `${action} adalah mutation/external dan wajib idempotent`);
  }
  for (const action of [
    "transactions.create", "transactions.update", "transactions.cancel", "transactions.restore",
    "accounts.archive", "accounts.restore", "accounts.deleteUnused",
    "categories.archive", "categories.restore", "categories.deleteUnused", "users.deactivate", "users.reactivate",
    "envelopes.move", "envelopes.archiveRule", "envelopes.deleteUnusedRule", "envelopes.restoreRule", "envelopes.reverseMovement",
    "recurring.archiveRule", "recurring.deleteUnusedRule", "recurring.cancelOccurrence", "recurring.restoreOccurrence", "recurring.payOccurrence", "recurring.restoreRule",
    "budgets.deleteUnused", "budgets.restore", "goals.archive", "goals.deleteUnused", "goals.move", "goals.restore", "periods.close",
    "notifications.updatePreference", "reminders.upsert", "reminders.cancel", "import.preview", "backup.create", "import.apply", "restore.preview", "restore.apply", "reset.apply", "fullReset.apply",
  ]) assert.equal(requiresIdempotencyKey(action), true, action);
  assert.equal(requiresIdempotencyKey("integrity.run"), true);
});

test("human-error lifecycle tetap owner-only dan generic purge tidak tersedia", () => {
  const ownerOnly = [
    "archive.list", "accounts.previewLifecycle", "accounts.restore", "accounts.deleteUnused",
    "categories.previewArchive", "categories.restore", "categories.deleteUnused", "transactions.restore", "users.reactivate", "periods.previewClose",
    "envelopes.previewRuleLifecycle", "envelopes.archiveRule", "envelopes.deleteUnusedRule", "envelopes.restoreRule",
    "recurring.previewRuleLifecycle", "recurring.archiveRule", "recurring.deleteUnusedRule", "recurring.cancelOccurrence", "recurring.restoreOccurrence", "recurring.restoreRule",
    "budgets.previewLifecycle", "budgets.deleteUnused", "budgets.restore", "goals.previewLifecycle", "goals.archive", "goals.deleteUnused", "goals.restore",
    "reset.preview", "reset.status", "reset.apply", "fullReset.preview", "fullReset.status", "fullReset.apply",
  ];
  for (const action of ownerOnly) {
    assert.equal(ACTION_PERMISSIONS.owner.has(action), true, `${action} wajib tersedia untuk owner`);
    assert.equal(ACTION_PERMISSIONS.member.has(action), false, `${action} tidak boleh tersedia untuk member`);
  }
  for (const forbidden of ["purge", "data.purge", "accounts.delete", "transactions.delete", "categories.delete"]) {
    assert.equal(ACTION_POLICIES[forbidden], undefined, `${forbidden} tidak boleh terdaftar`);
    assert.equal(ACTION_REGISTRY[forbidden], undefined, `${forbidden} tidak boleh memiliki handler`);
  }
  for (const action of ["accounts.deleteUnused", "categories.deleteUnused", "envelopes.deleteUnusedRule", "recurring.deleteUnusedRule", "budgets.deleteUnused", "goals.deleteUnused"]) {
    assert.equal(ACTION_POLICIES[action].maintenanceAllowed, false);
  }
});


test("preview yang menulis state tidak menyamar sebagai read dan retry external hanya diaktifkan untuk workflow recoverable", () => {
  assert.equal(ACTION_POLICIES["import.preview"].mode, "write");
  assert.equal(ACTION_POLICIES["restore.preview"].mode, "external");
  assert.equal(ACTION_POLICIES["notifications.test"].retryUnknownSafe, false);
  assert.equal(ACTION_POLICIES["reset.apply"].retryUnknownSafe, false);
  assert.equal(ACTION_POLICIES["fullReset.apply"].retryUnknownSafe, false);
  for (const action of ["backup.create", "import.apply", "restore.preview", "restore.apply"]) {
    assert.equal(ACTION_POLICIES[action].retryUnknownSafe, true, `${action} wajib punya durable recovery sebelum retry outcome unknown`);
  }
});


test("frontend read transport tidak drift dari backend action policy", () => {
  const backendReads = Object.entries(ACTION_POLICIES).filter(([, policy]) => policy.mode === "read").map(([action]) => action).sort();
  assert.deepEqual(Object.keys(READ_CACHE_TTL_MS).sort(), backendReads);
});


test("snapshot read dipertahankan untuk read-model multi-query finansial dan preview guarded", () => {
  for (const action of ["app.initialState", "bootstrap.get", "dashboard.overview", "archive.list", "transactions.list", "envelopes.list", "goals.list", "reports.monthly", "periods.previewClose", "reset.preview", "reset.status", "fullReset.preview", "fullReset.status"]) {
    assert.equal(isSnapshotReadAction(action), true, `${action} wajib memakai snapshot konsisten`);
  }
  for (const action of ["accounts.list", "categories.list", "budgets.list", "recurring.list", "reconciliations.list", "periods.list"]) {
    assert.equal(isSnapshotReadAction(action), false, `${action} cukup memakai single-query read tanpa BEGIN/COMMIT`);
  }
});
