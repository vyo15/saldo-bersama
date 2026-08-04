import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { canonicalJson } from "../../api/_lib/services/core.js";
import { digest, insertRows, normalizeRestoredRows, snapshotDatabase, validateSnapshot } from "../../api/_lib/services/maintenance/shared.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const maintenanceSource = async () => {
  const directory = new URL("../../api/_lib/services/maintenance/", import.meta.url);
  const preferredOrder = ["shared.js", "backup.js", "restore.js", "import.js", "integrity.js", "index.js"];
  const available = new Set((await readdir(directory)).filter((name) => name.endsWith(".js")));
  return (await Promise.all(preferredOrder.filter((name) => available.has(name)).map((name) => readFile(new URL(name, directory), "utf8")))).join("\n");
};

test("backup memakai snapshot transaction, checksum, gzip limit, nama unik, dan Drive bridge", async () => {
  const maintenance = await maintenanceSource();
  assert.match(maintenance, /snapshotDatabase = async \(db\) => db\.transaction/);
  assert.match(maintenance, /MAX_BACKUP_COMPRESSED_BYTES/);
  assert.match(maintenance, /maxOutputLength: MAX_BACKUP_JSON_BYTES/);
  assert.match(maintenance, /digest\(canonicalJson\(payload\)\)/);
  assert.match(maintenance, /backupId\.slice\(-8\)/);
  assert.match(maintenance, /callGoogleBridge\("backup\.store"/);
});

test("restore melakukan preview, safety backup, maintenance fail-closed, transaction, integrity, dan rebuild integration", async () => {
  const maintenance = await maintenanceSource();
  const safetyIndex = maintenance.indexOf("pre-restore");
  const maintenanceIndex = maintenance.indexOf("maintenance_mode");
  const transactionIndex = maintenance.indexOf("await db.transaction", safetyIndex);
  assert.ok(safetyIndex >= 0 && maintenanceIndex > safetyIndex && transactionIndex > maintenanceIndex);
  assert.match(maintenance, /RESTORE SALDO BERSAMA/);
  assert.match(maintenance, /integrityIssues\(tx\)/);
  assert.match(maintenance, /Fail closed: maintenance tetap aktif/);
  assert.match(maintenance, /enqueueIntegration\(tx, "sheets", "rebuild"/);
  assert.match(maintenance, /enqueueIntegration\(tx, "calendar", "rebuild"/);
  assert.match(maintenance, /status='applied',result_json=/);
});

test("restore menghapus queue dan push credential lama, mempertahankan audit, serta mengikat identitas ke konfigurasi aktif", async () => {
  const maintenance = await maintenanceSource();
  assert.match(maintenance, /"notification_queue", "integration_links", "integration_outbox", "request_nonces"/);
  assert.match(maintenance, /"push_subscriptions"/);
  assert.doesNotMatch(maintenance, /BACKUP_TABLES[\s\S]{0,500}"push_subscriptions"/);
  assert.doesNotMatch(maintenance, /insertRows\(tx, "push_subscriptions"/);
  assert.doesNotMatch(maintenance, /RESTORE_DELETE_ORDER[\s\S]{0,400}"audit_log"/);
  assert.match(maintenance, /currentByEmail/);
  assert.match(maintenance, /allowedRoleByEmail/);
  assert.match(maintenance, /context\.signedActor\.uid/);
  assert.match(maintenance, /RESTORE_IDENTITY_CONFLICT/);
  assert.match(maintenance, /allowedRole \|\| current\?\.role \|\| user\.role/);
  assert.match(maintenance, /allowedRole\s*\?\s*(?:\()?current\?\.status\s*\|\|\s*user\.status(?:\))?\s*:\s*"inactive"/);
  assert.match(maintenance, /nextStatus = allowedRole \? current\.status : "inactive"/);
  assert.match(maintenance, /insertRows\(tx, "audit_log"[\s\S]*INSERT OR IGNORE/);
});

test("import dibatasi 50 row, preview tervalidasi, safety backup, atomic apply, dan replay-safe", async () => {
  const maintenance = await maintenanceSource();
  assert.match(maintenance, /records\.length > 50/);
  assert.match(maintenance, /pre-import/);
  assert.match(maintenance, /return db\.transaction\(async\s*(?:\(tx\)|tx)\s*=>/);
  assert.match(maintenance, /status='applying'/);
  assert.match(maintenance, /appendAudit\(tx, context/);
  assert.match(maintenance, /status === "applied"/);
  assert.match(maintenance, /IMPORT TRANSAKSI/);
});

test("normalisasi restore template menurunkan enum uppercase dan menolak template non-bank", () => {
  assert.deepEqual(
    normalizeRestoredRows("accounts", [{ account_id: "upper", account_type: "bank", bank_template: "BNI" }])[0],
    { account_id: "upper", account_type: "bank", bank_template: "bni" },
  );
  assert.throws(
    () => normalizeRestoredRows("accounts", [{ account_id: "invalid", account_type: "cash", bank_template: "bca" }]),
    /Template kartu pada backup tidak valid/,
  );
});

test("backup schema v3/v4 tetap dapat dimuat ke schema v5 dengan default field additive", async () => {
  const sourceDb = await createSqliteTestDatabase();
  const targetDb = await createSqliteTestDatabase();
  try {
    const now = "2026-08-03T00:00:00.000Z";
    await sourceDb.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", ["u-v3", "firebase-v3", "v3@example.com", "Legacy", "owner", "active", 1, now, now]);
    await sourceDb.execute("INSERT INTO accounts(account_id,name,account_type,account_number,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["a-v3", "Legacy · BNI", "bank", "1234567890", "shared", null, 0, "2026-01-01", 0, "active", 1, "u-v3", now, "u-v3", now]);

    const current = await snapshotDatabase(sourceDb);
    const legacyTables = structuredClone(current.tables);
    legacyTables.accounts = legacyTables.accounts.map(({ account_number: _accountNumber, bank_template: _bankTemplate, ...row }) => row);
    const manifest = { ...current.manifest, version: 3, schemaVersion: 3, tables: { ...current.manifest.tables } };
    const legacy = { manifest, tables: legacyTables };
    legacy.checksum = digest(canonicalJson(legacy));
    assert.equal(validateSnapshot(legacy), legacy.checksum);

    const v4 = structuredClone(legacy);
    v4.manifest.version = 4;
    v4.manifest.schemaVersion = 4;
    v4.tables.accounts = current.tables.accounts.map(({ bank_template: _bankTemplate, ...row }) => row);
    v4.checksum = digest(canonicalJson({ manifest: v4.manifest, tables: v4.tables }));
    assert.equal(validateSnapshot(v4), v4.checksum);

    await targetDb.transaction(async (tx) => {
      await insertRows(tx, "users", legacy.tables.users);
      await insertRows(tx, "accounts", normalizeRestoredRows("accounts", legacy.tables.accounts));
    });
    const restored = await targetDb.one("SELECT account_number,bank_template,name FROM accounts WHERE account_id='a-v3'");
    assert.equal(restored.account_number, "");
    assert.equal(restored.bank_template, "bni");
    assert.equal(restored.name, "Legacy · BNI");
  } finally {
    sourceDb.close();
    targetDb.close();
  }
});
