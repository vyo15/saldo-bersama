import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

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
  const healthState = { mirror: true, calendar: true, backup: true };
  const managedMetadata = {
    getRange: () => ({
      getValues: () => [
        ["source_of_truth", "Turso"],
        ["mode", "read-only mirror"],
        ["generated_at", "2026-08-08T00:00:00.000Z"],
        ["schema_version", 10],
        ["warning", "managed"],
      ],
    }),
  };
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
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => properties.get(key) || "",
        setProperty: (key, value) => properties.set(key, String(value)),
      }),
    },
    CacheService: { getScriptCache: () => ({ get: (key) => cache.get(key) || null, put: (key, value) => cache.set(key, value) }) },
    ScriptApp: { getProjectTriggers: () => [{ getHandlerFunction: () => "runScheduledJobs" }] },
    SpreadsheetApp: {
      openById: () => {
        if (!healthState.mirror) throw new Error("mirror unavailable");
        return {
          getId: () => "mirror-id",
          getSheetByName: (name) => name === "_Mirror_Metadata" ? managedMetadata : null,
          getSheets: () => [],
        };
      },
      flush() {},
    },
    CalendarApp: { getCalendarById: () => healthState.calendar ? { getId: () => "calendar-id" } : null },
    DriveApp: {
      getFolderById: () => {
        if (!healthState.backup) throw new Error("backup unavailable");
        return { getId: () => "backup-id" };
      },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: "application/json" }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) },
  };
  context.__properties = properties;
  context.__healthState = healthState;
  vm.createContext(context);
  for (const file of files) vm.runInContext(await readFile(new URL(file, root), "utf8"), context, { filename: file });
  return context;
};
test("bridge hanya mengekspos action Google integration dan tidak memiliki router finansial", async () => {
  const context = await loadBridge();
  for (const name of ["doGet", "doPost", "rebuildMirror_", "rebuildCalendar_", "storeBackup_", "readBackup_", "runScheduledJobs"]) assert.equal(typeof context[name], "function", name);
  for (const name of ["createTransaction_", "rows_", "setupSaldoBersama", "routeAction_"]) assert.equal(typeof context[name], "undefined", name);
});

