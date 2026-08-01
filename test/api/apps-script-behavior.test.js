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
  let uuidSequence = 0;
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
    uuid_: () => `uuid-${++uuidSequence}`,
    appendRow_: (name, record) => {
      if (!tables[name]) tables[name] = [];
      const stored = { ...record, __row: tables[name].length + 2 };
      tables[name].push(stored);
      return record;
    },
    updateRow_: (name, rowNumber, updated) => {
      const index = Number(rowNumber) - 2;
      tables[name][index] = { ...updated, __row: rowNumber };
      return updated;
    },
    deleteRow_: (name, rowNumber) => { tables[name].splice(Number(rowNumber) - 2, 1); },
    appendAudit_: () => {},
    compensateOrFailClosed_: (_status, _details, compensate) => compensate(),
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
  context.today_ = () => "2026-08-01";
  context.monthKey_ = () => "2026-08";
  context.periodEndDate_ = () => "2026-07-31";
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
    assertCanModifyTransaction_: () => {}, assertTransactionDateUnlocked_: () => {}, sanitizeText_: (value) => String(value || "").trim(), nowIso_: () => "now",
    updateRow_: (name, _row, record) => { tables[name][0] = { ...record, __row: 2 }; }, appendAudit_: () => {},
    compensateOrFailClosed_: (_status, _details, compensate) => compensate(),
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  const result = context.reverseOccurrencePayment_({ actor: { user_id: "u1", role: "owner" }, payload: { occurrence_id: "o1", transaction_id: "t1", row_version: 1, reason: "salah" }, rowVersion: 1 });
  assert.equal(result.transaction.status, "cancelled");
  assert.equal(result.occurrence.actual_amount, 0);
  assert.equal(result.occurrence.status, "scheduled");
});

test("reverse recurring pemasukan tanpa transaksi tersisa kembali menjadi expected", async () => {
  const occurrence = { __row: 2, occurrence_id: "o-income", recurring_rule_id: "r-income", expected_amount: 500, actual_amount: 500, transaction_ids: "t-income", status: "received", row_version: 1 };
  const transaction = { __row: 2, transaction_id: "t-income", recurring_occurrence_id: "o-income", transaction_date: "2026-07-20", amount: 500, status: "active", row_version: 1, created_by: "u1" };
  const tables = { Recurring_Occurrences: [occurrence], Recurring_Rules: [{ recurring_rule_id: "r-income", kind: "income", default_account_id: "a1", scope: "shared", owner_user_id: "" }], Accounts: [{ account_id: "a1", owner_scope: "shared" }], Transactions: [transaction], Period_Closures: [] };
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory,
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    rows_: (name) => tables[name] || [], publicRow_: publicRow, rowVersion_: (row) => Number(row.row_version || 0),
    assertVersion_: (row, expected) => { if (Number(expected) !== Number(row.row_version || 0)) throw errorFactory("CONFLICT", "conflict", 409); },
    assertCanModifyTransaction_: () => {}, assertTransactionDateUnlocked_: () => {}, sanitizeText_: (value) => String(value || "").trim(), nowIso_: () => "now",
    updateRow_: (name, _row, record) => { tables[name][0] = { ...record, __row: 2 }; }, appendAudit_: () => {},
    compensateOrFailClosed_: (_status, _details, compensate) => compensate(),
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  const result = context.reverseOccurrencePayment_({ actor: { user_id: "u1", role: "owner" }, payload: { occurrence_id: "o-income", transaction_id: "t-income", row_version: 1, reason: "salah" }, rowVersion: 1 });
  assert.equal(result.transaction.status, "cancelled");
  assert.equal(result.occurrence.actual_amount, 0);
  assert.equal(result.occurrence.status, "expected");
});

test("reverse goal movement membatalkan transfer dan mengurangi progress target", async () => {
  const movement = { __row: 2, goal_movement_id: "m1", goal_id: "g1", transaction_id: "t1", movement_type: "contribution", amount: 100, status: "active", created_by: "u1", created_at: "now" };
  const transaction = { __row: 2, transaction_id: "t1", goal_id: "g1", transaction_date: "2026-07-20", transaction_type: "transfer", amount: 100, status: "active", row_version: 1 };
  const tables = { Goal_Movements: [movement], Transactions: [transaction], Savings_Goals: [{ goal_id: "g1", name: "Target", account_id: "a1", scope: "shared", owner_user_id: "" }], Accounts: [{ account_id: "a1", owner_scope: "shared" }], Period_Closures: [] };
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory,
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    rows_: (name) => tables[name] || [], publicRow_: publicRow, rowVersion_: (row) => Number(row.row_version || 0),
    assertTransactionDateUnlocked_: () => {}, sanitizeText_: (value) => String(value || "").trim(), nowIso_: () => "now",
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
    requestCache_: () => ({ readModels: {} }),
  });
  await loadAppsScript(context, ["Security.gs", "FinanceService.gs", "ReadModel.gs", "MasterDataService.gs", "PlanningService.gs", "ReportsAndIntegrations.gs"]);

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
  context.buildTransactionReadModel_ = () => ({ transactions: [], activeTransactions: [], transactionsByPeriod: { "2026-07": [] }, activeTransactionsByPeriod: { "2026-07": [] }, transactionById: {} });
  context.periodCutoffDate_ = () => "2026-07-29";
  context.isTransactionDateLocked_ = () => false;
  context.goalMovementReadModelAsOf_ = () => ({ totals: {}, latestByGoal: {} });
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
  context.buildTransactionReadModel_ = () => ({ transactionsByPeriod: { "2026-07": transactions } });
  context.transactionCapabilities_ = () => ({ can_edit: true, can_cancel: true });
  context.isTransactionDateLocked_ = () => false;
  const result = context.routeAction_({ action: "transactions.list", payload: { period: "2026-07", limit: 20, offset: 2, transaction_type: "expense", allocation: "allocated", query: "belanja" } });
  assert.equal(result.total, 4);
  assert.equal(result.offset, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.hasMore, false);
});

