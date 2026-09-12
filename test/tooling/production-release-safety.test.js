import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertVerifiedProductionBackup, ensureVerifiedProductionBackup } from "../../scripts/production-migration-safety.mjs";
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
      && /prod:update/.test(error.message)
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


test("Production migration membuat backup fresh walau backup schema lama sudah pernah verified", async () => {
  let created = 0;
  const rows = [
    { backup_id: "old", schema_version: 19, status: "verified", external_file_id: "drive-old", verified_at: "2026-09-01T00:00:00.000Z" },
  ];
  const database = {
    one: async (sql) => {
      if (/FROM users/.test(sql)) return { user_id: "owner-1", email: "owner@example.com", role: "owner", status: "active" };
      if (/FROM backup_runs/.test(sql)) return rows.at(-1) || null;
      return null;
    },
  };
  const result = await ensureVerifiedProductionBackup({
    database,
    currentSchemaVersion: 19,
    targetSchemaVersion: 20,
    pendingMigrations: ["018_envelope_decoration.sql"],
    backupCreator: async () => {
      created += 1;
      rows.push({ backup_id: "fresh", schema_version: 19, status: "verified", external_file_id: "drive-fresh", verified_at: "2026-09-12T09:00:00.000Z" });
      return { backupId: "fresh", status: "verified" };
    },
    logger: { log() {} },
  });
  assert.equal(created, 1);
  assert.equal(result.created, true);
  assert.equal(result.backupId, "fresh");
});

test("db:migrate Production membuat backup fresh lalu menerapkan seluruh pending migration secara atomik", async () => {
  const source = await readFile(new URL("../../scripts/db-migrate.mjs", import.meta.url), "utf8");
  assert.match(source, /await ensureVerifiedProductionBackup/);
  assert.match(source, /pending\.at\(-1\)\.targetSchemaVersion/);
  assert.match(source, /applyPendingAtomically/);
  assert.match(source, /assertIntegrityInsideMigration/);
  const guardIndex = source.indexOf("await ensureVerifiedProductionBackup");
  const applyIndex = source.indexOf("applyPendingAtomically", guardIndex);
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


test("Production runtime menolak deployment live yang tertinggal dari schema source lokal", async () => {
  const fetchImpl = async (url) => {
    if (String(url).endsWith("/api/health")) {
      return {
        ok: true, status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          ok: true,
          data: {
            status: "ok",
            schema: { ready: true, version: 18, expectedVersion: 18, databaseEnvironment: "production" },
            maintenanceMode: false,
            coreOperationsHealthy: true,
          },
        }),
      };
    }
    throw new Error("frontend should not be checked while deployment is stale");
  };
  await assert.rejects(
    checkProductionRuntime({ fetchImpl }),
    (error) => error?.code === "PRODUCTION_DEGRADED"
      && error?.blockers?.includes("PRODUCTION_RELEASE_BEHIND_SOURCE")
      && /source membutuhkan v21/.test(error.message),
  );
});

test("db:migrate Production membaca target schema dari isi migration, bukan prefix file", async () => {
  const source = await readFile(new URL("../../scripts/db-migrate.mjs", import.meta.url), "utf8");
  assert.match(source, /migrationTargetSchemaVersion/);
  assert.match(source, /targetSchemaVersion/);
  assert.doesNotMatch(source, /targetSchemaVersion:\s*nextMigration\.version/);
  assert.match(source, /runProductionUpdate/);
});
