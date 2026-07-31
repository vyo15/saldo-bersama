import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createBaseContext, loadAllAppsScript, loadAppsScript } from "./helpers/apps-script-vm.js";

const errorFactory = (code, message, status, details) => Object.assign(new Error(message), { code, status, details });
const publicRow = (row) => Object.fromEntries(Object.entries(row || {}).filter(([key]) => key !== "__row"));

const RECOVERY_SCHEMA = Object.freeze({
  System_Config: ["key", "value", "updated_at"],
  Users: ["user_id", "firebase_uid", "email", "name", "role", "status", "row_version", "created_at", "updated_at"],
  Accounts: ["account_id"],
  Categories: ["category_id"],
  Transactions: ["transaction_id", "idempotency_key"],
  Recurring_Rules: ["recurring_rule_id"],
  Recurring_Occurrences: ["occurrence_id", "calendar_event_id"],
  Budgets: ["budget_id"],
  Envelope_Rules: ["envelope_rule_id"],
  Envelope_Periods: ["envelope_period_id"],
  Envelope_Movements: ["movement_id"],
  Savings_Goals: ["goal_id"],
  Goal_Movements: ["goal_movement_id"],
  Reconciliations: ["reconciliation_id"],
  Period_Closures: ["closure_id", "period_key", "scope", "status", "snapshot_json", "reason", "row_version", "closed_by", "closed_at", "reopened_by", "reopened_at"],
  Calendar_Sync: ["sync_id"],
  Notification_Queue: ["notification_id"],
  Push_Subscriptions: ["subscription_id"],
  Audit_Log: ["audit_id"],
  Idempotency: ["idempotency_key"],
  Backup_Log: ["backup_id"]
});


test("project Apps Script dapat boot tanpa bergantung urutan file", async () => {
  for (const reverse of [false, true]) {
    const runtime = await loadAllAppsScript(createBaseContext(), { reverse });
    assert.equal(typeof runtime.doGet, "function");
    assert.equal(typeof runtime.doPost, "function");
    assert.equal(typeof runtime.setupSaldoBersama, "function");
  }
});


test("setup memakai lock dan baru menandai ready setelah validasi schema", async () => {
  const properties = new Map();
  const calls = { initialize: 0, validate: 0, release: 0, flush: 0 };
  const scriptProperties = {
    getProperty: (key) => properties.get(key) ?? null,
    setProperty: (key, value) => properties.set(key, String(value)),
    setProperties: (values) => Object.entries(values).forEach(([key, value]) => properties.set(key, String(value))),
    deleteProperty: (key) => properties.delete(key),
  };
  const runtime = createBaseContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => "sheet-1" }), flush: () => { calls.flush += 1; } },
    PropertiesService: { getScriptProperties: () => scriptProperties },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { calls.release += 1; } }) },
    sbError_: errorFactory,
  });
  await loadAppsScript(runtime, ["Schema.gs"]);
  runtime.initializeSchema_ = () => { calls.initialize += 1; };
  runtime.validateSchema_ = () => { calls.validate += 1; return []; };

  const result = runtime.setupSaldoBersama();
  assert.equal(result.verified, true);
  assert.equal(properties.get("SPREADSHEET_ID"), "sheet-1");
  assert.equal(properties.get("SETUP_STATUS"), "ready");
  assert.ok(properties.get("SETUP_VERIFIED_AT"));
  assert.equal(properties.has("SETUP_DETAILS"), false);
  assert.deepEqual(calls, { initialize: 1, validate: 1, release: 1, flush: 1 });
});

test("setup parsial fail closed dan mencatat status failed", async () => {
  const properties = new Map();
  let released = 0;
  const scriptProperties = {
    getProperty: (key) => properties.get(key) ?? null,
    setProperty: (key, value) => properties.set(key, String(value)),
    setProperties: (values) => Object.entries(values).forEach(([key, value]) => properties.set(key, String(value))),
    deleteProperty: (key) => properties.delete(key),
  };
  const runtime = createBaseContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => "sheet-1" }), flush: () => {} },
    PropertiesService: { getScriptProperties: () => scriptProperties },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { released += 1; } }) },
    sbError_: errorFactory,
  });
  await loadAppsScript(runtime, ["Schema.gs"]);
  runtime.initializeSchema_ = () => {};
  runtime.validateSchema_ = () => ["Sheet hilang: Transactions"];

  assert.throws(() => runtime.setupSaldoBersama(), (error) => error.code === "SCHEMA_MISMATCH");
  assert.equal(properties.get("SETUP_STATUS"), "failed");
  assert.match(properties.get("SETUP_DETAILS"), /SCHEMA_MISMATCH/);
  assert.equal(released, 1);
});

const financeRuntime = async (tables) => {
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta",
    sbError_: errorFactory,
    rows_: (name) => tables[name] || [],
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    filterBy_: (name, predicate) => (tables[name] || []).filter(predicate),
    publicRow_: publicRow,
    rowVersion_: (row) => Number(row.row_version || 0),
    assertVersion_: (row, expected) => { if (Number(expected) !== Number(row.row_version || 0)) throw errorFactory("CONFLICT", "conflict", 409); },
    intAmount_: (value) => { const number = Number(value); if (!Number.isSafeInteger(number) || number <= 0) throw errorFactory("INVALID_AMOUNT", "invalid", 400); return number; },
    sanitizeText_: (value) => String(value ?? "").trim(),
    nowIso_: () => "2026-07-28T10:00:00+07:00",
    today_: () => "2026-07-28",
    uuid_: () => "uuid-1",
    appendAuditedRow_: (name, _idField, record) => { tables[name].push({ ...record, __row: tables[name].length + 2 }); },
    updateAuditedRow_: (name, current, updated) => { tables[name][current.__row - 2] = { ...updated, __row: current.__row }; },
  });
  await loadAppsScript(context, ["Security.gs", "FinanceService.gs"]);
  return context;
};

test("adjustment positif menambah saldo dan tidak ditolak insufficient balance", async () => {
  const tables = {
    Accounts: [{ __row: 2, account_id: "a1", initial_balance: 0, allow_negative: false, status: "active", owner_scope: "shared" }],
    Categories: [], Transactions: [], Period_Closures: [], Envelope_Periods: [], Envelope_Rules: [],
  };
  const runtime = await financeRuntime(tables);
  const result = runtime.createTransaction_({ actor: { user_id: "u1", role: "owner" }, payload: { transaction_type: "adjustment", transaction_date: "2026-07-28", source_account_id: "a1", amount: 100, description: "Koreksi saldo awal" }, idempotencyKey: "k1" });
  assert.equal(result.amount, 100);
  assert.equal(runtime.accountBalance_("a1"), 100);
});

test("update expense mengecualikan transaksi lama dari perhitungan envelope", async () => {
  const current = { __row: 2, transaction_id: "t1", transaction_date: "2026-07-28", transaction_type: "expense", source_account_id: "a1", destination_account_id: "", category_id: "c1", envelope_period_id: "e1", amount: 90, description: "lama", overspend_reason: "", merchant: "", payment_method: "cash", scope: "shared", owner_user_id: "u1", status: "active", row_version: 1, created_by: "u1", recurring_occurrence_id: "", goal_id: "" };
  const tables = {
    Accounts: [{ __row: 2, account_id: "a1", initial_balance: 1000, allow_negative: false, status: "active", owner_scope: "shared" }],
    Categories: [{ __row: 2, category_id: "c1", transaction_type: "expense", status: "active" }],
    Transactions: [current], Period_Closures: [],
    Envelope_Periods: [{ __row: 2, envelope_period_id: "e1", envelope_rule_id: "r1", allocated_amount: 100, reserved_amount: 0, period_start: "2026-07-01", period_end: "2026-07-31", status: "active" }],
    Envelope_Rules: [{ __row: 2, envelope_rule_id: "r1", scope: "shared" }],
  };
  const runtime = await financeRuntime(tables);
  const result = runtime.updateTransaction_({ actor: { user_id: "u1", role: "owner" }, payload: { transaction_id: "t1", amount: 80, row_version: 1 }, rowVersion: 1 });
  assert.equal(result.amount, 80);
  assert.equal(result.overspend_reason, "");
});

test("close period dapat dijalankan lagi setelah reopen dengan update row yang sama", async () => {
  const tables = { Period_Closures: [{ __row: 2, closure_id: "p1", period_key: "2026-07", status: "reopened", scope: "shared", row_version: 2, reopened_by: "u1", reopened_at: "x" }], Transactions: [] };
  const context = createBaseContext({
    SB_SCHEMA_VERSION: "1", SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory,
    rows_: (name) => tables[name] || [], publicRow_: publicRow, rowVersion_: (row) => Number(row.row_version || 0),
    integrityIssues_: () => [], compactPeriodSnapshot_: () => ({ periodKey: "2026-07" }), canonicalJson_: JSON.stringify,
    sha256Hex_: () => "hash", sanitizeText_: (value) => String(value || ""), nowIso_: () => "now",
    updateAuditedRow_: (name, current, updated) => { tables[name][current.__row - 2] = { ...updated, __row: current.__row }; },
    appendAuditedRow_: () => { throw new Error("tidak boleh insert row baru"); },
  });
  await loadAppsScript(context, ["ReportsAndIntegrations.gs"]);
  context.integrityIssues_ = () => [];
  context.compactPeriodSnapshot_ = () => ({ periodKey: "2026-07" });
  context.canonicalJson_ = JSON.stringify;
  context.sha256Hex_ = () => "hash";
  const result = context.closePeriod_({ actor: { user_id: "u1" }, payload: { period_key: "2026-07", reason: "selesai" } });
  assert.equal(result.closure_id, "p1");
  assert.equal(result.status, "closed");
  assert.equal(tables.Period_Closures.length, 1);
});

