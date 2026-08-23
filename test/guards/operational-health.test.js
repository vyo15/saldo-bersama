import assert from "node:assert/strict";
import test from "node:test";

import {
  presentSchedulerHealth,
  readSchedulerHealth,
  recordSchedulerHeartbeat,
  SCHEDULER_STALE_MS,
} from "../../api/_lib/services/operationalHealth.js";

const memoryDb = () => {
  const values = new Map();
  return {
    values,
    async execute(sql, args = []) {
      if (!/INSERT INTO system_config/i.test(sql)) throw new Error(`Unexpected execute: ${sql}`);
      values.set(String(args[0]), String(args[1]));
      return { rowsAffected: 1 };
    },
    async all() {
      return [...values.entries()].map(([key, value]) => ({ key, value }));
    },
  };
};

test("scheduler health disabled tidak memerlukan heartbeat", async () => {
  const db = { all: async () => { throw new Error("query tidak boleh dipanggil"); } };
  assert.deepEqual(await readSchedulerHealth(db, { configured: false }), {
    configured: false,
    status: "disabled",
    stale: false,
    lastRunAt: "",
    lastSuccessAt: "",
    lastFailureAt: "",
    errorCode: "",
  });
});

test("scheduler configured fail-closed ketika heartbeat belum ada atau stale", () => {
  const now = Date.parse("2026-08-23T10:00:00.000Z");
  assert.equal(presentSchedulerHealth({}, { configured: true, now }).status, "degraded");

  const stale = presentSchedulerHealth({
    scheduler_last_success_at: new Date(now - SCHEDULER_STALE_MS - 1).toISOString(),
  }, { configured: true, now });
  assert.equal(stale.status, "degraded");
  assert.equal(stale.stale, true);
});

test("heartbeat sukses membuat scheduler sehat dan failure terbaru membuatnya degraded", async () => {
  const db = memoryDb();
  await recordSchedulerHeartbeat(db, { success: true });
  const successAt = db.values.get("scheduler_last_success_at");
  const healthy = await readSchedulerHealth(db, { configured: true, now: Date.parse(successAt) + 1_000 });
  assert.equal(healthy.status, "ok");
  assert.equal(healthy.stale, false);
  assert.equal(healthy.errorCode, "");

  await new Promise((resolve) => setTimeout(resolve, 2));
  await recordSchedulerHeartbeat(db, { success: false, errorCode: "UPSTREAM_TEMPORARY_FAILURE" });
  const failureAt = db.values.get("scheduler_last_failure_at");
  const degraded = await readSchedulerHealth(db, { configured: true, now: Date.parse(failureAt) + 1_000 });
  assert.equal(degraded.status, "degraded");
  assert.equal(degraded.errorCode, "UPSTREAM_TEMPORARY_FAILURE");
});

test("error code heartbeat disanitasi sebelum disimpan", async () => {
  const db = memoryDb();
  await recordSchedulerHeartbeat(db, { success: false, errorCode: "X".repeat(120) });
  assert.equal(db.values.get("scheduler_last_error_code").length, 80);
});
