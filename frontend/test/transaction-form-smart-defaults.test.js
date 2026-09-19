import test from "node:test";
import assert from "node:assert/strict";
import { TRANSACTION_TYPES } from "../src/domain/constants.js";
import {
  UNALLOCATED_NEED_VALUE,
  contextualPlanningData,
  earlyFundsWarning,
  frequentCategories,
  mergeContextualAllocationCandidate,
  needSelectionValue,
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

test("smart allocation mengembalikan semua Kebutuhan ambigu agar UI meminta pilihan user", () => {
  const budgets = [
    { budget_id: "b-arisan-pt", period_key: "2026-08", category_id: "c-arisan", envelope_rule_id: "r-rumah", name: "Arisan PT", status: "active" },
    { budget_id: "b-arisan-sekolah", period_key: "2026-08", category_id: "c-arisan", envelope_rule_id: "r-rumah", name: "Arisan Sekolah", status: "active" },
  ];
  const envelopes = [
    { envelope_period_id: "p-rumah", envelope_rule_id: "r-rumah", source_account_id: "a1", period_start: "2026-08-01", period_end: "2026-08-31", name: "Rumah" },
  ];
  const form = { transaction_type: "expense", transaction_date: "2026-08-20", source_account_id: "a1", category_id: "c-arisan" };
  const candidates = smartAllocationCandidates({ budgets, envelopes, form });
  assert.deepEqual(candidates.map((item) => item.need.budget_id), ["b-arisan-pt", "b-arisan-sekolah"]);
  assert.ok(candidates.every((item) => item.envelope.envelope_period_id === "p-rumah"));
});


test("context Kebutuhan dari detail Alokasi tetap terpilih saat overview composer belum memuat kandidat", () => {
  const form = { transaction_type: "expense", transaction_date: "2026-08-20", source_account_id: "a1", category_id: "c1", budget_id: "b1" };
  const context = {
    budget: { budget_id: "b1", category_id: "c1", name: "Bensin", amount: 200_000, used_amount: 50_000 },
    envelope: { envelope_period_id: "p1", source_account_id: "a1", period_start: "2026-08-01", period_end: "2026-08-31", name: "Bulanan" },
  };
  const merged = mergeContextualAllocationCandidate({ candidates: [], context, form });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].need.budget_id, "b1");
  assert.equal(merged[0].envelope.envelope_period_id, "p1");

  assert.deepEqual(mergeContextualAllocationCandidate({ candidates: [], context, form: { ...form, category_id: "c2", budget_id: "" } }), []);
});


test("state auto kosong tetap berbeda dari pilihan eksplisit Dana Tersedia", () => {
  assert.equal(needSelectionValue({ budgetId: "", allocationMode: "auto" }), "");
  assert.equal(needSelectionValue({ budgetId: "", allocationMode: "manual" }), UNALLOCATED_NEED_VALUE);
  assert.equal(needSelectionValue({ budgetId: "b-dry-food", allocationMode: "manual" }), "b-dry-food");
});

test("early warning membedakan dana bebas, sisa Alokasi, dan kebijakan overspend", () => {
  const source = { balance: 1_000_000, available_balance: 200_000 };
  assert.equal(earlyFundsWarning({ transactionType: "expense", amount: 2_000_000, source: { ...source, allow_negative: true }, envelope: null }), null);
  assert.equal(earlyFundsWarning({ transactionType: "expense", amount: 150_000, source, envelope: null }), null);
  assert.match(earlyFundsWarning({ transactionType: "expense", amount: 300_000, source, envelope: null }).title, /rekening tidak cukup/i);

  const blocked = earlyFundsWarning({ transactionType: "expense", amount: 600_000, source, envelope: { name: "Rumah", remaining_amount: 500_000, overspend_policy: "block" } });
  assert.match(blocked.title, /Melebihi batas Alokasi/);

  const confirmable = earlyFundsWarning({ transactionType: "expense", amount: 600_000, source, envelope: { name: "Rumah", remaining_amount: 500_000, overspend_policy: "confirm" } });
  assert.equal(confirmable.shortage, 0);
  assert.match(confirmable.message, /dana tersedia rekening/);
});
test("context Kebutuhan ikut memasok data impact saat overview composer tertinggal", () => {
  const candidate = {
    need: { budget_id: "dry-food", amount: 100_000, used_amount: 50_000, name: "Dry Food" },
    envelope: { envelope_period_id: "kucing-period", remaining_amount: 90_000, name: "Kucing" },
  };
  const form = { budget_id: "dry-food", envelope_period_id: "kucing-period" };
  const merged = contextualPlanningData({ budgets: [], envelopes: [], candidates: [candidate], form });
  assert.equal(merged.budgets[0].budget_id, "dry-food");
  assert.equal(merged.envelopes[0].envelope_period_id, "kucing-period");

  const existing = contextualPlanningData({ budgets: [candidate.need], envelopes: [candidate.envelope], candidates: [candidate], form });
  assert.equal(existing.budgets.length, 1);
  assert.equal(existing.envelopes.length, 1);
});