test("idempotency menolak key yang sama untuk payload berbeda", async () => {
  const records = [];
  const context = createBaseContext({ SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory, SB_SCHEMA: { Idempotency: [] } });
  await loadAppsScript(context, ["DataStore.gs"]);
  context.rows_ = () => records;
  context.deleteRowsDescending_ = () => {};
  context.idempotencyFingerprint_ = (request) => JSON.stringify(request.payload);
  records.push({ idempotency_key: "same", action: "transactions.create", actor_id: "u1", response_json: JSON.stringify({ __sb_idempotency: 1, fingerprint: JSON.stringify({ amount: 10 }), result: { id: "t1" } }), expires_at: "2099-01-01T00:00:00+07:00" });
  assert.throws(() => context.getIdempotentResult_({ idempotencyKey: "same", action: "transactions.create", actor: { user_id: "u1" }, payload: { amount: 20 } }), (error) => error.code === "IDEMPOTENCY_MISMATCH");
});

test("idempotency expired dihapus dan tidak digunakan", async () => {
  const records = [{ __row: 2, idempotency_key: "old", action: "x", actor_id: "u1", response_json: "{}", expires_at: "2020-01-01T00:00:00+07:00" }];
  const context = createBaseContext({ SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory, SB_SCHEMA: { Idempotency: [] } });
  await loadAppsScript(context, ["DataStore.gs"]);
  context.rows_ = () => records;
  context.deleteRowsDescending_ = (_name, rows) => { assert.deepEqual(rows, [2]); records.length = 0; };
  assert.equal(context.getIdempotentResult_({ idempotencyKey: "old", action: "x", actor: { user_id: "u1" }, payload: {} }), null);
});

const restoreRuntime = async ({ failPrimary = false, failRollback = false } = {}) => {
  const cache = new Map([["restore-preview:token", JSON.stringify({ actorId: "u1", fileId: "source", checksum: "source-hash" })]]);
  const maintenance = [];
  let applications = 0;
  const context = createBaseContext({
    SB_SCHEMA: RECOVERY_SCHEMA, SB_SCHEMA_VERSION: "1", SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory,
    CacheService: { getScriptCache: () => ({ get: (key) => cache.get(key) || null, remove: (key) => cache.delete(key), put: (key, value) => cache.set(key, value) }) },
    validateBackupSpreadsheet_: (fileId) => ({ issues: [], checksum: fileId === "source" ? "source-hash" : "safety-hash", schemaVersion: "1", source: {} }),
    createBackup_: () => ({ fileId: "safety", checksum: "safety-hash", fileName: "safety" }),
    applySpreadsheetSnapshot_: (fileId) => { applications += 1; if (fileId === "source" && failPrimary) throw errorFactory("APPLY_FAILED", "primary"); if (fileId === "safety" && failRollback) throw errorFactory("ROLLBACK_FAILED", "rollback"); },
    snapshotVerificationIssues_: (checksum) => ({ issues: [], checksum }),
    setRecoveryOperationState_: (_status, _safety, details) => maintenance.push({ type: "state", details }),
    clearRecoveryState_: () => maintenance.push({ type: "clear" }),
    upsertConfig_: (key, value) => maintenance.push({ key, value }),
    getSpreadsheet_: () => ({ getSheets: () => [], getId: () => "sheet-id" }),
    DriveApp: { getFileById: () => ({ setTrashed: () => {}, makeCopy: () => ({ getId: () => "copy-id", getName: () => "copy" }), getId: () => "file-id", getName: () => "file" }) },
    appendAudit_: () => {}, nowIso_: () => "now", recoveryDetails_: () => ({ recoveryRequired: true, status: "restore_recovery_required" }),
  });
  await loadAppsScript(context, ["RecoveryService.gs"]);
  // restore file defines functions with same names; override dependencies afterwards.
  context.validateBackupSpreadsheet_ = (fileId) => ({ issues: [], checksum: fileId === "source" ? "source-hash" : "safety-hash", schemaVersion: "1", source: {} });
  context.assertBackupOwner_ = () => ({ user_id: "u1", email: "owner@gmail.com", role: "owner" });
  context.createBackup_ = () => ({ fileId: "safety", checksum: "safety-hash", fileName: "safety" });
  context.createEmergencySafetySnapshot_ = () => ({ fileId: "safety", checksum: "safety-hash", fileName: "safety", raw: false });
  context.applySpreadsheetSnapshot_ = (fileId) => { applications += 1; if (fileId === "source" && failPrimary) throw errorFactory("APPLY_FAILED", "primary"); if (fileId === "safety" && failRollback) throw errorFactory("ROLLBACK_FAILED", "rollback"); };
  context.snapshotVerificationIssues_ = (checksum) => ({ issues: [], checksum });
  context.setRecoveryOperationState_ = (_status, _safety, details) => maintenance.push({ type: "state", details });
  context.clearRecoveryState_ = () => maintenance.push({ type: "clear" });
  context.upsertConfig_ = (key, value) => maintenance.push({ key, value });
  context.appendAudit_ = () => {};
  context.recoveryDetails_ = () => ({ recoveryRequired: true, status: "restore_recovery_required" });
  return { context, maintenance, applications: () => applications };
};

test("restore apply failure mencoba rollback dan baru membuka maintenance setelah rollback terverifikasi", async () => {
  const { context, maintenance, applications } = await restoreRuntime({ failPrimary: true });
  assert.throws(() => context.restoreApply_({ actor: { user_id: "u1", email: "owner@gmail.com" }, payload: { previewToken: "token", backupFileId: "source", confirmation: "RESTORE SALDO BERSAMA" }, requestId: "r1" }), (error) => error.code === "RESTORE_ROLLED_BACK");
  assert.equal(applications(), 2);
  assert.ok(maintenance.some((entry) => entry.key === "maintenance_mode" && entry.value === "false"));
});

test("restore rollback failure fail closed dan mengembalikan RECOVERY_REQUIRED", async () => {
  const { context, maintenance } = await restoreRuntime({ failPrimary: true, failRollback: true });
  assert.throws(() => context.restoreApply_({ actor: { user_id: "u1", email: "owner@gmail.com" }, payload: { previewToken: "token", backupFileId: "source", confirmation: "RESTORE SALDO BERSAMA" }, requestId: "r1" }), (error) => error.code === "RECOVERY_REQUIRED");
  assert.ok(maintenance.some((entry) => entry.type === "state"));
  assert.ok(!maintenance.some((entry) => entry.key === "maintenance_mode" && entry.value === "false"));
});

test("checksum snapshot berubah saat isi spreadsheet berubah walau ukuran sama", async () => {
  const makeSpreadsheet = (value) => ({ getSheetByName: () => ({ getLastRow: () => 2, getRange: () => ({ getValues: () => [["id"], [value]], getFormulas: () => [[""], [""]] }) }) });
  const context = createBaseContext({ SB_SCHEMA: RECOVERY_SCHEMA, SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory });
  await loadAppsScript(context, ["RecoveryService.gs"]);
  context.sha256Hex_ = (value) => value;
  context.canonicalJson_ = JSON.stringify;
  const left = context.spreadsheetSnapshotChecksum_(makeSpreadsheet("A"));
  const right = context.spreadsheetSnapshotChecksum_(makeSpreadsheet("B"));
  assert.notEqual(left, right);
});

test("strict boolean menolak string false", async () => {
  const context = createBaseContext({ SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory, SB_SCHEMA: {} });
  await loadAppsScript(context, ["DataStore.gs"]);
  assert.throws(() => context.strictBoolean_("false", "auto_debit", false), (error) => error.code === "INVALID_BOOLEAN");
  assert.equal(context.strictBoolean_(false, "auto_debit", true), false);
});

test("append audited row menghapus entity bila audit gagal", async () => {
  const records = [];
  const context = createBaseContext({ SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory, SB_SCHEMA: {} });
  await loadAppsScript(context, ["DataStore.gs"]);
  context.appendRow_ = (_name, record) => records.push({ ...record, __row: 2 });
  context.findBy_ = () => records[0] || null;
  context.deleteRow_ = (_name, rowNumber) => { assert.equal(rowNumber, 2); records.length = 0; };
  context.appendAudit_ = () => { throw errorFactory("AUDIT_FAILED", "audit"); };
  assert.throws(
    () => context.appendAuditedRow_("Accounts", "account_id", { account_id: "a1" }, { actor: { user_id: "u1" } }, "accounts.create", "account"),
    (error) => error.code === "AUDIT_WRITE_FAILED",
  );
  assert.equal(records.length, 0);
});

