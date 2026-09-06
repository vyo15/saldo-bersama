import assert from "node:assert/strict";
import test from "node:test";
import { allocationCardActionState, allocationNeedsFundingSummary } from "../src/features/allocations/allocationPresentation.js";

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


test("aksi kartu Alokasi menonjolkan Kebutuhan pertama dan menjaga adjustment capability-gated", () => {
  assert.deepEqual(allocationCardActionState({ can_manage_needs: true, can_adjust: true }, 0), {
    canManageNeeds: true,
    canAdjust: true,
    needsEmpty: true,
    showPlanningActions: true,
    addNeedVariant: "primary",
  });

  assert.deepEqual(allocationCardActionState({ can_manage_needs: true, can_adjust: true }, 2), {
    canManageNeeds: true,
    canAdjust: true,
    needsEmpty: false,
    showPlanningActions: true,
    addNeedVariant: "secondary",
  });

  assert.deepEqual(allocationCardActionState({ can_manage_needs: false, can_adjust: true }, 0), {
    canManageNeeds: false,
    canAdjust: true,
    needsEmpty: true,
    showPlanningActions: true,
    addNeedVariant: "primary",
  });
});
