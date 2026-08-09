import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureDevelopmentDependencies } from "../../scripts/bootstrap-development-dependencies.mjs";
import { ensureDevelopmentEnvironment } from "../../scripts/bootstrap-development-env.mjs";
import { CORE_RUNTIME_ENV_KEYS, LEGACY_ENV_KEYS } from "../../scripts/runtime-environment.mjs";
import { cleanEnvironmentText } from "../../scripts/clean-local-environment.mjs";
import { validateDevelopmentEnvironment } from "../../scripts/push-vercel-development-env.mjs";
import { createVapidTestEnvironment } from "../helpers/vapid-test-keys.js";

const validWebPushEnvironment = () => createVapidTestEnvironment();

const completeEnvironment = () => {
  const values = {
    ...Object.fromEntries(CORE_RUNTIME_ENV_KEYS.map((key) => [key, `${key.toLowerCase()}-value`])),
    ...validWebPushEnvironment(),
  };
  return `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
};

const coreOnlyEnvironment = () => `${CORE_RUNTIME_ENV_KEYS.map((key) => `${key}=${key.toLowerCase()}-value`).join("\n")}\n`;

const withTempRoot = async (callback) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-local-env-"));
  try { return await callback(root); }
  finally { await rm(root, { recursive: true, force: true }); }
};



test("legacy environment key memakai satu registry canonical untuk cleaner dan validator Development", () => {
  const legacyValues = Object.fromEntries(LEGACY_ENV_KEYS.map((key) => [key, "legacy-value"]));
  const validation = validateDevelopmentEnvironment({
    ...Object.fromEntries(CORE_RUNTIME_ENV_KEYS.map((key) => [key, "runtime-value"])),
    ...validWebPushEnvironment(),
    ...legacyValues,
  });
  assert.deepEqual([...validation.forbidden].sort(), [...LEGACY_ENV_KEYS].sort());

  const source = `${Object.entries(legacyValues).map(([key, value]) => `${key}=${value}`).join("\n")}\nSAFE_KEY=keep\n`;
  const cleaned = cleanEnvironmentText(source);
  assert.deepEqual(cleaned.removed, [...LEGACY_ENV_KEYS].sort());
  assert.equal(cleaned.text, "SAFE_KEY=keep\n");
});

const successfulRefreshRunner = (environmentSource, calls = []) => async ({ args, stdio }) => {
  calls.push({ args: [...args], stdio });
  if (args[0] === "whoami") return { code: 0 };
  if (args[0] === "link") return { code: 0 };
  if (args[0] === "env" && args[1] === "ls") return { code: 0 };
  if (args[0] === "env" && args[1] === "pull") {
    await writeFile(args[2], environmentSource);
    return { code: 0 };
  }
  return { code: 1 };
};

test("bootstrap non-interaktif memakai .env.local lengkap tanpa menghubungi Vercel", async () => withTempRoot(async (root) => {
  await writeFile(path.join(root, ".env.local"), completeEnvironment());
  let calls = 0;
  const result = await ensureDevelopmentEnvironment({
    projectRoot: root,
    interactive: false,
    runner: async () => { calls += 1; return { code: 0 }; },
  });
  assert.equal(result.source, "local");
  assert.deepEqual(result.missing, []);
  assert.equal(calls, 0);
}));

test("bootstrap interaktif selalu refresh Vercel Development walau .env.local lengkap", async () => withTempRoot(async (root) => {
  const envPath = path.join(root, ".env.local");
  const local = completeEnvironment();
  const remote = completeEnvironment();
  await writeFile(envPath, local);
  const calls = [];
  const result = await ensureDevelopmentEnvironment({
    projectRoot: root,
    interactive: true,
    runner: successfulRefreshRunner(remote, calls),
  });
  assert.equal(result.source, "vercel-development");
  assert.equal(calls.some(({ args }) => args[0] === "env" && args[1] === "pull"), true);
  assert.equal(await readFile(envPath, "utf8"), remote);
}));

test("bootstrap membersihkan OIDC dari .env.local lengkap pada mode non-interaktif", async () => withTempRoot(async (root) => {
  const envPath = path.join(root, ".env.local");
  await writeFile(envPath, `${completeEnvironment()}VERCEL_OIDC_TOKEN=temporary\n`);
  let calls = 0;
  const result = await ensureDevelopmentEnvironment({
    projectRoot: root,
    interactive: false,
    runner: async () => { calls += 1; return { code: 0 }; },
  });
  const source = await readFile(envPath, "utf8");
  assert.equal(result.source, "local");
  assert.equal(calls, 0);
  assert.doesNotMatch(source, /VERCEL_OIDC_TOKEN/);
  assert.ok(result.removed.includes("VERCEL_OIDC_TOKEN"));
}));

test("bootstrap fail closed tanpa terminal interaktif ketika .env.local tidak tersedia", async () => withTempRoot(async (root) => {
  await assert.rejects(
    ensureDevelopmentEnvironment({ projectRoot: root, interactive: false }),
    (error) => error.code === "LOCAL_ENV_NOT_FOUND" && error.envPath.endsWith(".env.local"),
  );
}));

test("bootstrap menganggap Web Push wajib untuk canonical local testing", async () => withTempRoot(async (root) => {
  await writeFile(path.join(root, ".env.local"), coreOnlyEnvironment());
  await assert.rejects(
    ensureDevelopmentEnvironment({ projectRoot: root, interactive: false }),
    (error) => error.code === "LOCAL_ENV_INCOMPLETE"
      && error.missing.includes("VITE_VAPID_PUBLIC_KEY")
      && error.missing.includes("VAPID_PRIVATE_KEY")
      && error.missing.includes("VAPID_SUBJECT"),
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
  assert.match(local, /VITE_VAPID_PUBLIC_KEY=/);
  assert.doesNotMatch(local, /VERCEL_OIDC_TOKEN/);
  assert.equal(calls.some(({ args }) => args[0] === "login"), true);
  assert.equal(calls.some(({ args }) => args[0] === "link" && args.includes("saldo-bersama")), true);
  assert.equal(calls.some(({ args }) => args[0] === "env" && args[1] === "pull"), true);
  assert.equal(projectChecks, 1);
}));

test("bootstrap mempertahankan .env.local lama bila pull Development gagal", async () => withTempRoot(async (root) => {
  const envPath = path.join(root, ".env.local");
  const original = completeEnvironment();
  await writeFile(envPath, original);

  const runner = async ({ args }) => {
    if (args[0] === "whoami") return { code: 0 };
    if (args[0] === "link") {
      await writeFile(envPath, `${original}VERCEL_OIDC_TOKEN=temporary\n`);
      return { code: 0 };
    }
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

test("bootstrap menolak hasil pull Development yang tidak memiliki Web Push tanpa mengganti local lama", async () => withTempRoot(async (root) => {
  const envPath = path.join(root, ".env.local");
  const original = completeEnvironment();
  await writeFile(envPath, original);
  const runner = successfulRefreshRunner(coreOnlyEnvironment());

  await assert.rejects(
    ensureDevelopmentEnvironment({ projectRoot: root, interactive: true, runner }),
    (error) => error.code === "VERCEL_DEVELOPMENT_ENV_INCOMPLETE"
      && error.missing.includes("VITE_VAPID_PUBLIC_KEY"),
  );
  assert.equal(await readFile(envPath, "utf8"), original);
}));

test("bootstrap menolak hasil pull Development yang core-nya tidak lengkap tanpa membuat .env.local", async () => withTempRoot(async (root) => {
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
