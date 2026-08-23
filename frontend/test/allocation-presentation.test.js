import assert from "node:assert/strict";
import test from "node:test";
import { allocationNeedsFundingSummary } from "../src/features/allocations/allocationPresentation.js";

test("ringkasan Kebutuhan membandingkan rencana dengan dana alokasi tanpa memakai sisa setelah transaksi", () => {
  const summary = allocationNeedsFundingSummary(
    { allocated_amount: 1_500_000, used_amount: 900_000, remaining_amount: 600_000 },
    [{ amount: 800_000 }, { amount: 500_000 }],
  );

  assert.deepEqual(summary, {
    allocated: 1_500_000,
    planned: 1_300_000,
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
    gap: 250_000,
    unplanned: 0,
    status: "needs-funding",
  });
});