test("update audited row memulihkan record lama bila audit gagal", async () => {
  const records = [{ __row: 2, account_id: "a1", name: "lama" }];
  const context = createBaseContext({ SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory, SB_SCHEMA: {} });
  await loadAppsScript(context, ["DataStore.gs"]);
  context.updateRow_ = (_name, _rowNumber, record) => { records[0] = { ...record, __row: 2 }; };
  context.appendAudit_ = () => { throw errorFactory("AUDIT_FAILED", "audit"); };
  assert.throws(
    () => context.updateAuditedRow_("Accounts", records[0], { ...records[0], name: "baru" }, { actor: { user_id: "u1" } }, "accounts.update", "account", "a1"),
    (error) => error.code === "AUDIT_WRITE_FAILED",
  );
  assert.equal(records[0].name, "lama");
});

test("gagal menyimpan hasil idempotency mengunci aplikasi agar retry tidak menggandakan mutasi", async () => {
  let recoveryStatus = "";
  const context = createBaseContext({ SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory, SB_SCHEMA: {} });
  await loadAppsScript(context, ["DataStore.gs"]);
  context.rows_ = () => [];
  context.appendRow_ = () => { throw errorFactory("WRITE_FAILED", "write"); };
  context.setRecoveryRequired_ = (status) => { recoveryStatus = status; };
  context.recoveryDetails_ = () => ({ recoveryRequired: true, status: recoveryStatus });
  assert.throws(
    () => context.saveIdempotentResult_({ idempotencyKey: "k1", action: "transactions.create", actor: { user_id: "u1" }, payload: { amount: 100 } }, "t1", { transaction_id: "t1" }),
    (error) => error.code === "IDEMPOTENCY_COMMIT_REQUIRED",
  );
  assert.equal(recoveryStatus, "idempotency_commit_required");
});

test("mismatch idempotency pada preflight ditolak tanpa mutasi atau lockdown global", async () => {
  const records = [{
    idempotency_key: "same", action: "transactions.create", actor_id: "u1", expires_at: "2099-01-01T00:00:00+07:00",
    response_json: JSON.stringify({ __sb_idempotency: 1, fingerprint: "payload-lama", result: { transaction_id: "t1" } }),
  }];
  let recoveryStatus = "";
  const context = createBaseContext({ SB_TIMEZONE: "Asia/Jakarta", SB_SCHEMA: {}, sbError_: errorFactory });
  await loadAppsScript(context, ["DataStore.gs"]);
  context.rows_ = () => records;
  context.idempotencyFingerprint_ = () => "payload-baru";
  context.setRecoveryRequired_ = (status) => { recoveryStatus = status; };
  assert.throws(
    () => context.getIdempotentResult_({ idempotencyKey: "same", action: "transactions.create", actor: { user_id: "u1" }, payload: { amount: 200 } }),
    (error) => error.code === "IDEMPOTENCY_MISMATCH" && error.status === 409,
  );
  assert.equal(recoveryStatus, "");
});

test("mismatch idempotency recovery pada preflight ditolak tanpa mengubah recovery global", async () => {
  let recoveryStatus = "";
  const context = createBaseContext({ SB_TIMEZONE: "Asia/Jakarta", SB_SCHEMA: {}, sbError_: errorFactory, canonicalValue_: (value) => value });
  await loadAppsScript(context, ["DataStore.gs", "Code.gs"]);
  context.setRecoveryRequired_ = (status) => { recoveryStatus = status; };
  const first = { action: "restore.apply", actor: { user_id: "recovery:uid", email: "owner@gmail.com" }, payload: { backupFileId: "b1" }, rowVersion: null, idempotencyKey: "restore-key" };
  const mismatch = { ...first, payload: { backupFileId: "b2" } };
  context.saveRecoveryIdempotentResult_(first, { restored: true });
  assert.throws(
    () => context.getRecoveryIdempotentResult_(mismatch),
    (error) => error.code === "IDEMPOTENCY_MISMATCH" && error.status === 409,
  );
  assert.equal(recoveryStatus, "");
});

test("checksum restore mengabaikan flag recovery sementara tetapi tetap mendeteksi perubahan konfigurasi bisnis", async () => {
  const spreadsheet = (maintenance, currency) => ({
    getSheetByName(name) {
      const headers = RECOVERY_SCHEMA[name];
      const values = name === "System_Config"
        ? [headers, ["schema_version", "1", "x"], ["currency", currency, "x"], ["maintenance_mode", maintenance, "x"], ["recovery_status", "restore_applying", "x"]]
        : [headers];
      return {
        getLastRow: () => values.length,
        getRange: () => ({ getValues: () => values, getFormulas: () => values.map((row) => row.map(() => "")) }),
      };
    },
  });
  const context = createBaseContext({ SB_SCHEMA: RECOVERY_SCHEMA, SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory });
  await loadAppsScript(context, ["RecoveryService.gs"]);
  context.sha256Hex_ = (value) => value;
  context.canonicalJson_ = JSON.stringify;
  const normal = context.spreadsheetSnapshotChecksum_(spreadsheet("false", "IDR"));
  const maintenance = context.spreadsheetSnapshotChecksum_(spreadsheet("true", "IDR"));
  const changedCurrency = context.spreadsheetSnapshotChecksum_(spreadsheet("true", "USD"));
  assert.equal(normal, maintenance);
  assert.notEqual(normal, changedCurrency);
});

test("manual recovery memverifikasi owner dari safety backup, bukan sheet aktif yang mungkin rusak", async () => {
  const headers = RECOVERY_SCHEMA.Users;
  const owner = headers.map((field) => ({ user_id: "u1", email: "owner@gmail.com", role: "owner", status: "active", name: "Owner" })[field] || "");
  const spreadsheet = { getSheetByName: () => ({ getLastRow: () => 2, getRange: () => ({ getValues: () => [owner] }) }) };
  const context = createBaseContext({ SB_SCHEMA: RECOVERY_SCHEMA, SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory });
  await loadAppsScript(context, ["RecoveryService.gs"]);
  const actor = context.manualRecoveryActorFromBackup_(spreadsheet);
  assert.equal(actor.user_id, "u1");
  assert.equal(actor.role, "owner");
});

test("push HTTP 200 dengan sent nol tidak ditandai berhasil", async () => {
  const queue = [{ __row: 2, notification_id: "n1", user_id: "u1", title: "T", body: "B", target_path: "/", scheduled_at: "2026-01-01", status: "pending", attempt_count: 0 }];
  const subscriptions = [{ user_id: "u1", status: "active", endpoint: "https://push.example", p256dh: "p", auth: "a" }];
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta",
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => key === "PUSH_ENDPOINT_URL" ? "https://app.example/api/push" : "x".repeat(32) }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ data: { sent: 0, failed: 1 } }) }) },
    rows_: (name) => name === "Notification_Queue" ? queue : name === "Push_Subscriptions" ? subscriptions : name === "Users" ? [{ user_id: "owner", role: "owner", status: "active" }] : [],
    updateRow_: (_name, _row, record) => { queue[0] = { ...record, __row: 2 }; },
    nowIso_: () => "2026-07-28T10:00:00+07:00",
    uuid_: () => "nonce",
    sanitizeText_: String,
  });
  await loadAppsScript(context, ["NotificationWorker.gs"]);
  context.processNotificationQueue();
  assert.equal(queue[0].status, "pending");
  assert.equal(queue[0].attempt_count, 1);
});

test("retensi backup tidak menandai expired bila file Drive gagal dihapus", async () => {
  const backups = [{ __row: 2, backup_id: "b1", backup_type: "daily", file_id: "f1", status: "verified", created_at: "2020-01-01T00:00:00+07:00" }];
  let updates = 0;
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta",
    rows_: () => backups,
    DriveApp: { getFileById: () => ({ setTrashed: () => { throw new Error("drive"); } }) },
    updateRow_: () => { updates += 1; },
  });
  await loadAppsScript(context, ["NotificationWorker.gs"]);
  context.cleanupBackupRetention_();
  assert.equal(backups[0].status, "verified");
  assert.equal(updates, 0);
});

test("external cleanup dicatat tanpa membuka maintenance recovery database", async () => {
  const context = createBaseContext({ SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory, SB_SCHEMA: {} });
  await loadAppsScript(context, ["DataStore.gs"]);
  const cleanup = context.recordExternalCleanupRequired_("calendar_event", { eventId: "e1" });
  assert.equal(cleanup.kind, "calendar_event");
  assert.equal(context.isRecoveryRequired_(), false);
  assert.equal(context.externalCleanupRequired_().length, 1);
});

