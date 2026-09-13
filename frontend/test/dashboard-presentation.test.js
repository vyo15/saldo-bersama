import assert from "node:assert/strict";
import test from "node:test";

import { dashboardDueLabel } from "../src/features/dashboard/dashboardPresentation.js";

test("dashboardDueLabel memakai tanggal Jakarta dan copy relatif yang stabil", () => {
  const today = "2026-09-06";

  assert.equal(dashboardDueLabel("2026-09-05", today), "1 hari terlambat");
  assert.equal(dashboardDueLabel(today, today), "Hari ini");
  assert.equal(dashboardDueLabel("2026-09-07", today), "Besok");
  assert.equal(dashboardDueLabel("2026-09-09", today), "3 hari lagi");
  assert.equal(dashboardDueLabel("invalid", today), "Jadwal belum tersedia");
  assert.equal(dashboardDueLabel("2026-02-31", today), "Jadwal belum tersedia");
});

