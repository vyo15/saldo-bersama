import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { environmentIsolationStatus, environmentSharedConfigStatus } from "../../scripts/check-production-environment.mjs";
import { checkProductionRuntime, PRODUCTION_ORIGIN } from "../../scripts/production-runtime.mjs";
import { assertDatabaseProfileBinding, loadDatabaseProfile, resolveDatabaseProfileTarget } from "../../scripts/database-profile.mjs";
import { environmentProfileSummary, inspectEnvironmentProfiles, safeFingerprint } from "../../scripts/environment-status.mjs";
import { createVapidTestEnvironment } from "../helpers/vapid-test-keys.js";

const response = ({ status = 200, body = null, contentType = "application/json" } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (key) => key.toLowerCase() === "content-type" ? contentType : null },
  json: async () => body,
});

test("environment isolation menolak Development dan Production yang berbagi database/token/session", () => {
  const shared = environmentIsolationStatus({
    development: {
      DATABASE_ENVIRONMENT: "development",
      TURSO_DATABASE_URL: "libsql://saldo-bersama-dev.example.turso.io",
      TURSO_AUTH_TOKEN: "same-token",
      SESSION_SECRET: "same-session-secret",
    },
    production: {
      DATABASE_ENVIRONMENT: "production",
      TURSO_DATABASE_URL: "https://saldo-bersama-dev.example.turso.io",
      TURSO_AUTH_TOKEN: "same-token",
      SESSION_SECRET: "same-session-secret",
    },
  });
  assert.equal(shared.valid, false);
  assert.deepEqual(new Set(shared.issues), new Set(["DATABASE_SHARED", "DATABASE_TOKEN_SHARED", "SESSION_SECRET_SHARED"]));
});

test("environment isolation menerima profile Development/Production yang benar-benar terpisah", () => {
  const isolated = environmentIsolationStatus({
    development: {
      DATABASE_ENVIRONMENT: "development",
      TURSO_DATABASE_URL: "libsql://saldo-bersama-dev.example.turso.io",
      TURSO_AUTH_TOKEN: "dev-token",
      SESSION_SECRET: "dev-session-secret",
    },
    production: {
      DATABASE_ENVIRONMENT: "production",
      TURSO_DATABASE_URL: "libsql://saldo-bersama.example.turso.io",
      TURSO_AUTH_TOKEN: "prod-token",
      SESSION_SECRET: "prod-session-secret",
    },
  });
  assert.equal(isolated.valid, true);
  assert.deepEqual(isolated.issues, []);
});



