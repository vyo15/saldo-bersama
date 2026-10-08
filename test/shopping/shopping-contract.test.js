import test from "node:test";
import assert from "node:assert/strict";
import { DATABASE_SCHEMA_VERSION } from "../../api/_lib/db/schema.js";
import { ACTION_POLICIES } from "../../api/_lib/actions/policy.js";
import { normalizeShoppingItemInput, shoppingSummary } from "../../api/_lib/services/shopping/shared.js";
import { syncDependenciesForAction } from "../../api/_lib/syncRevisions.js";

const ACTIONS = [
  "shopping.detail", "shopping.suggestions", "shopping.byTransaction", "shopping.create",
  "shopping.itemCreate", "shopping.itemUpdate", "shopping.itemState", "shopping.itemRemove", "shopping.checkout",
];

test("shopping schema and canonical actions are registered", () => {
  assert.equal(DATABASE_SCHEMA_VERSION, 26);
  for (const action of ACTIONS) assert.ok(ACTION_POLICIES[action], `${action} must have canonical policy`);
});

test("shopping item normalization keeps rupiah integer and milli quantity", () => {
  const row = normalizeShoppingItemInput({ name: " Beras ", quantity_milli: 1500, unit_key: "kg", estimated_unit_price: 20_000 });
  assert.equal(row.name, "Beras");
  assert.equal(row.quantity_milli, 1500);
  assert.equal(row.estimated_amount, 30_000);
});

test("shopping item normalization recalculates estimate when quantity or unit price changes", () => {
  const current = {
    name: "Beras", quantity_milli: 1000, unit_key: "kg", estimated_unit_price: 20_000, estimated_amount: 20_000, actual_amount: 0, note: "", group_name: "",
  };
  const row = normalizeShoppingItemInput({ quantity_milli: 2000 }, current);
  assert.equal(row.quantity_milli, 2000);
  assert.equal(row.estimated_unit_price, 20_000);
  assert.equal(row.estimated_amount, 40_000);
});

test("shopping summary never counts removed rows", () => {
  const summary = shoppingSummary([
    { status: "pending", estimated_amount: 10_000 },
    { status: "in_cart", estimated_amount: 20_000, actual_amount: 18_000 },
    { status: "purchased", estimated_amount: 30_000, actual_amount: 31_000 },
    { status: "removed", estimated_amount: 99_000 },
  ]);
  assert.deepEqual(summary, {
    total_items: 3,
    pending_items: 1,
    in_cart_items: 1,
    purchased_items: 1,
    estimated_total: 60_000,
    in_cart_estimated_total: 18_000,
    purchased_total: 31_000,
  });
});


test("shopping mutations that change capability metadata invalidate budgets.list", () => {
  for (const action of ["shopping.create", "shopping.itemCreate", "shopping.itemState", "shopping.itemRemove", "shopping.checkout"]) {
    assert.ok(syncDependenciesForAction(action).includes("budgets.list"), `${action} must invalidate budgets.list`);
  }
});
