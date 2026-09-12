import assert from "node:assert/strict";
import test from "node:test";
import {
  BUDGET_BATCH_LIMIT,
  buildBudgetBatchPayload,
  budgetBatchTotal,
  createBudgetBatchRow,
  validateBudgetBatchRows,
} from "../src/features/budgets/budgetBatchModel.js";

const form = { envelope_rule_id: "rule-1", scope: "shared", owner_user_id: "" };

test("model batch menghitung total dan membangun payload compact", () => {
  const rows = [
    createBudgetBatchRow({ category_id: "food", amount: 1_000_000 }),
    createBudgetBatchRow({ category_id: "electric", amount: 500_000, recording_mode: "scheduled", schedule_due_day: 20 }),
  ];
  assert.equal(budgetBatchTotal(rows), 1_500_000);
  const payload = buildBudgetBatchPayload({ rows, form, period: "2026-09", items: [] });
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[1].recording_mode, "scheduled");
  assert.equal(payload.items[1].schedule_due_day, 20);
});

test("model batch menolak kategori duplikat dan menunjuk row bermasalah", () => {
  const first = createBudgetBatchRow({ category_id: "food", amount: 100_000 });
  const second = createBudgetBatchRow({ category_id: "food", amount: 200_000 });
  assert.throws(
    () => validateBudgetBatchRows([first, second]),
    (error) => error.rowId === second.id && /Kategori yang sama/.test(error.message),
  );
});

test("model batch membawa row-version Kebutuhan legacy saat dihubungkan ke Alokasi", () => {
  const row = createBudgetBatchRow({ category_id: "food", amount: 300_000 });
  const payload = buildBudgetBatchPayload({
    rows: [row],
    form,
    period: "2026-09",
    items: [{ category_id: "food", scope: "shared", owner_user_id: null, envelope_rule_id: null, row_version: 7 }],
  });
  assert.equal(payload.items[0].row_version, 7);
});


test("model batch menegakkan batas maksimal item", () => {
  const rows = Array.from({ length: BUDGET_BATCH_LIMIT + 1 }, (_, index) => createBudgetBatchRow({
    category_id: `category-${index}`,
    amount: 1_000,
  }));
  assert.throws(
    () => validateBudgetBatchRows(rows),
    new RegExp(`Maksimal ${BUDGET_BATCH_LIMIT} kebutuhan`),
  );
});
