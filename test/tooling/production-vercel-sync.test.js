import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ensureProductionEnvironment,
  mergeProductionEnvironment,
} from "../../scripts/bootstrap-production-env.mjs";
import { parseEnvironmentText } from "../../scripts/runtime-environment.mjs";

const development = {
  VITE_APP_NAME: "Saldo Bersama",
  VITE_GOOGLE_CLIENT_ID: "shared-client",
  VITE_FIREBASE_API_KEY: "firebase-key",
  VITE_FIREBASE_AUTH_DOMAIN: "saldo-bersama.firebaseapp.com",
  ALLOWED_USERS_JSON: "[]",
  ALLOWED_ORIGINS: "http://localhost:5173,https://saldo-bersama.vercel.app",
  SESSION_SECRET: "dev-session-secret",
  TURSO_DATABASE_URL: "libsql://dev.example.turso.io",
  TURSO_AUTH_TOKEN: "dev-token",
  DATABASE_ENVIRONMENT: "development",
};

test("merge Production mengutamakan runtime Vercel untuk Sensitive dan tidak menyalin secret Development", () => {
  const merged = mergeProductionEnvironment({
    development,
    existing: { DATABASE_ENVIRONMENT: "production" },
    pulled: {
      DATABASE_ENVIRONMENT: "production",
      TURSO_DATABASE_URL: "libsql://prod.example.turso.io",
      TURSO_AUTH_TOKEN: "[SENSITIVE]",
      SESSION_SECRET: "[SENSITIVE]",
    },
    runtime: {
      DATABASE_ENVIRONMENT: "production",
      TURSO_AUTH_TOKEN: "prod-token",
      SESSION_SECRET: "prod-session-secret",
    },
  });

  assert.equal(merged.values.DATABASE_ENVIRONMENT, "production");
  assert.equal(merged.values.TURSO_DATABASE_URL, "libsql://prod.example.turso.io");
  assert.equal(merged.values.TURSO_AUTH_TOKEN, "prod-token");
  assert.equal(merged.values.SESSION_SECRET, "prod-session-secret");
  assert.notEqual(merged.values.TURSO_AUTH_TOKEN, development.TURSO_AUTH_TOKEN);
  assert.notEqual(merged.values.SESSION_SECRET, development.SESSION_SECRET);
  assert.deepEqual(merged.unresolvedRemoteSensitive, []);
});

test("merge Production menolak marker Vercel selain production", () => {
  assert.throws(
    () => mergeProductionEnvironment({
      development,
      existing: {},
      pulled: { DATABASE_ENVIRONMENT: "development" },
      runtime: {},
    }),
    (error) => error?.code === "VERCEL_PRODUCTION_MARKER_MISMATCH",
  );
});


test("merge Production mempercayai marker explicit pull dan menolak runtime capture yang terkontaminasi Development", () => {
  const merged = mergeProductionEnvironment({
    development,
    existing: {
      DATABASE_ENVIRONMENT: "production",
      TURSO_AUTH_TOKEN: "cached-prod-token",
      SESSION_SECRET: "cached-prod-session",
    },
    pulled: {
      DATABASE_ENVIRONMENT: "production",
      TURSO_DATABASE_URL: "libsql://prod.example.turso.io",
      TURSO_AUTH_TOKEN: "[SENSITIVE]",
      SESSION_SECRET: "[SENSITIVE]",
    },
    runtime: {
      DATABASE_ENVIRONMENT: "development",
      TURSO_DATABASE_URL: "libsql://dev.example.turso.io",
      TURSO_AUTH_TOKEN: "dev-token",
      SESSION_SECRET: "dev-session-secret",
    },
  });

  assert.equal(merged.values.DATABASE_ENVIRONMENT, "production");
  assert.equal(merged.values.TURSO_DATABASE_URL, "libsql://prod.example.turso.io");
  assert.equal(merged.values.TURSO_AUTH_TOKEN, "cached-prod-token");
  assert.equal(merged.values.SESSION_SECRET, "cached-prod-session");
  assert.equal(merged.runtimeCaptureRejected, true);
  assert.notEqual(merged.values.TURSO_AUTH_TOKEN, development.TURSO_AUTH_TOKEN);
});

test("merge Production tetap menolak marker development bila explicit Production pull sendiri salah", () => {
  assert.throws(
    () => mergeProductionEnvironment({
      development,
      existing: {},
      pulled: { DATABASE_ENVIRONMENT: "development" },
      runtime: { DATABASE_ENVIRONMENT: "production" },
    }),
    (error) => error?.code === "VERCEL_PRODUCTION_MARKER_MISMATCH"
      && error?.markerSource === "production-pull",
  );
});

