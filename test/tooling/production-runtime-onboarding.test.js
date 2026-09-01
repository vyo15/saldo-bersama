import assert from "node:assert/strict";
import test from "node:test";

import { prepareTrustedProductionRuntime } from "../../scripts/production-runtime.mjs";

const createdProfile = async () => ({
  created: true,
  productionPath: "/tmp/project/.env.production.local",
});

test("npm run prod membuka deployment saat operator profile baru dibuat tetapi preflight lokal tetap fail-closed", async () => {
  const calls = [];
  const logger = {
    log: (message) => calls.push(["log", message]),
    warn: (message) => calls.push(["warn", message]),
  };

  await assert.rejects(
    prepareTrustedProductionRuntime({
      root: "/tmp/project",
      productionProfileEnsurer: createdProfile,
      centralBridgeSynchronizer: async () => calls.push(["bridge"]),
      productionEnvironmentChecker: async () => calls.push(["environment"]),
      productionDatabaseChecker: async () => calls.push(["database"]),
      operatorProfilePersister: async () => calls.push(["persist"]),
      openSetup: true,
      productionOpener: () => {
        calls.push(["open"]);
        return true;
      },
      logger,
    }),
    (error) => {
      assert.equal(error?.code, "PRODUCTION_PROFILE_SETUP_REQUIRED");
      assert.equal(error?.productionPath, "/tmp/project/.env.production.local");
      assert.match(error?.message || "", /TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN/);
      assert.match(error?.message || "", /checkout berikutnya/);
      return true;
    },
  );

  assert.equal(calls.filter(([type]) => type === "open").length, 1);
  assert.equal(calls.some(([type]) => type === "bridge"), false);
  assert.equal(calls.some(([type]) => type === "environment"), false);
  assert.equal(calls.some(([type]) => type === "database"), false);
  assert.equal(calls.some(([type]) => type === "persist"), false);
});

test("prod:check tidak membuka browser ketika operator profile Production baru dibuat", async () => {
  let opened = false;

  await assert.rejects(
    prepareTrustedProductionRuntime({
      root: "/tmp/project",
      productionProfileEnsurer: createdProfile,
      openSetup: false,
      productionOpener: () => {
        opened = true;
        return true;
      },
      logger: { log() {}, warn() {} },
    }),
    (error) => error?.code === "PRODUCTION_PROFILE_SETUP_REQUIRED",
  );

  assert.equal(opened, false);
});

test("operator Production mempertahankan urutan bridge, isolation, DB preflight, lalu persistence", async () => {
  const calls = [];
  await prepareTrustedProductionRuntime({
    root: "/tmp/project",
    productionProfileEnsurer: async () => {
      calls.push("profile");
      return { created: false, productionPath: "/tmp/project/.env.production.local" };
    },
    centralBridgeSynchronizer: async () => calls.push("bridge"),
    productionEnvironmentChecker: async () => calls.push("environment"),
    productionDatabaseChecker: async () => calls.push("database"),
    operatorProfilePersister: async () => calls.push("persist"),
  });
  assert.deepEqual(calls, ["profile", "bridge", "environment", "database", "persist"]);
});
