import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const loadBridge = async () => {
  const root = new URL("../../apps-script/", import.meta.url);
  const files = (await readdir(root)).filter((name) => name.endsWith(".gs")).sort();
  const properties = new Map([
    ["GOOGLE_BRIDGE_SHARED_SECRET", "s".repeat(64)],
    ["MIRROR_SPREADSHEET_ID", "mirror-id"],
    ["GOOGLE_CALENDAR_ID", "calendar-id"],
    ["BACKUP_FOLDER_ID", "backup-id"],
    ["JOBS_ENDPOINT_URL", "https://saldo-bersama.vercel.app/api/jobs"],
    ["JOBS_SHARED_SECRET", "j".repeat(64)],
  ]);
  const cache = new Map();
  const context = {
    console,
    Date,
    JSON,
    Error,
    Math,
    Utilities: {
      Charset: { UTF_8: "utf8" },
      computeHmacSha256Signature(message, secret) { return [...crypto.createHmac("sha256", secret).update(message).digest()].map((byte) => byte > 127 ? byte - 256 : byte); },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key) || "" }) },
    CacheService: { getScriptCache: () => ({ get: (key) => cache.get(key) || null, put: (key, value) => cache.set(key, value) }) },
    ScriptApp: { getProjectTriggers: () => [{ getHandlerFunction: () => "runScheduledJobs" }] },
    ContentService: { MimeType: { JSON: "application/json" }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
  };
  vm.createContext(context);
  for (const file of files) vm.runInContext(await readFile(new URL(file, root), "utf8"), context, { filename: file });
  return context;
};

test("bridge hanya mengekspos action Google integration dan tidak memiliki router finansial", async () => {
  const context = await loadBridge();
  for (const name of ["doGet", "doPost", "rebuildMirror_", "rebuildCalendar_", "storeBackup_", "readBackup_", "runScheduledJobs"]) assert.equal(typeof context[name], "function", name);
  for (const name of ["createTransaction_", "rows_", "setupSaldoBersama", "routeAction_"]) assert.equal(typeof context[name], "undefined", name);
});

