import test from "node:test";
import assert from "node:assert/strict";
import {
  allocationAvailableBalance,
  allocationFundingImpact,
  allocationTargetsForAccount,
  fundingAccountsForItems,
  initialAllocationFundingForm,
} from "../src/features/allocations/allocationFundingModel.js";

const accounts = [
  { account_id: "bni", available_balance: 8_460_000, owner_scope: "personal" },
  { account_id: "bca-joint", available_balance: 2_000_000, owner_scope: "shared" },
  { account_id: "partner", available_balance: 3_000_000, owner_scope: "personal" },
  { account_id: "empty", available_balance: 0, owner_scope: "shared" },
];

const items = [
  { envelope_period_id: "house", source_account_id: "bni", remaining_amount: 1_250_000 },
  { envelope_period_id: "cat", source_account_id: "bca-joint", remaining_amount: 90_000 },
  { envelope_period_id: "empty-target", source_account_id: "empty", remaining_amount: 10_000 },
];

test("flow alokasi generik meminta rekening ketika beberapa sumber valid tersedia", () => {
  const eligible = fundingAccountsForItems(accounts, items);
  assert.deepEqual(eligible.map((item) => item.account_id), ["bni", "bca-joint"]);
  const initial = initialAllocationFundingForm({ accounts: eligible, items });
  assert.equal(initial.sourceAccountId, "");
  assert.equal(initial.envelopePeriodId, "");
});

test("setelah rekening dipilih hanya Alokasi dari rekening yang sama yang tersedia", () => {
  assert.deepEqual(allocationTargetsForAccount(items, "bca-joint").map((item) => item.envelope_period_id), ["cat"]);
  assert.deepEqual(allocationTargetsForAccount(items, "bni").map((item) => item.envelope_period_id), ["house"]);
});

test("flow contextual Alokasi mengunci rekening dan target yang sudah diketahui", () => {
  const eligible = fundingAccountsForItems(accounts, items, { requestedAccountId: "bca-joint", locked: true });
  assert.deepEqual(eligible.map((item) => item.account_id), ["bca-joint"]);
  const initial = initialAllocationFundingForm({ accounts: eligible, items, requestedAccountId: "bca-joint", requestedEnvelopePeriodId: "cat" });
  assert.equal(initial.sourceAccountId, "bca-joint");
  assert.equal(initial.envelopePeriodId, "cat");
});

test("flow contextual tetap mempertahankan sumber Alokasi walau dana bebas sedang nol", () => {
  const eligible = fundingAccountsForItems(accounts, items, { requestedAccountId: "empty", locked: true });
  assert.deepEqual(eligible.map((item) => item.account_id), ["empty"]);
  assert.equal(allocationAvailableBalance(eligible[0]), 0);
});

test("preview penambahan dana memindahkan dana bebas ke Alokasi tanpa mengubah saldo ledger", () => {
  const impact = allocationFundingImpact({ account: accounts[1], target: items[1], amount: 100_000 });
  assert.equal(impact.valid, true);
  assert.equal(impact.beforeAvailable, 2_000_000);
  assert.equal(impact.afterAvailable, 1_900_000);
  assert.equal(impact.beforeAllocation, 90_000);
  assert.equal(impact.afterAllocation, 190_000);
});

test("preview tidak dianggap valid ketika nominal melebihi dana bebas sumber", () => {
  const impact = allocationFundingImpact({ account: accounts[1], target: items[1], amount: 2_100_000 });
  assert.equal(impact.valid, false);
  assert.equal(impact.beforeAvailable, 2_000_000);
});

test("sumber yang dibawa dari pemasukan tidak diam-diam berpindah ke rekening lain", () => {
  const sourceWithoutTarget = { account_id: "income-only", available_balance: 750_000, owner_scope: "personal" };
  const eligible = fundingAccountsForItems([...accounts, sourceWithoutTarget], items, { requestedAccountId: "income-only" });
  assert.equal(eligible.some((item) => item.account_id === "income-only"), true);
  const initial = initialAllocationFundingForm({ accounts: eligible, items, requestedAccountId: "income-only", suggestedAmount: 500_000 });
  assert.equal(initial.sourceAccountId, "income-only");
  assert.equal(initial.envelopePeriodId, "");
  assert.equal(initial.amount, "500000");
});
