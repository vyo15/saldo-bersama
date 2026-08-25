import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkProductionEnvironment, environmentIsolationStatus, environmentSharedConfigStatus } from "../../scripts/check-production-environment.mjs";
import { checkProductionRuntime, prepareTrustedProductionRuntime, productionCoreReadiness, PRODUCTION_ORIGIN, runProductionRuntime } from "../../scripts/production-runtime.mjs";
import { assertDatabaseProfileBinding, loadDatabaseProfile, resolveDatabaseProfileTarget } from "../../scripts/database-profile.mjs";
import { environmentProfileSummary, inspectEnvironmentProfiles, safeFingerprint } from "../../scripts/environment-status.mjs";
import { buildProductionProfileTemplate, ensureProductionLocalProfile, synchronizeCentralGoogleBridgeProfile } from "../../scripts/production-local-profile.mjs";
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

test("environment status menghasilkan fingerprint aman dan workstation menandai Production profile yang belum tersedia", async () => {
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



test("helper profile Production membuat skeleton sekali tanpa menyalin credential environment-specific Development", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-prod-profile-"));
  try {
    await writeFile(path.join(root, ".env.local"), [
      "VITE_APP_NAME=Saldo Bersama",
      "VITE_GOOGLE_CLIENT_ID=shared-client",
      "VITE_FIREBASE_API_KEY=shared-firebase",
      "VITE_FIREBASE_AUTH_DOMAIN=saldo-bersama.firebaseapp.com",
      "ALLOWED_USERS_JSON=[{\"email\":\"admin@example.com\",\"role\":\"administrator\"}]",
      "ALLOWED_ORIGINS=http://localhost:5173,https://saldo-bersama.vercel.app",
      "SESSION_SECRET=dev-session-secret",
      "TURSO_DATABASE_URL=libsql://saldo-bersama-dev.example.turso.io",
      "TURSO_AUTH_TOKEN=dev-token",
      "DATABASE_ENVIRONMENT=development",
      "LOG_LEVEL=info",
      "VITE_VAPID_PUBLIC_KEY=dev-public",
      "VAPID_PRIVATE_KEY=dev-private",
      "VAPID_SUBJECT=mailto:admin@example.com",
      "",
    ].join("\n"));

    const created = await ensureProductionLocalProfile({ projectRoot: root, logger: { log: () => {} } });
    assert.equal(created.created, true);
    const source = await readFile(path.join(root, ".env.production.local"), "utf8");
    assert.match(source, /VITE_GOOGLE_CLIENT_ID=shared-client/);
    assert.match(source, /DATABASE_ENVIRONMENT=production/);
    assert.match(source, /ALLOWED_ORIGINS=http:\/\/localhost:5173,https:\/\/saldo-bersama\.vercel\.app/);
    assert.doesNotMatch(source, /dev-session-secret|dev-token|saldo-bersama-dev\.example|dev-private|dev-public/);

    await writeFile(path.join(root, ".env.production.local"), "KEEP=1\n");
    const existing = await ensureProductionLocalProfile({ projectRoot: root, logger: { log: () => {} } });
    assert.equal(existing.created, false);
    assert.equal(await readFile(path.join(root, ".env.production.local"), "utf8"), "KEEP=1\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Production template hanya menyamakan config aman dan membiarkan secret per-environment kosong", () => {
  const source = buildProductionProfileTemplate({
    development: {
      VITE_APP_NAME: "Saldo Bersama",
      VITE_GOOGLE_CLIENT_ID: "shared-client",
      SESSION_SECRET: "dev-session",
      TURSO_DATABASE_URL: "libsql://dev.example.turso.io",
      TURSO_AUTH_TOKEN: "dev-token",
      VITE_VAPID_PUBLIC_KEY: "dev-public",
      VAPID_PRIVATE_KEY: "dev-private",
    },
  });
  assert.match(source, /VITE_APP_NAME=Saldo Bersama/);
  assert.match(source, /VITE_GOOGLE_CLIENT_ID=shared-client/);
  assert.match(source, /SESSION_SECRET=\n/);
  assert.match(source, /TURSO_DATABASE_URL=\n/);
  assert.match(source, /TURSO_AUTH_TOKEN=\n/);
  assert.match(source, /VITE_VAPID_PUBLIC_KEY=\n/);
  assert.match(source, /VAPID_PRIVATE_KEY=\n/);
  assert.doesNotMatch(source, /dev-session|dev\.example|dev-token|dev-public|dev-private/);
});

test("npm run prod tidak menarik/menimpa Development dan hanya memeriksa Production + isolasi", async () => {
  const calls = [];
  await prepareTrustedProductionRuntime({
    root: "/tmp/project",
    productionProfileEnsurer: async () => { calls.push("profile"); return { created: false, productionPath: "/tmp/project/.env.production.local" }; },
    centralBridgeSynchronizer: async () => { calls.push("bridge"); },
    productionEnvironmentChecker: async () => { calls.push("isolation"); },
    productionDatabaseChecker: async () => { calls.push("database"); },
  });
  assert.deepEqual(calls, ["profile", "bridge", "isolation", "database"]);
});

test("npm run prod meminta setup satu kali bila Production profile baru dibuat", async () => {
  await assert.rejects(
    prepareTrustedProductionRuntime({
      root: "/tmp/project",
      interactive: true,
      productionProfileEnsurer: async () => ({ created: true, productionPath: "/tmp/project/.env.production.local" }),
      productionEnvironmentChecker: async () => { throw new Error("should not run"); },
      productionDatabaseChecker: async () => { throw new Error("should not run"); },
    }),
    (error) => error?.code === "PRODUCTION_PROFILE_SETUP_REQUIRED",
  );
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





test("Google bridge pusat dapat diselaraskan DEV ke PROD lokal tanpa menyalin secret environment-specific", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-bridge-profile-"));
  try {
    await writeFile(path.join(root, ".env.local"), [
      "GOOGLE_BRIDGE_WEB_APP_URL=https://script.google.com/macros/s/central/exec",
      "GOOGLE_BRIDGE_SHARED_SECRET=central-bridge-secret",
      "JOBS_SHARED_SECRET=central-jobs-secret",
      "SESSION_SECRET=dev-session",
      "TURSO_DATABASE_URL=libsql://dev.example.turso.io",
      "TURSO_AUTH_TOKEN=dev-token",
      "VITE_VAPID_PUBLIC_KEY=dev-public",
      "VAPID_PRIVATE_KEY=dev-private",
      "",
    ].join("\n"));
    await writeFile(path.join(root, ".env.production.local"), [
      "DATABASE_ENVIRONMENT=production",
      "SESSION_SECRET=prod-session",
      "TURSO_DATABASE_URL=libsql://prod.example.turso.io",
      "TURSO_AUTH_TOKEN=prod-token",
      "GOOGLE_BRIDGE_WEB_APP_URL=",
      "GOOGLE_BRIDGE_SHARED_SECRET=",
      "JOBS_SHARED_SECRET=",
      "VITE_VAPID_PUBLIC_KEY=prod-public",
      "VAPID_PRIVATE_KEY=prod-private",
      "",
    ].join("\n"));

    const result = await synchronizeCentralGoogleBridgeProfile({ projectRoot: root, logger: { log: () => {} } });
    assert.equal(result.changed, true);
    const source = await readFile(path.join(root, ".env.production.local"), "utf8");
    assert.match(source, /GOOGLE_BRIDGE_WEB_APP_URL=https:\/\/script\.google\.com\/macros\/s\/central\/exec/);
    assert.match(source, /GOOGLE_BRIDGE_SHARED_SECRET=central-bridge-secret/);
    assert.match(source, /JOBS_SHARED_SECRET=central-jobs-secret/);
    assert.match(source, /SESSION_SECRET=prod-session/);
    assert.match(source, /TURSO_DATABASE_URL=libsql:\/\/prod\.example\.turso\.io/);
    assert.match(source, /VAPID_PRIVATE_KEY=prod-private/);
    assert.doesNotMatch(source, /dev-session|dev\.example|dev-token|dev-private/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Google bridge pusat fail closed bila DEV/PROD lengkap tetapi drift", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-bridge-drift-"));
  try {
    await writeFile(path.join(root, ".env.local"), [
      "GOOGLE_BRIDGE_WEB_APP_URL=https://script.google.com/macros/s/central/exec",
      "GOOGLE_BRIDGE_SHARED_SECRET=central-secret",
      "JOBS_SHARED_SECRET=central-jobs",
      "",
    ].join("\n"));
    await writeFile(path.join(root, ".env.production.local"), [
      "GOOGLE_BRIDGE_WEB_APP_URL=https://script.google.com/macros/s/other/exec",
      "GOOGLE_BRIDGE_SHARED_SECRET=other-secret",
      "JOBS_SHARED_SECRET=other-jobs",
      "",
    ].join("\n"));
    await assert.rejects(
      synchronizeCentralGoogleBridgeProfile({ projectRoot: root, logger: { log: () => {} } }),
      (error) => error?.code === "CENTRAL_GOOGLE_BRIDGE_DRIFT" && error.mismatched.length === 3,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Production core tetap usable saat hanya scheduler/integrasi optional degraded", async () => {
  const readiness = productionCoreReadiness({
    databaseStatus: "ok",
    schema: { ready: true },
    maintenanceMode: false,
    scheduler: { status: "degraded", errorCode: "INTEGRATIONS:GOOGLE_BRIDGE_NOT_CONFIGURED" },
    operations: { status: "degraded", codes: ["INTEGRATION_DEAD_LETTER"] },
  });
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.blockers, []);
  assert.deepEqual(readiness.warnings, ["INTEGRATIONS:GOOGLE_BRIDGE_NOT_CONFIGURED", "INTEGRATION_DEAD_LETTER"]);

  const blocked = productionCoreReadiness({
    databaseStatus: "ok",
    schema: { ready: true },
    maintenanceMode: false,
    scheduler: { status: "ok" },
    operations: { status: "degraded", codes: ["INTEGRITY_FAILED"] },
  });
  assert.equal(blocked.ready, false);
  assert.deepEqual(blocked.blockers, ["INTEGRITY_FAILED"]);
});

test("npm run prod membuka core Production sehat walau aggregate health scheduler masih degraded", async () => {
  let frontendChecked = 0;
  const before = console.warn;
  const beforeLog = console.log;
  console.warn = () => {};
  console.log = () => {};
  try {
    const result = await runProductionRuntime({
      root: "/tmp/project",
      open: false,
      prepare: async () => {},
      runtimeCheck: async () => { throw Object.assign(new Error("degraded"), { code: "PRODUCTION_DEGRADED" }); },
      degradationReporter: async () => ({
        databaseStatus: "ok",
        schema: { ready: true, version: 14 },
        maintenanceMode: false,
        scheduler: { status: "degraded", errorCode: "INTEGRATIONS:GOOGLE_BRIDGE_NOT_CONFIGURED" },
        operations: { status: "ok", codes: [] },
      }),
      frontendCheck: async () => { frontendChecked += 1; },
    });
    assert.equal(result.coreReady, true);
    assert.equal(result.serviceStatus, "degraded");
    assert.equal(frontendChecked, 1);
  } finally {
    console.warn = before;
    console.log = beforeLog;
  }
});

test("Production checker mewajibkan profile Development dan Production pada workstation yang sama", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "saldo-prod-check-"));
  try {
    const prodVapid = createVapidTestEnvironment();
    await writeFile(path.join(root, ".env.production.local"), [
      "VITE_APP_NAME=Saldo Bersama",
      "VITE_GOOGLE_CLIENT_ID=client",
      "VITE_FIREBASE_API_KEY=firebase",
      "VITE_FIREBASE_AUTH_DOMAIN=saldo-bersama.firebaseapp.com",
      "ALLOWED_USERS_JSON=[{\"email\":\"admin@example.com\",\"role\":\"administrator\"}]",
      "ALLOWED_ORIGINS=http://localhost:5173,https://saldo-bersama.vercel.app",
      "SESSION_SECRET=production-session-secret-at-least-32",
      "TURSO_DATABASE_URL=libsql://saldo-bersama.example.turso.io",
      "TURSO_AUTH_TOKEN=production-token",
      "DATABASE_ENVIRONMENT=production",
      "GOOGLE_OAUTH_CLIENT_SECRET=production-oauth-secret",
      `VITE_VAPID_PUBLIC_KEY=${prodVapid.VITE_VAPID_PUBLIC_KEY}`,
      `VAPID_PRIVATE_KEY=${prodVapid.VAPID_PRIVATE_KEY}`,
      `VAPID_SUBJECT=${prodVapid.VAPID_SUBJECT}`,
      "",
    ].join("\n"));

    await assert.rejects(
      checkProductionEnvironment({ cwd: root }),
      (error) => error?.code === "DEVELOPMENT_LOCAL_ENV_NOT_FOUND",
    );

    const devVapid = createVapidTestEnvironment();
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
      `VITE_VAPID_PUBLIC_KEY=${devVapid.VITE_VAPID_PUBLIC_KEY}`,
      `VAPID_PRIVATE_KEY=${devVapid.VAPID_PRIVATE_KEY}`,
      `VAPID_SUBJECT=${devVapid.VAPID_SUBJECT}`,
      "",
    ].join("\n"));

    const checked = await checkProductionEnvironment({ cwd: root });
    assert.equal(checked.developmentStatus.complete, true);
    assert.equal(checked.productionStatus.valid, true);
    assert.equal(checked.isolation.valid, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
