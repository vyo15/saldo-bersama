import test from "node:test";
import assert from "node:assert/strict";
import { TRANSACTION_TYPES } from "../src/domain/constants.js";
import { initialAllocationMode, initialTransactionForm, shouldApplySmartAllocationSelection } from "../src/features/transactions/transactionFormController.js";

test("smart selection tidak boleh menimpa planning intent pada render pertama", () => {
  const initialRender = {
    open: true,
    transaction: null,
    allocationMode: "auto",
    transactionType: TRANSACTION_TYPES.EXPENSE,
    budgetId: "",
  };

  assert.equal(shouldApplySmartAllocationSelection({ ...initialRender, disabled: true }), false);
  assert.equal(shouldApplySmartAllocationSelection({ ...initialRender, disabled: false }), true);
});

test("smart selection hanya aktif untuk expense baru yang unresolved", () => {
  const base = {
    open: true,
    transaction: null,
    allocationMode: "auto",
    transactionType: TRANSACTION_TYPES.EXPENSE,
    budgetId: "",
    disabled: false,
  };

  assert.equal(shouldApplySmartAllocationSelection(base), true);
  assert.equal(shouldApplySmartAllocationSelection({ ...base, budgetId: "dry-food" }), false);
  assert.equal(shouldApplySmartAllocationSelection({ ...base, allocationMode: "manual" }), false);
  assert.equal(shouldApplySmartAllocationSelection({ ...base, transaction: { transaction_id: "tx-1" } }), false);
  assert.equal(shouldApplySmartAllocationSelection({ ...base, transactionType: TRANSACTION_TYPES.INCOME }), false);
  assert.equal(shouldApplySmartAllocationSelection({ ...base, open: false }), false);
});
test("draft contextual tersedia sejak render pertama, bukan baru setelah effect reset", () => {
  const initialDraft = {
    transaction_type: TRANSACTION_TYPES.EXPENSE,
    source_account_id: "bni-gajian",
    category_id: "kucing",
    envelope_period_id: "kucing-2026-09",
    budget_id: "dry-food",
  };
  const form = initialTransactionForm({ initialType: TRANSACTION_TYPES.EXPENSE, initialSourceAccountId: "", initialDraft });
  assert.equal(form.budget_id, "dry-food");
  assert.equal(form.envelope_period_id, "kucing-2026-09");
  assert.equal(initialAllocationMode({ transaction: null, initialDraft }), "manual");
});
