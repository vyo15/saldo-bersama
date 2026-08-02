import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureDevelopmentDependencies } from "../../scripts/bootstrap-development-dependencies.mjs";
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
  let calls = 0;
  const result = await ensureDevelopmentEnvironment({
    projectRoot: root,
    runner: async () => { calls += 1; return { code: 0 }; },
  });
  assert.equal(result.source, "local");
  assert.deepEqual(result.missing, []);
  assert.equal(calls, 0);
}));

test("bootstrap fail closed tanpa terminal interaktif ketika .env.local tidak tersedia", async () => withTempRoot(async (root) => {
  await assert.rejects(
    ensureDevelopmentEnvironment({ projectRoot: root, interactive: false }),
    (error) => error.code === "LOCAL_ENV_NOT_FOUND" && error.envPath.endsWith(".env.local"),
  );
}));

test("bootstrap otomatis login, link, pull Development, sanitasi OIDC, dan menulis .env.local", async () => withTempRoot(async (root) => {
  const calls = [];
  let whoamiCalls = 0;
  let projectChecks = 0;
  const runner = async ({ args, stdio }) => {
    calls.push({ args: [...args], stdio });
    if (args[0] === "whoami") {
      whoamiCalls += 1;
      return { code: whoamiCalls === 1 ? 1 : 0 };
    }
    if (args[0] === "login") return { code: 0 };
    if (args[0] === "link") return { code: 0 };
    if (args[0] === "env" && args[1] === "ls") {
      projectChecks += 1;
      return { code: 0 };
    }
    if (args[0] === "env" && args[1] === "pull") {
      await writeFile(args[2], `${completeEnvironment()}VERCEL_OIDC_TOKEN=temporary-token\n`);
      return { code: 0 };
    }
    return { code: 1 };
  };

  const result = await ensureDevelopmentEnvironment({
    projectRoot: root,
    interactive: true,
    runner,
  });
  const local = await readFile(path.join(root, ".env.local"), "utf8");

  assert.equal(result.source, "vercel-development");
  assert.match(local, /TURSO_DATABASE_URL=/);
  assert.doesNotMatch(local, /VERCEL_OIDC_TOKEN/);
  assert.equal(calls.some(({ args }) => args[0] === "login"), true);
  assert.equal(calls.some(({ args }) => args[0] === "link" && args.includes("saldo-bersama")), true);
  assert.equal(calls.some(({ args }) => args[0] === "env" && args[1] === "pull"), true);
}));

test("bootstrap mempertahankan .env.local lama bila pull Development gagal", async () => withTempRoot(async (root) => {
  const envPath = path.join(root, ".env.local");
  const original = "VITE_GOOGLE_CLIENT_ID=client-id\n";
  await writeFile(envPath, original);

  const runner = async ({ args }) => {
    if (args[0] === "whoami") return { code: 0 };
    if (args[0] === "link") return { code: 0 };
    if (args[0] === "env" && args[1] === "ls") return { code: 0 };
    if (args[0] === "env" && args[1] === "pull") return { code: 1 };
    return { code: 1 };
  };

  await assert.rejects(
    ensureDevelopmentEnvironment({ projectRoot: root, interactive: true, runner }),
    (error) => error.code === "VERCEL_DEVELOPMENT_ENV_PULL_FAILED",
  );
  assert.equal(await readFile(envPath, "utf8"), original);
}));

test("bootstrap menolak hasil pull Development yang tidak lengkap tanpa membuat .env.local", async () => withTempRoot(async (root) => {
  const runner = async ({ args }) => {
    if (args[0] === "whoami") return { code: 0 };
    if (args[0] === "link") return { code: 0 };
    if (args[0] === "env" && args[1] === "ls") return { code: 0 };
    if (args[0] === "env" && args[1] === "pull") {
      await writeFile(args[2], "VITE_APP_NAME=Saldo Bersama\n");
      return { code: 0 };
    }
    return { code: 1 };
  };

  await assert.rejects(
    ensureDevelopmentEnvironment({ projectRoot: root, interactive: true, runner }),
    (error) => error.code === "VERCEL_DEVELOPMENT_ENV_INCOMPLETE"
      && error.missing.includes("TURSO_DATABASE_URL"),
  );
  await assert.rejects(readFile(path.join(root, ".env.local"), "utf8"), { code: "ENOENT" });
}));

test("dependency bootstrap tidak menjalankan npm ci ketika dependency sudah tersedia", async () => {
  let installs = 0;
  const result = await ensureDevelopmentDependencies({
    projectRoot: "/project",
    probe: () => [],
    installer: async () => { installs += 1; },
  });
  assert.equal(result.installed, false);
  assert.equal(installs, 0);
});

test("dependency bootstrap menjalankan npm ci sekali saat dependency belum tersedia", async () => {
  let installed = false;
  let installs = 0;
  const result = await ensureDevelopmentDependencies({
    projectRoot: "/project",
    probe: () => installed ? [] : ["vite", "@mantine/core"],
    installer: async () => { installs += 1; installed = true; },
  });
  assert.equal(result.installed, true);
  assert.equal(result.source, "npm-ci");
  assert.equal(installs, 1);
});

test("dependency bootstrap fail closed bila npm ci tidak melengkapi dependency", async () => {
  await assert.rejects(
    ensureDevelopmentDependencies({
      projectRoot: "/project",
      probe: () => ["vite"],
      installer: async () => {},
    }),
    (error) => error.code === "DEVELOPMENT_DEPENDENCY_INCOMPLETE"
      && error.missing.includes("vite"),
  );
});
