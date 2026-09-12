import assert from "node:assert/strict";
import test from "node:test";

import { checkProductionReleasePreflight } from "../../scripts/production-release-preflight.mjs";

test("Production release preflight menjalankan integrity di staged Vercel Production build", async () => {
  const calls = [];
  const logs = [];
  const result = await checkProductionReleasePreflight({
    remoteIntegrityRunner: async ({ operation }) => {
      calls.push(operation);
      return { operation, remote: true };
    },
    logger: { log: (message) => logs.push(String(message)) },
  });
  assert.deepEqual(calls, ["integrity"]);
  assert.equal(result.ready, true);
  assert.equal(result.remote, true);
  assert.match(logs.join("\n"), /staged Vercel Production integrity PASS/);
});

test("Production release preflight fail-closed bila remote integrity gagal", async () => {
  await assert.rejects(
    checkProductionReleasePreflight({
      remoteIntegrityRunner: async () => {
        throw Object.assign(new Error("schema mismatch"), { code: "DATABASE_SCHEMA_MISMATCH" });
      },
      logger: { log() {} },
    }),
    (error) => error?.code === "PRODUCTION_RELEASE_SCHEMA_NOT_READY"
      && error?.remoteCode === "DATABASE_SCHEMA_MISMATCH"
      && /db:migrate -- production/.test(error.message),
  );
});
