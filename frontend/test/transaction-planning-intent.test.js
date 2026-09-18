import test from "node:test";
import assert from "node:assert/strict";
import { TRANSACTION_TYPES } from "../src/domain/constants.js";
import {
  PLANNING_INTENT_MODES,
  applyPlanningIntentToDraft,
  isLockedPlanningIntent,
  normalizePlanningIntent,
  planningIntentLocksField,
  planningIntentMatchesForm,
  planningDependencyInvalidatesSelection,
  transactionPlanningState,
} from "../src/features/transactions/transactionPlanningIntent.js";
import { needSelectionValue, smartAllocationCandidates } from "../src/features/transactions/transactionFormSmartDefaults.js";

const dryFoodIntent = {
  mode: PLANNING_INTENT_MODES.LOCKED_NEED,
  budget_id: "dry-food",
  envelope_period_id: "kucing-2026-09",
  source_account_id: "bni-gajian",
  category_id: "kucing",
};

test("intent dari tombol + Kebutuhan wajib lengkap sebelum boleh mengunci composer", () => {
  assert.equal(isLockedPlanningIntent(dryFoodIntent), true);
  assert.deepEqual(normalizePlanningIntent(dryFoodIntent), dryFoodIntent);
  assert.equal(normalizePlanningIntent({ ...dryFoodIntent, budget_id: "" }), null);
  assert.equal(normalizePlanningIntent({ ...dryFoodIntent, mode: "auto" }), null);
});

test("intent Kebutuhan menjadi sumber kebenaran walau draft membawa nilai stale atau berbeda", () => {
  const draft = applyPlanningIntentToDraft({
    initialDraft: {
      transaction_type: TRANSACTION_TYPES.INCOME,
      source_account_id: "rekening-lain",
      category_id: "kategori-lain",
      envelope_period_id: "alokasi-lain",
      budget_id: "pasir",
      amount: "40000",
      description: "Dry Food",
    },
    planningIntent: dryFoodIntent,
  });

  assert.equal(draft.transaction_type, TRANSACTION_TYPES.EXPENSE);
  assert.equal(draft.source_account_id, "bni-gajian");
  assert.equal(draft.category_id, "kucing");
  assert.equal(draft.envelope_period_id, "kucing-2026-09");
  assert.equal(draft.budget_id, "dry-food");
  assert.equal(draft.amount, "40000");
});

test("klik + Dry Food tetap memilih Dry Food walau kategori Kucing punya beberapa Kebutuhan", () => {
  const form = applyPlanningIntentToDraft({ initialDraft: { transaction_date: "2026-09-17" }, planningIntent: dryFoodIntent });
  const budgets = [
    { budget_id: "dry-food", period_key: "2026-09", category_id: "kucing", envelope_rule_id: "kucing-rule", name: "Dry Food" },
    { budget_id: "pasir", period_key: "2026-09", category_id: "kucing", envelope_rule_id: "kucing-rule", name: "Pasir" },
  ];
  const envelopes = [
    { envelope_period_id: "kucing-2026-09", envelope_rule_id: "kucing-rule", source_account_id: "bni-gajian", period_start: "2026-09-01", period_end: "2026-09-30", name: "Kucing" },
  ];
  const candidates = smartAllocationCandidates({ budgets, envelopes, form });

  assert.deepEqual(candidates.map((item) => item.need.budget_id), ["dry-food", "pasir"]);
  assert.equal(form.budget_id, "dry-food");
  assert.equal(needSelectionValue({ budgetId: form.budget_id, allocationMode: "manual" }), "dry-food");
});

test("context Kebutuhan mengunci sumber, kategori, Alokasi dan Kebutuhan tetapi nominal/tanggal tetap dapat diisi", () => {
  ["transaction_type", "source_account_id", "category_id", "envelope_period_id", "budget_id"].forEach((field) => {
    assert.equal(planningIntentLocksField(dryFoodIntent, field), true, field);
  });
  ["amount", "transaction_date", "payment_method", "description"].forEach((field) => {
    assert.equal(planningIntentLocksField(dryFoodIntent, field), false, field);
  });
});
test("planning intent fail-closed bila context form berubah sebelum submit", () => {
  const form = applyPlanningIntentToDraft({ initialDraft: { transaction_date: "2026-09-17" }, planningIntent: dryFoodIntent });
  assert.equal(planningIntentMatchesForm({ planningIntent: dryFoodIntent, form }), true);
  assert.equal(planningIntentMatchesForm({ planningIntent: dryFoodIntent, form: { ...form, budget_id: "" } }), false);
  assert.equal(planningIntentMatchesForm({ planningIntent: dryFoodIntent, form: { ...form, budget_id: "pasir" } }), false);
  assert.equal(planningIntentMatchesForm({ planningIntent: dryFoodIntent, form: { ...form, source_account_id: "rekening-lain" } }), false);
  assert.equal(planningIntentMatchesForm({ planningIntent: null, form: { ...form, budget_id: "" } }), true);
});


test("Kebutuhan sekali bayar tidak boleh menawarkan Tambah lagi dengan context yang sama", async () => {
  const { readFile } = await import("node:fs/promises");
  const formSource = await readFile(new URL("../src/features/transactions/TransactionForm.jsx", import.meta.url), "utf8");
  const postSaveSource = await readFile(new URL("../src/features/transactions/components/TransactionPostSaveModal.jsx", import.meta.url), "utf8");
  assert.match(formSource, /recording_mode === "fixed_once"/);
  assert.match(formSource, /onAddAnother=\{singleUseNeedCompleted \? null : addAnother\}/);
  assert.match(postSaveSource, /secondaryActions: onAddAnother \? \[\{ label: "Tambah lagi"/);
});
test("dependency generic menghapus pilihan stale tetapi tanggal contextual tetap mempertahankan Kebutuhan", () => {
  for (const field of ["transaction_type", "category_id", "transaction_date"]) {
    assert.equal(planningDependencyInvalidatesSelection({ planningIntent: null, field }), true, field);
    assert.equal(planningDependencyInvalidatesSelection({ planningIntent: dryFoodIntent, field }), false, `locked ${field}`);
  }
  assert.equal(planningDependencyInvalidatesSelection({ planningIntent: null, field: "amount" }), false);
});
test("planning state contextual membawa batas tanggal periode tanpa mengunci nominal", () => {
  const state = transactionPlanningState({
    transaction: null,
    planningIntent: dryFoodIntent,
    initialDraft: { amount: "40000" },
    initialAllocationContext: { envelope: { period_start: "2026-09-01", period_end: "2026-09-30" } },
  });
  assert.equal(state.locked, true);
  assert.equal(state.initialDraft.amount, "40000");
  assert.equal(state.initialDraft.budget_id, "dry-food");
  assert.equal(state.dateMin, "2026-09-01");
  assert.equal(state.dateMax, "2026-09-30");
});