test("transaksi terhubung recurring tidak dapat diedit dari ledger umum", async () => {
  const linked = { __row: 2, transaction_id: "t1", transaction_date: "2026-07-28", transaction_type: "expense", source_account_id: "a1", amount: 10, status: "active", row_version: 1, created_by: "u1", recurring_occurrence_id: "o1" };
  const tables = { Accounts: [], Categories: [], Transactions: [linked], Period_Closures: [], Envelope_Periods: [], Envelope_Rules: [] };
  const runtime = await financeRuntime(tables);
  assert.throws(
    () => runtime.updateTransaction_({ actor: { user_id: "u1", role: "owner" }, payload: { transaction_id: "t1", amount: 20, row_version: 1 }, rowVersion: 1 }),
    (error) => error.code === "LINKED_RECURRING_TRANSACTION",
  );
});

test("reverse recurring payment membatalkan transaksi dan menghitung ulang occurrence", async () => {
  const occurrence = { __row: 2, occurrence_id: "o1", recurring_rule_id: "r1", expected_amount: 100, actual_amount: 100, transaction_ids: "t1", status: "paid", row_version: 1 };
  const transaction = { __row: 2, transaction_id: "t1", recurring_occurrence_id: "o1", transaction_date: "2026-07-20", amount: 100, status: "active", row_version: 1, created_by: "u1" };
  const tables = { Recurring_Occurrences: [occurrence], Recurring_Rules: [{ recurring_rule_id: "r1", kind: "expense", default_account_id: "a1", scope: "shared", owner_user_id: "" }], Accounts: [{ account_id: "a1", owner_scope: "shared" }], Transactions: [transaction], Period_Closures: [] };
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory,
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    rows_: (name) => tables[name] || [], publicRow_: publicRow, rowVersion_: (row) => Number(row.row_version || 0),
    assertVersion_: (row, expected) => { if (Number(expected) !== Number(row.row_version || 0)) throw errorFactory("CONFLICT", "conflict", 409); },
    assertCanModifyTransaction_: () => {}, assertPeriodOpen_: () => {}, sanitizeText_: (value) => String(value || "").trim(), nowIso_: () => "now",
    updateRow_: (name, _row, record) => { tables[name][0] = { ...record, __row: 2 }; }, appendAudit_: () => {},
    compensateOrFailClosed_: (_status, _details, compensate) => compensate(),
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  const result = context.reverseOccurrencePayment_({ actor: { user_id: "u1", role: "owner" }, payload: { occurrence_id: "o1", transaction_id: "t1", row_version: 1, reason: "salah" }, rowVersion: 1 });
  assert.equal(result.transaction.status, "cancelled");
  assert.equal(result.occurrence.actual_amount, 0);
  assert.equal(result.occurrence.status, "scheduled");
});

test("reverse goal movement membatalkan transfer dan mengurangi progress target", async () => {
  const movement = { __row: 2, goal_movement_id: "m1", goal_id: "g1", transaction_id: "t1", movement_type: "contribution", amount: 100, status: "active", created_by: "u1", created_at: "now" };
  const transaction = { __row: 2, transaction_id: "t1", goal_id: "g1", transaction_date: "2026-07-20", transaction_type: "transfer", amount: 100, status: "active", row_version: 1 };
  const tables = { Goal_Movements: [movement], Transactions: [transaction], Savings_Goals: [{ goal_id: "g1", name: "Target", account_id: "a1", scope: "shared", owner_user_id: "" }], Accounts: [{ account_id: "a1", owner_scope: "shared" }], Period_Closures: [] };
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory,
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    rows_: (name) => tables[name] || [], publicRow_: publicRow, rowVersion_: (row) => Number(row.row_version || 0),
    assertPeriodOpen_: () => {}, sanitizeText_: (value) => String(value || "").trim(), nowIso_: () => "now",
    updateRow_: (name, _row, record) => { tables[name][0] = { ...record, __row: 2 }; }, appendAudit_: () => {},
    compensateOrFailClosed_: (_status, _details, compensate) => compensate(),
    today_: () => "2026-07-29",
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  const result = context.reverseGoalMovement_({ actor: { user_id: "u1", role: "owner" }, payload: { goal_movement_id: "m1", reason: "salah" } });
  assert.equal(result.transaction.status, "cancelled");
  assert.equal(result.movement.status, "cancelled");
  assert.equal(result.goal.current_amount, 0);
});

test("restore preview tetap dapat dibuat saat sheet aktif hilang", async () => {
  const sourceSheet = { getLastRow: () => 3 };
  const currentSpreadsheet = { getSheetByName: () => null };
  const context = createBaseContext({
    SB_SCHEMA: RECOVERY_SCHEMA,
    SB_SCHEMA_VERSION: "1", SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory,
    validateBackupSpreadsheet_: () => ({ issues: [], source: { getSheetByName: () => sourceSheet }, schemaVersion: "1", checksum: "hash" }),
    assertBackupOwner_: () => ({ user_id: "u1" }), getSpreadsheet_: () => currentSpreadsheet,
    uuid_: () => "preview", CacheService: { getScriptCache: () => ({ put: () => {} }) },
  });
  await loadAppsScript(context, ["RecoveryService.gs"]);
  context.validateBackupSpreadsheet_ = () => ({ issues: [], source: { getSheetByName: () => sourceSheet }, schemaVersion: "1", checksum: "hash" });
  context.assertBackupOwner_ = () => ({ user_id: "u1" });
  context.getSpreadsheet_ = () => currentSpreadsheet;
  const result = context.backupPreview_({ actor: { user_id: "u1", email: "owner@gmail.com" }, payload: { backupFileId: "b1" } });
  assert.equal(result.summary.Transactions.currentRows, 0);
  assert.equal(result.summary.Transactions.currentSheetMissing, true);
});

test("backup restore ditolak bila email actor bukan owner aktif di backup", async () => {
  const values = [["u1", "", "owner@gmail.com", "Owner", "owner", "active", 1, "", ""]];
  const usersSheet = { getLastRow: () => 2, getRange: () => ({ getValues: () => values }) };
  const context = createBaseContext({ SB_SCHEMA: RECOVERY_SCHEMA, sbError_: errorFactory });
  await loadAppsScript(context, ["RecoveryService.gs"]);
  const spreadsheet = { getSheetByName: (name) => name === "Users" ? usersSheet : null };
  assert.equal(context.assertBackupOwner_(spreadsheet, "owner@gmail.com").user_id, "u1");
  assert.throws(() => context.assertBackupOwner_(spreadsheet, "other@gmail.com"), (error) => error.code === "BACKUP_OWNER_MISMATCH");
});

test("recovery actor hanya menerima owner bertanda tangan saat schema aktif rusak", async () => {
  const context = createBaseContext({ sanitizeText_: (value) => String(value || "") });
  await loadAppsScript(context, ["Security.gs"]);
  const actor = context.resolveRecoveryActor_({ uid: "uid-1", email: "owner@gmail.com", role: "owner", name: "Owner" }, "restore.apply");
  assert.equal(actor.role, "owner");
  assert.equal(actor.user_id, "recovery:uid-1");
  assert.throws(() => context.resolveRecoveryActor_({ uid: "uid-2", email: "member@gmail.com", role: "member" }, "restore.apply"), (error) => error.code === "FORBIDDEN");
});

test("system initialize menolak signed actor non-owner sebelum schema dibuat", async () => {
  const context = createBaseContext();
  await loadAppsScript(context, ["Security.gs"]);
  assert.doesNotThrow(() => context.assertInitializationActor_({ uid: "uid-1", email: "owner@gmail.com", role: "owner" }));
  assert.throws(
    () => context.assertInitializationActor_({ uid: "uid-2", email: "member@gmail.com", role: "member" }),
    (error) => error.code === "FORBIDDEN",
  );
});

test("idempotency restore memakai Script Properties tanpa membaca sheet rusak", async () => {
  const context = createBaseContext({ SB_TIMEZONE: "Asia/Jakarta", SB_SCHEMA: {}, sbError_: errorFactory, canonicalValue_: (value) => value });
  await loadAppsScript(context, ["DataStore.gs", "Code.gs"]);
  const request = { action: "restore.apply", actor: { user_id: "recovery:uid", email: "owner@gmail.com" }, payload: { backupFileId: "b1" }, rowVersion: null, idempotencyKey: "restore-key" };
  context.saveRecoveryIdempotentResult_(request, { restored: true });
  assert.deepEqual(context.getRecoveryIdempotentResult_(request), { restored: true });
});

test("transaksi komposit dapat ditulis tanpa audit sukses prematur", async () => {
  const tables = {
    Accounts: [{ __row: 2, account_id: "a1", initial_balance: 1000, allow_negative: false, status: "active", owner_scope: "shared" }],
    Categories: [{ __row: 2, category_id: "c1", transaction_type: "expense", status: "active" }],
    Transactions: [], Period_Closures: [], Envelope_Periods: [], Envelope_Rules: [],
  };
  let audited = 0;
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory,
    rows_: (name) => tables[name] || [], findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    filterBy_: (name, predicate) => (tables[name] || []).filter(predicate), publicRow_: publicRow,
    intAmount_: (value) => Number(value), sanitizeText_: (value) => String(value || ""), nowIso_: () => "now", uuid_: () => "t1",
    appendRow_: (name, record) => { tables[name].push({ ...record, __row: tables[name].length + 2 }); },
    appendAuditedRow_: () => { audited += 1; },
  });
  await loadAppsScript(context, ["Security.gs", "FinanceService.gs"]);
  const result = context.createTransaction_({ actor: { user_id: "u1", role: "owner" }, payload: {}, idempotencyKey: "k" }, {
    transaction_type: "expense", transaction_date: "2026-07-28", source_account_id: "a1", category_id: "c1", amount: 100,
  }, { skipAudit: true });
  assert.equal(result.transaction_id, "t1");
  assert.equal(tables.Transactions.length, 1);
  assert.equal(audited, 0);
});