test("auto-sync Production menarik Vercel pull + env run dan menulis mirror concrete", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-prod-vercel-sync-"));
  await writeFile(path.join(root, ".env.local"), [
    "VITE_APP_NAME=Saldo Bersama",
    "VITE_GOOGLE_CLIENT_ID=shared-client",
    "VITE_FIREBASE_API_KEY=firebase-key",
    "VITE_FIREBASE_AUTH_DOMAIN=saldo-bersama.firebaseapp.com",
    "ALLOWED_USERS_JSON=[]",
    "ALLOWED_ORIGINS=http://localhost:5173,https://saldo-bersama.vercel.app",
    "SESSION_SECRET=dev-session-secret",
    "TURSO_DATABASE_URL=libsql://dev.example.turso.io",
    "TURSO_AUTH_TOKEN=dev-token",
    "DATABASE_ENVIRONMENT=development",
    "",
  ].join("\n"));

  const calls = [];
  const runner = async ({ args, env }) => {
    calls.push(args);
    if (args[0] === "whoami") return { code: 0, stdout: "vio", stderr: "" };
    if (args[0] === "link") {
      await writeFile(path.join(root, ".env.local"), "VERCEL_OIDC_TOKEN=temporary-link-token\n");
      return { code: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "env" && args[1] === "ls") return { code: 0, stdout: "", stderr: "" };
    if (args[0] === "env" && args[1] === "pull") {
      await writeFile(args[2], [
        "DATABASE_ENVIRONMENT=production",
        "TURSO_DATABASE_URL=libsql://prod.example.turso.io",
        "TURSO_AUTH_TOKEN=[SENSITIVE]",
        "SESSION_SECRET=[SENSITIVE]",
        "VITE_APP_NAME=Saldo Bersama",
        "VITE_GOOGLE_CLIENT_ID=shared-client",
        "VITE_FIREBASE_API_KEY=firebase-key",
        "VITE_FIREBASE_AUTH_DOMAIN=saldo-bersama.firebaseapp.com",
        "ALLOWED_USERS_JSON=[]",
        "ALLOWED_ORIGINS=https://saldo-bersama.vercel.app",
        "",
      ].join("\n"));
      return { code: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "env" && args[1] === "run") {
      await assert.rejects(readFile(path.join(root, ".env.local"), "utf8"), { code: "ENOENT" });
      await assert.rejects(readFile(path.join(root, ".env.production.local"), "utf8"), { code: "ENOENT" });
      assert.equal(env?.DATABASE_ENVIRONMENT, undefined);
      assert.equal(env?.TURSO_DATABASE_URL, undefined);
      assert.equal(env?.TURSO_AUTH_TOKEN, undefined);
      assert.equal(env?.SESSION_SECRET, undefined);
      const target = args.at(-1);
      await writeFile(target, [
        "DATABASE_ENVIRONMENT=production",
        "TURSO_DATABASE_URL=libsql://prod.example.turso.io",
        "TURSO_AUTH_TOKEN=prod-token",
        "SESSION_SECRET=prod-session-secret",
        "",
      ].join("\n"));
      return { code: 0, stdout: "", stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  };

  const result = await ensureProductionEnvironment({
    projectRoot: root,
    requiredKeys: ["DATABASE_ENVIRONMENT", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"],
    runner,
    logger: { log() {}, warn() {} },
  });

  assert.equal(result.source, "vercel-production");
  const values = parseEnvironmentText(await readFile(path.join(root, ".env.production.local"), "utf8"));
  assert.equal(values.DATABASE_ENVIRONMENT, "production");
  assert.equal(values.TURSO_DATABASE_URL, "libsql://prod.example.turso.io");
  assert.equal(values.TURSO_AUTH_TOKEN, "prod-token");
  assert.equal(values.SESSION_SECRET, "prod-session-secret");
  assert.notEqual(values.TURSO_AUTH_TOKEN, "dev-token");
  const restoredDevelopment = await readFile(path.join(root, ".env.local"), "utf8");
  assert.match(restoredDevelopment, /DATABASE_ENVIRONMENT=development/);
  assert.doesNotMatch(restoredDevelopment, /VERCEL_OIDC_TOKEN/);
  assert.equal(calls.some((args) => args[0] === "env" && args[1] === "pull" && args.includes("--environment=production")), true);
  assert.equal(calls.some((args) => args[0] === "env" && args[1] === "run" && args.includes("production")), true);
});
