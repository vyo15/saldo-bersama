import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureDevelopmentEnvironment } from "../../scripts/bootstrap-development-env.mjs";
import { REQUIRED_RUNTIME_ENV_KEYS } from "../../scripts/runtime-environment.mjs";

const completeEnvironment = () => `${REQUIRED_RUNTIME_ENV_KEYS.map((key) => `${key}=${key.toLowerCase()}-value`).join("\n")}\n`;

const withTempRoot = async (callback) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-local-env-"));
  try { return await callback(root); }
  finally { await rm(root, { recursive: true, force: true }); }
};

test("bootstrap memakai .env.local lengkap tanpa menghubungi Vercel", async () => withTempRoot(async (root) => {
  await writeFile(path.join(root, ".env.local"), completeEnvironment());
  const result = await ensureDevelopmentEnvironment({ projectRoot: root });
  assert.equal(result.source, "local");
  assert.deepEqual(result.missing, []);
}));

test("bootstrap fail closed ketika .env.local tidak tersedia", async () => withTempRoot(async (root) => {
  await assert.rejects(
    ensureDevelopmentEnvironment({ projectRoot: root }),
    (error) => error.code === "LOCAL_ENV_NOT_FOUND" && error.envPath.endsWith(".env.local"),
  );
}));

test("bootstrap melaporkan key wajib yang belum lengkap", async () => withTempRoot(async (root) => {
  await writeFile(path.join(root, ".env.local"), "VITE_GOOGLE_CLIENT_ID=client-id\n");
  await assert.rejects(
    ensureDevelopmentEnvironment({ projectRoot: root }),
    (error) => error.code === "LOCAL_ENV_INCOMPLETE"
      && error.missing.includes("TURSO_DATABASE_URL")
      && error.missing.includes("SESSION_SECRET"),
  );
}));
