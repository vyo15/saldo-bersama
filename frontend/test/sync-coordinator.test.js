import assert from "node:assert/strict";
import test from "node:test";
import { changedSyncResources, createSyncRefreshPlan } from "../src/services/sync/syncCoordinator.js";

test("coordinator tidak reload resource bila revision global tidak berubah", () => {
  const previous = { globalRevision: 7, resources: { "categories.list": 2 } };
  const current = { globalRevision: 7, resources: { "categories.list": 2 } };
  const plan = createSyncRefreshPlan({ previous, current });
  assert.deepEqual(plan.changedResources, []);
  assert.deepEqual(plan.targets, []);
  assert.equal(plan.bootstrapChanged, false);
  assert.equal(plan.overviewChanged, false);
});

test("coordinator hanya menargetkan resource yang revision-nya berubah", () => {
  const previous = { globalRevision: 7, resources: { "categories.list": 2, "transactions.list": 9, "bootstrap.get": 3 } };
  const current = { globalRevision: 8, resources: { "categories.list": 3, "transactions.list": 9, "bootstrap.get": 4 } };
  assert.deepEqual(changedSyncResources(previous, current).sort(), ["bootstrap.get", "categories.list"]);
  const plan = createSyncRefreshPlan({ previous, current });
  assert.equal(plan.bootstrapChanged, true);
  assert.equal(plan.overviewChanged, false);
  assert.deepEqual(plan.passiveTargets, ["categories.list"]);
});

test("manual refresh menyatukan mounted read tanpa sync.state dan tetap memakai core refresher", () => {
  const snapshot = { globalRevision: 4, resources: {} };
  const plan = createSyncRefreshPlan({
    previous: snapshot,
    current: snapshot,
    manual: true,
    subscribedActions: ["sync.state", "bootstrap.get", "dashboard.overview", "transactions.list", "transactions.list"],
  });
  assert.equal(plan.bootstrapChanged, true);
  assert.equal(plan.overviewChanged, true);
  assert.deepEqual(plan.passiveTargets, ["transactions.list"]);
  assert.doesNotMatch(plan.targets.join(" "), /sync\.state/);
});