test("member hanya melihat data shared dan personal miliknya di rekening serta dashboard", async () => {
  const tables = {
    Accounts: [
      { __row: 2, account_id: "shared", name: "Bersama", owner_scope: "shared", initial_balance: 100, account_type: "bank", status: "active" },
      { __row: 3, account_id: "owner-private", name: "Owner Pribadi", owner_scope: "personal", owner_user_id: "owner", initial_balance: 200, account_type: "bank", status: "active" },
      { __row: 4, account_id: "member-private", name: "Member Pribadi", owner_scope: "personal", owner_user_id: "member", initial_balance: 300, account_type: "cash", status: "active" },
    ],
    Transactions: [
      { transaction_id: "shared-income", transaction_date: "2026-07-01", transaction_type: "income", destination_account_id: "shared", amount: 50, scope: "shared", owner_user_id: "owner", status: "active", created_at: "2026-07-01T00:00:00+07:00" },
      { transaction_id: "owner-expense", transaction_date: "2026-07-02", transaction_type: "expense", source_account_id: "owner-private", amount: 20, scope: "personal", owner_user_id: "owner", status: "active", created_at: "2026-07-02T00:00:00+07:00" },
      { transaction_id: "member-expense", transaction_date: "2026-07-03", transaction_type: "expense", source_account_id: "member-private", amount: 30, scope: "personal", owner_user_id: "member", status: "active", created_at: "2026-07-03T00:00:00+07:00" },
    ],
    Envelope_Rules: [],
    Envelope_Periods: [],
    Recurring_Rules: [],
    Recurring_Occurrences: [],
    Savings_Goals: [],
    Goal_Movements: [],
  };
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta",
    rows_: (name) => tables[name] || [],
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    publicRow_: publicRow,
    getConfig_: () => "false",
    monthKey_: () => "2026-07",
    today_: () => "2026-07-29",
    nowIso_: () => "2026-07-29T12:00:00+07:00",
  });
  await loadAppsScript(context, ["Security.gs", "FinanceService.gs", "MasterDataService.gs", "PlanningService.gs", "ReportsAndIntegrations.gs"]);

  const memberContext = { actor: { user_id: "member", role: "member" }, payload: { period: "2026-07" } };
  const ownerContext = { actor: { user_id: "owner", role: "owner" }, payload: { period: "2026-07" } };
  assert.deepEqual(Array.from(context.listAccounts_(memberContext), (item) => item.account_id), ["shared", "member-private"]);
  assert.deepEqual(Array.from(context.listAccounts_(ownerContext), (item) => item.account_id), ["shared", "owner-private", "member-private"]);

  const memberDashboard = context.dashboardOverview_(memberContext);
  assert.deepEqual(Array.from(memberDashboard.accountBalances, (item) => item.account_id), ["shared", "member-private"]);
  assert.deepEqual(Array.from(memberDashboard.recentTransactions, (item) => item.transaction_id), ["member-expense", "shared-income"]);
  assert.equal(memberDashboard.totalBalance, 420);
  assert.deepEqual(JSON.parse(JSON.stringify(memberDashboard.cashFlow)), { income: 50, expense: 30, refund: 0, net: 20 });
});

test("notification gagal atau tanpa subscription dapat diantrikan ulang", async () => {
  const queue = [{ __row: 2, notification_id: "n1", user_id: "u1", dedupe_key: "due:o1:u1", status: "no_subscription", attempt_count: 0, created_at: "old" }];
  const context = createBaseContext({
    rows_: () => queue, uuid_: () => "new", nowIso_: () => "now", sanitizeText_: (value) => String(value || ""),
    updateRow_: (_name, _row, record) => { queue[0] = { ...record, __row: 2 }; }, appendRow_: () => { throw new Error("tidak boleh membuat duplikat"); },
  });
  await loadAppsScript(context, ["NotificationWorker.gs"]);
  context.enqueueNotification_("u1", "recurring_due", "T", "B", "/tagihan", "now", "due:o1:u1");
  assert.equal(queue[0].status, "pending");
  assert.equal(queue[0].notification_id, "n1");
});

test("role anggota invalid ditolak dan tidak diam-diam menjadi member", async () => {
  const context = createBaseContext({ sbError_: errorFactory, rows_: () => [], sanitizeText_: String });
  await loadAppsScript(context, ["MasterDataService.gs"]);
  assert.throws(() => context.upsertUser_({ actor: { user_id: "owner" }, payload: { email: "user@gmail.com", role: "owenr" } }), (error) => error.code === "INVALID_ROLE");
});

test("export CSV dan XLSX menetralkan formula-like text", async () => {
  const context = createBaseContext({ SB_SCHEMA: RECOVERY_SCHEMA, sbError_: errorFactory });
  await loadAppsScript(context, ["RecoveryService.gs"]);
  assert.equal(context.safeExportCell_("=SUM(A1:A2)"), "'=SUM(A1:A2)");
  assert.equal(context.safeExportCell_("@cmd"), "'@cmd");
  assert.equal(context.csvEscape_("+1+1"), '"\'+1+1"');
});

test("read recurring tidak membuat occurrence saat maintenance aktif", async () => {
  let lockRequested = false;
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta",
    sbError_: errorFactory,
    getConfig_: () => "true",
    LockService: {
      getScriptLock: () => {
        lockRequested = true;
        throw new Error("lock tidak boleh diminta saat maintenance");
      },
    },
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  assert.doesNotThrow(() => context.ensureRecurringOccurrences_("2026-07"));
  assert.equal(lockRequested, false);
});

test("member tidak melihat jadwal, budget, dan target personal pengguna lain", async () => {
  const tables = {
    Accounts: [
      { account_id: "shared", owner_scope: "shared", status: "active" },
      { account_id: "owner-account", owner_scope: "personal", owner_user_id: "owner", status: "active" },
      { account_id: "member-account", owner_scope: "personal", owner_user_id: "member", status: "active" },
    ],
    Envelope_Rules: [
      { envelope_rule_id: "shared-envelope", scope: "shared", owner_user_id: "", status: "active" },
      { envelope_rule_id: "owner-envelope", scope: "personal", owner_user_id: "owner", status: "active" },
      { envelope_rule_id: "member-envelope", scope: "personal", owner_user_id: "member", status: "active" },
    ],
    Recurring_Rules: [
      { recurring_rule_id: "shared-rule", name: "Bersama", kind: "expense", default_account_id: "shared", scope: "shared", owner_user_id: "", status: "active" },
      { recurring_rule_id: "owner-rule", name: "Owner", kind: "expense", default_account_id: "owner-account", scope: "personal", owner_user_id: "owner", status: "active" },
      { recurring_rule_id: "member-rule", name: "Member", kind: "expense", default_account_id: "member-account", scope: "personal", owner_user_id: "member", status: "active" },
    ],
    Recurring_Occurrences: [
      { occurrence_id: "shared-occ", recurring_rule_id: "shared-rule", period_key: "2026-07", due_date: "2026-07-10", status: "scheduled" },
      { occurrence_id: "owner-occ", recurring_rule_id: "owner-rule", period_key: "2026-07", due_date: "2026-07-11", status: "scheduled" },
      { occurrence_id: "member-occ", recurring_rule_id: "member-rule", period_key: "2026-07", due_date: "2026-07-12", status: "scheduled" },
    ],
    Budgets: [
      { budget_id: "shared-budget", period_key: "2026-07", category_id: "c1", envelope_rule_id: "shared-envelope", scope: "shared", owner_user_id: "", status: "active" },
      { budget_id: "owner-budget", period_key: "2026-07", category_id: "c1", envelope_rule_id: "owner-envelope", scope: "personal", owner_user_id: "owner", status: "active" },
      { budget_id: "member-budget", period_key: "2026-07", category_id: "c1", envelope_rule_id: "member-envelope", scope: "personal", owner_user_id: "member", status: "active" },
    ],
    Savings_Goals: [
      { goal_id: "shared-goal", account_id: "shared", scope: "shared", owner_user_id: "", status: "active" },
      { goal_id: "owner-goal", account_id: "owner-account", scope: "personal", owner_user_id: "owner", status: "active" },
      { goal_id: "member-goal", account_id: "member-account", scope: "personal", owner_user_id: "member", status: "active" },
    ],
    Transactions: [], Goal_Movements: [], Envelope_Periods: [], Categories: [{ category_id: "c1" }],
  };
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta",
    rows_: (name) => tables[name] || [],
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    publicRow_: publicRow,
    visibleTransactions_: () => tables.Transactions,
    monthKey_: () => "2026-07",
    today_: () => "2026-07-29",
  });
  await loadAppsScript(context, ["Security.gs", "PlanningService.gs"]);
  context.ensureRecurringOccurrences_ = () => {};
  const memberContext = { actor: { user_id: "member", role: "member" }, payload: { period: "2026-07" } };
  assert.deepEqual(Array.from(context.listRecurring_(memberContext), (item) => item.recurring_rule_id), ["shared-rule", "member-rule"]);
  assert.deepEqual(Array.from(context.listBudgets_(memberContext), (item) => item.budget_id), ["shared-budget", "member-budget"]);
  assert.deepEqual(Array.from(context.listGoals_(memberContext), (item) => item.goal_id), ["shared-goal", "member-goal"]);
});

