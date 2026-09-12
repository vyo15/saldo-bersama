import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRemoteDatabaseBuildContext,
  resolveVercelDatabaseOperation,
  runVercelBuild,
} from "../../scripts/vercel-build.mjs";

const productionEnvironment = (operation = "") => ({
  VERCEL_ENV: "production",
  TURSO_DATABASE_URL: "libsql://prod.example.turso.io",
  TURSO_AUTH_TOKEN: "prod-token",
  SALDO_BERSAMA_DB_OPERATION: operation,
});

test("Vercel build biasa hanya membangun frontend tanpa operasi database", () => {
  const calls = [];
  const result = runVercelBuild({
    environment: {},
    buildRunner: () => calls.push("build"),
    nodeRunner: () => calls.push("node"),
  });
  assert.deepEqual(calls, ["build"]);
  assert.deepEqual(result, { operation: null, databaseOperationRan: false });
});

test("staged migrate selalu build source lebih dulu lalu migration dan integrity", () => {
  const calls = [];
  const result = runVercelBuild({
    environment: productionEnvironment("migrate"),
    buildRunner: () => calls.push("build"),
    nodeRunner: (args, env) => calls.push({ args, env }),
  });
  assert.equal(calls[0], "build");
  assert.deepEqual(calls[1].args, ["scripts/db-migrate.mjs", "production"]);
  assert.deepEqual(calls[2].args, ["scripts/db-integrity.mjs", "production"]);
  assert.equal(calls[1].env.SALDO_BERSAMA_REMOTE_DB_CONTEXT, "1");
  assert.equal(calls[1].env.DATABASE_ENVIRONMENT, "production");
  assert.deepEqual(result, { operation: "migrate", databaseOperationRan: true });
});

test("migration tidak pernah berjalan bila frontend build gagal", () => {
  const calls = [];
  assert.throws(
    () => runVercelBuild({
      environment: productionEnvironment("migrate"),
      buildRunner: () => { calls.push("build"); throw new Error("compile failed"); },
      nodeRunner: () => calls.push("database"),
    }),
    /compile failed/,
  );
  assert.deepEqual(calls, ["build"]);
});

test("operasi database staged fail-closed di luar Vercel Production atau tanpa Turso", () => {
  assert.throws(
    () => assertRemoteDatabaseBuildContext({ VERCEL_ENV: "preview", TURSO_DATABASE_URL: "x", TURSO_AUTH_TOKEN: "y" }),
    (error) => error?.code === "REMOTE_PRODUCTION_CONTEXT_INVALID",
  );
  assert.throws(
    () => assertRemoteDatabaseBuildContext({ VERCEL_ENV: "production" }),
    (error) => error?.code === "REMOTE_PRODUCTION_DATABASE_CREDENTIALS_MISSING",
  );
});

test("nama operasi build database harus canonical", () => {
  assert.equal(resolveVercelDatabaseOperation(productionEnvironment("integrity")), "integrity");
  assert.throws(
    () => resolveVercelDatabaseOperation({ SALDO_BERSAMA_DB_OPERATION: "drop" }),
    (error) => error?.code === "VERCEL_DB_OPERATION_INVALID",
  );
});


test("staged update memakai source candidate yang sama untuk migration dan integrity", () => {
  const calls = [];
  const result = runVercelBuild({
    environment: productionEnvironment("update"),
    buildRunner: () => calls.push("build"),
    nodeRunner: (args, env) => calls.push({ args, env }),
  });
  assert.equal(calls[0], "build");
  assert.deepEqual(calls[1].args, ["scripts/db-migrate.mjs", "production"]);
  assert.deepEqual(calls[2].args, ["scripts/db-integrity.mjs", "production"]);
  assert.equal(calls[1].env.SALDO_BERSAMA_REMOTE_DB_CONTEXT, "1");
  assert.deepEqual(result, { operation: "update", databaseOperationRan: true });
});
