import assert from "node:assert/strict";
import test from "node:test";
import {
  beginFinanceRequest,
  createFinanceRequestEpoch,
  finishFinanceResource,
  hasPendingFinanceRequest,
  invalidateFinanceSession,
  requestOwnsAnyFinanceResource,
  requestOwnsFinanceResource,
} from "../src/app/financeRequestEpoch.js";

test("refresh overview tidak membatalkan bootstrap dari initial load", () => {
  const epoch = createFinanceRequestEpoch();
  const initial = beginFinanceRequest(epoch, ["bootstrap", "overview"]);
  const overview = beginFinanceRequest(epoch, ["overview"]);

  assert.equal(requestOwnsFinanceResource(epoch, initial, "bootstrap"), true);
  assert.equal(requestOwnsFinanceResource(epoch, initial, "overview"), false);
  assert.equal(requestOwnsFinanceResource(epoch, overview, "overview"), true);
  assert.equal(finishFinanceResource(epoch, initial, "bootstrap"), true);
  assert.equal(hasPendingFinanceRequest(epoch), true, "Overview baru masih berjalan setelah bootstrap initial selesai.");
  assert.equal(finishFinanceResource(epoch, overview, "overview"), true);
  assert.equal(hasPendingFinanceRequest(epoch), false);
});

test("refresh bootstrap dan overview memiliki epoch independen", () => {
  const epoch = createFinanceRequestEpoch();
  const bootstrap = beginFinanceRequest(epoch, ["bootstrap"]);
  const overview = beginFinanceRequest(epoch, ["overview"]);

  assert.equal(requestOwnsFinanceResource(epoch, bootstrap, "bootstrap"), true);
  assert.equal(requestOwnsFinanceResource(epoch, overview, "overview"), true);
  assert.equal(requestOwnsAnyFinanceResource(epoch, bootstrap), true);
  assert.equal(requestOwnsAnyFinanceResource(epoch, overview), true);
});

test("request baru hanya membatalkan resource yang sama", () => {
  const epoch = createFinanceRequestEpoch();
  const bootstrap = beginFinanceRequest(epoch, ["bootstrap"]);
  const overviewOld = beginFinanceRequest(epoch, ["overview"]);
  const overviewNew = beginFinanceRequest(epoch, ["overview"]);

  assert.equal(requestOwnsFinanceResource(epoch, bootstrap, "bootstrap"), true);
  assert.equal(requestOwnsFinanceResource(epoch, overviewOld, "overview"), false);
  assert.equal(requestOwnsFinanceResource(epoch, overviewNew, "overview"), true);
  assert.equal(finishFinanceResource(epoch, overviewOld, "overview"), false, "Response stale tidak boleh mematikan pending request terbaru.");
  assert.equal(epoch.pending.overview, true);
});

test("logout atau pergantian session membatalkan semua response lama", () => {
  const epoch = createFinanceRequestEpoch();
  const initial = beginFinanceRequest(epoch, ["bootstrap", "overview"]);
  invalidateFinanceSession(epoch);

  assert.equal(requestOwnsAnyFinanceResource(epoch, initial), false);
  assert.equal(requestOwnsFinanceResource(epoch, initial, "bootstrap"), false);
  assert.equal(requestOwnsFinanceResource(epoch, initial, "overview"), false);
  assert.equal(hasPendingFinanceRequest(epoch), false);
});
