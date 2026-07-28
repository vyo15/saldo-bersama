import assert from "node:assert/strict";
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
    uuid_: () => "uuid-1",
    appendAuditedRow_: (name, _idField, record) => { tables[name].push({ ...record, __row: tables[name].length + 2 }); },
    updateAuditedRow_: (name, current, updated) => { tables[name][current.__row - 2] = { ...updated, __row: current.__row }; },
  });
  await loadAppsScript(context, ["FinanceService.gs"]);
  return context;
};

test("adjustment positif menambah saldo dan tidak ditolak insufficient balance", async () => {
  const tables = {
    Accounts: [{ __row: 2, account_id: "a1", initial_balance: 0, allow_negative: false, status: "active", owner_scope: "shared" }],
    Categories: [], Transactions: [], Period_Closures: [], Envelope_Periods: [], Envelope_Rules: [],
  };
  const runtime = await financeRuntime(tables);
  const result = runtime.createTransaction_({ actor: { user_id: "u1", role: "owner" }, payload: { transaction_type: "adjustment", transaction_date: "2026-07-28", source_account_id: "a1", amount: 100 }, idempotencyKey: "k1" });
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
    appendAudit_: () => {}, nowIso_: () => "now", recoveryDetails_: () => ({ recoveryRequired: true, status: "restore_recovery_required" }),
  });
  await loadAppsScript(context, ["RecoveryService.gs"]);
  // restore file defines functions with same names; override dependencies afterwards.
  context.validateBackupSpreadsheet_ = (fileId) => ({ issues: [], checksum: fileId === "source" ? "source-hash" : "safety-hash", schemaVersion: "1", source: {} });
  context.assertBackupOwner_ = () => ({ user_id: "u1", email: "owner@gmail.com", role: "owner" });
  context.createBackup_ = () => ({ fileId: "safety", checksum: "safety-hash", fileName: "safety" });
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
    rows_: (name) => name === "Notification_Queue" ? queue : subscriptions,
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
  const tables = { Recurring_Occurrences: [occurrence], Recurring_Rules: [{ recurring_rule_id: "r1", kind: "expense" }], Transactions: [transaction], Period_Closures: [] };
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
  const tables = { Goal_Movements: [movement], Transactions: [transaction], Savings_Goals: [{ goal_id: "g1", name: "Target" }], Period_Closures: [] };
  const context = createBaseContext({
    SB_TIMEZONE: "Asia/Jakarta", sbError_: errorFactory,
    findBy_: (name, field, value) => (tables[name] || []).find((row) => String(row[field]) === String(value)) || null,
    rows_: (name) => tables[name] || [], publicRow_: publicRow, rowVersion_: (row) => Number(row.row_version || 0),
    assertPeriodOpen_: () => {}, sanitizeText_: (value) => String(value || "").trim(), nowIso_: () => "now",
    updateRow_: (name, _row, record) => { tables[name][0] = { ...record, __row: 2 }; }, appendAudit_: () => {},
    compensateOrFailClosed_: (_status, _details, compensate) => compensate(),
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
  await loadAppsScript(context, ["FinanceService.gs"]);
  const result = context.createTransaction_({ actor: { user_id: "u1", role: "owner" }, payload: {}, idempotencyKey: "k" }, {
    transaction_type: "expense", transaction_date: "2026-07-28", source_account_id: "a1", category_id: "c1", amount: 100,
  }, { skipAudit: true });
  assert.equal(result.transaction_id, "t1");
  assert.equal(tables.Transactions.length, 1);
  assert.equal(audited, 0);
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
