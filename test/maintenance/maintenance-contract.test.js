import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { canonicalJson } from "../../api/_lib/services/core.js";
import { decodeBackup, digest, encodeBackup, insertRows, normalizeRestoredRows, snapshotDatabase, validateSnapshot } from "../../api/_lib/services/maintenance/shared.js";
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
  assert.match(maintenance, /"manual_reminders"/);
  assert.match(maintenance, /backupId\.slice\(-8\)/);
  assert.match(maintenance, /callGoogleBridge\("backup\.store"/);
});

test("gzip backup menyimpan nama JSON internal agar Google Drive tidak menampilkan item Unknown", () => {
  const payload = { manifest: { format: "saldo-bersama-backup" }, tables: {}, checksum: "test" };
  const innerName = "saldo-bersama-backup-v10-20260817T113606Z-bc0c2716.json";
  const compressed = Buffer.from(encodeBackup(payload, innerName), "base64");
  assert.equal(compressed[3] & 0x08, 0x08, "gzip wajib memiliki FNAME metadata");
  const nameEnd = compressed.indexOf(0, 10);
  assert.ok(nameEnd > 10, "nama file internal gzip harus diakhiri null byte");
  assert.equal(compressed.subarray(10, nameEnd).toString("latin1"), innerName);
  assert.deepEqual(decodeBackup(compressed.toString("base64")), payload);
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
  assert.match(maintenance, /previewUpdate\.rowsAffected !== 1/);
  assert.match(maintenance, /maintenanceUpdate\.rowsAffected !== 1/);
});

