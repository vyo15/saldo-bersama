import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const recoverySource = await readFile(new URL("../../apps-script/RecoveryService.gs", import.meta.url), "utf8");

const RECOVERY_SCHEMA = Object.freeze({
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
  Reconciliations: ["reconciliation_id"]
});

const codedError = (code, message = code, status = 500, details = null) => {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
};

const createRuntime = ({
  cacheEntries = {},
  applySnapshot = () => {},
  validateSchema = () => [],
  integrityIssues = () => [],
  createTransaction = () => ({ transaction_id: "transaction-1" }),
} = {}) => {
  const cache = new Map(Object.entries(cacheEntries));
  const calls = { applied: [], audits: [], maintenance: [], removed: [], flushed: 0 };
  let maintenance = false;
  let recoveryState = { recoveryRequired: false, status: "", details: {} };
  const sandbox = {
    CacheService: {
      getScriptCache: () => ({
        get: (key) => cache.get(key) || null,
        put: (key, value) => cache.set(key, value),
        remove: (key) => { calls.removed.push(key); cache.delete(key); },
      }),
    },
    SpreadsheetApp: {
      flush: () => { calls.flushed += 1; },
      openById: () => { throw new Error("not used in test"); },
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => "owner@example.com" }) },
    Utilities: {},
    DriveApp: {},
    UrlFetchApp: {},
    ScriptApp: {},
    SB_SCHEMA: RECOVERY_SCHEMA,
    SB_TIMEZONE: "Asia/Jakarta",
  };
  vm.createContext(sandbox);
  vm.runInContext(recoverySource, sandbox, { filename: "RecoveryService.gs" });

  sandbox.validateBackupSpreadsheet_ = () => ({ issues: [], schemaVersion: "1", checksum: "source-checksum", source: {} });
  sandbox.assertBackupOwner_ = () => ({ user_id: "owner-1", email: "owner@example.com", role: "owner", status: "active" });
  sandbox.createBackup_ = () => ({ fileId: "safety-file", fileName: "safety", checksum: "safety-checksum", raw: false });
  sandbox.createEmergencySafetySnapshot_ = () => ({ fileId: "safety-file", fileName: "safety", checksum: "safety-checksum", raw: false });
  sandbox.validateSchema_ = validateSchema;
  sandbox.integrityIssues_ = integrityIssues;
  sandbox.snapshotVerificationIssues_ = (expectedChecksum) => {
    const schemaIssues = validateSchema().map((message) => ({ code: "SCHEMA", message }));
    const integrity = schemaIssues.length ? [] : integrityIssues();
    return { issues: schemaIssues.concat(integrity), checksum: expectedChecksum || "verified-checksum" };
  };
  sandbox.appendAudit_ = (...args) => { calls.audits.push(args); };
  sandbox.createTransaction_ = createTransaction;
  sandbox.nowIso_ = () => "2026-07-28T09:00:00+07:00";
  sandbox.uuid_ = () => "uuid-1";
  sandbox.sbError_ = codedError;
  sandbox.getSpreadsheet_ = () => ({});
  sandbox.canonicalJson_ = JSON.stringify;
  sandbox.sha256Hex_ = () => "preview-fingerprint";
  sandbox.setRecoveryRequired_ = (status, details) => {
    recoveryState = { recoveryRequired: true, status, details };
    if (!maintenance) {
      maintenance = true;
      calls.maintenance.push(true);
    }
  };
  sandbox.clearRecoveryState_ = () => { recoveryState = { recoveryRequired: false, status: "", details: {} }; };
  sandbox.recoveryDetails_ = () => recoveryState;
  sandbox.upsertConfig_ = (key, value) => {
    if (key !== "maintenance_mode") return;
    const next = String(value) === "true";
    if (next !== maintenance) {
      maintenance = next;
      calls.maintenance.push(next);
    }
  };
  sandbox.applySpreadsheetSnapshot_ = (fileId) => {
    calls.applied.push(fileId);
    return applySnapshot(fileId, calls.applied.length);
  };
  return { runtime: sandbox, calls, cache };
};