test("transactions.list mengembalikan total sebelum pagination dan filter server", async () => {
  const transactions = Array.from({ length: 8 }, (_, index) => ({
    transaction_id: `t${index + 1}`,
    transaction_date: "2026-07-20",
    transaction_type: index % 2 ? "income" : "expense",
    description: index < 7 ? "Belanja" : "Gaji",
    merchant: "",
    category_id: "c1",
    envelope_period_id: index % 2 ? "" : "e1",
    created_at: `2026-07-20T10:00:0${index}+07:00`,
  }));
  const context = createBaseContext({
    sbError_: errorFactory,
    monthKey_: () => "2026-07",
    visibleTransactions_: () => transactions,
    rows_: (name) => name === "Categories" ? [{ category_id: "c1", name: "Harian" }] : [],
    publicRow_: publicRow,
  });
  await loadAppsScript(context, ["Router.gs"]);
  const result = context.routeAction_({ action: "transactions.list", payload: { period: "2026-07", limit: 20, offset: 2, transaction_type: "expense", allocation: "allocated", query: "belanja" } });
  assert.equal(result.total, 4);
  assert.equal(result.offset, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.hasMore, false);
});

test("request cache membaca sheet sekali dan diinvalidasi setelah write", async () => {
  let reads = 0;
  const values = [["a1", "Aktif"]];
  const sheet = {
    getLastRow: () => 2,
    getRange: () => ({
      getValues: () => { reads += 1; return values; },
      setValues: () => {},
    }),
    appendRow: () => {},
  };
  const context = createBaseContext({
    SB_SCHEMA: { Accounts: ["account_id", "name"] },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "sheet-1" }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
  });
  await loadAppsScript(context, ["DataStore.gs"]);
  assert.equal(context.rows_("Accounts")[0].account_id, "a1");
  assert.equal(context.rows_("Accounts")[0].name, "Aktif");
  assert.equal(reads, 1);
  context.appendRow_("Accounts", { account_id: "a2", name: "Baru" });
  context.rows_("Accounts");
  assert.equal(reads, 2);
});

test("transfer lintas kepemilikan ditolak dan scope transaksi diturunkan dari rekening", async () => {
  const tables = {
    Accounts: [
      { __row: 2, account_id: "shared", initial_balance: 1000, allow_negative: false, status: "active", owner_scope: "shared", owner_user_id: "" },
      { __row: 3, account_id: "personal-a", initial_balance: 1000, allow_negative: false, status: "active", owner_scope: "personal", owner_user_id: "u1" },
      { __row: 4, account_id: "personal-b", initial_balance: 1000, allow_negative: false, status: "active", owner_scope: "personal", owner_user_id: "u1" },
    ],
    Categories: [{ __row: 2, category_id: "expense", transaction_type: "expense", status: "active" }],
    Transactions: [], Period_Closures: [], Envelope_Periods: [], Envelope_Rules: [],
  };
  const runtime = await financeRuntime(tables);
  const context = { actor: { user_id: "u1", role: "owner" }, idempotencyKey: "k1" };

  assert.throws(() => runtime.createTransaction_({ ...context, payload: {
    transaction_type: "transfer", transaction_date: "2026-07-29", source_account_id: "shared", destination_account_id: "personal-a", amount: 100,
  } }), (error) => error.code === "ACCOUNT_SCOPE_MISMATCH");

  const result = runtime.createTransaction_({ ...context, payload: {
    transaction_type: "transfer", transaction_date: "2026-07-29", source_account_id: "personal-a", destination_account_id: "personal-b", amount: 100,
  } });
  assert.equal(result.scope, "personal");
  assert.equal(result.owner_user_id, "u1");

  assert.throws(() => runtime.createTransaction_({ ...context, payload: {
    transaction_type: "expense", transaction_date: "2026-07-29", source_account_id: "personal-a", category_id: "expense", amount: 100, scope: "shared",
  } }), (error) => error.code === "RESERVED_TRANSACTION_FIELD" && error.details.field === "scope");
});

test("kantong pengeluaran wajib satu kepemilikan dengan rekening transaksi", async () => {
  const tables = {
    Accounts: [{ __row: 2, account_id: "personal", initial_balance: 1000, allow_negative: false, status: "active", owner_scope: "personal", owner_user_id: "u1" }],
    Categories: [{ __row: 2, category_id: "expense", transaction_type: "expense", status: "active" }],
    Transactions: [], Period_Closures: [],
    Envelope_Periods: [{ __row: 2, envelope_period_id: "e1", envelope_rule_id: "r1", allocated_amount: 500, reserved_amount: 0, period_start: "2026-07-01", period_end: "2026-07-31", status: "active" }],
    Envelope_Rules: [{ __row: 2, envelope_rule_id: "r1", scope: "shared", owner_user_id: "", status: "active" }],
  };
  const runtime = await financeRuntime(tables);
  assert.throws(() => runtime.createTransaction_({ actor: { user_id: "u1", role: "owner" }, payload: {
    transaction_type: "expense", transaction_date: "2026-07-29", source_account_id: "personal", category_id: "expense", envelope_period_id: "e1", amount: 100,
  }, idempotencyKey: "k1" }), (error) => error.code === "ENVELOPE_SCOPE_MISMATCH");
});

test("scheduled notification tidak membocorkan jadwal atau transaksi personal", async () => {
  const notifications = [];
  const tables = {
    Users: [
      { user_id: "owner", role: "owner", status: "active" },
      { user_id: "member", role: "member", status: "active" },
    ],
    Accounts: [
      { account_id: "shared", owner_scope: "shared", owner_user_id: "", status: "active" },
      { account_id: "owner-account", owner_scope: "personal", owner_user_id: "owner", status: "active" },
      { account_id: "member-account", owner_scope: "personal", owner_user_id: "member", status: "active" },
    ],
    Recurring_Rules: [
      { recurring_rule_id: "shared-rule", default_account_id: "shared", scope: "shared", owner_user_id: "", status: "active" },
      { recurring_rule_id: "owner-rule", default_account_id: "owner-account", scope: "personal", owner_user_id: "owner", status: "active" },
      { recurring_rule_id: "member-rule", default_account_id: "member-account", scope: "personal", owner_user_id: "member", status: "active" },
    ],
    Recurring_Occurrences: [
      { occurrence_id: "shared-occ", recurring_rule_id: "shared-rule", period_key: "2026-07", due_date: "2026-07-10", status: "scheduled" },
      { occurrence_id: "owner-occ", recurring_rule_id: "owner-rule", period_key: "2026-07", due_date: "2026-07-10", status: "scheduled" },
      { occurrence_id: "member-occ", recurring_rule_id: "member-rule", period_key: "2026-07", due_date: "2026-07-10", status: "scheduled" },
    ],
    Transactions: [
      { transaction_id: "owner-unallocated", transaction_type: "expense", transaction_date: "2026-07-15", source_account_id: "owner-account", envelope_period_id: "", scope: "personal", owner_user_id: "owner", status: "active" },
    ],
    Notification_Queue: [],
  };
  const context = createBaseContext({
    rows_: (name) => tables[name] || [],
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    monthKey_: () => "2026-07",
    today_: () => "2026-07-29",
    nowIso_: () => "2026-07-29T08:00:00+07:00",
  });
  await loadAppsScript(context, ["Security.gs", "FinanceService.gs", "PlanningService.gs", "NotificationWorker.gs"]);
  context.generateRecurringOccurrencesUnlocked_ = () => 0;
  context.processNotificationQueueUnlocked_ = () => ({ processed: 0, sent: 0, failed: 0, revokedSubscriptions: 0 });
  context.enqueueNotification_ = (userId, type, _title, _body, _path, _scheduledAt, dedupeKey) => notifications.push({ userId, type, dedupeKey });

  context.scheduleDailyFinanceNotifications();

  assert.equal(notifications.some((item) => item.userId === "member" && item.dedupeKey === "due:owner-occ:member"), false);
  assert.equal(notifications.some((item) => item.userId === "member" && item.dedupeKey === "due:member-occ:member"), true);
  assert.equal(notifications.some((item) => item.userId === "member" && item.type === "unallocated"), false);
  assert.equal(notifications.some((item) => item.userId === "owner" && item.dedupeKey === "due:owner-occ:owner"), true);
  assert.equal(notifications.some((item) => item.userId === "owner" && item.type === "unallocated"), true);
});