test("read model mempertahankan transaksi cancelled untuk ledger tetapi mengecualikannya dari agregasi", async () => {
  const tables = {
    Accounts: [{ account_id: "a1", owner_scope: "shared", owner_user_id: "", status: "active" }],
    Transactions: [
      { transaction_id: "active", transaction_date: "2026-07-20", transaction_type: "expense", source_account_id: "a1", amount: 100, status: "active", scope: "shared", owner_user_id: "" },
      { transaction_id: "cancelled", transaction_date: "2026-07-21", transaction_type: "expense", source_account_id: "a1", amount: 50, status: "cancelled", scope: "shared", owner_user_id: "" },
    ],
  };
  const context = createBaseContext({
    rows_: (name) => tables[name] || [],
    canAccessOwnedScope_: () => true,
    canAccessAccount_: () => true,
    requestCache_: () => ({ readModels: {} }),
  });
  await loadAppsScript(context, ["ReadModel.gs"]);
  const model = context.buildTransactionReadModel_({ actor: { user_id: "owner", role: "owner" } });
  assert.deepEqual(Array.from(model.transactionsByPeriod["2026-07"], (item) => item.transaction_id), ["active", "cancelled"]);
  assert.deepEqual(Array.from(model.activeTransactionsByPeriod["2026-07"], (item) => item.transaction_id), ["active"]);
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

test("pembacaan sheet menormalkan sel Date menjadi tanggal dan timestamp Jakarta", async () => {
  const sheet = {
    getLastRow: () => 2,
    getRange: () => ({
      getValues: () => [[new Date("2026-07-31T05:00:00.000Z"), new Date("2026-07-31T06:02:03.000Z")]],
      setValues: () => {},
    }),
  };
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta",
    SB_SCHEMA: { Transactions: ["transaction_date", "created_at"] },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "sheet-1" }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) },
  });
  await loadAppsScript(context, ["DataStore.gs"]);
  const row = context.rows_("Transactions")[0];
  assert.equal(row.transaction_date, "2026-07-31");
  assert.match(row.created_at, /^2026-07-31T/);
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
    (error) => error.code === "INSUFFICIENT_UNALLOCATED_FUNDS" && error.status === 409,
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
    monthKey_: () => "2026-07",
    periodKey_: (value) => value || "2026-07",
    canAccessAccount_: () => true,
    isTransactionDateLocked_: () => false,
  });
  await loadAppsScript(context, ["ReadModel.gs", "PlanningService.gs"]);
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
    periodCutoffDate_: () => "2026-07-29",
    isTransactionDateLocked_: () => false,
    buildTransactionReadModel_: () => ({ transactions: [], activeTransactions: [], transactionsByPeriod: { "2026-07": [] }, transactionById: {} }),
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

test("schema read cache hanya menyimpan hasil valid dan dapat diinvalidasi", async () => {
  const context = createBaseContext();
  context.PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", "sheet-cache-test");
  await loadAppsScript(context, ["Schema.gs"]);
  let scans = 0;
  context.validateSchema_ = () => { scans += 1; return []; };
  assert.deepEqual(Array.from(context.validateSchemaCached_()), []);
  assert.deepEqual(Array.from(context.validateSchemaCached_()), []);
  assert.equal(scans, 1);
  context.invalidateSchemaValidationCache_();
  assert.deepEqual(Array.from(context.validateSchemaCached_()), []);
  assert.equal(scans, 2);

  context.invalidateSchemaValidationCache_();
  context.validateSchema_ = () => { scans += 1; return ["rusak"]; };
  assert.deepEqual(Array.from(context.validateSchemaCached_()), ["rusak"]);
  assert.deepEqual(Array.from(context.validateSchemaCached_()), ["rusak"]);
  assert.equal(scans, 4, "hasil schema rusak tidak boleh dicache");

  context.CacheService.getScriptCache = () => { throw new Error("cache unavailable"); };
  context.validateSchema_ = () => { scans += 1; return []; };
  assert.deepEqual(Array.from(context.validateSchemaCached_()), []);
  assert.equal(scans, 5, "kegagalan cache tidak boleh menggagalkan validasi schema utama");
});

test("bootstrap.get tetap melalui mutation lock karena dapat mengikat UID pertama", async () => {
  const context = createBaseContext();
  await loadAppsScript(context, ["Code.gs"]);
  assert.equal(context.isMutatingAction_("bootstrap.get"), true);
  assert.equal(context.isMutatingAction_("app.initialState"), false);
});

test("initial state memakai satu snapshot transaksi untuk bootstrap dan dashboard", async () => {
  const context = createBaseContext();
  await loadAppsScript(context, ["Router.gs"]);
  const transactions = [{ transaction_id: "t1" }];
  const model = { transactions, transactionsByPeriod: { "2026-07": transactions } };
  const categories = [{ category_id: "c1", status: "active" }];
  const accounts = [{ account_id: "a1", status: "active" }];
  let accountCalls = 0;
  context.periodKey_ = () => "2026-07";
  context.periodCutoffDate_ = () => "2026-07-31";
  context.buildTransactionReadModel_ = () => model;
  context.rows_ = (name) => name === "Categories" ? categories : [];
  context.listAccounts_ = (_requestContext, snapshot) => {
    accountCalls += 1;
    assert.equal(snapshot, model);
    return accounts;
  };
  context.bootstrapData_ = (_requestContext, snapshots) => ({ accounts: snapshots.accounts, categories: snapshots.categories });
  context.dashboardOverview_ = (_requestContext, snapshots) => ({ transactionCount: snapshots.model.transactions.length });
  const result = context.appInitialState_({ actor: { role: "owner" }, payload: {} });
  assert.equal(accountCalls, 1);
  assert.deepEqual(result.bootstrap.accounts, accounts);
  assert.equal(result.overview.transactionCount, 1);
});

