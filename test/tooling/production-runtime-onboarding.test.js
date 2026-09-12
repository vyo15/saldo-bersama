import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCTION_ORIGIN, runProductionRuntime } from "../../scripts/production-runtime.mjs";

test("npm run prod memakai runtime Production remote tanpa provisioning secret lokal", async () => {
  const calls = [];
  const result = await runProductionRuntime({
    open: false,
    runtimeCheck: async () => {
      calls.push("runtime");
      return { origin: PRODUCTION_ORIGIN, serviceStatus: "ok" };
    },
  });
  assert.deepEqual(calls, ["runtime"]);
  assert.equal(result.origin, PRODUCTION_ORIGIN);
});

test("npm run prod meneruskan kegagalan runtime remote secara fail-closed", async () => {
  await assert.rejects(
    runProductionRuntime({
      open: false,
      runtimeCheck: async () => { throw Object.assign(new Error("degraded"), { code: "PRODUCTION_DEGRADED" }); },
    }),
    (error) => error?.code === "PRODUCTION_DEGRADED",
  );
});