test("sinkronisasi Calendar hanya membuat event shared", async () => {
  const created = [];
  const syncRows = [];
  const eventFactory = (title) => ({
    title,
    getId: () => `event-${created.length}`,
    setTag: () => {},
    setTitle: () => {},
    setTime: () => {},
    deleteEvent: () => {},
  });
  const calendar = {
    getEvents: () => [],
    getEventById: () => null,
    createEvent: (title) => { const event = eventFactory(title); created.push(event); return event; },
  };
  const context = createBaseContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => key === "CALENDAR_ID" ? "calendar-1" : null }) },
    CalendarApp: { getCalendarById: () => calendar },
    rows_: (name) => name === "Calendar_Sync" ? syncRows : [],
    appendRow_: (_name, record) => syncRows.push({ ...record, __row: syncRows.length + 2 }),
    updateRow_: () => {},
    appendAudit_: () => {},
    rowVersion_: () => 0,
    nowIso_: () => "2026-07-29T08:00:00+07:00",
    uuid_: () => "sync-1",
    periodKey_: () => "2026-07",
  });
  await loadAppsScript(context, ["ReportsAndIntegrations.gs"]);
  context.listRecurring_ = () => [
    { occurrence_id: "shared-occ", due_date: "2026-07-10", status: "scheduled", kind: "expense", name: "Shared", scope: "shared" },
    { occurrence_id: "personal-occ", due_date: "2026-07-11", status: "scheduled", kind: "expense", name: "Personal", scope: "personal", owner_user_id: "owner" },
  ];

  const result = context.syncCalendar_({ actor: { user_id: "owner", role: "owner" }, payload: { period: "2026-07" } });
  assert.equal(result.synced, 1);
  assert.equal(result.skippedPersonal, 1);
  assert.equal(created.length, 1);
  assert.equal(syncRows.length, 1);
});

test("migration v2 menolak kepemilikan legacy yang ambigu sebelum backup", async () => {
  const context = createBaseContext({
    SB_SCHEMA_V1: {},
    SB_SCHEMA: {},
    SB_PREVIOUS_SCHEMA_VERSION: "1",
    SB_SCHEMA_VERSION: "2",
    sbError_: errorFactory,
  });
  await loadAppsScript(context, ["Migration.gs"]);
  assert.throws(
    () => context.assertMigrationPreviewSafe_({
      recurringRules: { ambiguous: 1 },
      budgets: { ambiguous: 0 },
      goals: { ambiguous: 0 },
    }),
    (error) => error.code === "MIGRATION_OWNERSHIP_AMBIGUOUS" && error.status === 409,
  );
});

test("firebase UID pertama hanya diikat melalui bootstrap yang berjalan di jalur lock", async () => {
  const user = { __row: 2, user_id: "u1", firebase_uid: "", email: "member@gmail.com", name: "Member", role: "member", status: "active", row_version: 1 };
  let bound = false;
  const context = createBaseContext({
    sbError_: errorFactory,
    findBy_: () => user,
    publicRow_: publicRow,
    sanitizeText_: String,
    rowVersion_: (row) => Number(row.row_version || 0),
    nowIso_: () => "2026-07-29T10:00:00+07:00",
    uuid_: () => "bind-1",
    updateAuditedRow_: (_name, _current, updated) => { Object.assign(user, updated); bound = true; },
  });
  await loadAppsScript(context, ["Security.gs"]);

  assert.throws(
    () => context.resolveActor_({ uid: "firebase-u1", email: "member@gmail.com", role: "member" }, "system.health"),
    (error) => error.code === "IDENTITY_BIND_REQUIRED" && error.status === 409,
  );
  assert.equal(bound, false);

  const actor = context.resolveActor_({ uid: "firebase-u1", email: "member@gmail.com", role: "member" }, "bootstrap.get");
  assert.equal(bound, true);
  assert.equal(actor.firebase_uid, "firebase-u1");
});

// Regression tests preserved from saldo-bersama-clean(25).
test("bootstrap owner hanya tersedia ketika Users dan seluruh data bisnis masih kosong", async () => {
  const tables = { Users: [], Accounts: [], Transactions: [], Audit_Log: [], Idempotency: [] };
  const context = createBaseContext({
    SB_SCHEMA: { System_Config: [], Users: [], Accounts: [], Transactions: [], Audit_Log: [], Idempotency: [] },
    rows_: (name) => tables[name] || [],
    getConfig_: () => "",
  });
  await loadAppsScript(context, ["Security.gs"]);
  assert.equal(context.isSystemBootstrapEligible_(), true);
  tables.Transactions.push({ transaction_id: "orphan" });
  assert.equal(context.isSystemBootstrapEligible_(), false);
  tables.Transactions.length = 0;
  context.getConfig_ = (key) => key === "initialized_at" ? "2026-07-29T00:00:00+07:00" : "";
  assert.equal(context.isSystemBootstrapEligible_(), false);
});

test("duplicate idempotency yang muncul setelah mutasi tidak di-retry dan mengunci aplikasi", async () => {
  const records = [{ idempotency_key: "same" }, { idempotency_key: "same" }];
  let recoveryStatus = "";
  let sleeps = 0;
  const base = createBaseContext();
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta",
    SB_SCHEMA: {},
    sbError_: errorFactory,
    Utilities: { ...base.Utilities, sleep: () => { sleeps += 1; } },
  });
  await loadAppsScript(context, ["DataStore.gs"]);
  context.rows_ = () => records;
  context.idempotencyFingerprint_ = () => "payload";
  context.setRecoveryRequired_ = (status) => { recoveryStatus = status; };
  context.recoveryDetails_ = () => ({ recoveryRequired: true, status: recoveryStatus });
  assert.throws(
    () => context.saveIdempotentResult_({ idempotencyKey: "same", action: "transactions.create", actor: { user_id: "u1" }, payload: {} }, "t2", { transaction_id: "t2" }),
    (error) => error.code === "IDEMPOTENCY_COMMIT_REQUIRED",
  );
  assert.equal(sleeps, 0);
  assert.equal(recoveryStatus, "idempotency_commit_required");
});

test("emergency safety snapshot tidak bergantung pada schema aktif atau Backup_Log", async () => {
  const malformedSpreadsheet = { getId: () => "active-sheet" };
  const copiedFile = { getId: () => "raw-copy", getName: () => "raw-copy", setTrashed: () => {} };
  const context = createBaseContext({
    SB_SCHEMA: RECOVERY_SCHEMA,
    SB_TIMEZONE: "Asia/Jakarta",
    sbError_: errorFactory,
    getSpreadsheet_: () => malformedSpreadsheet,
    sanitizeText_: (value) => String(value || ""),
    nowIso_: () => "now", today_: () => "2026-07-31",
    Utilities: { ...createBaseContext().Utilities, formatDate: () => "20260729-120000" },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "" }) },
    DriveApp: { getFileById: () => ({ makeCopy: () => copiedFile }) },
    SpreadsheetApp: { openById: () => malformedSpreadsheet },
  });
  await loadAppsScript(context, ["RecoveryService.gs"]);
  context.getSpreadsheet_ = () => malformedSpreadsheet;
  context.rawSpreadsheetSnapshotChecksum_ = () => "raw-hash";
  const snapshot = context.createEmergencySafetySnapshot_({ actor: { user_id: "owner" } }, "pre-restore");
  assert.equal(snapshot.raw, true);
  assert.equal(snapshot.fileId, "raw-copy");
  assert.equal(snapshot.checksum, "raw-hash");
});

test("member tidak dapat membuat adjustment dan field linkage internal ditolak", async () => {
  const tables = {
    Accounts: [{ __row: 2, account_id: "a1", initial_balance: 0, allow_negative: false, status: "active", owner_scope: "shared" }],
    Categories: [], Transactions: [], Period_Closures: [], Envelope_Periods: [], Envelope_Rules: [],
  };
  const runtime = await financeRuntime(tables);
  assert.throws(
    () => runtime.createTransaction_({ actor: { user_id: "member", role: "member" }, payload: { transaction_type: "adjustment", transaction_date: "2026-07-28", source_account_id: "a1", amount: 100, description: "Koreksi" }, idempotencyKey: "k1" }),
    (error) => error.code === "ADJUSTMENT_OWNER_ONLY",
  );
  assert.throws(
    () => runtime.createTransaction_({ actor: { user_id: "u1", role: "owner" }, payload: { transaction_type: "adjustment", transaction_date: "2026-07-28", source_account_id: "a1", amount: 100, description: "Koreksi", goal_id: "g1" }, idempotencyKey: "k2" }),
    (error) => error.code === "RESERVED_TRANSACTION_FIELD" && error.details.field === "goal_id",
  );
});

