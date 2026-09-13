import assert from "node:assert/strict";
import test from "node:test";
import { compatiblePlanningNeeds, planningNeedLinkState, planningNeedSelectionPatch } from "../src/shared/workflows/planningBudgetLinks.js";

const budgets = [
  { budget_id: "internet-home", name: "Internet Rumah", category_id: "internet", envelope_rule_id: "home", envelope_source_account_id: "bca", can_manage: true },
  { budget_id: "internet-office", name: "Internet Kantor", category_id: "internet", envelope_rule_id: "office", envelope_source_account_id: "mandiri", can_manage: true },
  { budget_id: "electricity-home", name: "Listrik", category_id: "electricity", envelope_rule_id: "home", envelope_source_account_id: "bca", can_manage: true },
  { budget_id: "readonly", name: "Bukan milik saya", category_id: "internet", envelope_rule_id: "other", envelope_source_account_id: "bni", can_manage: false },
];

test("smart planning memilih Kebutuhan otomatis hanya saat kandidatnya pasti", () => {
  assert.deepEqual(planningNeedSelectionPatch({ budgets, categoryId: "electricity" }), { budget_id: "electricity-home", account_id: "bca" });
  assert.deepEqual(planningNeedSelectionPatch({ budgets, categoryId: "internet" }), { budget_id: "", account_id: "" });
  assert.deepEqual(planningNeedSelectionPatch({ budgets, categoryId: "internet", accountId: "mandiri" }), { budget_id: "internet-office", account_id: "mandiri" });
});

test("smart planning mempertahankan pilihan valid dan melepas pilihan saat rekening tidak lagi cocok", () => {
  assert.deepEqual(planningNeedSelectionPatch({ budgets, categoryId: "internet", accountId: "bca", budgetId: "internet-home" }), { budget_id: "internet-home", account_id: "bca" });
  assert.deepEqual(planningNeedSelectionPatch({ budgets, categoryId: "internet", accountId: "mandiri", budgetId: "internet-home" }), { budget_id: "internet-office", account_id: "mandiri" });
});

test("picker tidak menawarkan Kebutuhan yang tidak dapat dikelola", () => {
  assert.deepEqual(compatiblePlanningNeeds({ budgets, categoryId: "internet" }).map((item) => item.budget_id).sort(), ["internet-home", "internet-office"]);
  const state = planningNeedLinkState({ budgets, categoryId: "internet", accountId: "bca" });
  assert.equal(state.candidates.length, 1);
  assert.equal(state.candidates[0].budget_id, "internet-home");
});