test("health bridge memverifikasi akses resource nyata dan konfigurasi scheduler tanpa membocorkan ID", async () => {
  const context = await loadBridge();
  const ready = JSON.parse(JSON.stringify(context.integrationHealth_()));
  assert.equal(ready.mirrorConfigured, true);
  assert.equal(ready.calendarConfigured, true);
  assert.equal(ready.backupConfigured, true);
  assert.equal(ready.jobsConfigured, true);
  assert.equal(ready.triggerReady, true);
  assert.match(ready.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(Object.keys(ready).sort(), ["backupConfigured", "calendarConfigured", "jobsConfigured", "mirrorConfigured", "timestamp", "triggerReady"]);

  context.__healthState.mirror = false;
  context.__healthState.calendar = false;
  context.__healthState.backup = false;
  context.__properties.set("JOBS_ENDPOINT_URL", "[https://invalid](https://invalid)");
  context.__properties.set("JOBS_SHARED_SECRET", "short");
  const unavailable = JSON.parse(JSON.stringify(context.integrationHealth_()));
  assert.equal(unavailable.mirrorConfigured, false);
  assert.equal(unavailable.calendarConfigured, false);
  assert.equal(unavailable.backupConfigured, false);
  assert.equal(unavailable.jobsConfigured, false);
  assert.equal(unavailable.triggerReady, true);
  assert.deepEqual(Object.keys(unavailable).sort(), ["backupConfigured", "calendarConfigured", "jobsConfigured", "mirrorConfigured", "timestamp", "triggerReady"]);
});

test("signature bridge menolak replay dan formula mirror dinetralkan", async () => {
  const context = await loadBridge();
  const message = JSON.stringify({ action: "integration.health", payload: {}, timestamp: Date.now(), nonce: "nonce-1" });
  const signature = crypto.createHmac("sha256", "s".repeat(64)).update(message).digest("hex");
  assert.equal(context.verifySignedBody_({ postData: { contents: JSON.stringify({ message, signature }) } }).action, "integration.health");
  assert.throws(() => context.verifySignedBody_({ postData: { contents: JSON.stringify({ message, signature }) } }), (error) => error.code === "REPLAY_DENIED");
  assert.equal(context.safeCell_("=SUM(A1:A2)"), "'=SUM(A1:A2)");
});

test("mirror metadata memakai schema canonical dari backend dan menolak versi invalid", async () => {
  const context = await loadBridge();
  assert.equal(context.mirrorSchemaVersion_({ schemaVersion: 9 }), 9);
  assert.throws(() => context.mirrorSchemaVersion_({ schemaVersion: 0 }), (error) => error.code === "MIRROR_SCHEMA_INVALID");
  assert.throws(() => context.mirrorSchemaVersion_({ schemaVersion: "9" }), (error) => error.code === "MIRROR_SCHEMA_INVALID");

  const mirrorSource = await readFile(new URL("../../apps-script/MirrorService.gs", import.meta.url), "utf8");
  const jobsSource = await readFile(new URL("../../api/jobs.js", import.meta.url), "utf8");
  assert.match(jobsSource, /schemaVersion:\s*DATABASE_SCHEMA_VERSION/);
  assert.match(jobsSource, /assignee_user_id/);
  assert.match(jobsSource, /assignee_name/);
  assert.match(jobsSource, /Administrator/);
  assert.match(jobsSource, /Member/);
  assert.match(mirrorSource, /\["schema_version",\s*schemaVersion\]/);
  assert.doesNotMatch(mirrorSource, /\["schema_version",\s*3\]/);
});


test("mirror hanya mengadopsi spreadsheet kosong atau target yang memiliki metadata canonical dan membersihkan Sheet1 kosong", async () => {
  const context = await loadBridge();
  const blankSheet = { getLastRow: () => 0, getLastColumn: () => 0 };
  const nonEmptySheet = { getLastRow: () => 2, getLastColumn: () => 2 };
  const blankSpreadsheet = { getSheetByName: () => null, getSheets: () => [blankSheet] };
  assert.equal(context.mirrorTargetState_(blankSpreadsheet), "blank");

  const metadata = {
    getRange: () => ({
      getValues: () => [
        ["source_of_truth", "Turso"],
        ["mode", "read-only mirror"],
        ["generated_at", "2026-08-08T00:00:00.000Z"],
        ["schema_version", 10],
        ["warning", "managed"],
      ],
    }),
  };
  const managedSpreadsheet = { getSheetByName: (name) => name === "_Mirror_Metadata" ? metadata : null, getSheets: () => [nonEmptySheet] };
  assert.equal(context.mirrorTargetState_(managedSpreadsheet), "managed");

  const unsafeSpreadsheet = { getSheetByName: () => null, getSheets: () => [nonEmptySheet] };
  assert.throws(() => context.mirrorTargetState_(unsafeSpreadsheet), (error) => error.code === "MIRROR_TARGET_UNSAFE");

  let deleted = null;
  const cleanupSpreadsheet = {
    getSheetByName: (name) => name === "Sheet1" ? blankSheet : null,
    getSheets: () => [blankSheet, nonEmptySheet],
    deleteSheet: (sheet) => { deleted = sheet; },
  };
  assert.equal(context.cleanupDefaultMirrorSheet_(cleanupSpreadsheet), true);
  assert.equal(deleted, blankSheet);

  const mirrorSource = await readFile(new URL("../../apps-script/MirrorService.gs", import.meta.url), "utf8");
  assert.ok(mirrorSource.indexOf("writeMirrorMetadata_(spreadsheet, payload, schemaVersion);") < mirrorSource.indexOf("SB_MIRROR_SHEETS.forEach"));
  assert.match(mirrorSource, /cleanupDefaultMirrorSheet_\(spreadsheet\)/);
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
    const providerRows = [
      { provider: "sheets", status: "pending", count: 2, last_updated_at: "2026-08-08T03:00:00.000Z", last_completed_at: null },
      { provider: "sheets", status: "completed", count: 3, last_updated_at: "2026-08-08T03:04:00.000Z", last_completed_at: "2026-08-08T03:04:00.000Z" },
      { provider: "sheets", status: "failed", count: 1, last_updated_at: "2026-08-08T03:06:00.000Z", last_completed_at: null },
      { provider: "sheets", status: "dead_letter", count: 1, last_updated_at: "2026-08-08T03:07:00.000Z", last_completed_at: null },
    ];
    const backupRows = [{
      backup_id: "backup-latest", backup_type: "manual", external_file_id: "drive-file", file_name: "backup-latest.json.gz",
      schema_version: 10, status: "verified", created_at: "2026-08-08T03:02:00.000Z", verified_at: "2026-08-08T03:03:00.000Z", error_code: null,
    }];
    const db = { batch: async () => [{ rows: providerRows }, { rows: backupRows }] };
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
      lastUpdatedAt: "2026-08-08T03:07:00.000Z",
      lastCompletedAt: "2026-08-08T03:04:00.000Z",
      lastFailureAt: "2026-08-08T03:07:00.000Z",
    });
    assert.deepEqual(status.driveBackup, {
      backupId: "backup-latest", backupType: "manual", fileId: "drive-file", fileName: "backup-latest.json.gz",
      schemaVersion: 10, status: "verified", createdAt: "2026-08-08T03:02:00.000Z", verifiedAt: "2026-08-08T03:03:00.000Z", errorCode: null,
    });
  } finally {
    if (previous.url === undefined) delete process.env.GOOGLE_BRIDGE_WEB_APP_URL;
    else process.env.GOOGLE_BRIDGE_WEB_APP_URL = previous.url;
    if (previous.secret === undefined) delete process.env.GOOGLE_BRIDGE_SHARED_SECRET;
    else process.env.GOOGLE_BRIDGE_SHARED_SECRET = previous.secret;
  }
});


