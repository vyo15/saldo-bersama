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
  assert.match(maintenance, /"notification_preferences"/);
  assert.match(maintenance, /backupId\.slice\(-8\)/);
  assert.match(maintenance, /callGoogleBridge\("backup\.store"/);
});

test("restore melakukan preview, safety backup, maintenance fail-closed, transaction, integrity, dan rebuild integration", async () => {
  const maintenance = await maintenanceSource();
  const applyRestoreSource = maintenance.slice(maintenance.indexOf("export const applyRestore"));
  const safetyIndex = applyRestoreSource.indexOf("pre-restore");
  const maintenanceIndex = applyRestoreSource.indexOf("maintenance_mode");
  const transactionIndex = applyRestoreSource.indexOf("await db.transaction", safetyIndex);
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
  assert.match(maintenance, /"notification_deliveries", "notification_queue", "integration_links", "integration_outbox", "request_nonces"/);
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

test("normalisasi restore template bank dan E-wallet menurunkan enum uppercase serta menjaga jenis rekening", () => {
  assert.deepEqual(
    normalizeRestoredRows("accounts", [{ account_id: "upper", account_type: "bank", bank_template: "BNI" }])[0],
    { account_id: "upper", account_type: "bank", bank_template: "bni", ewallet_template: "generic" },
  );
  assert.deepEqual(
    normalizeRestoredRows("accounts", [{ account_id: "wallet", account_type: "ewallet", bank_template: "generic", ewallet_template: "DANA" }])[0],
    { account_id: "wallet", account_type: "ewallet", bank_template: "generic", ewallet_template: "dana" },
  );
  assert.throws(
    () => normalizeRestoredRows("accounts", [{ account_id: "invalid", account_type: "cash", bank_template: "bca", ewallet_template: "generic" }]),
    /Template kartu bank pada backup tidak valid/,
  );
  assert.throws(
    () => normalizeRestoredRows("accounts", [{ account_id: "invalid-wallet", account_type: "cash", bank_template: "generic", ewallet_template: "dana" }]),
    /Provider E-wallet pada backup tidak valid/,
  );
});



test("backup schema v8 menyimpan notification preferences dan provider E-wallet canonical", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = "2026-08-09T00:00:00.000Z";
    await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", ["u-pref", "firebase-pref", "pref@example.com", "Preference", "owner", "active", 1, now, now]);
    await db.execute("INSERT INTO notification_preferences(user_id,notification_type,enabled,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?)", ["u-pref", "budget_threshold", 0, 1, now, now]);
    await db.execute("INSERT INTO accounts(account_id,name,account_type,account_number,bank_template,ewallet_template,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["wallet-v8", "Belanja", "ewallet", "", "generic", "gopay", "shared", null, 0, "2026-01-01", 0, "active", 1, "u-pref", now, "u-pref", now]);
    const snapshot = await snapshotDatabase(db);
    assert.equal(snapshot.manifest.schemaVersion, 8);
    assert.equal(snapshot.manifest.tables.notification_preferences, 1);
    assert.equal(snapshot.tables.notification_preferences[0].enabled, 0);
    assert.equal(snapshot.tables.accounts[0].ewallet_template, "gopay");
    assert.equal(validateSnapshot(snapshot), snapshot.checksum);
  } finally { db.close(); }
});

test("backup schema v3-v7 tetap dapat dimuat ke schema v8 dengan field additive canonical", async () => {
  const sourceDb = await createSqliteTestDatabase();
  const targetDb = await createSqliteTestDatabase();
  try {
    const now = "2026-08-03T00:00:00.000Z";
    await sourceDb.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", ["u-v3", "firebase-v3", "v3@example.com", "Legacy", "owner", "active", 1, now, now]);
    await sourceDb.execute("INSERT INTO accounts(account_id,name,account_type,account_number,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["a-v3", "Legacy · BNI", "bank", "1234567890", "shared", null, 0, "2026-01-01", 0, "active", 1, "u-v3", now, "u-v3", now]);
    await sourceDb.execute("INSERT INTO accounts(account_id,name,account_type,account_number,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["wallet-v3", "DANA Belanja", "ewallet", "", "shared", null, 0, "2026-01-01", 0, "active", 1, "u-v3", now, "u-v3", now]);

    const current = await snapshotDatabase(sourceDb);
    const legacyTables = structuredClone(current.tables);
    delete legacyTables.notification_preferences;
    legacyTables.accounts = legacyTables.accounts.map(({ account_number: _accountNumber, bank_template: _bankTemplate, ewallet_template: _ewalletTemplate, ...row }) => row);
    const legacyManifestTables = { ...current.manifest.tables };
    delete legacyManifestTables.notification_preferences;
    const manifest = { ...current.manifest, version: 3, schemaVersion: 3, tables: legacyManifestTables };
    const legacy = { manifest, tables: legacyTables };
    legacy.checksum = digest(canonicalJson(legacy));
    assert.equal(validateSnapshot(legacy), legacy.checksum);

    const v4 = structuredClone(legacy);
    v4.manifest.version = 4;
    v4.manifest.schemaVersion = 4;
    v4.tables.accounts = current.tables.accounts.map(({ bank_template: _bankTemplate, ewallet_template: _ewalletTemplate, ...row }) => row);
    v4.checksum = digest(canonicalJson({ manifest: v4.manifest, tables: v4.tables }));
    assert.equal(validateSnapshot(v4), v4.checksum);

    const v5 = structuredClone(current);
    v5.tables.accounts = v5.tables.accounts.map(({ ewallet_template: _ewalletTemplate, ...row }) => row);
    v5.manifest.version = 5;
    v5.manifest.schemaVersion = 5;
    delete v5.tables.notification_preferences;
    delete v5.manifest.tables.notification_preferences;
    v5.checksum = digest(canonicalJson({ manifest: v5.manifest, tables: v5.tables }));
    assert.equal(validateSnapshot(v5), v5.checksum);

    const v6 = structuredClone(current);
    v6.tables.accounts = v6.tables.accounts.map(({ ewallet_template: _ewalletTemplate, ...row }) => row);
    v6.manifest.version = 6;
    v6.manifest.schemaVersion = 6;
    delete v6.tables.notification_preferences;
    delete v6.manifest.tables.notification_preferences;
    v6.checksum = digest(canonicalJson({ manifest: v6.manifest, tables: v6.tables }));
    assert.equal(validateSnapshot(v6), v6.checksum);

    const v7 = structuredClone(current);
    v7.tables.accounts = v7.tables.accounts.map(({ ewallet_template: _ewalletTemplate, ...row }) => row);
    v7.manifest.version = 7;
    v7.manifest.schemaVersion = 7;
    v7.checksum = digest(canonicalJson({ manifest: v7.manifest, tables: v7.tables }));
    assert.equal(validateSnapshot(v7), v7.checksum);

    await targetDb.transaction(async (tx) => {
      await insertRows(tx, "users", legacy.tables.users);
      await insertRows(tx, "accounts", normalizeRestoredRows("accounts", legacy.tables.accounts));
    });
    const restored = await targetDb.one("SELECT account_number,bank_template,ewallet_template,name FROM accounts WHERE account_id='a-v3'");
    assert.equal(restored.account_number, "");
    assert.equal(restored.bank_template, "bni");
    assert.equal(restored.ewallet_template, "generic");
    assert.equal(restored.name, "Legacy · BNI");
    const restoredWallet = await targetDb.one("SELECT bank_template,ewallet_template,name FROM accounts WHERE account_id='wallet-v3'");
    assert.equal(restoredWallet.bank_template, "generic");
    assert.equal(restoredWallet.ewallet_template, "dana");
    assert.equal(restoredWallet.name, "DANA Belanja");
  } finally {
    sourceDb.close();
    targetDb.close();
  }
});
