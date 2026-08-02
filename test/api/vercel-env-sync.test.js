import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  CORE_RUNTIME_ENV_KEYS,
  OPTIONAL_LOGGING_ENV_KEYS,
  PRODUCTION_SYNC_ENV_KEYS,
} from "../../scripts/runtime-environment.mjs";

const canonicalValues = () => Object.fromEntries(PRODUCTION_ENV_KEYS.map((key) => [key, `${key.toLowerCase()}-value`]));
const serialize = (values) => `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;

const withTempProject = async (callback) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-vercel-env-"));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

test("sinkronisasi Vercel memakai delapan core dan satu logging canonical Production", () => {
  assert.equal(CORE_RUNTIME_ENV_KEYS.length, 8);
  assert.deepEqual(OPTIONAL_LOGGING_ENV_KEYS, ["LOG_LEVEL"]);
  assert.deepEqual(PRODUCTION_ENV_KEYS, PRODUCTION_SYNC_ENV_KEYS);
  assert.equal(PRODUCTION_ENV_KEYS.length, 9);
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
  assert.equal(result.synced.length, 8);
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
  assert.equal(calls.find(({ key }) => key === "VITE_APP_NAME").sensitive, false);
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


test("runner Vercel memakai cmd.exe pada Windows agar npx.cmd tidak memicu spawn EINVAL", () => {
  const invocation = buildVercelInvocation(["env", "ls", "production"], {
    platform: "win32",
    comspec: "C:\\Windows\\System32\\cmd.exe",
  });
  assert.equal(invocation.executable, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(invocation.args, ["/d", "/s", "/c", "npx.cmd", "vercel", "env", "ls", "production"]);
});

test("runner Vercel memakai npx langsung pada platform non-Windows", () => {
  const invocation = buildVercelInvocation(["env", "ls", "production"], { platform: "linux" });
  assert.equal(invocation.executable, "npx");
  assert.deepEqual(invocation.args, ["vercel", "env", "ls", "production"]);
});