test("mismatch idempotency recovery setelah restore mengunci aplikasi", async () => {
  let recoveryStatus = "";
  const context = createBaseContext({ SB_TIMEZONE: "Asia/Jakarta", SB_SCHEMA: {}, sbError_: errorFactory, canonicalValue_: (value) => value });
  await loadAppsScript(context, ["DataStore.gs", "Code.gs"]);
  context.setRecoveryRequired_ = (status) => { recoveryStatus = status; };
  context.recoveryDetails_ = () => ({ recoveryRequired: true, status: recoveryStatus });
  const first = { action: "restore.apply", actor: { user_id: "recovery:uid", email: "owner@gmail.com" }, payload: { backupFileId: "b1" }, rowVersion: null, idempotencyKey: "restore-key" };
  const mismatch = { ...first, payload: { backupFileId: "b2" } };
  context.saveRecoveryIdempotentResult_(first, { restored: true });
  assert.throws(
    () => context.saveRecoveryIdempotentResult_(mismatch, { restored: true }),
    (error) => error.code === "RECOVERY_IDEMPOTENCY_COMMIT_REQUIRED",
  );
  assert.equal(recoveryStatus, "recovery_idempotency_commit_required");
});

test("mismatch idempotency yang muncul setelah mutasi tidak di-retry dan mengunci aplikasi", async () => {
  const records = [{
    idempotency_key: "same",
    response_json: JSON.stringify({ __sb_idempotency: 1, fingerprint: "payload-lama", result: { transaction_id: "t1" } }),
  }];
  let recoveryStatus = "";
  let sleeps = 0;
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta",
    SB_SCHEMA: {},
    sbError_: errorFactory,
    Utilities: {
      ...createBaseContext().Utilities,
      sleep: () => { sleeps += 1; },
    },
  });
  await loadAppsScript(context, ["DataStore.gs"]);
  context.rows_ = () => records;
  context.idempotencyFingerprint_ = () => "payload-baru";
  context.setRecoveryRequired_ = (status) => { recoveryStatus = status; };
  context.recoveryDetails_ = () => ({ recoveryRequired: true, status: recoveryStatus });
  assert.throws(
    () => context.saveIdempotentResult_({ idempotencyKey: "same", action: "transactions.create", actor: { user_id: "u1" }, payload: { amount: 200 } }, "t2", { transaction_id: "t2" }),
    (error) => error.code === "IDEMPOTENCY_COMMIT_REQUIRED",
  );
  assert.equal(sleeps, 0);
  assert.equal(recoveryStatus, "idempotency_commit_required");
});

test("pembuatan kantong komposit menghapus rule bila period gagal", async () => {
  const rules = [];
  const context = createBaseContext({ sbError_: errorFactory });
  await loadAppsScript(context, ["PlanningService.gs"]);
  context.createEnvelopeRule_ = () => {
    const rule = { __row: 2, envelope_rule_id: "r1" };
    rules.push(rule);
    return publicRow(rule);
  };
  context.createEnvelopePeriod_ = () => { throw errorFactory("INSUFFICIENT_UNALLOCATED_FUNDS", "kurang", 409); };
  context.findBy_ = () => rules[0] || null;
  context.deleteRow_ = () => { rules.length = 0; };
  context.compensateOrFailClosed_ = (_status, _details, compensate) => compensate();
  assert.throws(
    () => context.createEnvelope_({ actor: { user_id: "u1", role: "owner" }, payload: {} }),
    (error) => error.code === "ENVELOPE_CREATE_ROLLED_BACK",
  );
  assert.equal(rules.length, 0);
});

test("progress target hari ini tidak memasukkan transfer goal bertanggal masa depan", async () => {
  const tables = {
    Accounts: [{ account_id: "a1", status: "active", owner_scope: "shared" }],
    Savings_Goals: [{ goal_id: "g1", name: "Target", account_id: "a1", status: "active" }],
    Goal_Movements: [
      { goal_movement_id: "m1", goal_id: "g1", transaction_id: "t1", movement_type: "contribution", amount: 100, status: "active", created_at: "2026-07-20" },
      { goal_movement_id: "m2", goal_id: "g1", transaction_id: "t2", movement_type: "contribution", amount: 500, status: "active", created_at: "2026-07-21" },
    ],
    Transactions: [
      { transaction_id: "t1", transaction_date: "2026-07-20", status: "active" },
      { transaction_id: "t2", transaction_date: "2026-08-01", status: "active" },
    ],
  };
  const context = createBaseContext({
    rows_: (name) => tables[name] || [],
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    publicRow_: publicRow,
    today_: () => "2026-07-29",
    canAccessAccount_: () => true,
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  const goal = context.listGoals_({ actor: { user_id: "u1", role: "owner" }, payload: {} })[0];
  assert.equal(goal.current_amount, 100);
  assert.equal(goal.last_movement_id, "m1");
});

test("read recurring tidak pernah membuat occurrence atau meminta mutation lock", async () => {
  let writes = 0;
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta",
    sbError_: errorFactory,
    rows_: () => [],
    monthKey_: () => "2026-07",
    today_: () => "2026-07-29",
    appendRow_: () => { writes += 1; },
    LockService: {
      getScriptLock: () => { throw new Error("lock tidak boleh diminta saat read"); },
    },
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  assert.deepEqual(context.listRecurring_({ actor: { user_id: "u1", role: "member" }, payload: { period: "2026-07" } }), []);
  assert.equal(writes, 0);
});

test("saldo as-of mengecualikan transaksi masa depan dan menghormati tanggal saldo awal", async () => {
  const tables = {
    Accounts: [{ __row: 2, account_id: "a1", initial_balance: 100, initial_balance_date: "2026-07-01", allow_negative: false, status: "active", owner_scope: "shared" }],
    Categories: [],
    Transactions: [
      { transaction_id: "t1", transaction_date: "2026-07-20", transaction_type: "income", destination_account_id: "a1", amount: 50, status: "active" },
      { transaction_id: "t2", transaction_date: "2026-08-01", transaction_type: "income", destination_account_id: "a1", amount: 500, status: "active" },
    ],
    Period_Closures: [], Envelope_Periods: [], Envelope_Rules: [],
  };
  const runtime = await financeRuntime(tables);
  assert.equal(runtime.accountBalanceAsOf_("a1", "2026-07-31"), 150);
  assert.equal(runtime.accountBalanceAsOf_("a1", "2026-08-01"), 650);
  assert.throws(
    () => runtime.createTransaction_({ actor: { user_id: "u1", role: "owner" }, payload: { transaction_type: "adjustment", transaction_date: "2026-06-30", source_account_id: "a1", amount: 10, description: "Koreksi" }, idempotencyKey: "k3" }),
    (error) => error.code === "TRANSACTION_BEFORE_INITIAL_BALANCE",
  );
});

test("transaksi backdated ditolak bila membuat saldo negatif pada tanggal setelahnya", async () => {
  const tables = {
    Accounts: [{ __row: 2, account_id: "a1", initial_balance: 1000, initial_balance_date: "2026-07-01", allow_negative: false, status: "active", owner_scope: "shared" }],
    Categories: [{ __row: 2, category_id: "c1", transaction_type: "expense", status: "active" }],
    Transactions: [
      { transaction_id: "later-expense", transaction_date: "2026-07-20", transaction_type: "expense", source_account_id: "a1", category_id: "c1", amount: 900, status: "active" },
    ],
    Period_Closures: [], Envelope_Periods: [], Envelope_Rules: [],
  };
  const runtime = await financeRuntime(tables);
  assert.throws(
    () => runtime.createTransaction_({ actor: { user_id: "u1", role: "owner" }, payload: { transaction_type: "expense", transaction_date: "2026-07-10", source_account_id: "a1", category_id: "c1", amount: 200, description: "Backdated" }, idempotencyKey: "k4" }),
    (error) => error.code === "INSUFFICIENT_BALANCE" && error.details.offendingDate === "2026-07-20",
  );
});


test("verifyEnvelope memberi detail clock skew aman dan menerima timestamp dalam toleransi", async () => {
  const secret = "a".repeat(64);
  const context = createBaseContext();
  context.PropertiesService.getScriptProperties().setProperty("INTERNAL_SHARED_SECRET", secret);
  await loadAppsScript(context, ["Security.gs"]);

  const sign = (message) => crypto.createHmac("sha256", secret).update(message).digest("hex");
  const expiredMessage = JSON.stringify({
    timestamp: Date.now() - 300_000,
    nonce: "expired-nonce",
    requestId: "req-clock-expired",
    action: "bootstrap.get",
    actor: { role: "owner" },
  });
  assert.throws(
    () => context.verifyEnvelope_({ message: expiredMessage, signature: sign(expiredMessage) }),
    (error) => error.code === "REQUEST_EXPIRED"
      && error.status === 401
      && Number.isFinite(error.details.serverEpochMs)
      && Number.isFinite(error.details.requestEpochMs)
      && error.details.skewMs > 120_000
      && error.details.toleranceMs === 120_000,
  );

  const acceptedMessage = JSON.stringify({
    timestamp: Date.now() - 1_000,
    nonce: "accepted-nonce",
    requestId: "req-clock-ok",
    action: "bootstrap.get",
    actor: { role: "owner" },
  });
  assert.equal(context.verifyEnvelope_({ message: acceptedMessage, signature: sign(acceptedMessage) }).requestId, "req-clock-ok");
});
