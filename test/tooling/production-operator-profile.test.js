import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { remoteProductionBuildArgs, runRemoteProductionDatabaseOperation } from "../../scripts/remote-production-database-operation.mjs";

test("operasi Production memakai staged Vercel production build tanpa menarik secret ke lokal", () => {
  const args = remoteProductionBuildArgs("migrate");
  assert.deepEqual(args.slice(0, 6), ["deploy", "--prod", "--skip-domain", "--yes", "--no-color", "--build-env"]);
  assert.equal(args.at(-1), "SALDO_BERSAMA_DB_OPERATION=migrate");
  assert.equal(args.includes("env"), false);
  assert.equal(args.includes("pull"), false);
});

test("operasi Production menolak nama operasi yang tidak dikenal", () => {
  assert.throws(
    () => remoteProductionBuildArgs("drop"),
    (error) => error?.code === "PRODUCTION_DB_OPERATION_INVALID",
  );
});

test("staged Production operation memulihkan .env.local byte-for-byte setelah vercel link", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-prod-remote-"));
  const envPath = path.join(root, ".env.local");
  const gitignorePath = path.join(root, ".gitignore");
  const original = Buffer.from("DATABASE_ENVIRONMENT=development\nTURSO_AUTH_TOKEN=dev-token\n", "utf8");
  const originalGitignore = Buffer.from("node_modules/\n.env.*\n.vercel/\n", "utf8");
  await writeFile(envPath, original);
  await writeFile(gitignorePath, originalGitignore);
  const calls = [];
  try {
    const result = await runRemoteProductionDatabaseOperation({
      operation: "integrity",
      root,
      loginEnsurer: async () => { calls.push("login"); },
      projectEnsurer: async () => {
        calls.push("project");
        await writeFile(envPath, "VERCEL_OIDC_TOKEN=temporary\n");
        await writeFile(gitignorePath, "node_modules/\n.env*\n.vercel\n");
      },
      runner: async ({ args }) => {
        calls.push(args.join(" "));
        return { code: 0 };
      },
      logger: { log() {} },
    });
    assert.equal(result.operation, "integrity");
    assert.deepEqual(calls.slice(0, 2), ["login", "project"]);
    assert.match(calls[2], /deploy --prod --skip-domain/);
    assert.match(calls[2], /SALDO_BERSAMA_DB_OPERATION=integrity/);
    assert.deepEqual(await readFile(envPath), original);
    assert.deepEqual(await readFile(gitignorePath), originalGitignore);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
