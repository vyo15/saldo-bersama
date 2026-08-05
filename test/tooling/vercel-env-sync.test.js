import crypto from "node:crypto";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PRODUCTION_ENV_KEYS,
  PUBLIC_PRODUCTION_KEYS,
  SENSITIVE_PRODUCTION_KEYS,
  buildVercelInvocation,
  pushProductionEnvironment,
  validateProductionEnvironment,
} from "../../scripts/push-vercel-production-env.mjs";
import {
  DEVELOPMENT_ENV_KEYS,
  pushDevelopmentEnvironment,
  validateDevelopmentEnvironment,
} from "../../scripts/push-vercel-development-env.mjs";
import {
  CORE_RUNTIME_ENV_KEYS,
  OPTIONAL_LOGGING_ENV_KEYS,
  PRODUCTION_SYNC_ENV_KEYS,
} from "../../scripts/runtime-environment.mjs";

const coreValues = () => Object.fromEntries([...CORE_RUNTIME_ENV_KEYS, ...OPTIONAL_LOGGING_ENV_KEYS].map((key) => [key, `${key.toLowerCase()}-value`]));
const validWebPushValues = () => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    VITE_VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString("base64url"),
    VAPID_PRIVATE_KEY: ecdh.getPrivateKey().toString("base64url"),
    VAPID_SUBJECT: "mailto:owner@example.com",
  };
};
const canonicalValues = () => ({
  ...coreValues(),
  GOOGLE_BRIDGE_WEB_APP_URL: "https://script.google.com/macros/s/test/exec",
  GOOGLE_BRIDGE_SHARED_SECRET: "g".repeat(40),
  JOBS_SHARED_SECRET: "j".repeat(40),
  ...validWebPushValues(),
});
const serialize = (values) => `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;

const withTempProject = async (callback) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-vercel-env-"));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

test("sinkronisasi Vercel mencakup core, logging, dan grup integrasi Production", () => {
  assert.equal(CORE_RUNTIME_ENV_KEYS.length, 8);
  assert.deepEqual(OPTIONAL_LOGGING_ENV_KEYS, ["LOG_LEVEL"]);
  assert.deepEqual(PRODUCTION_ENV_KEYS, PRODUCTION_SYNC_ENV_KEYS);
  assert.equal(PRODUCTION_ENV_KEYS.length, 15);
  assert.deepEqual(new Set([...PUBLIC_PRODUCTION_KEYS, ...SENSITIVE_PRODUCTION_KEYS]), new Set(PRODUCTION_ENV_KEYS));
  assert.equal(validateProductionEnvironment(canonicalValues()).valid, true);
});

test("sinkronisasi menolak key legacy dan environment core yang tidak lengkap", () => {
  const incomplete = canonicalValues();
  delete incomplete.TURSO_AUTH_TOKEN;
  incomplete.APPS_SCRIPT_WEB_APP_URL = "legacy";
  const status = validateProductionEnvironment(incomplete);
  assert.equal(status.valid, false);
  assert.deepEqual(status.missing, ["TURSO_AUTH_TOKEN"]);
  assert.deepEqual(status.forbidden, ["APPS_SCRIPT_WEB_APP_URL"]);
});


test("LOG_LEVEL bersifat opsional dan tidak menghalangi sinkronisasi delapan core", async () => withTempProject(async (root) => {
  const values = canonicalValues();
  delete values.LOG_LEVEL;
  assert.equal(validateProductionEnvironment(values).valid, true);
  await writeFile(path.join(root, ".env.local"), serialize(values));
  const calls = [];
  const result = await pushProductionEnvironment({
    cwd: root,
    projectRunner: async () => {},
    runner: async (request) => calls.push(request),
  });
  assert.equal(result.synced.length, 14);
  assert.equal(calls.some(({ key }) => key === "LOG_LEVEL"), false);
}));

test("sinkronisasi mengirim nilai via runner tanpa mengekspos secret ke argumen lain", async () => withTempProject(async (root) => {
  const values = canonicalValues();
  await writeFile(path.join(root, ".env.local"), serialize(values));
  const calls = [];
  let projectChecks = 0;
  const result = await pushProductionEnvironment({
    cwd: root,
    projectRunner: async () => { projectChecks += 1; },
    runner: async (request) => calls.push(request),
  });
  assert.equal(projectChecks, 1);
  assert.deepEqual(result.synced, [...PRODUCTION_ENV_KEYS]);
  assert.deepEqual(calls.map(({ key }) => key), [...PRODUCTION_ENV_KEYS]);
  assert.equal(calls.find(({ key }) => key === "TURSO_AUTH_TOKEN").sensitive, true);
  assert.equal(calls.find(({ key }) => key === "GOOGLE_BRIDGE_SHARED_SECRET").sensitive, true);
  assert.equal(calls.find(({ key }) => key === "VAPID_PRIVATE_KEY").sensitive, true);
  assert.equal(calls.find(({ key }) => key === "VITE_APP_NAME").sensitive, false);
  assert.equal(calls.find(({ key }) => key === "VITE_VAPID_PUBLIC_KEY").sensitive, false);
  assert.equal(calls.find(({ key }) => key === "SESSION_SECRET").value, values.SESSION_SECRET);
}));

test("sinkronisasi tidak bergantung pada .vercel/project.json dan menerima project yang tersambung lewat Git", async () => withTempProject(async (root) => {
  const values = canonicalValues();
  await writeFile(path.join(root, ".env.local"), serialize(values));
  let checked = false;
  await pushProductionEnvironment({
    cwd: root,
    projectRunner: async ({ cwd }) => {
      checked = cwd === root;
    },
    runner: async () => {},
  });
  assert.equal(checked, true);
}));


test("sinkronisasi Production menolak grup integrasi parsial dan VAPID tidak valid", () => {
  const partial = coreValues();
  partial.VITE_VAPID_PUBLIC_KEY = "invalid";
  const partialStatus = validateProductionEnvironment(partial);
  assert.equal(partialStatus.valid, false);
  assert.deepEqual(partialStatus.incompleteWebPush, ["VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]);

  const invalid = canonicalValues();
  invalid.VAPID_PRIVATE_KEY = "invalid";
  const invalidStatus = validateProductionEnvironment(invalid);
  assert.equal(invalidStatus.valid, false);
  assert.deepEqual(invalidStatus.invalidWebPush, ["VAPID_PRIVATE_KEY"]);

  const mismatched = canonicalValues();
  const otherPair = crypto.createECDH("prime256v1");
  otherPair.generateKeys();
  mismatched.VAPID_PRIVATE_KEY = otherPair.getPrivateKey().toString("base64url");
  const mismatchedStatus = validateProductionEnvironment(mismatched);
  assert.equal(mismatchedStatus.valid, false);
  assert.deepEqual(mismatchedStatus.invalidWebPush, ["VAPID_KEY_PAIR"]);
});

test("runner Vercel memakai cmd.exe pada Windows agar npx.cmd tidak memicu spawn EINVAL", () => {
  const invocation = buildVercelInvocation(["env", "ls", "production"], {
    platform: "win32",
    comspec: "C:\\Windows\\System32\\cmd.exe",
  });
  assert.equal(invocation.executable, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(invocation.args, ["/d", "/s", "/c", "npx.cmd", "--yes", "vercel", "env", "ls", "production"]);
});

test("runner Vercel memakai npx langsung pada platform non-Windows", () => {
  const invocation = buildVercelInvocation(["env", "ls", "production"], { platform: "linux" });
  assert.equal(invocation.executable, "npx");
  assert.deepEqual(invocation.args, ["--yes", "vercel", "env", "ls", "production"]);
});


test("sinkronisasi Development mencakup core, logging, dan grup opsional lengkap", async () => withTempProject(async (root) => {
  const values = canonicalValues();
  assert.equal(validateDevelopmentEnvironment(values).valid, true);
  await writeFile(path.join(root, ".env.local"), serialize(values));
  const calls = [];
  const result = await pushDevelopmentEnvironment({
    cwd: root,
    projectRunner: async () => {},
    runner: async (request) => calls.push(request),
  });
  assert.deepEqual(result.synced, [...DEVELOPMENT_ENV_KEYS]);
  assert.deepEqual(calls.map(({ key }) => key), [...DEVELOPMENT_ENV_KEYS]);
  assert.equal(calls.find(({ key }) => key === "TURSO_AUTH_TOKEN").value, values.TURSO_AUTH_TOKEN);
}));

test("sinkronisasi Development membersihkan OIDC dari vercel link dan tetap idempotent", async () => withTempProject(async (root) => {
  const values = canonicalValues();
  const envPath = path.join(root, ".env.local");
  await writeFile(envPath, serialize(values));
  let projectRuns = 0;
  const projectRunner = async () => {
    projectRuns += 1;
    await writeFile(envPath, `${await readFile(envPath, "utf8")}VERCEL_OIDC_TOKEN=temporary-${projectRuns}\n`);
  };
  const calls = [];

  await pushDevelopmentEnvironment({ cwd: root, envPath, projectRunner, runner: async (request) => calls.push(request) });
  assert.doesNotMatch(await readFile(envPath, "utf8"), /VERCEL_OIDC_TOKEN/);
  await pushDevelopmentEnvironment({ cwd: root, envPath, projectRunner, runner: async (request) => calls.push(request) });

  assert.equal(projectRuns, 2);
  assert.equal(calls.length, DEVELOPMENT_ENV_KEYS.length * 2);
  assert.doesNotMatch(await readFile(envPath, "utf8"), /VERCEL_OIDC_TOKEN/);
}));

test("sinkronisasi Development membersihkan OIDC ketika pemeriksaan project gagal", async () => withTempProject(async (root) => {
  const values = canonicalValues();
  const envPath = path.join(root, ".env.local");
  await writeFile(envPath, serialize(values));

  await assert.rejects(
    pushDevelopmentEnvironment({
      cwd: root,
      envPath,
      projectRunner: async () => {
        await writeFile(envPath, `${await readFile(envPath, "utf8")}VERCEL_OIDC_TOKEN=temporary\n`);
        throw Object.assign(new Error("link failed"), { code: "VERCEL_LINK_FAILED" });
      },
      runner: async () => {},
    }),
    (error) => error.code === "VERCEL_LINK_FAILED",
  );
  assert.doesNotMatch(await readFile(envPath, "utf8"), /VERCEL_OIDC_TOKEN/);
}));

test("sinkronisasi Development menolak grup opsional parsial dan key OIDC", () => {
  const values = coreValues();
  values.GOOGLE_BRIDGE_WEB_APP_URL = "https://example.test/exec";
  values.VERCEL_OIDC_TOKEN = "temporary";
  const status = validateDevelopmentEnvironment(values);
  assert.equal(status.valid, false);
  assert.deepEqual(status.forbidden, ["VERCEL_OIDC_TOKEN"]);
  assert.deepEqual(status.incompleteGoogleBridge, ["GOOGLE_BRIDGE_SHARED_SECRET", "JOBS_SHARED_SECRET"]);
});
