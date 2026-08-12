import assert from "node:assert/strict";
import test from "node:test";
import { budgetPeriodMeta, budgetSafeDailyAmount, budgetTotals, budgetVisualState } from "../src/features/budgets/budgetPresentation.js";

test("presentasi Anggaran menghitung periode dan sisa hari tanpa mengubah data source", () => {
  const meta = budgetPeriodMeta("2026-08", "2026-08-11");
  assert.equal(meta.label, "Agustus 2026");
  assert.equal(meta.rangeLabel, "1–31 Agustus 2026");
  assert.equal(meta.daysLeft, 20);
  assert.equal(meta.isCurrent, true);
  assert.ok(meta.elapsedPercent > 35 && meta.elapsedPercent < 36);
});

test("status visual membedakan aman, ritme cepat, warning, dan over budget", () => {
  const current = budgetPeriodMeta("2026-08", "2026-08-11");
  const safe = budgetVisualState({ amount: 1_000_000, used_amount: 250_000, warning_threshold: 80 }, current);
  const pace = budgetVisualState({ amount: 1_000_000, used_amount: 500_000, warning_threshold: 80 }, current);
  const warning = budgetVisualState({ amount: 1_000_000, used_amount: 850_000, warning_threshold: 80 }, current);
  const danger = budgetVisualState({ amount: 1_000_000, used_amount: 1_100_000, warning_threshold: 80 }, current);

  assert.equal(safe.key, "safe");
  assert.equal(safe.attention, false);
  assert.equal(pace.key, "pace");
  assert.equal(pace.attention, true);
  assert.equal(warning.key, "warning");
  assert.equal(danger.key, "danger");
  assert.equal(danger.remaining, -100_000);
});

test("batas aman per hari hanya dihitung untuk periode aktif", () => {
  const current = budgetPeriodMeta("2026-08", "2026-08-11");
  const historical = budgetPeriodMeta("2026-07", "2026-08-11");
  assert.equal(budgetSafeDailyAmount(400_000, current), 20_000);
  assert.equal(budgetSafeDailyAmount(400_000, historical), 0);
  assert.equal(budgetSafeDailyAmount(-10_000, current), 0);
});

test("ringkasan Anggaran tetap berasal dari amount dan used_amount", () => {
  assert.deepEqual(budgetTotals([
    { amount: 2_000_000, used_amount: 750_000 },
    { amount: 1_000_000, used_amount: 250_000 },
  ]), { amount: 3_000_000, used: 1_000_000 });
});
