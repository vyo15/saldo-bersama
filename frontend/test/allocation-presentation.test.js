import assert from "node:assert/strict";
import test from "node:test";
import { allocationNeedsFundingSummary } from "../src/features/allocations/allocationPresentation.js";
import { budgetRemainingAmount, budgetVisualState } from "../src/shared/presentation/budget.js";

test("ringkasan Kebutuhan membandingkan rencana dengan dana alokasi tanpa memakai sisa setelah transaksi", () => {
  const summary = allocationNeedsFundingSummary(
    { allocated_amount: 1_500_000, used_amount: 900_000, remaining_amount: 600_000 },
    [{ amount: 800_000, used_amount: 420_000 }, { amount: 500_000, used_amount: 180_000 }],
  );

  assert.deepEqual(summary, {
    allocated: 1_500_000,
    planned: 1_300_000,
    used: 600_000,
    gap: 0,
    unplanned: 200_000,
    status: "available",
  });
});

test("ringkasan Kebutuhan menghitung selisih dana yang perlu ditambahkan secara eksplisit", () => {
  const summary = allocationNeedsFundingSummary(
    { allocated_amount: 1_500_000 },
    [{ amount: 1_000_000 }, { amount: 800_000 }],
  );

  assert.equal(summary.planned, 1_800_000);
  assert.equal(summary.used, 0);
  assert.equal(summary.gap, 300_000);
  assert.equal(summary.unplanned, 0);
  assert.equal(summary.status, "needs-funding");
});

test("ringkasan Kebutuhan menormalkan nominal invalid agar tidak membuat suggestion dana negatif", () => {
  const summary = allocationNeedsFundingSummary(
    { allocated_amount: -100 },
    [{ amount: 250_000 }, { amount: -50_000 }, { amount: "invalid" }],
  );

  assert.deepEqual(summary, {
    allocated: 0,
    planned: 250_000,
    used: 0,
    gap: 250_000,
    unplanned: 0,
    status: "needs-funding",
  });
});


test("sisa Kebutuhan mengikuti pemakaian aktual dan tidak mempertahankan nominal rencana sebagai saldo", () => {
  assert.equal(budgetRemainingAmount({ amount: 200_000, used_amount: 0 }), 200_000);
  assert.equal(budgetRemainingAmount({ amount: 200_000, used_amount: 50_000 }), 150_000);
  assert.equal(budgetRemainingAmount({ amount: 200_000, used_amount: 250_000 }), 0);
});


test("status kebutuhan membedakan selesai sekali bayar dari dana habis", () => {
  const completed = budgetVisualState({ amount: 1_000_000, used_amount: 1_000_000, recording_mode: "fixed_once", warning_threshold: 80 });
  const depleted = budgetVisualState({ amount: 1_000_000, used_amount: 1_000_000, recording_mode: "flexible", warning_threshold: 80 });
  const recurringDepleted = budgetVisualState({ amount: 1_000_000, used_amount: 1_000_000, recording_mode: "recurring", warning_threshold: 80 });
  const exceeded = budgetVisualState({ amount: 1_000_000, used_amount: 1_050_000, recording_mode: "fixed_once", warning_threshold: 80 });

  assert.deepEqual({ key: completed.key, label: completed.label, attention: completed.attention }, { key: "completed", label: "Selesai", attention: false });
  assert.deepEqual({ key: depleted.key, label: depleted.label, attention: depleted.attention }, { key: "empty", label: "Dana habis", attention: true });
  assert.equal(recurringDepleted.key, "empty");
  assert.deepEqual({ key: exceeded.key, label: exceeded.label, attention: exceeded.attention }, { key: "danger", label: "Melebihi rencana", attention: true });
});