test("composite envelope membuat rule dan period dengan satu audit final", async () => {
  const tables = { Accounts: [{ __row: 2, account_id: "a1", owner_scope: "shared", owner_user_id: "", status: "active" }], Envelope_Rules: [], Envelope_Periods: [], Transactions: [] };
  const audits = [];
  let sequence = 0;
  const context = createBaseContext({
    sbError_: errorFactory,
    rows_: (name) => tables[name] || [],
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    appendRow_: (name, record) => { const row = { ...record, __row: (tables[name] || []).length + 2 }; (tables[name] ||= []).push(row); return row; },
    deleteRow_: (name, rowNumber) => { const index = (tables[name] || []).findIndex((row) => row.__row === rowNumber); if (index >= 0) tables[name].splice(index, 1); },
    appendAudit_: (_request, action, entityType, entityId, before, after) => audits.push({ action, entityType, entityId, before, after }),
    compensateOrFailClosed_: (_reason, _details, compensate) => compensate(),
    activeAccount_: (id) => tables.Accounts.find((row) => row.account_id === id),
    assertAccountAccess_: () => {},
    normalizeOwnedScope_: () => ({ scope: "shared", owner_user_id: "" }),
    ownedScopeFromAccount_: () => ({ scope: "shared", owner_user_id: "" }),
    intAmount_: (value) => { const amount = Number(value); if (!Number.isSafeInteger(amount) || amount <= 0) throw errorFactory("INVALID_AMOUNT", "invalid", 400); return amount; },
    validateDate_: (value) => String(value),
    periodCutoffDate_: () => "2026-07-31",
    assertPeriodRangeOpen_: () => {},
    visibleTransactions_: () => [],
    envelopeUsage_: (record) => ({ ...publicRow(record), used_amount: 0, remaining_amount: Number(record.allocated_amount || 0) - Number(record.reserved_amount || 0) }),
    nowIso_: () => "2026-07-01T10:00:00+07:00",
    uuid_: () => `id-${++sequence}`,
    publicRow_: publicRow,
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  context.allocationAvailability_ = () => ({ availableBalance: 1_000_000, allocatedRemaining: 0, unallocatedAmount: 1_000_000 });
  context.compensateOrFailClosed_ = (_reason, _details, compensate) => compensate();
  const result = context.createEnvelope_({ actor: { user_id: "owner", role: "owner" }, payload: { name: "Belanja", source_account_id: "a1", period_type: "monthly", default_amount: 100_000, allocated_amount: 100_000, period_start: "2026-07-01", period_end: "2026-07-31", rollover_policy: "unallocated", overspend_policy: "confirm" } });
  assert.equal(tables.Envelope_Rules.length, 1);
  assert.equal(tables.Envelope_Periods.length, 1);
  assert.equal(result.period.envelope_rule_id, result.rule.envelope_rule_id);
  assert.deepEqual(audits.map((entry) => entry.action), ["envelopes.create"]);
});

test("composite envelope menghapus seluruh row saat audit final gagal", async () => {
  const tables = { Accounts: [{ __row: 2, account_id: "a1", owner_scope: "shared", owner_user_id: "", status: "active" }], Envelope_Rules: [], Envelope_Periods: [], Transactions: [] };
  let sequence = 0;
  const context = createBaseContext({
    sbError_: errorFactory,
    rows_: (name) => tables[name] || [],
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    appendRow_: (name, record) => { const row = { ...record, __row: (tables[name] || []).length + 2 }; (tables[name] ||= []).push(row); return row; },
    deleteRow_: (name, rowNumber) => { const index = (tables[name] || []).findIndex((row) => row.__row === rowNumber); if (index >= 0) tables[name].splice(index, 1); },
    appendAudit_: () => { throw errorFactory("AUDIT_FAILED", "audit", 503); },
    activeAccount_: (id) => tables.Accounts.find((row) => row.account_id === id),
    assertAccountAccess_: () => {}, normalizeOwnedScope_: () => ({ scope: "shared", owner_user_id: "" }), ownedScopeFromAccount_: () => ({ scope: "shared", owner_user_id: "" }),
    intAmount_: (value) => Number(value), validateDate_: String, periodCutoffDate_: () => "2026-07-31", assertPeriodRangeOpen_: () => {}, visibleTransactions_: () => [],
    envelopeUsage_: (record) => ({ ...publicRow(record), used_amount: 0, remaining_amount: Number(record.allocated_amount || 0) }),
    nowIso_: () => "now", uuid_: () => `id-${++sequence}`, publicRow_: publicRow,
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  context.allocationAvailability_ = () => ({ availableBalance: 1_000_000, allocatedRemaining: 0, unallocatedAmount: 1_000_000 });
  context.compensateOrFailClosed_ = (_reason, _details, compensate) => compensate();
  assert.throws(() => context.createEnvelope_({ actor: { user_id: "owner", role: "owner" }, payload: { name: "Belanja", source_account_id: "a1", default_amount: 100_000, period_start: "2026-07-01", period_end: "2026-07-31" } }), (error) => error.code === "ENVELOPE_CREATE_ROLLED_BACK");
  assert.equal(tables.Envelope_Rules.length, 0);
  assert.equal(tables.Envelope_Periods.length, 0);
});


const envelopeCloseRuntime = async (tables, { failAudit = false } = {}) => {
  let sequence = 0;
  const audits = [];
  const normalizeRows = (name) => {
    (tables[name] ||= []).forEach((row, index) => { row.__row = index + 2; });
  };
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta",
    sbError_: errorFactory,
    rows_: (name) => (tables[name] || []).map((row) => ({ ...row })),
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    appendRow_: (name, record) => {
      const stored = { ...record, __row: (tables[name] || []).length + 2 };
      (tables[name] ||= []).push(stored);
      return record;
    },
    updateRow_: (name, rowNumber, record) => {
      const index = (tables[name] || []).findIndex((row) => Number(row.__row) === Number(rowNumber));
      if (index < 0) throw new Error(`row ${name}:${rowNumber} tidak ditemukan`);
      tables[name][index] = { ...record, __row: Number(rowNumber) };
      return record;
    },
    deleteRow_: (name, rowNumber) => {
      const index = (tables[name] || []).findIndex((row) => Number(row.__row) === Number(rowNumber));
      if (index >= 0) tables[name].splice(index, 1);
      normalizeRows(name);
    },
    rowVersion_: (row) => Number(row.row_version || 0),
    assertVersion_: (row, expected) => {
      if (Number(expected) !== Number(row.row_version || 0)) throw errorFactory("CONFLICT", "conflict", 409);
    },
    validateDate_: (value) => String(value),
    intAmount_: (value) => {
      const amount = Number(value);
      if (!Number.isSafeInteger(amount) || amount <= 0) throw errorFactory("INVALID_AMOUNT", "invalid", 400);
      return amount;
    },
    periodCutoffDate_: (period) => `${period}-28`,
    assertPeriodRangeOpen_: () => {},
    visibleTransactions_: () => tables.Transactions || [],
    envelopeUsage_: (record, transactions) => {
      const used = (transactions || []).filter((row) => row.status === "active" && row.transaction_type === "expense" && row.envelope_period_id === record.envelope_period_id)
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
      return { ...publicRow(record), used_amount: used, remaining_amount: Number(record.allocated_amount || 0) - Number(record.reserved_amount || 0) - used };
    },
    nowIso_: () => "2026-08-01T10:00:00+07:00",
    uuid_: () => `env-${++sequence}`,
    publicRow_: publicRow,
    appendAudit_: (_request, action, entityType, entityId, before, after) => {
      if (failAudit) throw errorFactory("AUDIT_FAILED", "audit", 503);
      audits.push({ action, entityType, entityId, before, after });
    },
    compensateOrFailClosed_: (_reason, _details, compensate) => compensate(),
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  context.allocationAvailability_ = () => ({ availableBalance: 1_000_000, allocatedRemaining: 0, unallocatedAmount: 1_000_000 });
  context.compensateOrFailClosed_ = (_reason, _details, compensate) => compensate();
  return { context, audits };
};

test("rollover carry menutup periode, memindahkan sisa, dan membuat periode berikutnya tanpa arus kas palsu", async () => {
  const tables = {
    Envelope_Rules: [{ __row: 2, envelope_rule_id: "r1", name: "Belanja", period_type: "monthly", scope: "shared", owner_user_id: "", source_account_id: "", rollover_policy: "carry", status: "active" }],
    Envelope_Periods: [{ __row: 2, envelope_period_id: "p1", envelope_rule_id: "r1", name: "Belanja", period_start: "2026-07-01", period_end: "2026-07-31", allocated_amount: 100, reserved_amount: 0, status: "active", row_version: 1 }],
    Envelope_Movements: [],
    Transactions: [{ transaction_id: "t1", transaction_type: "expense", transaction_date: "2026-07-10", envelope_period_id: "p1", amount: 20, status: "active", scope: "shared", owner_user_id: "" }],
  };
  const { context, audits } = await envelopeCloseRuntime(tables);
  const result = context.closeEnvelope_({ actor: { user_id: "owner", role: "owner" }, payload: { envelope_period_id: "p1", row_version: 1 }, rowVersion: 1 });
  assert.equal(tables.Envelope_Periods[0].status, "closed");
  assert.equal(tables.Envelope_Periods.length, 2);
  assert.equal(tables.Envelope_Periods[1].period_start, "2026-08-01");
  assert.equal(tables.Envelope_Periods[1].period_end, "2026-08-31");
  assert.equal(tables.Envelope_Periods[1].allocated_amount, 80);
  assert.equal(tables.Envelope_Movements.length, 1);
  assert.equal(tables.Envelope_Movements[0].movement_type, "rollover");
  assert.equal(tables.Envelope_Movements[0].amount, 80);
  assert.equal(result.rollover.amount, 80);
  assert.deepEqual(audits.map((entry) => entry.action), ["envelopes.close"]);
});

test("rollover carry menambah periode berikutnya yang sudah ada tanpa membuat periode duplikat", async () => {
  const tables = {
    Envelope_Rules: [{ __row: 2, envelope_rule_id: "r1", name: "Belanja", period_type: "monthly", scope: "shared", owner_user_id: "", source_account_id: "", rollover_policy: "carry", status: "active" }],
    Envelope_Periods: [
      { __row: 2, envelope_period_id: "p1", envelope_rule_id: "r1", name: "Belanja", period_start: "2026-07-01", period_end: "2026-07-31", allocated_amount: 100, reserved_amount: 0, status: "active", row_version: 1 },
      { __row: 3, envelope_period_id: "p2", envelope_rule_id: "r1", name: "Belanja", period_start: "2026-08-01", period_end: "2026-08-31", allocated_amount: 200, reserved_amount: 0, status: "active", row_version: 1 },
    ],
    Envelope_Movements: [], Transactions: [],
  };
  const { context } = await envelopeCloseRuntime(tables);
  context.closeEnvelope_({ actor: { user_id: "owner", role: "owner" }, payload: { envelope_period_id: "p1", row_version: 1 }, rowVersion: 1 });
  assert.equal(tables.Envelope_Periods.length, 2);
  assert.equal(tables.Envelope_Periods.find((row) => row.envelope_period_id === "p2").allocated_amount, 300);
  assert.equal(tables.Envelope_Periods.find((row) => row.envelope_period_id === "p2").row_version, 2);
});

test("rollover bertujuan yang belum memiliki target ditolak sebelum mutasi", async () => {
  const tables = {
    Envelope_Rules: [{ __row: 2, envelope_rule_id: "r1", name: "Belanja", period_type: "monthly", scope: "shared", owner_user_id: "", source_account_id: "", rollover_policy: "savings", status: "active" }],
    Envelope_Periods: [{ __row: 2, envelope_period_id: "p1", envelope_rule_id: "r1", name: "Belanja", period_start: "2026-07-01", period_end: "2026-07-31", allocated_amount: 100, reserved_amount: 0, status: "active", row_version: 1 }],
    Envelope_Movements: [], Transactions: [],
  };
  const { context, audits } = await envelopeCloseRuntime(tables);
  assert.throws(() => context.closeEnvelope_({ actor: { user_id: "owner", role: "owner" }, payload: { envelope_period_id: "p1", row_version: 1 }, rowVersion: 1 }), (error) => error.code === "ROLLOVER_DESTINATION_REQUIRED");
  assert.equal(tables.Envelope_Periods[0].status, "active");
  assert.equal(tables.Envelope_Movements.length, 0);
  assert.equal(audits.length, 0);
});

test("kegagalan audit penutupan rollover memulihkan periode dan menghapus mutasi sementara", async () => {
  const tables = {
    Envelope_Rules: [{ __row: 2, envelope_rule_id: "r1", name: "Belanja", period_type: "monthly", scope: "shared", owner_user_id: "", source_account_id: "", rollover_policy: "carry", status: "active" }],
    Envelope_Periods: [{ __row: 2, envelope_period_id: "p1", envelope_rule_id: "r1", name: "Belanja", period_start: "2026-07-01", period_end: "2026-07-31", allocated_amount: 100, reserved_amount: 0, status: "active", row_version: 1 }],
    Envelope_Movements: [], Transactions: [],
  };
  const { context } = await envelopeCloseRuntime(tables, { failAudit: true });
  assert.throws(() => context.closeEnvelope_({ actor: { user_id: "owner", role: "owner" }, payload: { envelope_period_id: "p1", row_version: 1 }, rowVersion: 1 }), (error) => error.code === "ENVELOPE_CLOSE_ROLLED_BACK");
  assert.equal(tables.Envelope_Periods.length, 1);
  assert.equal(tables.Envelope_Periods[0].envelope_period_id, "p1");
  assert.equal(tables.Envelope_Periods[0].status, "active");
  assert.equal(tables.Envelope_Periods[0].row_version, 1);
  assert.equal(tables.Envelope_Movements.length, 0);
});

test("transaksi dari periode tertutup tidak dapat dipindahkan ke periode terbuka", async () => {
  const current = { __row: 2, transaction_id: "t1", transaction_date: "2026-07-31", transaction_type: "expense", source_account_id: "a1", destination_account_id: "", category_id: "c1", envelope_period_id: "", amount: 10, description: "lama", overspend_reason: "", merchant: "", payment_method: "cash", scope: "shared", owner_user_id: "", status: "active", row_version: 1, created_by: "owner", recurring_occurrence_id: "", goal_id: "" };
  const tables = {
    Accounts: [{ __row: 2, account_id: "a1", initial_balance: 1000, initial_balance_date: "2026-01-01", allow_negative: false, status: "active", owner_scope: "shared" }],
    Categories: [{ __row: 2, category_id: "c1", transaction_type: "expense", status: "active" }],
    Transactions: [current], Envelope_Periods: [], Envelope_Rules: [],
    Period_Closures: [{ __row: 2, closure_id: "p1", period_key: "2026-07", scope: "shared", status: "closed", row_version: 1 }],
  };
  const runtime = await financeRuntime(tables);
  assert.throws(() => runtime.updateTransaction_({ actor: { user_id: "owner", role: "owner" }, payload: { transaction_id: "t1", transaction_date: "2026-08-01", row_version: 1 }, rowVersion: 1 }), (error) => error.code === "PERIOD_CLOSED");
  assert.equal(tables.Transactions[0].transaction_date, "2026-07-31");
});

test("dashboard historis menghitung saldo as-of akhir periode, bukan saldo hari ini", async () => {
  const tables = {
    Accounts: [{ __row: 2, account_id: "a1", name: "Utama", account_type: "bank", owner_scope: "shared", owner_user_id: "", initial_balance: 100, initial_balance_date: "2026-07-01", status: "active" }],
    Categories: [{ __row: 2, category_id: "c1", name: "Gaji", transaction_type: "income", status: "active" }, { __row: 3, category_id: "c2", name: "Belanja", transaction_type: "expense", status: "active" }],
    Transactions: [
      { __row: 2, transaction_id: "jul", transaction_date: "2026-07-10", transaction_type: "income", destination_account_id: "a1", source_account_id: "", category_id: "c1", amount: 50, status: "active", scope: "shared", owner_user_id: "" },
      { __row: 3, transaction_id: "aug", transaction_date: "2026-08-05", transaction_type: "expense", source_account_id: "a1", destination_account_id: "", category_id: "c2", amount: 20, status: "active", scope: "shared", owner_user_id: "" },
    ],
    Recurring_Rules: [], Recurring_Occurrences: [], Envelope_Rules: [], Envelope_Periods: [], Savings_Goals: [], Goal_Movements: [], Period_Closures: [],
  };
  const requestCache = { readModels: {}, rows: {}, metrics: { sheets: {}, cacheHits: 0, rowsScanned: 0 } };
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory,
    rows_: (name) => tables[name] || [], findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    requestCache_: () => requestCache, publicRow_: publicRow,
    canAccessOwnedScope_: () => true, canAccessAccount_: () => true,
    today_: () => "2026-08-15", monthKey_: () => "2026-08", nowIso_: () => "now",
  });
  await loadAppsScript(context, ["FinanceService.gs", "ReadModel.gs", "MasterDataService.gs", "PlanningService.gs", "ReportsAndIntegrations.gs"]);
  context.listRecurring_ = () => [];
  context.listEnvelopes_ = () => [];
  context.listGoals_ = () => [];
  context.allocationAvailability_ = () => ({ availableBalance: 0, allocatedRemaining: 0, unallocatedAmount: 0 });
  const result = context.dashboardOverview_({ actor: { user_id: "owner", role: "owner" }, payload: { period: "2026-07" } });
  assert.equal(result.cutoffDate, "2026-07-31");
  assert.equal(result.totalBalance, 150);
  assert.equal(result.openingBalance, 0);
  assert.equal(result.balanceChange, 150);
});

test("recurring rule baru langsung menghasilkan occurrence periode berjalan", async () => {
  const tables = { Recurring_Rules: [], Recurring_Occurrences: [], Transactions: [], Accounts: [{ account_id: "a1", status: "active", owner_scope: "shared" }], Categories: [{ category_id: "c1", status: "active", transaction_type: "expense" }] };
  let sequence = 0;
  const audits = [];
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory,
    rows_: (name) => tables[name] || [], findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    appendRow_: (name, record) => { const row = { ...record, __row: (tables[name] || []).length + 2 }; (tables[name] ||= []).push(row); return row; },
    deleteRowsDescending_: (name, rowNumbers) => { const set = new Set(rowNumbers); tables[name] = (tables[name] || []).filter((row) => !set.has(row.__row)); },
    deleteRow_: (name, rowNumber) => { tables[name] = (tables[name] || []).filter((row) => row.__row !== rowNumber); },
    activeCategory_: (id, type) => { const row = tables.Categories.find((item) => item.category_id === id && item.transaction_type === type); if (!row) throw errorFactory("INVALID_CATEGORY", "invalid"); return row; },
    activeAccount_: (id) => tables.Accounts.find((row) => row.account_id === id), assertAccountAccess_: () => {},
    normalizeOwnedScope_: () => ({ scope: "shared", owner_user_id: "" }), ownedScopeFromAccount_: () => ({ scope: "shared", owner_user_id: "" }),
    validateDate_: (value) => String(value), intAmount_: Number, strictBoolean_: (value, _name, fallback) => value === undefined ? fallback : Boolean(value),
    sanitizeText_: (value) => String(value || ""), nowIso_: () => "2026-07-01T10:00:00+07:00", today_: () => "2026-07-01", monthKey_: () => "2026-07", uuid_: () => `r-${++sequence}`,
    appendAudit_: (_request, action, _type, _id, _before, after) => audits.push({ action, after }), publicRow_: publicRow,
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  context.compensateOrFailClosed_ = (_reason, _details, compensate) => compensate();
  const result = context.createRecurringRule_({ actor: { user_id: "owner", role: "owner" }, payload: { name: "Internet", kind: "expense", category_id: "c1", expected_amount: 400000, frequency: "monthly", due_day: 15, default_account_id: "a1", start_date: "2026-07-01", end_date: "", auto_debit: false } });
  assert.equal(result.generated_occurrences, 1);
  assert.equal(tables.Recurring_Occurrences.length, 1);
  assert.equal(tables.Recurring_Occurrences[0].due_date, "2026-07-15");
  assert.deepEqual(audits.map((entry) => entry.action), ["recurring.createRule"]);
});

test("recurring dengan transaksi terkait mengunci perubahan rekening dan kategori", async () => {
  const current = { __row: 2, recurring_rule_id: "r1", name: "Internet", kind: "expense", category_id: "c1", expected_amount: 400000, frequency: "monthly", due_day: 15, default_account_id: "a1", payment_method: "transfer", auto_debit: false, start_date: "2026-01-01", end_date: "", priority: "normal", status: "active", scope: "shared", owner_user_id: "", row_version: 1 };
  const tables = {
    Recurring_Rules: [current],
    Recurring_Occurrences: [{ __row: 2, occurrence_id: "o1", recurring_rule_id: "r1", period_key: "2026-07", due_date: "2026-07-15", status: "paid", transaction_ids: "t1" }],
    Transactions: [{ __row: 2, transaction_id: "t1", recurring_occurrence_id: "o1", transaction_date: "2026-07-15", status: "active" }],
    Accounts: [{ account_id: "a1", status: "active", owner_scope: "shared", owner_user_id: "" }, { account_id: "a2", status: "active", owner_scope: "shared", owner_user_id: "" }],
    Categories: [{ category_id: "c1", status: "active", transaction_type: "expense" }, { category_id: "c2", status: "active", transaction_type: "expense" }],
    Period_Closures: [],
  };
  let writes = 0;
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory,
    rows_: (name) => tables[name] || [],
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    activeCategory_: (id, type) => { const row = tables.Categories.find((item) => item.category_id === id && item.transaction_type === type && item.status === "active"); if (!row) throw errorFactory("INVALID_CATEGORY", "invalid", 400); return row; },
    activeAccount_: (id) => { const row = tables.Accounts.find((item) => item.account_id === id && item.status === "active"); if (!row) throw errorFactory("INVALID_ACCOUNT", "invalid", 400); return row; },
    assertAccountAccess_: () => {}, assertRecurringRuleAccess_: () => {}, assertVersion_: () => {},
    normalizeOwnedScope_: (_request, payload, fallback) => ({ scope: payload.scope === undefined ? fallback.scope : payload.scope, owner_user_id: payload.owner_user_id === undefined ? fallback.owner_user_id : payload.owner_user_id }),
    validateDate_: (value) => String(value), sanitizeText_: (value) => String(value || ""), intAmount_: Number, strictBoolean_: (value, _name, fallback) => value === undefined ? fallback : Boolean(value),
    rowVersion_: (row) => Number(row.row_version || 0), today_: () => "2026-08-01", monthKey_: () => "2026-08",
    isTransactionDateLocked_: () => false, updateRow_: () => { writes += 1; }, appendAudit_: () => {},
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  assert.throws(
    () => context.updateRecurringRule_({ actor: { user_id: "owner", role: "owner" }, payload: { recurring_rule_id: "r1", row_version: 1, default_account_id: "a2", category_id: "c2" }, rowVersion: 1 }),
    (error) => error.code === "RECURRING_RULE_LINKED_IDENTITY_LOCKED" && error.status === 409,
  );
  assert.equal(writes, 0);
});

test("public doGet hanya mengembalikan status minimal", async () => {
  const context = createBaseContext({
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (value) => ({ value, setMimeType() { return this; } }) },
  });
  await loadAppsScript(context, ["Code.gs"]);
  const payload = JSON.parse(context.doGet().value);
  assert.deepEqual(Object.keys(payload.data).sort(), ["service", "status"]);
  assert.equal(payload.data.status, "ok");
  assert.equal("schemaVersion" in payload.data, false);
  assert.equal("recovery" in payload.data, false);
});

test("logger Apps Script menyimpan timing numerik aman tanpa payload sensitif", async () => {
  const output = [];
  const context = createBaseContext({ console: { log: (value) => output.push(value), warn: (value) => output.push(value), error: (value) => output.push(value) } });
  await loadAppsScript(context, ["Security.gs"]);
  context.appsScriptLog_("info", "request.completed", { requestId: "r1", stageTimings: { routeAction: 120, nested: { read: 30 }, email: "owner@gmail.com" }, sheetMetrics: { Transactions: { durationMs: 50, rows: 100, payload: "secret" } }, payload: { amount: 1 } });
  const record = JSON.parse(output[0]);
  assert.equal(record.stageTimings.routeAction, 120);
  assert.equal(record.stageTimings.nested.read, 30);
  assert.equal(record.stageTimings.email, undefined);
  assert.equal(record.sheetMetrics.Transactions.rows, 100);
  assert.equal(record.sheetMetrics.Transactions.payload, undefined);
  assert.equal(record.payload, undefined);
});

test("goal selesai ditolak sebelum target nominal tercapai", async () => {
  const goal = { __row: 2, goal_id: "g1", name: "Dana", goal_type: "savings", target_amount: 1000, target_date: "2026-12-31", priority: "normal", status: "active", row_version: 1, account_id: "a1", scope: "shared", owner_user_id: "" };
  const context = createBaseContext({
    sbError_: errorFactory, findBy_: () => goal, assertGoalAccess_: () => {}, assertVersion_: () => {}, sanitizeText_: (value) => String(value || ""), intAmount_: Number, validateDate_: String,
    goalCurrentAmount_: () => 500, rowVersion_: (row) => row.row_version, nowIso_: () => "now", updateAuditedRow_: () => { throw new Error("tidak boleh update"); }, publicRow_: publicRow,
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  context.goalCurrentAmount_ = () => 500;
  assert.throws(() => context.updateGoal_({ actor: { user_id: "owner", role: "owner" }, payload: { goal_id: "g1", row_version: 1, status: "completed" }, rowVersion: 1 }), (error) => error.code === "GOAL_NOT_REACHED");
});

test("pembayaran recurring memakai jalur transaksi internal dan menyimpan linkage occurrence", async () => {
  const tables = {
    Accounts: [{ __row: 2, account_id: "a1", initial_balance: 1000, initial_balance_date: "2026-01-01", allow_negative: false, status: "active", owner_scope: "shared", owner_user_id: "" }],
    Categories: [{ __row: 2, category_id: "c1", transaction_type: "expense", status: "active" }],
    Transactions: [], Period_Closures: [], Envelope_Periods: [], Envelope_Rules: [],
    Recurring_Rules: [{ __row: 2, recurring_rule_id: "r1", name: "Internet", kind: "expense", category_id: "c1", default_account_id: "a1", payment_method: "transfer", scope: "shared", owner_user_id: "", status: "active" }],
    Recurring_Occurrences: [{ __row: 2, occurrence_id: "o1", recurring_rule_id: "r1", period_key: "2026-07", due_date: "2026-07-28", expected_amount: 100, actual_amount: 0, transaction_ids: "", status: "scheduled", row_version: 1 }],
  };
  const runtime = await financeRuntime(tables);
  await loadAppsScript(runtime, ["ReadModel.gs", "PlanningService.gs"]);

  const result = runtime.payOccurrence_({
    actor: { user_id: "u1", role: "owner" },
    payload: { occurrence_id: "o1", row_version: 1, transaction_date: "2026-07-28", amount: 100 },
    rowVersion: 1,
    idempotencyKey: "pay-o1",
  });

  assert.equal(tables.Transactions.length, 1);
  assert.equal(tables.Transactions[0].recurring_occurrence_id, "o1");
  assert.equal(tables.Transactions[0].scope, "shared");
  assert.equal(result.occurrence.status, "paid");
  assert.equal(result.occurrence.transaction_ids, result.transaction.transaction_id);
});

test("mutasi goal memakai jalur transaksi internal dan menyimpan linkage goal", async () => {
  const tables = {
    Accounts: [
      { __row: 2, account_id: "source", initial_balance: 1000, initial_balance_date: "2026-01-01", allow_negative: false, status: "active", owner_scope: "shared", owner_user_id: "" },
      { __row: 3, account_id: "goal", initial_balance: 0, initial_balance_date: "2026-01-01", allow_negative: false, status: "active", owner_scope: "shared", owner_user_id: "" },
    ],
    Categories: [], Transactions: [], Period_Closures: [], Envelope_Periods: [], Envelope_Rules: [],
    Savings_Goals: [{ __row: 2, goal_id: "g1", name: "Dana darurat", account_id: "goal", status: "active", scope: "shared", owner_user_id: "" }],
    Goal_Movements: [],
  };
  const runtime = await financeRuntime(tables);
  await loadAppsScript(runtime, ["ReadModel.gs", "PlanningService.gs"]);

  const result = runtime.moveGoal_({
    actor: { user_id: "u1", role: "owner" },
    payload: { goal_id: "g1", movement_type: "contribution", source_account_id: "source", destination_account_id: "goal", amount: 250, transaction_date: "2026-07-28" },
    idempotencyKey: "goal-g1-1",
  });

  assert.equal(tables.Transactions.length, 1);
  assert.equal(tables.Transactions[0].goal_id, "g1");
  assert.equal(tables.Transactions[0].transaction_type, "transfer");
  assert.equal(tables.Goal_Movements.length, 1);
  assert.equal(tables.Goal_Movements[0].transaction_id, tables.Transactions[0].transaction_id);
  assert.equal(result.goal.current_amount, 250);
});

test("alokasi rekening tidak dapat melampaui sisa global setelah kantong lain", async () => {
  const context = createBaseContext();
  await loadAppsScript(context, ["PlanningService.gs"]);
  context.allocationAvailabilitySummary_ = () => ({
    availableBalance: 1000,
    allocatedRemaining: 980,
    unallocatedAmount: 20,
    availableByAccount: { a1: 500 },
    allocatedByAccount: { a1: 100 },
  });
  const result = context.allocationAvailability_("a1", { actor: { user_id: "u1", role: "owner" }, payload: {} });
  assert.equal(result.availableBalance, 500);
  assert.equal(result.allocatedRemaining, 100);
  assert.equal(result.unallocatedAmount, 20);
});

test("periode lama harus dibuka dari closure paling akhir", async () => {
  const tables = {
    Period_Closures: [
      { __row: 2, closure_id: "jul", period_key: "2026-07", status: "closed", row_version: 1 },
      { __row: 3, closure_id: "agu", period_key: "2026-08", status: "closed", row_version: 1 },
    ],
  };
  const context = createBaseContext({
    sbError_: errorFactory,
    rows_: (name) => tables[name] || [],
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    assertVersion_: () => {},
    sanitizeText_: (value) => String(value || ""),
  });
  await loadAppsScript(context, ["ReportsAndIntegrations.gs"]);
  assert.throws(
    () => context.reopenPeriod_({ actor: { user_id: "owner", role: "owner" }, payload: { closure_id: "jul", row_version: 1, reason: "koreksi" }, rowVersion: 1 }),
    (error) => error.code === "LATER_PERIOD_CLOSED" && error.details.latestClosedPeriod === "2026-08",
  );
});

test("jatuh tempo pada hari terakhir periode historis ditandai overdue", async () => {
  const tables = {
    Accounts: [{ account_id: "a1", status: "active", owner_scope: "shared" }],
    Recurring_Rules: [{ recurring_rule_id: "r1", name: "Tagihan", kind: "expense", category_id: "c1", default_account_id: "a1", payment_method: "transfer", frequency: "monthly", status: "active", scope: "shared", owner_user_id: "" }],
    Recurring_Occurrences: [{ occurrence_id: "o1", recurring_rule_id: "r1", period_key: "2026-07", due_date: "2026-07-31", expected_amount: 100, actual_amount: 0, transaction_ids: "", status: "scheduled", row_version: 1 }],
    Transactions: [], Period_Closures: [],
  };
  const context = createBaseContext({
    rows_: (name) => tables[name] || [],
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    periodKey_: (value) => value || "2026-07",
    monthKey_: () => "2026-08",
    periodCutoffDate_: () => "2026-07-31",
    canAccessRecurringRule_: () => true,
    buildTransactionReadModel_: () => ({ transactions: [], transactionById: {} }),
    isTransactionDateLocked_: () => false,
    publicRow_: publicRow,
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  const item = context.listRecurring_({ actor: { user_id: "owner", role: "owner" }, payload: { period: "2026-07" } })[0];
  assert.equal(item.status, "overdue");
});

test("upsert budget mengaktifkan kembali row archived yang sama", async () => {
  const tables = {
    Budgets: [{ __row: 2, budget_id: "b1", period_key: "2026-07", category_id: "c1", envelope_rule_id: "", amount: 100, warning_threshold: 80, scope: "shared", owner_user_id: "", status: "archived", row_version: 2, created_at: "old" }],
  };
  const context = createBaseContext({
    sbError_: errorFactory,
    rows_: (name) => tables[name] || [],
    activeCategory_: () => ({ category_id: "c1", name: "Makan", transaction_type: "expense", status: "active" }),
    normalizeOwnedScope_: () => ({ scope: "shared", owner_user_id: "" }),
    assertPeriodOpen_: () => {},
    assertVersion_: () => {},
    intAmount_: Number,
    rowVersion_: (row) => Number(row.row_version || 0),
    nowIso_: () => "new",
    publicRow_: publicRow,
    updateAuditedRow_: (name, current, updated) => { tables[name][current.__row - 2] = { ...updated, __row: current.__row }; },
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  const result = context.upsertBudget_({ actor: { user_id: "owner", role: "owner" }, payload: { period_key: "2026-07", category_id: "c1", amount: 200, warning_threshold: 90, row_version: 2 }, rowVersion: 2 });
  assert.equal(tables.Budgets.length, 1);
  assert.equal(result.budget_id, "b1");
  assert.equal(result.status, "active");
  assert.equal(result.amount, 200);
});

test("capability goal menolak rekening archived dan reverse transaksi periode terkunci", async () => {
  const tables = {
    Accounts: [{ account_id: "a1", status: "archived", owner_scope: "shared" }],
    Savings_Goals: [{ goal_id: "g1", account_id: "a1", status: "active", scope: "shared", owner_user_id: "", created_at: "2026-01-01" }],
  };
  const context = createBaseContext({
    rows_: (name) => tables[name] || [],
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    periodCutoffDate_: () => "2026-07-31",
    canAccessGoal_: () => true,
    isTransactionDateLocked_: () => true,
    goalMovementReadModelAsOf_: () => ({
      totals: { g1: 100 },
      latestByGoal: { g1: { goal_movement_id: "m1", transaction_id: "t1", movement_type: "contribution", created_by: "owner" } },
      transactionById: { t1: { transaction_id: "t1", transaction_date: "2026-07-20", status: "active" } },
    }),
    publicRow_: publicRow,
  });
  await loadAppsScript(context, ["PlanningService.gs"]);
  const goal = context.listGoals_({ actor: { user_id: "owner", role: "owner" }, payload: { period: "2026-07" } })[0];
  assert.equal(goal.can_move, false);
  assert.equal(goal.can_reverse, false);
});

test("import preview memakai ownership transaksi aktual, menetralkan formula, dan menerima batch valid", async () => {
  const tables = {
    Accounts: [{ __row: 2, account_id: "a1", initial_balance: 1000, initial_balance_date: "2026-01-01", allow_negative: false, status: "active", owner_scope: "shared", owner_user_id: "" }],
    Categories: [{ __row: 2, category_id: "c1", transaction_type: "expense", status: "active" }],
    Transactions: [], Period_Closures: [], Envelope_Periods: [], Envelope_Rules: [],
  };
  const runtime = await financeRuntime(tables);
  await loadAppsScript(runtime, ["RecoveryService.gs"]);
  runtime.sanitizeText_ = (value, maxLength = 250) => {
    const text = String(value ?? "").trim().slice(0, maxLength);
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
  };
  const result = runtime.importPreview_({
    actor: { user_id: "owner", role: "owner" },
    payload: { records: [{ transaction_type: "expense", transaction_date: "2026-07-28", source_account_id: "a1", category_id: "c1", amount: 25, description: "=HYPERLINK(\"x\")" }] },
  });
  assert.equal(result.acceptable, true);
  assert.equal(result.validCount, 1);
  const cached = JSON.parse(runtime.CacheService.getScriptCache().get(`import-preview:${result.previewToken}`));
  assert.equal(cached.records[0].description.startsWith("'="), true);
  assert.equal(Object.hasOwn(cached.records[0], "scope"), false);
  assert.equal(Object.hasOwn(cached.records[0], "owner_user_id"), false);
});

test("import preview menolak transaksi yang dikunci closure bulan setelahnya", async () => {
  const tables = {
    Accounts: [{ __row: 2, account_id: "a1", initial_balance: 1000, initial_balance_date: "2026-01-01", allow_negative: false, status: "active", owner_scope: "shared", owner_user_id: "" }],
    Categories: [{ __row: 2, category_id: "c1", transaction_type: "expense", status: "active" }],
    Transactions: [], Envelope_Periods: [], Envelope_Rules: [],
    Period_Closures: [{ __row: 2, closure_id: "aug", period_key: "2026-08", status: "closed" }],
  };
  const runtime = await financeRuntime(tables);
  await loadAppsScript(runtime, ["RecoveryService.gs"]);
  const result = runtime.importPreview_({
    actor: { user_id: "owner", role: "owner" },
    payload: { records: [{ transaction_type: "expense", transaction_date: "2026-07-28", source_account_id: "a1", category_id: "c1", amount: 25, description: "Makan" }] },
  });
  assert.equal(result.acceptable, false);
  assert.equal(result.invalid[0].code, "PERIOD_CLOSED");
});

test("integrity scanner mendeteksi formula tanpa membocorkan isi formula", async () => {
  const context = createBaseContext({
    SB_SCHEMA: { Transactions: ["transaction_id", "description"] },
    getSheet_: () => ({
      getLastRow: () => 3,
      getRange: () => ({ getFormulas: () => [["", "=SUM(1,1)"], ["", ""]] }),
    }),
  });
  await loadAppsScript(context, ["ReportsAndIntegrations.gs"]);
  const issues = context.formulaIntegrityIssues_();
  assert.deepEqual(Array.from(issues, (issue) => issue.code), ["FORMULA_CELL_DETECTED"]);
  assert.equal(issues[0].count, 1);
  assert.equal(issues[0].firstCell, "R2C2");
  assert.equal(JSON.stringify(issues).includes("SUM"), false);
});

test("fingerprint closure mencakup progress goal tetapi kompatibel dengan snapshot legacy", async () => {
  const context = createBaseContext();
  await loadAppsScript(context, ["ReportsAndIntegrations.gs"]);
  const base = { schemaVersion: "2", periodKey: "2026-07", totals: {}, accountBalances: [], categoryExpenses: [], budgets: [], envelopes: [], recurring: [], goals: [{ goal_id: "g1", current_amount: 100 }] };
  const changed = { ...base, goals: [{ goal_id: "g1", current_amount: 200 }] };
  assert.notEqual(context.periodSnapshotFingerprint_(base), context.periodSnapshotFingerprint_(changed));
  const legacy = { schemaVersion: "2", periodKey: "2026-07", totals: {}, accountBalances: [], categoryExpenses: [], budgets: [], envelopes: [], recurring: [] };
  assert.equal(
    context.periodSnapshotComparableFingerprint_(base, legacy),
    context.periodSnapshotComparableFingerprint_(changed, legacy),
  );
});

test("integrity menolak entity aktif yang bergantung pada master data terarsip", async () => {
  const tables = {
    Users: [{ user_id: "u1", email: "owner@gmail.com", role: "owner", status: "active" }],
    Accounts: [{ account_id: "a-archived", owner_scope: "shared", owner_user_id: "", status: "archived" }],
    Categories: [{ category_id: "c-archived", transaction_type: "expense", status: "archived" }],
    Transactions: [],
    Envelope_Rules: [
      { envelope_rule_id: "er-active", source_account_id: "a-archived", scope: "shared", owner_user_id: "", status: "active" },
      { envelope_rule_id: "er-archived", source_account_id: "", scope: "shared", owner_user_id: "", status: "archived" },
    ],
    Envelope_Periods: [], Envelope_Movements: [],
    Recurring_Rules: [{ recurring_rule_id: "rr1", category_id: "c-archived", default_account_id: "a-archived", scope: "shared", owner_user_id: "", status: "active" }],
    Recurring_Occurrences: [],
    Budgets: [{ budget_id: "b1", period_key: "2026-07", category_id: "c-archived", envelope_rule_id: "er-archived", scope: "shared", owner_user_id: "", status: "active" }],
    Savings_Goals: [{ goal_id: "g1", account_id: "a-archived", scope: "shared", owner_user_id: "", status: "active" }],
    Goal_Movements: [], Reconciliations: [], Period_Closures: [], Calendar_Sync: [], Notification_Queue: [], Push_Subscriptions: [], Backup_Log: [], Idempotency: [], Audit_Log: [],
  };
  const context = createBaseContext({
    SB_SCHEMA: {}, SB_SCHEMA_VERSION: "2",
    rows_: (name) => tables[name] || [],
    groupRowsByField_: (rows, field) => rows.reduce((grouped, row) => {
      const key = String(row[field] || "");
      (grouped[key] ||= []).push(row);
      return grouped;
    }, {}),
    accountOwnershipKey_: () => "shared:",
    allocationAvailabilitySummary_: () => ({ availableBalance: 0, allocatedRemaining: 0, availableByAccount: {}, allocatedByAccount: {} }),
  });
  await loadAppsScript(context, ["ReportsAndIntegrations.gs"]);
  context.allocationAvailabilitySummary_ = () => ({ availableBalance: 0, allocatedRemaining: 0, availableByAccount: {}, allocatedByAccount: {} });
  const codes = new Set(Array.from(context.integrityIssues_({ actor: { user_id: "u1", role: "owner" }, payload: {} }), (issue) => issue.code));
  [
    "ACTIVE_ENVELOPE_ARCHIVED_ACCOUNT",
    "ACTIVE_RECURRING_ARCHIVED_ACCOUNT",
    "ACTIVE_RECURRING_ARCHIVED_CATEGORY",
    "ACTIVE_BUDGET_ARCHIVED_CATEGORY",
    "ACTIVE_BUDGET_ARCHIVED_ENVELOPE",
    "ACTIVE_GOAL_ARCHIVED_ACCOUNT",
  ].forEach((code) => assert.equal(codes.has(code), true, `${code} harus terdeteksi`));
});
