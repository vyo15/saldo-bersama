import test from "node:test";
import assert from "node:assert/strict";
import { calculateAccountBalance, calculateCashFlow, calculateEnvelopeUsage } from "../src/domain/finance.js";

const account = { account_id: "a1", initial_balance: 1_000_000 };
const transactions = [
  { status: "active", transaction_type: "income", destination_account_id: "a1", amount: 500_000 },
  { status: "active", transaction_type: "expense", source_account_id: "a1", amount: 100_000, envelope_period_id: "e1" },
  { status: "active", transaction_type: "transfer", source_account_id: "a1", destination_account_id: "a2", amount: 250_000 },
  { status: "cancelled", transaction_type: "expense", source_account_id: "a1", amount: 900_000 },
];

test("saldo rekening menghitung transfer tanpa menggandakan arus kas", () => {
  assert.equal(calculateAccountBalance(account, transactions), 1_150_000);
  assert.deepEqual(calculateCashFlow(transactions), { income: 500_000, expense: 100_000, refund: 0 });
});

test("sisa kantong dihitung dari transaksi aktif", () => {
  const usage = calculateEnvelopeUsage({ envelope_period_id: "e1", allocated_amount: 500_000, reserved_amount: 50_000 }, transactions);
  assert.equal(usage.used_amount, 100_000);
  assert.equal(usage.remaining_amount, 350_000);
});

test("perhitungan as-of mengecualikan transaksi masa depan", () => {
  const futureTransactions = transactions.concat([
    { status: "active", transaction_date: "2026-08-01", transaction_type: "expense", source_account_id: "a1", amount: 1_000_000, envelope_period_id: "e1" },
  ]);
  assert.equal(calculateAccountBalance(account, futureTransactions, "2026-07-31"), 1_150_000);
  assert.equal(calculateEnvelopeUsage({ envelope_period_id: "e1", allocated_amount: 1_500_000, reserved_amount: 0 }, futureTransactions, "2026-07-31").used_amount, 100_000);
});
