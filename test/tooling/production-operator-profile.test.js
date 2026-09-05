import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkProductionOperatorEnvironment } from "../../scripts/production-runtime.mjs";

const makeRoot = async () => mkdtemp(path.join(os.tmpdir(), "saldo-prod-operator-"));

test("standalone recovery script tidak hidup kembali karena npm run prod sudah menjadi entry point canonical", async () => {
  await assert.rejects(
    access(new URL("../../scripts/recover-production-db-profile.mjs", import.meta.url)),
    (error) => error?.code === "ENOENT",
  );
  const runtime = await readFile(new URL("../../scripts/production-runtime.mjs", import.meta.url), "utf8");
  assert.match(runtime, /restoreProductionOperatorProfile/);
  assert.match(runtime, /persistProductionOperatorProfile/);
});

test("npm run prod operator tidak mewajibkan session OAuth atau VAPID lokal untuk preflight read-only", async () => {
  const root = await makeRoot();
  await writeFile(path.join(root, ".env.local"), [
    "DATABASE_ENVIRONMENT=development",
    "TURSO_DATABASE_URL=libsql://saldo-dev.example",
    "TURSO_AUTH_TOKEN=dev-token",
    "SESSION_SECRET=dev-session",
    "",
  ].join("\n"));
  await writeFile(path.join(root, ".env.production.local"), [
    "DATABASE_ENVIRONMENT=production",
    "TURSO_DATABASE_URL=libsql://saldo-prod.example",
    "TURSO_AUTH_TOKEN=prod-token",
    "SESSION_SECRET=",
    "GOOGLE_OAUTH_CLIENT_SECRET=",
    "VITE_VAPID_PUBLIC_KEY=",
    "VAPID_PRIVATE_KEY=",
    "",
  ].join("\n"));

  const logs = [];
  const result = await checkProductionOperatorEnvironment({
    cwd: root,
    logger: { log: (message) => logs.push(message) },
  });

  assert.equal(result.databaseEnvironment, "production");
  assert.equal(logs.some((message) => /tidak diperlukan/.test(message)), true);
});

test("operator Production tetap fail-closed bila Turso Development dan Production sama", async () => {
  const root = await makeRoot();
  await writeFile(path.join(root, ".env.local"), [
    "DATABASE_ENVIRONMENT=development",
    "TURSO_DATABASE_URL=libsql://same.example",
    "TURSO_AUTH_TOKEN=dev-token",
    "",
  ].join("\n"));
  await writeFile(path.join(root, ".env.production.local"), [
    "DATABASE_ENVIRONMENT=production",
    "TURSO_DATABASE_URL=libsql://same.example",
    "TURSO_AUTH_TOKEN=prod-token",
    "",
  ].join("\n"));

  await assert.rejects(
    checkProductionOperatorEnvironment({ cwd: root, logger: { log() {} } }),
    (error) => error?.code === "DATABASE_ENVIRONMENT_ISOLATION_FAILED",
  );
});

test("operator Production menolak placeholder Vercel Sensitive sebagai credential Turso", async () => {
  const root = await makeRoot();
  await writeFile(path.join(root, ".env.local"), [
    "DATABASE_ENVIRONMENT=development",
    "TURSO_DATABASE_URL=libsql://saldo-dev.example",
    "TURSO_AUTH_TOKEN=dev-token",
    "",
  ].join("\n"));
  await writeFile(path.join(root, ".env.production.local"), [
    "DATABASE_ENVIRONMENT=production",
    "TURSO_DATABASE_URL=[SENSITIVE]",
    "TURSO_AUTH_TOKEN=[SENSITIVE]",
    "",
  ].join("\n"));

  await assert.rejects(
    checkProductionOperatorEnvironment({ cwd: root, logger: { log() {} } }),
    (error) => error?.code === "PRODUCTION_OPERATOR_DB_CREDENTIALS_REQUIRED",
  );
});
