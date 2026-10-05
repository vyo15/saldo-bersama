import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanningActiveItems, filterPlanningActiveItems, filterPlanningActiveItemsByQuery, planningActiveOwnership } from "../src/features/planning/planningActiveModel.js";

test("Atur Dana menyatukan Alokasi, jadwal pengeluaran, dan Kewajiban tanpa duplikasi link", () => {
  const allocation = { envelope_rule_id: "env-1", envelope_period_id: "period-1", status: "active", name: "Rumah", scope: "shared", owner_user_id: null };
  const budgets = [{ budget_id: "budget-1", envelope_rule_id: "env-1" }];
  const recurringItems = [
    { occurrence_id: "occ-1", kind: "expense", rule_status: "active", budget_id: "budget-1", commitment_id: "commit-1" },
    { occurrence_id: "occ-2", kind: "expense", rule_status: "active", budget_id: null, commitment_id: null },
    { occurrence_id: "occ-income", kind: "income", rule_status: "active", budget_id: null, commitment_id: null },
  ];
  const commitments = [
    { commitment_id: "commit-1", status: "active", budget_id: "budget-1" },
    { commitment_id: "commit-2", status: "active", budget_id: null },
  ];

  const rows = buildPlanningActiveItems({ allocations: [allocation], budgets, recurringItems, commitments });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.kind), ["allocation", "commitment", "recurring"]);
  assert.equal(rows[0].commitments[0].commitment_id, "commit-1");
  assert.equal(rows[0].recurring[0].occurrence_id, "occ-1");
  assert.equal(rows.some((row) => row.id.includes("occ-income")), false, "pemasukan rutin tidak tampil di Atur Dana");
  assert.equal(rows.some((row) => row.id === "commitment:commit-1"), false, "Kewajiban tertaut tidak diduplikasi");
});

test("filter Aktif tetap menghormati Bersama dan Saya tanpa membuat tab domain", () => {
  const rows = [
    { id: "shared", kind: "commitment", scope: "shared", owner_user_id: null },
    { id: "mine", kind: "recurring", scope: "personal", owner_user_id: "u-1" },
  ];
  const actor = { user_id: "u-1" };
  assert.equal(planningActiveOwnership(rows, actor).showFilter, true);
  assert.deepEqual(filterPlanningActiveItems(rows, "shared", actor).map((row) => row.id), ["shared"]);
  assert.deepEqual(filterPlanningActiveItems(rows, "mine", actor).map((row) => row.id), ["mine"]);
});


test("search Aktif menemukan objek nested tanpa menduplikasi row Alokasi", () => {
  const rows = buildPlanningActiveItems({
    allocations: [{ envelope_rule_id: "env-1", envelope_period_id: "period-1", status: "active", name: "Rumah Tangga", source_account_name: "BCA", source_account_id: "bca", scope: "shared", owner_user_id: null }],
    budgets: [{ budget_id: "budget-1", envelope_rule_id: "env-1", category_id: "housing", name: "Rumah", category_name: "Hunian" }],
    commitments: [{ commitment_id: "commit-1", status: "active", budget_id: "budget-1", name: "KPR Rumah", provider: "BTN" }],
  });
  assert.equal(filterPlanningActiveItemsByQuery(rows, "KPR Rumah").length, 1);
  assert.equal(filterPlanningActiveItemsByQuery(rows, "BTN").length, 1);
  assert.equal(filterPlanningActiveItemsByQuery(rows, "Hunian").length, 1);
});

test("legacy recurring hanya ditautkan jika relasi kategori dan rekening menghasilkan satu Alokasi", () => {
  const allocations = [{ envelope_rule_id: "env-1", envelope_period_id: "period-1", status: "active", source_account_id: "bca", scope: "shared", owner_user_id: null }];
  const budgets = [{ budget_id: "budget-1", envelope_rule_id: "env-1", category_id: "electricity" }];
  const recurringItems = [{ occurrence_id: "occ-legacy", recurring_rule_id: "rule-legacy", kind: "expense", rule_status: "active", budget_id: null, category_id: "electricity", default_account_id: "bca", scope: "shared", owner_user_id: null }];
  const rows = buildPlanningActiveItems({ allocations, budgets, recurringItems });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].recurring[0].occurrence_id, "occ-legacy");
});
