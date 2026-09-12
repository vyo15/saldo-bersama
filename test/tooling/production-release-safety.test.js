import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertVerifiedProductionBackup } from "../../scripts/production-migration-safety.mjs";
import { checkProductionReleasePreflight } from "../../scripts/production-release-preflight.mjs";
import { requiresProductionDatabasePreflight, runPrePushGuard } from "../../scripts/pre-push-verify.mjs";
import { checkProductionRuntime } from "../../scripts/production-runtime.mjs";

const SHA = "1111111111111111111111111111111111111111";
const REMOTE_SHA = "2222222222222222222222222222222222222222";

test("pre-push frontend-only memverifikasi source lalu core Production tanpa credential DB lokal", async () => {
  const calls = [];
  const result = await runPrePushGuard({
    stdinSource: `refs/heads/main ${SHA} refs/heads/main ${REMOTE_SHA}\n`,
    gitInspector: () => ({ currentBranch: "main", headSha: SHA, workingTree: "", isFastForward: true }),
    changedPathsInspector: () => ["frontend/src/features/investments/StockLogo.jsx", "frontend/src/features/investments/StockLogo.module.css"],
    verify: async () => { calls.push("verify"); },
    releasePreflight: async () => { calls.push("production-release-preflight"); },
    runtimePreflight: async () => { calls.push("production-runtime-preflight"); },
  });
  assert.deepEqual(calls, ["verify", "production-runtime-preflight"]);
  assert.equal(result.databasePreflightRequired, false);
});

test("pre-push schema/migration tetap mewajibkan Production DB read-only sebelum main dikirim", async () => {
  const calls = [];
  const result = await runPrePushGuard({
    stdinSource: `refs/heads/main ${SHA} refs/heads/main ${REMOTE_SHA}\n`,
    gitInspector: () => ({ currentBranch: "main", headSha: SHA, workingTree: "", isFastForward: true }),
    changedPathsInspector: () => ["database/migrations/015_example.sql"],
    verify: async () => { calls.push("verify"); },
    releasePreflight: async () => { calls.push("production-release-preflight"); },
    runtimePreflight: async () => { calls.push("production-runtime-preflight"); },
  });
  assert.deepEqual(calls, ["verify", "production-release-preflight"]);
  assert.equal(result.databasePreflightRequired, true);
});

test("scope Production DB guard hanya aktif untuk path yang dapat mengubah compatibility database", () => {
  assert.equal(requiresProductionDatabasePreflight(["frontend/src/App.jsx"]), false);
  assert.equal(requiresProductionDatabasePreflight(["api/_lib/services/finance.js"]), false);
  assert.equal(requiresProductionDatabasePreflight(["database/migrations/015_example.sql"]), true);
  assert.equal(requiresProductionDatabasePreflight(["api/_lib/db/schema.js"]), true);
  assert.equal(requiresProductionDatabasePreflight(["api/_lib/db/httpClient.js"]), true);
  assert.equal(requiresProductionDatabasePreflight(["scripts/db-migrate.mjs"]), true);
});

test("Production release preflight menolak remote integrity failure tanpa memigrasikan database otomatis", async () => {
  await assert.rejects(
    checkProductionReleasePreflight({
      remoteIntegrityRunner: async () => {
        throw Object.assign(new Error("schema v17/18"), { code: "DATABASE_SCHEMA_MISMATCH" });
      },
      logger: { log: () => {} },
    }),
    (error) => error?.code === "PRODUCTION_RELEASE_SCHEMA_NOT_READY"
      && /db:migrate -- production/.test(error.message)
      && /git push origin main/.test(error.message),
  );
});

test("migration Production existing wajib mempunyai backup verified pada schema saat ini", async () => {
  const missingBackupDb = { one: async () => null };
  await assert.rejects(
    assertVerifiedProductionBackup({
      database: missingBackupDb,
      currentSchemaVersion: 13,
      targetSchemaVersion: 14,
      pendingMigrations: ["012_member_collaboration.sql"],
    }),
    (error) => error?.code === "PRODUCTION_MIGRATION_BACKUP_REQUIRED" && /backup teknis terverifikasi/.test(error.message),
  );

  const verified = await assertVerifiedProductionBackup({
    database: { one: async () => ({ schema_version: 13, status: "verified", verified_at: "2026-08-25T07:00:00.000Z" }) },
    currentSchemaVersion: 13,
    targetSchemaVersion: 14,
    pendingMigrations: ["012_member_collaboration.sql"],
  });
  assert.equal(verified.required, true);
  assert.equal(verified.verified, true);
  assert.equal(verified.currentSchemaVersion, 13);
  assert.equal(verified.targetSchemaVersion, 14);
});


test("db:migrate Production menghubungkan backup guard sebelum pending migration diterapkan", async () => {
  const source = await readFile(new URL("../../scripts/db-migrate.mjs", import.meta.url), "utf8");
  assert.match(source, /databaseEnvironment === "production" && pending\.length/);
  assert.match(source, /await assertVerifiedProductionBackup/);
  const guardIndex = source.indexOf("await assertVerifiedProductionBackup");
  const applyIndex = source.lastIndexOf("for (const migration of migrations)");
  assert.ok(guardIndex >= 0 && applyIndex > guardIndex);
});

test("npm run prod melaporkan live health degraded tanpa membutuhkan secret lokal", async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith("/api/health")) {
      return {
        ok: true, status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          ok: true,
          data: {
            status: "degraded",
            schema: { ready: true, version: 18, expectedVersion: 18, databaseEnvironment: "production" },
            maintenanceMode: false,
            coreOperationsHealthy: false,
          },
        }),
      };
    }
    throw new Error("frontend should not be checked when health is degraded");
  };
  await assert.rejects(
    checkProductionRuntime({ fetchImpl }),
    (error) => error?.code === "PRODUCTION_DEGRADED"
      && error?.blockers?.includes("CORE_OPERATIONS_DEGRADED")
      && !/TURSO_AUTH_TOKEN|SESSION_SECRET|VAPID_PRIVATE_KEY/.test(error.message),
  );
});
