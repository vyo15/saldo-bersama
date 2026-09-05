import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { inspectProductionDatabaseHealth } from "../../scripts/production-database-preflight.mjs";
import { assertVerifiedProductionBackup } from "../../scripts/production-migration-safety.mjs";
import { checkProductionReleasePreflight } from "../../scripts/production-release-preflight.mjs";
import { requiresProductionDatabasePreflight, runPrePushGuard } from "../../scripts/pre-push-verify.mjs";
import { reportProductionDegradation } from "../../scripts/production-runtime.mjs";

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

test("Production release preflight menolak schema tertinggal tanpa memigrasikan database otomatis", async () => {
  await assert.rejects(
    checkProductionReleasePreflight({
      root: "/tmp/saldo-release",
      environmentChecker: async () => {},
      databaseChecker: async () => {
        throw Object.assign(new Error("not ready"), {
          code: "PRODUCTION_DATABASE_NOT_READY",
          schema: { version: 13, expectedVersion: 14, databaseEnvironment: "production" },
        });
      },
      logger: { log: () => {} },
    }),
    (error) => error?.code === "PRODUCTION_RELEASE_SCHEMA_NOT_READY"
      && /v13\/14/.test(error.message)
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
  assert.ok(source.indexOf("await assertVerifiedProductionBackup") < source.indexOf("for (const migration of migrations) {\n  if (appliedByVersion.has"));
});

test("diagnosis Production mengenali heartbeat scheduler lama walau secret jobs tidak ada di profile lokal", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-prod-health-"));
  const before = {
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
    DATABASE_ENVIRONMENT: process.env.DATABASE_ENVIRONMENT,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  };
  try {
    await writeFile(path.join(root, ".env.production.local"), [
      "TURSO_DATABASE_URL=libsql://saldo-bersama.example.turso.io",
      "TURSO_AUTH_TOKEN=prod-token",
      "DATABASE_ENVIRONMENT=production",
      "",
    ].join("\n"));
    const now = Date.parse("2026-08-25T08:00:00.000Z");
    const database = {
      health: async () => true,
      one: async () => ({ value: "false" }),
      all: async () => [
        { key: "scheduler_last_success_at", value: "2026-08-25T06:00:00.000Z" },
        { key: "scheduler_last_failure_at", value: "2026-08-25T07:50:00.000Z" },
        { key: "scheduler_last_error_code", value: "DATABASE_SCHEMA_MISMATCH" },
      ],
    };
    const diagnostics = await inspectProductionDatabaseHealth({
      root,
      databaseFactory: () => database,
      schemaReader: async () => ({ ready: true, version: 14, expectedVersion: 14, databaseEnvironment: "production" }),
      operationalReader: async () => ({ status: "ok", codes: [] }),
      now,
    });
    assert.equal(diagnostics.schedulerConfigurationSource, "database_history");
    assert.equal(diagnostics.scheduler.status, "degraded");
    assert.equal(diagnostics.scheduler.errorCode, "DATABASE_SCHEMA_MISMATCH");
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("npm run prod melaporkan penyebab safe ketika live health degraded dan tidak menyuruh migrate ulang", async () => {
  const logs = [];
  await reportProductionDegradation({
    root: "/tmp/saldo-prod",
    diagnosticsReader: async () => ({
      databaseStatus: "ok",
      schema: { ready: true, version: 14 },
      maintenanceMode: false,
      scheduler: { status: "degraded", stale: false, errorCode: "DATABASE_SCHEMA_MISMATCH" },
      operations: { status: "ok", codes: [] },
      googleBridge: { enabled: false, complete: false },
    }),
    logger: { log: (message) => logs.push(String(message)), error: (message) => logs.push(String(message)) },
  });
  const output = logs.join("\n");
  assert.match(output, /scheduler: degraded/);
  assert.match(output, /DATABASE_SCHEMA_MISMATCH/);
  assert.match(output, /setiap 10 menit/);
  assert.doesNotMatch(output, /TURSO_AUTH_TOKEN|SESSION_SECRET|VAPID_PRIVATE_KEY/);
});