test("health bridge hanya mengungkap readiness resource dan scheduler", async () => {
  const context = await loadBridge();
  const health = JSON.parse(JSON.stringify(context.integrationHealth_()));
  assert.equal(health.mirrorConfigured, true);
  assert.equal(health.calendarConfigured, true);
  assert.equal(health.backupConfigured, true);
  assert.equal(health.jobsConfigured, true);
  assert.equal(health.triggerReady, true);
  assert.match(health.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(Object.keys(health).sort(), ["backupConfigured", "calendarConfigured", "jobsConfigured", "mirrorConfigured", "timestamp", "triggerReady"]);
});

test("signature bridge menolak replay dan formula mirror dinetralkan", async () => {
  const context = await loadBridge();
  const message = JSON.stringify({ action: "integration.health", payload: {}, timestamp: Date.now(), nonce: "nonce-1" });
  const signature = crypto.createHmac("sha256", "s".repeat(64)).update(message).digest("hex");
  assert.equal(context.verifySignedBody_({ postData: { contents: JSON.stringify({ message, signature }) } }).action, "integration.health");
  assert.throws(() => context.verifySignedBody_({ postData: { contents: JSON.stringify({ message, signature }) } }), (error) => error.code === "REPLAY_DENIED");
  assert.equal(context.safeCell_("=SUM(A1:A2)"), "'=SUM(A1:A2)");
});

test("Drive backup menerima nama versioned canonical tanpa hardcode schema lama", async () => {
  const context = await loadBridge();
  const v3 = "saldo-bersama-backup-v3-20260808T061235Z-deadbeef.json.gz";
  const v6 = "saldo-bersama-backup-v6-20260808T061235Z-cafebabe.json.gz";

  assert.equal(context.safeBackupName_(v3), v3);
  assert.equal(context.safeBackupName_(v6), v6);
  assert.equal(context.backupNameDetails_(v6).schemaVersion, 6);
  assert.throws(() => context.safeBackupName_("saldo-bersama-backup-v6-anything.json.gz"), (error) => error.code === "BACKUP_NAME_INVALID");
  assert.throws(() => context.safeBackupName_("../saldo-bersama-backup-v6-20260808T061235Z-cafebabe.json.gz"), (error) => error.code === "BACKUP_NAME_INVALID");
});

test("Drive backup memakai nama deterministik, checksum, ukuran maksimal, dan reuse idempotent", async () => {
  const source = await readFile(new URL("../../apps-script/DriveBackupService.gs", import.meta.url), "utf8");
  assert.match(source, /getFilesByName\(fileName\)/);
  assert.match(source, /Saldo Bersama backup v" \+ backupName\.schemaVersion/);
  assert.match(source, /Checksum:/);
  assert.match(source, /Backup ID:/);
  assert.match(source, /20 \* 1024 \* 1024/);
  assert.match(source, /BACKUP_NAME_CONFLICT/);
  assert.doesNotMatch(source, /saldo-bersama-backup-v3-\.\*/);
});

test("status integrasi membedakan queue, hasil sukses, dan kesiapan resource Google nyata", async () => {
  const { integrationStatus } = await import("../../api/_lib/services/integrations.js");
  const previous = {
    url: process.env.GOOGLE_BRIDGE_WEB_APP_URL,
    secret: process.env.GOOGLE_BRIDGE_SHARED_SECRET,
  };
  process.env.GOOGLE_BRIDGE_WEB_APP_URL = "https://script.google.com/macros/s/example/exec";
  process.env.GOOGLE_BRIDGE_SHARED_SECRET = "g".repeat(64);
  try {
    const db = {
      all: async () => [
        { provider: "sheets", status: "pending", count: 2, last_updated_at: "2026-08-08T03:00:00.000Z", last_completed_at: null },
        { provider: "sheets", status: "failed", count: 1, last_updated_at: "2026-08-08T03:02:00.000Z", last_completed_at: null },
        { provider: "sheets", status: "dead_letter", count: 1, last_updated_at: "2026-08-08T03:03:00.000Z", last_completed_at: null },
        { provider: "sheets", status: "completed", count: 3, last_updated_at: "2026-08-08T03:04:00.000Z", last_completed_at: "2026-08-08T03:04:00.000Z" },
      ],
    };
    const fetchImpl = async () => ({
      ok: true,
      text: async () => JSON.stringify({ ok: true, data: {
        mirrorConfigured: true,
        calendarConfigured: false,
        backupConfigured: true,
        jobsConfigured: true,
        triggerReady: true,
        timestamp: "2026-08-08T03:05:00.000Z",
      } }),
    });
    const status = await integrationStatus(db, { action: "integrations.status", fetchImpl });
    assert.equal(status.bridge.configured, true);
    assert.equal(status.bridge.checked, true);
    assert.equal(status.bridge.reachable, true);
    assert.equal(status.configured.sheets, true);
    assert.equal(status.configured.calendar, false);
    assert.equal(status.configured.drive, true);
    assert.deepEqual(status.providers.sheets, {
      pending: 2,
      processing: 0,
      failed: 1,
      dead_letter: 1,
      completed: 3,
      lastUpdatedAt: "2026-08-08T03:04:00.000Z",
      lastCompletedAt: "2026-08-08T03:04:00.000Z",
      lastFailureAt: "2026-08-08T03:03:00.000Z",
    });
  } finally {
    if (previous.url === undefined) delete process.env.GOOGLE_BRIDGE_WEB_APP_URL;
    else process.env.GOOGLE_BRIDGE_WEB_APP_URL = previous.url;
    if (previous.secret === undefined) delete process.env.GOOGLE_BRIDGE_SHARED_SECRET;
    else process.env.GOOGLE_BRIDGE_SHARED_SECRET = previous.secret;
  }
});

test("status integrasi fail closed ketika health bridge tidak dapat dijangkau", async () => {
  const { integrationStatus } = await import("../../api/_lib/services/integrations.js");
  const previous = {
    url: process.env.GOOGLE_BRIDGE_WEB_APP_URL,
    secret: process.env.GOOGLE_BRIDGE_SHARED_SECRET,
  };
  process.env.GOOGLE_BRIDGE_WEB_APP_URL = "https://script.google.com/macros/s/example/exec";
  process.env.GOOGLE_BRIDGE_SHARED_SECRET = "h".repeat(64);
  try {
    const status = await integrationStatus(
      { all: async () => [] },
      { action: "integrations.status", fetchImpl: async () => { throw new Error("network unavailable"); } },
    );
    assert.equal(status.bridge.configured, true);
    assert.equal(status.bridge.checked, true);
    assert.equal(status.bridge.reachable, false);
    assert.equal(status.bridge.errorCode, "GOOGLE_BRIDGE_UNAVAILABLE");
    assert.deepEqual(status.configured, { sheets: false, calendar: false, drive: false });
  } finally {
    if (previous.url === undefined) delete process.env.GOOGLE_BRIDGE_WEB_APP_URL;
    else process.env.GOOGLE_BRIDGE_WEB_APP_URL = previous.url;
    if (previous.secret === undefined) delete process.env.GOOGLE_BRIDGE_SHARED_SECRET;
    else process.env.GOOGLE_BRIDGE_SHARED_SECRET = previous.secret;
  }
});
