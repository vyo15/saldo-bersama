import test from "node:test";
import assert from "node:assert/strict";
import { TRANSACTION_TYPES } from "../src/domain/constants.js";
import {
  earlyFundsWarning,
  frequentCategories,
  smartAllocationCandidates,
  sourceAccountPicker,
} from "../src/features/transactions/transactionFormSmartDefaults.js";

const accounts = [
  { account_id: "a1", name: "Utama", balance: 1_000_000, available_balance: 500_000 },
  { account_id: "a2", name: "Kosong", balance: 0, available_balance: 0 },
  { account_id: "a3", name: "Terpakai Alokasi", balance: 900_000, available_balance: 0 },
  { account_id: "a4", name: "Boleh Minus", balance: 0, available_balance: 0, allow_negative: true },
];

test("rekening sumber menyembunyikan saldo nol tanpa menghilangkan rekening terpilih", () => {
  const expense = sourceAccountPicker({ accounts, transactionType: TRANSACTION_TYPES.EXPENSE });
  assert.deepEqual(expense.map((item) => item.account_id), ["a1", "a3", "a4"]);

  const selectedZero = sourceAccountPicker({ accounts, transactionType: TRANSACTION_TYPES.EXPENSE, selectedAccountId: "a2" });
  assert.equal(selectedZero[0].account_id, "a2");

  const transfer = sourceAccountPicker({ accounts, transactionType: TRANSACTION_TYPES.TRANSFER });
  assert.deepEqual(transfer.map((item) => item.account_id), ["a1", "a4"]);

  const adjustment = sourceAccountPicker({ accounts, transactionType: TRANSACTION_TYPES.ADJUSTMENT });
  assert.deepEqual(adjustment.map((item) => item.account_id), ["a1", "a2", "a3", "a4"]);
});

test("rekening sumber memprioritaskan rekening yang terakhir dipakai tanpa jalur search/show-all terpisah", () => {
  const recentTransactions = [
    { transaction_type: "expense", source_account_id: "a3" },
    { transaction_type: "expense", source_account_id: "a1" },
  ];
  const ranked = sourceAccountPicker({ accounts, transactionType: TRANSACTION_TYPES.EXPENSE, recentTransactions });
  assert.deepEqual(ranked.map((item) => item.account_id), ["a3", "a1", "a4"]);
});

test("kategori sering dipakai hanya memakai histori rekening sumber yang sama", () => {
  const visibleCategories = [
    { category_id: "c1", name: "Bensin" },
    { category_id: "c2", name: "Makan" },
  ];
  const recentTransactions = [
    { transaction_type: "expense", source_account_id: "a1", category_id: "c1" },
    { transaction_type: "expense", source_account_id: "a2", category_id: "c2" },
    { transaction_type: "expense", source_account_id: "a1", category_id: "c1" },
    { transaction_type: "expense", source_account_id: "a1", category_id: "c2" },
  ];
  assert.deepEqual(frequentCategories({ recentTransactions, sourceAccountId: "a1", visibleCategories }).map((item) => item.category_id), ["c1", "c2"]);
});

test("smart allocation memetakan Kebutuhan kategori ke Alokasi Dana pada rekening dan periode yang sama", () => {
  const budgets = [
    { budget_id: "b1", period_key: "2026-08", category_id: "c1", envelope_rule_id: "r1", name: "Bensin", status: "active" },
    { budget_id: "b2", period_key: "2026-08", category_id: "c1", envelope_rule_id: "r2", name: "Bensin kantor", status: "active" },
    { budget_id: "b3", period_key: "2026-09", category_id: "c1", envelope_rule_id: "r3", name: "Bensin September", status: "active" },
  ];
  const envelopes = [
    { envelope_period_id: "p1", envelope_rule_id: "r1", source_account_id: "a1", period_start: "2026-08-01", period_end: "2026-08-31", name: "Rumah" },
    { envelope_period_id: "p2", envelope_rule_id: "r2", source_account_id: "a2", period_start: "2026-08-01", period_end: "2026-08-31", name: "Kantor" },
    { envelope_period_id: "p3", envelope_rule_id: "r3", source_account_id: "a1", period_start: "2026-09-01", period_end: "2026-09-30", name: "September" },
  ];
  const form = { transaction_type: "expense", transaction_date: "2026-08-20", source_account_id: "a1", category_id: "c1" };
  const candidates = smartAllocationCandidates({ budgets, envelopes, form });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].envelope.envelope_period_id, "p1");
  assert.equal(candidates[0].need.name, "Bensin");
});

test("early warning membedakan dana bebas, sisa Alokasi, dan kebijakan overspend", () => {
  const source = { balance: 1_000_000, available_balance: 200_000 };
  assert.equal(earlyFundsWarning({ transactionType: "expense", amount: 2_000_000, source: { ...source, allow_negative: true }, envelope: null }), null);
  assert.equal(earlyFundsWarning({ transactionType: "expense", amount: 150_000, source, envelope: null }), null);
  assert.match(earlyFundsWarning({ transactionType: "expense", amount: 300_000, source, envelope: null }).title, /belum dialokasikan/i);

  const blocked = earlyFundsWarning({ transactionType: "expense", amount: 600_000, source, envelope: { name: "Rumah", remaining_amount: 500_000, overspend_policy: "block" } });
  assert.match(blocked.title, /Melebihi sisa Alokasi Dana/);

  const confirmable = earlyFundsWarning({ transactionType: "expense", amount: 600_000, source, envelope: { name: "Rumah", remaining_amount: 500_000, overspend_policy: "confirm" } });
  assert.equal(confirmable.shortage, 0);
  assert.match(confirmable.message, /dana tersedia rekening/);
});
