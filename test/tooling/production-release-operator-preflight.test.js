import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkProductionReleasePreflight } from "../../scripts/production-release-preflight.mjs";

const makeRoot = async () => mkdtemp(path.join(os.tmpdir(), "saldo-release-operator-"));

const writeProfiles = async (root, { sameDatabase = false } = {}) => {
  await writeFile(path.join(root, ".env.local"), [
    "DATABASE_ENVIRONMENT=development",
    "TURSO_DATABASE_URL=libsql://saldo-dev.example",
    "TURSO_AUTH_TOKEN=dev-token",
    "SESSION_SECRET=dev-session",
    "",
  ].join("\n"));
  await writeFile(path.join(root, ".env.production.local"), [
    "DATABASE_ENVIRONMENT=production",
    `TURSO_DATABASE_URL=${sameDatabase ? "libsql://saldo-dev.example" : "libsql://saldo-prod.example"}`,
    "TURSO_AUTH_TOKEN=prod-readonly-token",
    "",
  ].join("\n"));
};

test("Production release preflight memakai operator Turso read-only tanpa mewajibkan runtime secret lokal", async () => {
  const root = await makeRoot();
  await writeProfiles(root);
  const logs = [];
  let databaseChecks = 0;

  const schema = await checkProductionReleasePreflight({
    root,
    databaseChecker: async () => {
      databaseChecks += 1;
      return { version: 14, expectedVersion: 14, databaseEnvironment: "production", ready: true };
    },
    logger: { log: (message) => logs.push(message) },
  });

  assert.equal(databaseChecks, 1);
  assert.equal(schema.version, 14);
  assert.equal(schema.databaseEnvironment, "production");
  assert.equal(logs.some((message) => /read-only PASS/.test(message)), true);
});

test("Production release preflight tetap fail-closed bila operator menunjuk database Development", async () => {
  const root = await makeRoot();
  await writeProfiles(root, { sameDatabase: true });
  let databaseChecks = 0;

  await assert.rejects(
    checkProductionReleasePreflight({
      root,
      databaseChecker: async () => {
        databaseChecks += 1;
        return { version: 14, databaseEnvironment: "production", ready: true };
      },
      logger: { log() {} },
    }),
    (error) => error?.code === "DATABASE_ENVIRONMENT_ISOLATION_FAILED",
  );
  assert.equal(databaseChecks, 0);
});