const restoreContext = {
  actor: { user_id: "owner-1", email: "owner@example.com" },
  requestId: "request-1",
  payload: {
    previewToken: "preview-1",
    backupFileId: "source-file",
    confirmation: "RESTORE SALDO BERSAMA",
  },
};

const restoreCache = {
  "restore-preview:preview-1": JSON.stringify({ actorId: "owner-1", fileId: "source-file", checksum: "source-checksum" }),
};

test("restore sukses baru melepas maintenance setelah audit dan verifikasi", () => {
  const { runtime, calls } = createRuntime({ cacheEntries: restoreCache });
  const result = runtime.restoreApply_(restoreContext);

  assert.equal(result.restored, true);
  assert.deepEqual(calls.applied, ["source-file"]);
  assert.deepEqual(calls.maintenance, [true, false]);
  assert.equal(calls.audits[0][1], "restore.apply");
  assert.deepEqual(calls.removed, ["restore-preview:preview-1"]);
});

test("restore yang gagal di tengah selalu mencoba rollback safety backup", () => {
  const { runtime, calls } = createRuntime({
    cacheEntries: restoreCache,
    applySnapshot: (fileId) => {
      if (fileId === "source-file") throw codedError("WRITE_FAILED", "primary failed");
    },
  });

  assert.throws(() => runtime.restoreApply_(restoreContext), (error) => error.code === "RESTORE_ROLLED_BACK");
  assert.deepEqual(calls.applied, ["source-file", "safety-file"]);
  assert.deepEqual(calls.maintenance, [true, false]);
  assert.equal(calls.audits[0][1], "restore.rollback");
});

test("restore dengan hasil tidak valid di-rollback dan diverifikasi ulang", () => {
  let integrityChecks = 0;
  const { runtime, calls } = createRuntime({
    cacheEntries: restoreCache,
    integrityIssues: () => {
      integrityChecks += 1;
      return integrityChecks === 1 ? [{ code: "BROKEN_REFERENCE" }] : [];
    },
  });

  assert.throws(() => runtime.restoreApply_(restoreContext), (error) => {
    assert.equal(error.code, "RESTORE_ROLLED_BACK");
    assert.equal(error.details.cause, "RESTORE_INTEGRITY_FAILED");
    return true;
  });
  assert.deepEqual(calls.applied, ["source-file", "safety-file"]);
  assert.deepEqual(calls.maintenance, [true, false]);
});

test("maintenance tetap aktif ketika restore dan rollback sama-sama gagal", () => {
  const { runtime, calls } = createRuntime({
    cacheEntries: restoreCache,
    applySnapshot: (fileId) => { throw codedError(fileId === "source-file" ? "WRITE_FAILED" : "ROLLBACK_WRITE_FAILED"); },
  });

  assert.throws(() => runtime.restoreApply_(restoreContext), (error) => {
    assert.equal(error.code, "RECOVERY_REQUIRED");
    assert.equal(error.details.details.safetyBackupFileId, "safety-file");
    assert.equal(error.details.details.rollbackError, "ROLLBACK_WRITE_FAILED");
    return true;
  });
  assert.deepEqual(calls.applied, ["source-file", "safety-file"]);
  assert.deepEqual(calls.maintenance, [true]);
});

test("import gagal juga memakai rollback terverifikasi dan fail-safe maintenance", () => {
  const importContext = {
    actor: { user_id: "owner-1", email: "owner@example.com" },
    requestId: "import-request",
    payload: { previewToken: "import-preview", confirmation: "IMPORT TRANSAKSI" },
  };
  const { runtime, calls } = createRuntime({
    cacheEntries: {
      "import-preview:import-preview": JSON.stringify({ actorId: "owner-1", records: [{ amount: 1000 }], fingerprint: "preview-fingerprint", acceptable: true }),
    },
    createTransaction: () => { throw codedError("IMPORT_WRITE_FAILED"); },
  });

  assert.throws(() => runtime.importApply_(importContext), (error) => error.code === "IMPORT_ROLLED_BACK");
  assert.deepEqual(calls.applied, ["safety-file"]);
  assert.deepEqual(calls.maintenance, [true, false]);
  assert.equal(calls.audits[0][1], "import.rollback");
});