test("environment isolation menolak pasangan VAPID yang sama setelah database Dev/Prod terpisah", () => {
  const vapid = createVapidTestEnvironment();
  const result = environmentIsolationStatus({
    development: {
      DATABASE_ENVIRONMENT: "development",
      TURSO_DATABASE_URL: "libsql://saldo-bersama-dev.example.turso.io",
      TURSO_AUTH_TOKEN: "dev-token",
      SESSION_SECRET: "dev-session",
      ...vapid,
    },
    production: {
      DATABASE_ENVIRONMENT: "production",
      TURSO_DATABASE_URL: "libsql://saldo-bersama.example.turso.io",
      TURSO_AUTH_TOKEN: "prod-token",
      SESSION_SECRET: "prod-session",
      ...vapid,
    },
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.issues, ["VAPID_KEYPAIR_SHARED"]);
});

test("shared public environment config mengabaikan urutan origin tetapi menolak drift Firebase/Google", () => {
  const aligned = environmentSharedConfigStatus({
    development: {
      VITE_APP_NAME: "Saldo Bersama",
      VITE_GOOGLE_CLIENT_ID: "client",
      VITE_FIREBASE_API_KEY: "firebase",
      VITE_FIREBASE_AUTH_DOMAIN: "saldo-bersama.firebaseapp.com",
      ALLOWED_ORIGINS: "http://localhost:5173,https://saldo-bersama.vercel.app",
    },
    production: {
      VITE_APP_NAME: "Saldo Bersama",
      VITE_GOOGLE_CLIENT_ID: "client",
      VITE_FIREBASE_API_KEY: "firebase",
      VITE_FIREBASE_AUTH_DOMAIN: "saldo-bersama.firebaseapp.com",
      ALLOWED_ORIGINS: "https://saldo-bersama.vercel.app, http://localhost:5173",
    },
  });
  assert.equal(aligned.valid, true);

  const drift = environmentSharedConfigStatus({
    development: { VITE_GOOGLE_CLIENT_ID: "client-dev", VITE_FIREBASE_AUTH_DOMAIN: "saldo-bersama.firebaseapp.com" },
    production: { VITE_GOOGLE_CLIENT_ID: "client-prod", VITE_FIREBASE_AUTH_DOMAIN: "other.firebaseapp.com" },
  });
  assert.equal(drift.valid, false);
  assert.deepEqual(drift.mismatched, ["VITE_GOOGLE_CLIENT_ID", "VITE_FIREBASE_AUTH_DOMAIN"]);
});

test("environment status hanya menghasilkan fingerprint aman dan production local bersifat opsional", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-env-status-"));
  try {
    const vapid = createVapidTestEnvironment();
    await writeFile(path.join(root, ".env.local"), [
      "VITE_APP_NAME=Saldo Bersama",
      "VITE_GOOGLE_CLIENT_ID=client",
      "VITE_FIREBASE_API_KEY=firebase",
      "VITE_FIREBASE_AUTH_DOMAIN=saldo-bersama.firebaseapp.com",
      "ALLOWED_USERS_JSON=[{\"email\":\"admin@example.com\",\"role\":\"administrator\"}]",
      "ALLOWED_ORIGINS=http://localhost:5173,https://saldo-bersama.vercel.app",
      "SESSION_SECRET=development-session-secret-at-least-32",
      "TURSO_DATABASE_URL=libsql://saldo-bersama-dev.example.turso.io",
      "TURSO_AUTH_TOKEN=development-token",
      "DATABASE_ENVIRONMENT=development",
      `VITE_VAPID_PUBLIC_KEY=${vapid.VITE_VAPID_PUBLIC_KEY}`,
      `VAPID_PRIVATE_KEY=${vapid.VAPID_PRIVATE_KEY}`,
      `VAPID_SUBJECT=${vapid.VAPID_SUBJECT}`,
      "",
    ].join("\n"));

    const inspected = await inspectEnvironmentProfiles({ cwd: root });
    assert.equal(inspected.development.exists, true);
    assert.equal(inspected.production.exists, false);
    assert.equal(inspected.developmentSummary.databaseHost, "saldo-bersama-dev.example.turso.io");
    assert.equal(inspected.developmentSummary.webPush.valid, true);
    assert.equal(inspected.developmentSummary.webPush.fingerprint, safeFingerprint(vapid.VITE_VAPID_PUBLIC_KEY));
    assert.equal(inspected.developmentSummary.webPush.fingerprint.includes(vapid.VITE_VAPID_PUBLIC_KEY), false);

    const summary = environmentProfileSummary({ values: inspected.development.values, environment: "development" });
    assert.equal(summary.valid, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("production runtime check memverifikasi health backend dan frontend shell aktual", async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(String(url));
    if (String(url).endsWith("/api/health")) return response({ body: { ok: true, data: { status: "ok" } } });
    return response({ body: null, contentType: "text/html; charset=utf-8" });
  };
  const result = await checkProductionRuntime({ fetchImpl });
  assert.equal(result.origin, PRODUCTION_ORIGIN);
  assert.deepEqual(requests, [`${PRODUCTION_ORIGIN}/api/health`, PRODUCTION_ORIGIN]);
});

test("production runtime check fail closed bila Vercel Production degraded", async () => {
  const fetchImpl = async () => response({ body: { ok: true, data: { status: "degraded" } } });
  await assert.rejects(
    checkProductionRuntime({ fetchImpl }),
    (error) => error?.code === "PRODUCTION_DEGRADED" && error?.serviceStatus === "degraded",
  );
});


test("database profile resolver default ke Development dan Production wajib eksplisit", () => {
  assert.equal(resolveDatabaseProfileTarget({ argv: [] }), "development");
  assert.equal(resolveDatabaseProfileTarget({ argv: ["production"] }), "production");
  assert.throws(
    () => resolveDatabaseProfileTarget({ argv: ["staging"] }),
    (error) => error?.code === "DATABASE_PROFILE_INVALID",
  );
});

test("database profile loader memilih file terpisah dan menimpa shell env stale", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-db-profile-"));
  const before = {
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
    DATABASE_ENVIRONMENT: process.env.DATABASE_ENVIRONMENT,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  };
  try {
    await writeFile(path.join(root, ".env.local"), [
      "TURSO_DATABASE_URL=libsql://saldo-bersama-dev.example.turso.io",
      "TURSO_AUTH_TOKEN=dev-token",
      "DATABASE_ENVIRONMENT=development",
      "",
    ].join("\n"));
    await writeFile(path.join(root, ".env.production.local"), [
      "TURSO_DATABASE_URL=libsql://saldo-bersama.example.turso.io",
      "TURSO_AUTH_TOKEN=prod-token",
      "DATABASE_ENVIRONMENT=production",
      "",
    ].join("\n"));
    process.env.TURSO_DATABASE_URL = "libsql://stale.example.turso.io";
    process.env.DATABASE_ENVIRONMENT = "production";

    const development = await loadDatabaseProfile({ root, environment: "development" });
    assert.equal(development.fileName, ".env.local");
    assert.equal(process.env.TURSO_DATABASE_URL, "libsql://saldo-bersama-dev.example.turso.io");
    assert.equal(process.env.DATABASE_ENVIRONMENT, "development");
    assert.equal(process.env.VERCEL_ENV, "development");

    const production = await loadDatabaseProfile({ root, environment: "production" });
    assert.equal(production.fileName, ".env.production.local");
    assert.equal(process.env.TURSO_DATABASE_URL, "libsql://saldo-bersama.example.turso.io");
    assert.equal(process.env.DATABASE_ENVIRONMENT, "production");
    assert.equal(process.env.VERCEL_ENV, "production");
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("database mutation preflight menolak profile yang menunjuk database environment lain", async () => {
  const database = { one: async () => ({ value: "development" }) };
  await assert.rejects(
    assertDatabaseProfileBinding({ database, environment: "production" }),
    (error) => error?.code === "DATABASE_ENVIRONMENT_REBIND_DENIED" && error?.current === "development",
  );
  assert.deepEqual(
    await assertDatabaseProfileBinding({ database, environment: "development" }),
    { environment: "development", binding: "development" },
  );
});
