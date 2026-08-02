import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const loadBridge = async () => {
  const root = new URL("../../apps-script/", import.meta.url);
  const files = (await readdir(root)).filter((name) => name.endsWith(".gs")).sort();
  const properties = new Map([["GOOGLE_BRIDGE_SHARED_SECRET", "s".repeat(64)]]);
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

test("signature bridge menolak replay dan formula mirror dinetralkan", async () => {
  const context = await loadBridge();
  const message = JSON.stringify({ action: "integration.health", payload: {}, timestamp: Date.now(), nonce: "nonce-1" });
  const signature = crypto.createHmac("sha256", "s".repeat(64)).update(message).digest("hex");
  assert.equal(context.verifySignedBody_({ postData: { contents: JSON.stringify({ message, signature }) } }).action, "integration.health");
  assert.throws(() => context.verifySignedBody_({ postData: { contents: JSON.stringify({ message, signature }) } }), (error) => error.code === "REPLAY_DENIED");
  assert.equal(context.safeCell_("=SUM(A1:A2)"), "'=SUM(A1:A2)");
});

test("Drive backup memakai nama deterministik, checksum, ukuran maksimal, dan reuse idempotent", async () => {
  const source = await readFile(new URL("../../apps-script/DriveBackupService.gs", import.meta.url), "utf8");
  assert.match(source, /getFilesByName\(fileName\)/);
  assert.match(source, /Checksum:/);
  assert.match(source, /Backup ID:/);
  assert.match(source, /20 \* 1024 \* 1024/);
  assert.match(source, /BACKUP_NAME_CONFLICT/);
});
