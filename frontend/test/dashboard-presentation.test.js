import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardDueLabel,
  dashboardInsightState,
} from "../src/features/dashboard/dashboardPresentation.js";

test("dashboardDueLabel memakai tanggal Jakarta dan copy relatif yang stabil", () => {
  const today = "2026-09-06";

  assert.equal(dashboardDueLabel("2026-09-05", today), "1 hari terlambat");
  assert.equal(dashboardDueLabel(today, today), "Hari ini");
  assert.equal(dashboardDueLabel("2026-09-07", today), "Besok");
  assert.equal(dashboardDueLabel("2026-09-09", today), "3 hari lagi");
  assert.equal(dashboardDueLabel("invalid", today), "Jadwal belum tersedia");
  assert.equal(dashboardDueLabel("2026-02-31", today), "Jadwal belum tersedia");
});

test("dashboardInsightState memprioritaskan ruang aman lalu arus kas", () => {
  assert.equal(
    dashboardInsightState({ safeToSpend: 0, cashFlow: { net: 100_000 } }).kind,
    "limited",
  );
  assert.equal(
    dashboardInsightState({ safeToSpend: 500_000, cashFlow: { net: -1 } }).kind,
    "cashflow",
  );
  assert.equal(
    dashboardInsightState({ safeToSpend: 500_000, cashFlow: { net: 1 } }).kind,
    "safe",
  );
});