test("restore menghapus credential runtime lama, mempertahankan audit, dan tidak mengubah authorization canonical dari backup", async () => {
  const maintenance = await maintenanceSource();
  assert.match(maintenance, /"notification_deliveries", "notification_queue", "integration_links", "integration_outbox", "request_nonces"/);
  assert.match(maintenance, /"push_subscriptions"/);
  assert.doesNotMatch(maintenance, /BACKUP_TABLES[\s\S]{0,500}"push_subscriptions"/);
  assert.doesNotMatch(maintenance, /insertRows\(tx, "push_subscriptions"/);
  assert.doesNotMatch(maintenance, /RESTORE_DELETE_ORDER[\s\S]{0,400}"audit_log"/);
  assert.match(maintenance, /currentByEmail/);
  assert.match(maintenance, /context\.signedActor\.uid/);
  assert.match(maintenance, /RESTORE_IDENTITY_CONFLICT/);
  assert.match(maintenance, /current\?\.role \|\| user\.role/);
  assert.match(maintenance, /current\?\.status \|\| "inactive"/);
  assert.match(maintenance, /User canonical yang tidak ada di backup sengaja dibiarkan apa adanya/);
  assert.doesNotMatch(maintenance, /context\.allowedUsers|allowedRoleByEmail/);
  assert.match(maintenance, /insertRows\(tx, "audit_log"[\s\S]*INSERT OR IGNORE/);
  assert.match(maintenance, /DELETE FROM user_sessions/);
  assert.match(maintenance, /database_environment/);
  assert.match(maintenance, /scheduler_last_success_at/);
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



test("backup schema v16 menyimpan data canonical termasuk investasi dan request kolaborasi tanpa session, binding runtime, atau bucket rate limit", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = "2026-08-09T00:00:00.000Z";
    await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", ["u-pref", "firebase-pref", "pref@example.com", "Preference", "owner", "active", 1, now, now]);
    await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", ["u-member", "firebase-member", "member@example.com", "Member", "member", "active", 1, now, now]);
    await db.execute("INSERT INTO notification_preferences(user_id,notification_type,enabled,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?)", ["u-pref", "budget_threshold", 0, 1, now, now]);
    await db.execute("INSERT INTO manual_reminders(reminder_id,user_id,entity_type,entity_id,scheduled_at,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", ["reminder-v10", "u-pref", "budget", "budget-v10", "2026-08-18T01:00:00.000Z", "scheduled", 1, now, now]);
    await db.execute("INSERT INTO accounts(account_id,name,account_type,account_number,bank_template,ewallet_template,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["wallet-v8", "Belanja", "ewallet", "", "generic", "gopay", "shared", null, 0, "2026-01-01", 0, "active", 1, "u-pref", now, "u-pref", now]);
    await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["category-cost-v11", "Biaya Bersama", "expense", "variable", "other", "active", 1, "u-pref", now, "u-pref", now]);
    const costShareJson = JSON.stringify([{ user_id: "u-pref", basis_points: 5000, share_amount: 50 }, { user_id: "u-member", basis_points: 5000, share_amount: 50 }]);
    await db.execute(`INSERT INTO transactions(transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,recurring_occurrence_id,goal_id,amount,description,overspend_reason,merchant,payment_method,scope,owner_user_id,cost_share_mode,cost_share_json,status,row_version,idempotency_key,created_by,created_at,updated_by,updated_at,cancelled_by,cancelled_at,cancellation_reason)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["tx-cost-v11", "2026-08-09", "expense", "wallet-v8", null, "category-cost-v11", null, null, null, 100, "Shared split", "", "", "", "shared", null, "equal", costShareJson, "active", 1, "backup-cost-v11", "u-pref", now, "u-pref", now, null, null, ""]);
    await db.execute("INSERT INTO rate_limit_buckets(bucket_key,window_started_at_ms,reset_at_ms,request_count,updated_at) VALUES(?,?,?,?,?)", ["backup:test:abcdefghijklmnop", 1, 60_001, 3, now]);
    const snapshot = await snapshotDatabase(db);
    assert.equal(snapshot.manifest.schemaVersion, 16);
    assert.equal(snapshot.manifest.tables.notification_preferences, 1);
    assert.equal(snapshot.manifest.tables.manual_reminders, 1);
    assert.equal(snapshot.tables.notification_preferences[0].enabled, 0);
    assert.equal(snapshot.tables.manual_reminders[0].entity_type, "budget");
    assert.equal(snapshot.tables.accounts[0].ewallet_template, "gopay");
    assert.equal(snapshot.tables.transactions[0].cost_share_mode, "equal");
    assert.equal(snapshot.tables.transactions[0].cost_share_json, costShareJson);
    assert.equal(Object.hasOwn(snapshot.tables, "master_data_requests"), true);
    assert.equal(Object.hasOwn(snapshot.tables, "transfer_requests"), true);
    assert.equal(Object.hasOwn(snapshot.tables, "user_sessions"), false);
    assert.equal(Object.hasOwn(snapshot.tables, "rate_limit_buckets"), false);
    assert.equal(snapshot.tables.system_config.some((row) => [
      "database_environment", "maintenance_mode", "scheduler_last_run_at", "scheduler_last_success_at", "scheduler_last_failure_at", "scheduler_last_error_code",
    ].includes(row.key)), false);
    assert.equal(validateSnapshot(snapshot), snapshot.checksum);
  } finally { db.close(); }
});

test("backup schema v3-v15 tetap dapat dimuat ke schema v16 dengan field additive canonical", async () => {
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
    delete legacyTables.manual_reminders;
    legacyTables.accounts = legacyTables.accounts.map(({ account_number: _accountNumber, bank_template: _bankTemplate, ewallet_template: _ewalletTemplate, ...row }) => row);
    const legacyManifestTables = { ...current.manifest.tables };
    delete legacyManifestTables.notification_preferences;
    delete legacyManifestTables.manual_reminders;
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
    delete v5.tables.manual_reminders;
    delete v5.manifest.tables.manual_reminders;
    v5.checksum = digest(canonicalJson({ manifest: v5.manifest, tables: v5.tables }));
    assert.equal(validateSnapshot(v5), v5.checksum);

    const v6 = structuredClone(current);
    v6.tables.accounts = v6.tables.accounts.map(({ ewallet_template: _ewalletTemplate, ...row }) => row);
    v6.manifest.version = 6;
    v6.manifest.schemaVersion = 6;
    delete v6.tables.notification_preferences;
    delete v6.manifest.tables.notification_preferences;
    delete v6.tables.manual_reminders;
    delete v6.manifest.tables.manual_reminders;
    v6.checksum = digest(canonicalJson({ manifest: v6.manifest, tables: v6.tables }));
    assert.equal(validateSnapshot(v6), v6.checksum);

    const v7 = structuredClone(current);
    v7.tables.accounts = v7.tables.accounts.map(({ ewallet_template: _ewalletTemplate, ...row }) => row);
    v7.manifest.version = 7;
    v7.manifest.schemaVersion = 7;
    delete v7.tables.manual_reminders;
    delete v7.manifest.tables.manual_reminders;
    v7.checksum = digest(canonicalJson({ manifest: v7.manifest, tables: v7.tables }));
    assert.equal(validateSnapshot(v7), v7.checksum);

    const v8 = structuredClone(current);
    v8.manifest.version = 8;
    v8.manifest.schemaVersion = 8;
    delete v8.tables.manual_reminders;
    delete v8.manifest.tables.manual_reminders;
    v8.checksum = digest(canonicalJson({ manifest: v8.manifest, tables: v8.tables }));
    assert.equal(validateSnapshot(v8), v8.checksum);

    const v9 = structuredClone(current);
    v9.manifest.version = 9;
    v9.manifest.schemaVersion = 9;
    delete v9.tables.manual_reminders;
    delete v9.manifest.tables.manual_reminders;
    v9.checksum = digest(canonicalJson({ manifest: v9.manifest, tables: v9.tables }));
    assert.equal(validateSnapshot(v9), v9.checksum);

    const v10 = structuredClone(current);
    v10.manifest.version = 10;
    v10.manifest.schemaVersion = 10;
    v10.tables.transactions = v10.tables.transactions.map(({ cost_share_mode: _mode, cost_share_json: _json, ...row }) => row);
    v10.checksum = digest(canonicalJson({ manifest: v10.manifest, tables: v10.tables }));
    assert.equal(validateSnapshot(v10), v10.checksum);
    assert.deepEqual(normalizeRestoredRows("transactions", [{ transaction_id: "tx-v10" }])[0], { transaction_id: "tx-v10", cost_share_mode: "unspecified", cost_share_json: "[]" });

    const v11 = structuredClone(current);
    v11.manifest.version = 11;
    v11.manifest.schemaVersion = 11;
    v11.checksum = digest(canonicalJson({ manifest: v11.manifest, tables: v11.tables }));
    assert.equal(validateSnapshot(v11), v11.checksum);

    const v12 = structuredClone(current);
    v12.manifest.version = 12;
    v12.manifest.schemaVersion = 12;
    v12.checksum = digest(canonicalJson({ manifest: v12.manifest, tables: v12.tables }));
    assert.equal(validateSnapshot(v12), v12.checksum);

    const v13 = structuredClone(current);
    v13.manifest.version = 13;
    v13.manifest.schemaVersion = 13;
    v13.tables.users = v13.tables.users.map(({ photo_url: _photoUrl, ...row }) => row);
    delete v13.tables.master_data_requests;
    delete v13.tables.transfer_requests;
    delete v13.manifest.tables.master_data_requests;
    delete v13.manifest.tables.transfer_requests;
    v13.checksum = digest(canonicalJson({ manifest: v13.manifest, tables: v13.tables }));
    assert.equal(validateSnapshot(v13), v13.checksum);

    const v14 = structuredClone(current);
    v14.manifest.version = 14;
    v14.manifest.schemaVersion = 14;
    for (const table of ["investment_instruments", "investment_portfolios", "investment_trades", "investment_valuations", "investment_reconciliations", "investment_corrections"]) {
      delete v14.tables[table];
      delete v14.manifest.tables[table];
    }
    v14.checksum = digest(canonicalJson({ manifest: v14.manifest, tables: v14.tables }));
    assert.equal(validateSnapshot(v14), v14.checksum);

    const v15Trade = normalizeRestoredRows("investment_trades", [{ trade_id: "trade-v15" }])[0];
    assert.equal(v15Trade.notes, "");
    const v15Correction = normalizeRestoredRows("investment_corrections", [{ correction_id: "correction-v15" }])[0];
    assert.deepEqual(v15Correction, { correction_id: "correction-v15", correction_type: "correction", reference_price: 0, notes: "" });

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
