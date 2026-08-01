import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureDevelopmentEnvironment } from "../../scripts/bootstrap-development-env.mjs";
import { REQUIRED_RUNTIME_ENV_KEYS } from "../../scripts/runtime-environment.mjs";

const completeEnvironment = (extra = "") => `${REQUIRED_RUNTIME_ENV_KEYS.map((key) => `${key}=${key.toLowerCase()}-value`).join("\n")}\n${extra}`;

const withTempRoot = async (callback) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-dev-env-"));
  try { return await callback(root); }
  finally { await rm(root, { recursive: true, force: true }); }
};

test("bootstrap development tidak memanggil Vercel ketika env lokal sudah lengkap", async () => withTempRoot(async (root) => {
  await writeFile(path.join(root, ".env.local"), completeEnvironment());
  let calls = 0;
  const result = await ensureDevelopmentEnvironment({ projectRoot: root, interactive: true, runCli: async () => { calls += 1; }, log: () => {}, warn: () => {} });
  assert.equal(result.source, "existing");
  assert.equal(calls, 0);
}));

test("bootstrap menarik Development env dan membuang VERCEL_OIDC_TOKEN", async () => withTempRoot(async (root) => {
  const calls = [];
  const runCli = async (args) => {
    calls.push(args);
    if (args[0] === "env" && args[1] === "pull") await writeFile(args[2], completeEnvironment('VERCEL_OIDC_TOKEN="temporary"\n'));
  };
  const result = await ensureDevelopmentEnvironment({ projectRoot: root, interactive: true, runCli, log: () => {}, warn: () => {} });
  const content = await readFile(path.join(root, ".env.local"), "utf8");
  assert.equal(result.source, "vercel");
  assert.equal(content.includes("VERCEL_OIDC_TOKEN"), false);
  assert.deepEqual(calls.map((args) => args.slice(0, 2)), [["whoami"], ["env", "pull"]]);
}));

test("bootstrap login dan link otomatis saat credential serta project link belum ada", async () => withTempRoot(async (root) => {
  const calls = [];
  let pullAttempts = 0;
  const runCli = async (args) => {
    calls.push(args);
    if (args[0] === "whoami") throw new Error("not logged in");
    if (args[0] === "env" && args[1] === "pull") {
      pullAttempts += 1;
      if (pullAttempts === 1) throw new Error("not linked");
      await writeFile(args[2], completeEnvironment());
    }
  };
  await ensureDevelopmentEnvironment({ projectRoot: root, interactive: true, runCli, log: () => {}, warn: () => {} });
  assert.deepEqual(calls.map((args) => args[0]), ["whoami", "login", "env", "link", "env"]);
}));

test("bootstrap menolak hasil pull tidak lengkap dan mempertahankan env lama", async () => withTempRoot(async (root) => {
  const envPath = path.join(root, ".env.local");
  await writeFile(envPath, "VITE_GOOGLE_CLIENT_ID=old\n");
  const runCli = async (args) => {
    if (args[0] === "env" && args[1] === "pull") await writeFile(args[2], "VITE_GOOGLE_CLIENT_ID=new\n");
  };
  await assert.rejects(
    ensureDevelopmentEnvironment({ projectRoot: root, interactive: true, runCli, log: () => {}, warn: () => {} }),
    (error) => error.code === "VERCEL_ENV_INCOMPLETE",
  );
  assert.equal(await readFile(envPath, "utf8"), "VITE_GOOGLE_CLIENT_ID=old\n");
}));

test("bootstrap memulihkan env lama bila vercel link sempat menulis OIDC lalu pull gagal", async () => withTempRoot(async (root) => {
  const envPath = path.join(root, ".env.local");
  const original = "VITE_GOOGLE_CLIENT_ID=old\n";
  await writeFile(envPath, original);
  let pullAttempts = 0;
  const runCli = async (args) => {
    if (args[0] === "env" && args[1] === "pull") {
      pullAttempts += 1;
      if (pullAttempts === 1) throw new Error("not linked");
      await writeFile(args[2], "VITE_GOOGLE_CLIENT_ID=incomplete\n");
      return;
    }
    if (args[0] === "link") await writeFile(envPath, `${original}VERCEL_OIDC_TOKEN=temporary\n`);
  };
  await assert.rejects(
    ensureDevelopmentEnvironment({ projectRoot: root, interactive: true, runCli, log: () => {}, warn: () => {} }),
    (error) => error.code === "VERCEL_ENV_INCOMPLETE",
  );
  assert.equal(await readFile(envPath, "utf8"), original);
}));

test("bootstrap fail closed pada proses non-interaktif tanpa env lengkap", async () => withTempRoot(async (root) => {
  await assert.rejects(
    ensureDevelopmentEnvironment({ projectRoot: root, interactive: false, runCli: async () => {}, log: () => {}, warn: () => {} }),
    (error) => error.code === "DEV_ENV_INTERACTIVE_REQUIRED",
  );
}));
