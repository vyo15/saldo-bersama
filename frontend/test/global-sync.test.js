import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { apiClient, subscribeToInvalidation } from "../src/services/api/client.js";
import { publishServerStateChanged, subscribeToServerStateChanged } from "../src/services/sync/syncSignals.js";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("global sync coordinator memakai revision server untuk foreground polling dan manual refresh", async () => {
  const source = await read("src/app/FinanceContext.jsx");
  assert.match(source, /apiClient\.request\("sync\.state", \{\}, \{ force: true \}\)/);
  assert.match(source, /document\.visibilityState !== "visible"/);
  assert.match(source, /15_000/);
  assert.match(source, /reason: "foreground"/);
  assert.doesNotMatch(source, /addEventListener\("online"/);
  assert.doesNotMatch(source, /hiddenFor >= 2 \* 60_000/);
  assert.match(source, /failureStreakRef\.current >= 3/);
  assert.match(source, /subscribedReadActions\(\)/);
  assert.match(source, /apiClient\.invalidateAndWait\(passiveTargets\)/);
  assert.match(source, /if \(failedRefresh\) throw new Error/);
  assert.match(source, /controls\.syncBaselineRef\.current = current/);
});

test("pull-to-refresh mobile memakai coordinator tanpa hard reload dan menjaga interaction guard", async () => {
  const [shell, pull] = await Promise.all([
    read("src/layouts/AppShell.jsx"),
    read("src/components/pwa/MobilePullToRefresh.jsx"),
  ]);
  assert.match(shell, /<MobilePullToRefresh onRefresh=\{manualRefresh\}/);
  assert.match(shell, /composerOpen \|\| modalActivity\.modalOpen \|\| mutationActivity\.activeCount > 0/);
  assert.match(shell, /reason: "network-recovery"/);
  assert.doesNotMatch(shell, /manual: true, reason: "network-recovery"/);
  assert.match(pull, /window\.scrollY > 0/);
  assert.match(pull, /nestedScrollable\(event\.target\)/);
  assert.match(pull, /if \(offline\)/);
  assert.match(pull, /const onTouchCancel/);
  assert.match(pull, /if \(!blocked\) return;[\s\S]*setState\(\{ phase: "idle", distance: 0 \}\)/);
  assert.doesNotMatch(`${shell}\n${pull}`, /window\.location\.reload|location\.reload/);
});

test("invalidation yang ditunggu baru selesai setelah mounted resource selesai reload", async () => {
  apiClient.clearCache();
  let resolved = false;
  const unsubscribe = subscribeToInvalidation("transactions.list", async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    resolved = true;
  });
  const outcomes = await apiClient.invalidateAndWait("transactions.list");
  assert.equal(resolved, true);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].status, "fulfilled");
  unsubscribe();
});

test("sync signal tetap lokal di non-browser runtime dan tidak membuka BroadcastChannel Node", () => {
  let signals = 0;
  const unsubscribe = subscribeToServerStateChanged(() => { signals += 1; });
  publishServerStateChanged("transactions.create");
  assert.equal(signals, 1);
  unsubscribe();
});
