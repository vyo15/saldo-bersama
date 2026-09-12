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

test("model batch menghitung total dan membawa nama serta pola kebutuhan", () => {
  const rows = [
    createBudgetBatchRow({ name: "Arisan PT", category_id: "arisan", amount: 1_000_000, recording_mode: "fixed_once" }),
    createBudgetBatchRow({ name: "Internet rumah", category_id: "bills", amount: 500_000, recording_mode: "recurring", schedule_due_day: 20 }),
  ];
  assert.equal(budgetBatchTotal(rows), 1_500_000);
  const payload = buildBudgetBatchPayload({ rows, form, period: "2026-09", items: [] });
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items[0].name, "Arisan PT");
  assert.equal(payload.items[0].recording_mode, "fixed_once");
  assert.equal(payload.items[1].recording_mode, "recurring");
  assert.equal(payload.items[1].schedule_due_day, 20);
});

test("kategori yang sama boleh dipakai beberapa kebutuhan selama nama berbeda", () => {
  const first = createBudgetBatchRow({ name: "Arisan PT", category_id: "arisan", amount: 100_000 });
  const second = createBudgetBatchRow({ name: "Arisan Rumah", category_id: "arisan", amount: 200_000 });
  assert.doesNotThrow(() => validateBudgetBatchRows([first, second]));
});

test("model batch menolak nama kebutuhan duplikat dan menunjuk row bermasalah", () => {
  const first = createBudgetBatchRow({ name: "Arisan PT", category_id: "arisan", amount: 100_000 });
  const second = createBudgetBatchRow({ name: " arisan pt ", category_id: "other", amount: 200_000 });
  assert.throws(
    () => validateBudgetBatchRows([first, second]),
    (error) => error.rowId === second.id && /Nama kebutuhan yang sama/.test(error.message),
  );
});

test("model batch membawa row-version Kebutuhan legacy bila nama dan kategori yang sama dihubungkan", () => {
  const row = createBudgetBatchRow({ name: "Belanja rumah", category_id: "food", amount: 300_000 });
  const payload = buildBudgetBatchPayload({
    rows: [row],
    form,
    period: "2026-09",
    items: [{ name: "Belanja rumah", category_id: "food", scope: "shared", owner_user_id: null, envelope_rule_id: null, row_version: 7 }],
  });
  assert.equal(payload.items[0].row_version, 7);
});

test("model batch menegakkan batas maksimal item", () => {
  const rows = Array.from({ length: BUDGET_BATCH_LIMIT + 1 }, (_, index) => createBudgetBatchRow({
    name: `Kebutuhan ${index}`,
    category_id: `category-${index}`,
    amount: 1_000,
  }));
  assert.throws(
    () => validateBudgetBatchRows(rows),
    new RegExp(`Maksimal ${BUDGET_BATCH_LIMIT} kebutuhan`),
  );
});