test("full snapshot sukses menyupersede failed dan dead_letter lama tanpa menghapus histori outbox", async () => {
  const { integrationStatus } = await import("../../api/_lib/services/integrations.js");
  const db = await createSqliteTestDatabase();
  const previous = {
    url: process.env.GOOGLE_BRIDGE_WEB_APP_URL,
    secret: process.env.GOOGLE_BRIDGE_SHARED_SECRET,
  };
  delete process.env.GOOGLE_BRIDGE_WEB_APP_URL;
  delete process.env.GOOGLE_BRIDGE_SHARED_SECRET;
  const insert = async ({ id, eventType, entityType, entityId, status, updatedAt, completedAt = null }) => {
    await db.execute(`INSERT INTO integration_outbox(
      outbox_id,provider,event_type,entity_type,entity_id,event_key,payload_json,status,attempt_count,next_attempt_at,locked_at,locked_by,
      last_error_code,last_error_message,created_at,updated_at,completed_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      id, "sheets", eventType, entityType, entityId, `sheets:${eventType}:${entityType}:${entityId}`, "{}", status,
      status === "dead_letter" ? 5 : 1, updatedAt, null, null,
      status === "completed" ? "" : "BRIDGE_ERROR", status === "completed" ? "" : "Integrasi Google gagal.",
      updatedAt, updatedAt, completedAt,
    ]);
  };
  try {
    await insert({ id: "old-failed", eventType: "upsert", entityType: "account", entityId: "a1", status: "failed", updatedAt: "2026-08-08T03:00:00.000Z" });
    await insert({ id: "old-dead", eventType: "upsert", entityType: "category", entityId: "c1", status: "dead_letter", updatedAt: "2026-08-08T03:01:00.000Z" });
    await insert({ id: "full-sync", eventType: "sync", entityType: "system", entityId: "mirror", status: "completed", updatedAt: "2026-08-08T03:05:00.000Z", completedAt: "2026-08-08T03:05:00.000Z" });

    const reconciled = await integrationStatus(db);
    assert.equal(reconciled.providers.sheets.failed, 0);
    assert.equal(reconciled.providers.sheets.dead_letter, 0);
    assert.equal(reconciled.providers.sheets.completed, 1);
    assert.equal(await db.one("SELECT COUNT(*) AS count FROM integration_outbox WHERE status='dead_letter'").then((row) => Number(row.count)), 1);

    await insert({ id: "new-failed", eventType: "rebuild", entityType: "system", entityId: "mirror", status: "failed", updatedAt: "2026-08-08T03:06:00.000Z" });
    const activeFailure = await integrationStatus(db);
    assert.equal(activeFailure.providers.sheets.failed, 1);
    assert.equal(activeFailure.providers.sheets.dead_letter, 0);
    assert.equal(activeFailure.providers.sheets.lastFailureAt, "2026-08-08T03:06:00.000Z");
  } finally {
    db.close();
    if (previous.url === undefined) delete process.env.GOOGLE_BRIDGE_WEB_APP_URL;
    else process.env.GOOGLE_BRIDGE_WEB_APP_URL = previous.url;
    if (previous.secret === undefined) delete process.env.GOOGLE_BRIDGE_SHARED_SECRET;
    else process.env.GOOGLE_BRIDGE_SHARED_SECRET = previous.secret;
  }
});

test("status tanpa health probe tidak menganggap provider Google siap hanya dari environment", async () => {
  const { presentIntegrationStatus } = await import("../../api/_lib/services/integrations.js");
  const previous = { url: process.env.GOOGLE_BRIDGE_WEB_APP_URL, secret: process.env.GOOGLE_BRIDGE_SHARED_SECRET };
  process.env.GOOGLE_BRIDGE_WEB_APP_URL = "https://script.google.com/macros/s/example/exec";
  process.env.GOOGLE_BRIDGE_SHARED_SECRET = "i".repeat(64);
  try {
    const status = await presentIntegrationStatus([], null, []);
    assert.equal(status.bridge.configured, true);
    assert.equal(status.bridge.checked, false);
    assert.deepEqual(status.configured, { sheets: false, calendar: false, drive: false });
  } finally {
    if (previous.url === undefined) delete process.env.GOOGLE_BRIDGE_WEB_APP_URL; else process.env.GOOGLE_BRIDGE_WEB_APP_URL = previous.url;
    if (previous.secret === undefined) delete process.env.GOOGLE_BRIDGE_SHARED_SECRET; else process.env.GOOGLE_BRIDGE_SHARED_SECRET = previous.secret;
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



test("bridge memulihkan MESSAGE_EXPIRED sekali memakai clock offset liveness deployment", async () => {
  const { callGoogleBridge } = await import("../../api/_lib/services/integrations.js");
  const previous = {
    url: process.env.GOOGLE_BRIDGE_WEB_APP_URL,
    secret: process.env.GOOGLE_BRIDGE_SHARED_SECRET,
  };
  process.env.GOOGLE_BRIDGE_WEB_APP_URL = "https://script.google.com/macros/s/example/exec";
  process.env.GOOGLE_BRIDGE_SHARED_SECRET = "c".repeat(64);
  const remoteOffsetMs = 5 * 60_000;
  let postCount = 0;
  let getCount = 0;
  const fetchImpl = async (_url, options = {}) => {
    if (options.method === "GET") {
      getCount += 1;
      return {
        ok: true,
        text: async () => JSON.stringify({
          ok: true,
          service: "saldo-bersama-google-bridge",
          version: 3,
          timestamp: new Date(Date.now() + remoteOffsetMs).toISOString(),
        }),
      };
    }
    postCount += 1;
    const request = JSON.parse(options.body);
    const message = JSON.parse(request.message);
    const expired = Math.abs((Date.now() + remoteOffsetMs) - Number(message.timestamp || 0)) > 120_000;
    return {
      ok: true,
      text: async () => JSON.stringify(expired
        ? { ok: false, error: { code: "MESSAGE_EXPIRED", message: "Pesan bridge kedaluwarsa.", status: 401 } }
        : { ok: true, data: { backupConfigured: true } }),
    };
  };
  try {
    const result = await callGoogleBridge("integration.health", {}, { fetchImpl });
    assert.equal(result.backupConfigured, true);
    assert.equal(postCount, 2);
    assert.equal(getCount, 1);
  } finally {
    if (previous.url === undefined) delete process.env.GOOGLE_BRIDGE_WEB_APP_URL;
    else process.env.GOOGLE_BRIDGE_WEB_APP_URL = previous.url;
    if (previous.secret === undefined) delete process.env.GOOGLE_BRIDGE_SHARED_SECRET;
    else process.env.GOOGLE_BRIDGE_SHARED_SECRET = previous.secret;
  }
});

test("health status membawa diagnosis deployment tanpa membocorkan URL atau secret", async () => {
  const { integrationStatus } = await import("../../api/_lib/services/integrations.js");
  const previous = {
    url: process.env.GOOGLE_BRIDGE_WEB_APP_URL,
    secret: process.env.GOOGLE_BRIDGE_SHARED_SECRET,
  };
  process.env.GOOGLE_BRIDGE_WEB_APP_URL = "https://script.google.com/macros/s/example/exec";
  process.env.GOOGLE_BRIDGE_SHARED_SECRET = "d".repeat(64);
  const fetchImpl = async (_url, options = {}) => {
    if (options.method === "GET") {
      return {
        ok: true,
        text: async () => JSON.stringify({ ok: true, service: "saldo-bersama-google-bridge", version: 2, timestamp: new Date().toISOString() }),
      };
    }
    return {
      ok: true,
      text: async () => JSON.stringify({ ok: false, error: { code: "UNKNOWN_ACTION", message: "Action bridge tidak dikenali.", status: 404 } }),
    };
  };
  try {
    const status = await integrationStatus({ all: async () => [] }, { action: "integrations.status", fetchImpl });
    assert.equal(status.bridge.reachable, false);
    assert.equal(status.bridge.errorCode, "UNKNOWN_ACTION");
    assert.equal(status.bridge.liveness.errorCode, "GOOGLE_BRIDGE_DEPLOYMENT_STALE");
    assert.equal(status.bridge.liveness.version, 2);
    assert.equal(JSON.stringify(status).includes("script.google.com"), false);
    assert.equal(JSON.stringify(status).includes("d".repeat(64)), false);
  } finally {
    if (previous.url === undefined) delete process.env.GOOGLE_BRIDGE_WEB_APP_URL;
    else process.env.GOOGLE_BRIDGE_WEB_APP_URL = previous.url;
    if (previous.secret === undefined) delete process.env.GOOGLE_BRIDGE_SHARED_SECRET;
    else process.env.GOOGLE_BRIDGE_SHARED_SECRET = previous.secret;
  }
});

test("Calendar memakai ScriptLock dan self-heal event managed duplikat berdasarkan entityId", async () => {
  const context = await loadBridge();
  const makeEvent = (entityId) => {
    const tags = new Map([["saldo_bersama_managed", "true"], ["saldo_bersama_entity_id", entityId]]);
    return {
      deleted: false,
      title: "lama",
      getTag: (key) => tags.get(key) || "",
      setTag: (key, value) => tags.set(key, value),
      setTitle(value) { this.title = value; },
      setTime() {},
      setDescription() {},
      deleteEvent() { this.deleted = true; },
    };
  };
  const canonical = makeEvent("occurrence-1");
  const duplicate = makeEvent("occurrence-1");
  const stale = makeEvent("stale-occurrence");
  const blank = makeEvent("");
  const created = [];
  const calendar = {
    getEvents: () => [canonical, duplicate, stale, blank],
    createEvent: (title) => {
      const event = makeEvent("");
      event.title = title;
      created.push(event);
      return event;
    },
  };
  let released = false;
  context.CalendarApp = { getCalendarById: () => calendar };
  context.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { released = true; } }) };

  const result = JSON.parse(JSON.stringify(context.rebuildCalendar_({ items: [
    { entityId: "occurrence-1", date: "2026-08-07", title: "Pembayaran rumah", description: "Reminder" },
    { entityId: "occurrence-2", date: "2026-08-08", title: "Internet", description: "Reminder" },
  ] })));

  assert.equal(result.updated, 1);
  assert.equal(result.created, 1);
  assert.equal(result.removed, 3);
  assert.equal(canonical.title, "Pembayaran rumah");
  assert.equal(duplicate.deleted, true);
  assert.equal(stale.deleted, true);
  assert.equal(blank.deleted, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].getTag("saldo_bersama_entity_id"), "occurrence-2");
  assert.equal(released, true);

  context.LockService = { getScriptLock: () => ({ tryLock: () => false, releaseLock() {} }) };
  assert.throws(() => context.rebuildCalendar_({ items: [] }), (error) => error.code === "CALENDAR_BUSY");
});
