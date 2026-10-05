import assert from "node:assert/strict";
import test from "node:test";
import { planningDueState } from "../src/shared/presentation/dueDate.js";

test("due state planning konsisten untuk terlambat, hari ini, besok, dan masa depan", () => {
  const today = "2026-10-04";
  assert.equal(planningDueState("2026-10-03", { today }).state, "overdue");
  assert.equal(planningDueState("2026-10-04", { today }).label, "Jatuh tempo hari ini");
  assert.equal(planningDueState("2026-10-05", { today }).label, "Jatuh tempo besok");
  assert.equal(planningDueState("2026-10-06", { today }).state, "scheduled");
});
