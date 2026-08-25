import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrationDirectory = new URL("../../database/migrations/", import.meta.url);
const initialMigrationUrl = new URL("001_initial_schema.sql", migrationDirectory);
const accountNumberMigrationUrl = new URL("002_account_number.sql", migrationDirectory);
const bankTemplateMigrationUrl = new URL("003_account_bank_template.sql", migrationDirectory);
const notificationDeliveriesMigrationUrl = new URL("004_notification_deliveries.sql", migrationDirectory);
const notificationPreferencesMigrationUrl = new URL("005_notification_preferences.sql", migrationDirectory);
const ewalletTemplateMigrationUrl = new URL("006_account_ewallet_template.sql", migrationDirectory);
const envelopeAssigneeMigrationUrl = new URL("007_envelope_assignee.sql", migrationDirectory);
const manualRemindersMigrationUrl = new URL("008_manual_reminders.sql", migrationDirectory);
const transactionCostSharingMigrationUrl = new URL("009_transaction_cost_sharing.sql", migrationDirectory);
const environmentSessionsMigrationUrl = new URL("010_environment_sessions.sql", migrationDirectory);
const distributedRateLimitsMigrationUrl = new URL("011_distributed_rate_limits.sql", migrationDirectory);
const memberCollaborationMigrationUrl = new URL("012_member_collaboration.sql", migrationDirectory);

const migrationSql = async () => {
  const files = (await readdir(migrationDirectory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  const sources = await Promise.all(files.map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
  return sources.join("\n").replaceAll("-- migrate:split", "");
};

const migrationSqlThrough = async (lastName) => {
  const files = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name) && name <= lastName)
    .sort();
  const sources = await Promise.all(files.map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
  return sources.join("\n").replaceAll("-- migrate:split", "");
};

const validateWithSqlite = async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(await migrationSql());
    const now = "2026-08-01T15:00:00.000Z";
    db.prepare("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run("u1", "firebase-1", "owner@example.com", "Owner", "owner", "active", 1, now, now);
    const accountInsert = "INSERT INTO accounts(account_id,name,account_type,account_number,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    db.prepare(accountInsert).run("a1", "Kas", "cash", "", "shared", null, 100000, "2026-01-01", 0, "active", 1, "u1", now, "u1", now);
    db.prepare(accountInsert).run("a2", "Bank", "bank", "1234567890", "shared", null, 0, "2026-01-01", 0, "active", 1, "u1", now, "u1", now);
    db.prepare(accountInsert).run("a3", "DANA Harian", "ewallet", "", "shared", null, 0, "2026-01-01", 0, "active", 1, "u1", now, "u1", now);
    db.prepare("UPDATE accounts SET bank_template='bni' WHERE account_id='a2'").run();
    db.prepare("UPDATE accounts SET ewallet_template='dana' WHERE account_id='a3'").run();
    db.prepare("INSERT INTO categories VALUES(?,?,?,?,?,?,?,?,?,?,?)").run("c1", "Makan", "expense", "variable", "", "active", 1, "u1", now, "u1", now);

    const rejected = (statement, args = []) => {
      try { db.prepare(statement).run(...args); return false; }
      catch { return true; }
    };

    const tx = "INSERT INTO transactions(transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,recurring_occurrence_id,goal_id,amount,description,overspend_reason,merchant,payment_method,scope,owner_user_id,status,row_version,idempotency_key,created_by,created_at,updated_by,updated_at,cancelled_by,cancelled_at,cancellation_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    const base = ["t1", "2026-08-01", "expense", "a1", null, "c1", null, null, null, 10000, "Makan", "", "", "", "shared", null, "active", 1, "key-1", "u1", now, "u1", now, null, null, ""];
    db.prepare(tx).run(...base);

    const floatTx = [...base]; floatTx[0] = "t-float"; floatTx[9] = 1.5; floatTx[18] = "key-float";
    const sameTx = [...base]; sameTx[0] = "t-same"; sameTx[2] = "transfer"; sameTx[4] = "a1"; sameTx[5] = null; sameTx[18] = "key-same";
    const fkTx = [...base]; fkTx[0] = "t-fk"; fkTx[3] = "missing"; fkTx[18] = "key-fk";
    const duplicateIdempotency = [...base]; duplicateIdempotency[0] = "t-duplicate-idempotency";
    const invalidExpenseShape = [...base]; invalidExpenseShape[0] = "t-invalid-expense"; invalidExpenseShape[4] = "a2"; invalidExpenseShape[18] = "key-invalid-expense";
    const invalidCancellation = [...base]; invalidCancellation[0] = "t-invalid-cancel"; invalidCancellation[18] = "key-invalid-cancel"; invalidCancellation[23] = "u1"; invalidCancellation[24] = now; invalidCancellation[25] = "dibatalkan tetapi status aktif";

    db.prepare("INSERT INTO audit_log VALUES(?,?,?,?,?,?,?,?,?,?,?)").run("audit1", "req1", now, "u1", "owner@example.com", "test", "transaction", "t1", null, "{}", "success");
    const outboxInsert = "INSERT INTO integration_outbox VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    db.prepare(outboxInsert).run("done", "sheets", "upsert", "transaction", "t1", "sheets:upsert:transaction:t1", "{}", "completed", 0, now, null, null, "", "", now, now, now);
    db.prepare(outboxInsert).run("working", "sheets", "upsert", "transaction", "t1", "sheets:upsert:transaction:t1", "{}", "processing", 0, now, now, "worker", "", "", now, now, null);
    db.prepare(outboxInsert).run("waiting", "sheets", "upsert", "transaction", "t1", "sheets:upsert:transaction:t1", "{}", "pending", 0, now, null, null, "", "", now, now, null);

    const tableCount = db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'").get().count;
    const transactionSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='transactions'").get().sql;
    const importColumns = db.prepare("PRAGMA table_info(import_previews)").all();
    const restoreColumns = db.prepare("PRAGMA table_info(restore_previews)").all();

    return {
      schema_version: db.prepare("SELECT value FROM system_config WHERE key='schema_version'").get().value,
      table_count: tableCount,
      foreign_keys: db.prepare("PRAGMA foreign_keys").get().foreign_keys,
      strict_transactions: transactionSql.toUpperCase().includes("STRICT"),
      float_rejected: rejected(tx, floatTx),
      same_account_rejected: rejected(tx, sameTx),
      foreign_key_rejected: rejected(tx, fkTx),
      duplicate_idempotency_rejected: rejected(tx, duplicateIdempotency),
      invalid_expense_shape_rejected: rejected(tx, invalidExpenseShape),
      invalid_cancellation_metadata_rejected: rejected(tx, invalidCancellation),
      negative_initial_without_permission_rejected: rejected(accountInsert, ["a-negative", "Minus", "cash", "", "shared", null, -1, "2026-01-01", 0, "active", 1, "u1", now, "u1", now]),
      invalid_account_number_rejected: rejected(accountInsert, ["a-invalid-number", "Bank invalid", "bank", "12A34", "shared", null, 0, "2026-01-01", 0, "active", 1, "u1", now, "u1", now]),
      non_bank_account_number_rejected: rejected(accountInsert, ["a-cash-number", "Cash invalid", "cash", "123456", "shared", null, 0, "2026-01-01", 0, "active", 1, "u1", now, "u1", now]),
      invalid_bank_template_rejected: rejected("UPDATE accounts SET bank_template='visa' WHERE account_id='a2'"),
      non_bank_template_rejected: rejected("UPDATE accounts SET bank_template='bca' WHERE account_id='a1'"),
      bank_template_saved: db.prepare("SELECT bank_template FROM accounts WHERE account_id='a2'").get().bank_template === "bni",
      invalid_ewallet_template_rejected: rejected("UPDATE accounts SET ewallet_template='paypal' WHERE account_id='a3'"),
      non_ewallet_template_rejected: rejected("UPDATE accounts SET ewallet_template='dana' WHERE account_id='a1'"),
      ewallet_template_saved: db.prepare("SELECT ewallet_template FROM accounts WHERE account_id='a3'").get().ewallet_template === "dana",
      audit_update_rejected: rejected("UPDATE audit_log SET action='changed' WHERE audit_id='audit1'"),
      audit_delete_rejected: rejected("DELETE FROM audit_log WHERE audit_id='audit1'"),
      second_pending_rejected: rejected(outboxInsert, ["waiting2", "sheets", "upsert", "transaction", "t1", "sheets:upsert:transaction:t1", "{}", "pending", 0, now, null, null, "", "", now, now, null]),
      processing_and_pending_coexist: db.prepare("SELECT COUNT(*) AS count FROM integration_outbox WHERE event_key=? AND status IN ('processing','pending')").get("sheets:upsert:transaction:t1").count === 2,
      import_status_column: importColumns.some((row) => row.name === "status"),
      restore_result_column: restoreColumns.some((row) => row.name === "result_json"),
    };
  } finally {
    db.close();
  }
};

test("schema Turso/SQLite v14 dapat dibuat lengkap dan foreign key aktif", async () => {
  const result = await validateWithSqlite();
  assert.equal(result.schema_version, "14");
  assert.ok(result.table_count >= 30);
  assert.equal(result.foreign_keys, 1);
  assert.equal(result.strict_transactions, true);
});

test("constraint finansial, audit append-only, dan outbox coalescing ditegakkan database", async () => {
  const result = await validateWithSqlite();
  for (const key of ["float_rejected", "same_account_rejected", "foreign_key_rejected", "duplicate_idempotency_rejected", "invalid_expense_shape_rejected", "invalid_cancellation_metadata_rejected", "negative_initial_without_permission_rejected", "invalid_account_number_rejected", "non_bank_account_number_rejected", "invalid_bank_template_rejected", "non_bank_template_rejected", "bank_template_saved", "invalid_ewallet_template_rejected", "non_ewallet_template_rejected", "ewallet_template_saved", "audit_update_rejected", "audit_delete_rejected", "second_pending_rejected", "processing_and_pending_coexist"]) {
    assert.equal(result[key], true, key);
  }
});

test("preview import/restore menyimpan status hasil agar retry tidak menggandakan operasi", async () => {
  const result = await validateWithSqlite();
  assert.equal(result.import_status_column, true);
  assert.equal(result.restore_result_column, true);
});

test("migration menggunakan satu statement per split HTTP, STRICT, index periode, dan tanpa cascade delete finansial", async () => {
  const sql = await readFile(initialMigrationUrl, "utf8");
  const chunks = sql.split(/^\s*-- migrate:split\s*$/m).map((item) => item.trim()).filter(Boolean);
  assert.ok(chunks.length >= 40);
  assert.doesNotMatch(chunks[0], /PRAGMA\s+foreign_keys[\s\S]*CREATE TABLE/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS transactions[\s\S]*\) STRICT;/);
  assert.match(sql, /idx_transactions_actor_idempotency[\s\S]*created_by, idempotency_key/);
  assert.match(sql, /idx_transactions_period/);
  assert.match(sql, /status IN \('pending','applying','applied'\)/);
  assert.match(sql, /idx_outbox_coalesced_waiting[\s\S]*WHERE status IN \('pending','failed'\)/);
  assert.doesNotMatch(sql, /ON DELETE CASCADE/);
});


test("migration v4 menambahkan nomor rekening terformat digit tanpa merusak data lama", async () => {
  const sql = await readFile(accountNumberMigrationUrl, "utf8");
  assert.match(sql, /ALTER TABLE accounts[\s\S]*ADD COLUMN account_number/);
  assert.match(sql, /account_type = 'bank'/);
  assert.match(sql, /length\(account_number\) BETWEEN 6 AND 34/);
  assert.match(sql, /value = '4'/);
});


test("migration v5 menyimpan template kartu terpisah tanpa mengubah nama dan saldo", async () => {
  const sql = await readFile(bankTemplateMigrationUrl, "utf8");
  assert.match(sql, /ALTER TABLE accounts[\s\S]*ADD COLUMN bank_template/);
  assert.match(sql, /bank_template IN \('generic','bca','bni','btn','mandiri','permata'\)/);
  assert.match(sql, /WHERE account_type = 'bank'/);
  assert.match(sql, /value = '5'/);
  assert.doesNotMatch(sql, /UPDATE accounts\s+SET name/i);
});


test("migration v6 menambahkan delivery per subscription untuk retry Web Push tanpa duplikasi perangkat sukses", async () => {
  const sql = await readFile(notificationDeliveriesMigrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS notification_deliveries/);
  assert.match(sql, /UNIQUE\(notification_id, subscription_id\)/);
  assert.match(sql, /status IN \('pending','processing','sent','failed','expired','dead_letter'\)/);
  assert.match(sql, /idx_notification_deliveries_ready/);
  assert.match(sql, /value = '6'/);
  assert.doesNotMatch(sql, /ON DELETE CASCADE/);
});


test("migration v7 menambah preferensi notifikasi per pengguna tanpa menyimpan preference di client", async () => {
  const sql = await readFile(notificationPreferencesMigrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS notification_preferences/);
  assert.match(sql, /PRIMARY KEY \(user_id, notification_type\)/);
  assert.match(sql, /enabled INTEGER NOT NULL DEFAULT 1/);
  assert.match(sql, /row_version INTEGER NOT NULL DEFAULT 1/);
  assert.match(sql, /recurring_funding_shortage/);
  assert.match(sql, /value = '7'/);
  assert.doesNotMatch(sql, /ON DELETE CASCADE/);
});

test("migration v8 meng-upgrade database v7 tanpa mengubah nama/saldo dan tanpa false-positive provider", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(await migrationSqlThrough("005_notification_preferences.sql"));
    const now = "2026-08-01T15:00:00.000Z";
    db.prepare("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run("u1", "firebase-1", "owner@example.com", "Owner", "owner", "active", 1, now, now);
    const insert = "INSERT INTO accounts(account_id,name,account_type,account_number,bank_template,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    const rows = [
      ["w-dana", "DANA Belanja", "ewallet", 125000],
      ["w-dana-lower", "Dana darurat", "ewallet", 50000],
      ["w-ovo", "OVO - Harian", "ewallet", 75000],
      ["w-novotel", "Novotel", "ewallet", 10000],
      ["w-shopee", "ShopeePay Utama", "ewallet", 0],
      ["w-gopay", "Go Pay Transport", "ewallet", 0],
      ["w-linkaja", "Link Aja! Pulsa", "ewallet", 0],
      ["cash-dana", "DANA Kas", "cash", 90000],
    ];
    for (const [id, name, type, balance] of rows) {
      db.prepare(insert).run(id, name, type, "", "generic", "shared", null, balance, "2026-01-01", 0, "active", 1, "u1", now, "u1", now);
    }

    db.exec((await readFile(ewalletTemplateMigrationUrl, "utf8")).replaceAll("-- migrate:split", ""));
    const provider = (id) => db.prepare("SELECT ewallet_template FROM accounts WHERE account_id=?").get(id).ewallet_template;
    assert.equal(provider("w-dana"), "dana");
    assert.equal(provider("w-dana-lower"), "generic");
    assert.equal(provider("w-ovo"), "ovo");
    assert.equal(provider("w-novotel"), "generic");
    assert.equal(provider("w-shopee"), "shopeepay");
    assert.equal(provider("w-gopay"), "gopay");
    assert.equal(provider("w-linkaja"), "linkaja");
    assert.equal(provider("cash-dana"), "generic");
    const preserved = db.prepare("SELECT name,initial_balance FROM accounts WHERE account_id='w-dana'").get();
    assert.equal(preserved.name, "DANA Belanja");
    assert.equal(preserved.initial_balance, 125000);
    assert.equal(db.prepare("SELECT value FROM system_config WHERE key='schema_version'").get().value, "8");
  } finally {
    db.close();
  }
});

test("migration v8 menyimpan provider E-wallet terpisah dan hanya untuk rekening E-wallet", async () => {
  const sql = await readFile(ewalletTemplateMigrationUrl, "utf8");
  const chunks = sql.split(/^\s*-- migrate:split\s*$/m).map((item) => item.trim()).filter(Boolean);
  assert.equal(chunks.length, 3);
  assert.match(sql, /ALTER TABLE accounts[\s\S]*ADD COLUMN ewallet_template/);
  assert.match(sql, /ewallet_template IN \('generic','shopeepay','dana','gopay','ovo','linkaja'\)/);
  assert.match(sql, /GLOB '\* DANA \*'/);
  assert.match(sql, /LIKE '% ovo %'/);
  assert.match(sql, /WHERE account_type = 'ewallet'/);
  assert.match(sql, /value = '8'/);
  assert.doesNotMatch(sql, /UPDATE accounts\s+SET name/i);
});


test("migration v9 menambah penerima jatah dan membackfill kantong personal tanpa mengubah shared", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(await migrationSqlThrough("006_account_ewallet_template.sql"));
    const now = "2026-08-12T00:00:00.000Z";
    db.prepare("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run("u-admin", "firebase-admin", "admin@example.com", "Admin", "owner", "active", 1, now, now);
    db.prepare("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run("u-member", "firebase-member", "member@example.com", "Member", "member", "active", 1, now, now);
    const insertRule = `INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    db.prepare(insertRule).run("rule-personal", "Makan Member", "monthly", "personal", "u-member", 100000, null, "unallocated", "confirm", "active", 1, "u-admin", now, "u-admin", now);
    db.prepare(insertRule).run("rule-shared", "Makan Bersama", "monthly", "shared", null, 100000, null, "unallocated", "confirm", "active", 1, "u-admin", now, "u-admin", now);

    db.exec((await readFile(envelopeAssigneeMigrationUrl, "utf8")).replaceAll("-- migrate:split", ""));
    assert.equal(db.prepare("SELECT assignee_user_id FROM envelope_rules WHERE envelope_rule_id='rule-personal'").get().assignee_user_id, "u-member");
    assert.equal(db.prepare("SELECT assignee_user_id FROM envelope_rules WHERE envelope_rule_id='rule-shared'").get().assignee_user_id, null);
    assert.equal(db.prepare("SELECT value FROM system_config WHERE key='schema_version'").get().value, "9");
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_envelope_rules_assignee'").get());
  } finally {
    db.close();
  }
});


test("migration v10 menambah pengingat manual one-shot dengan ownership user dan optimistic version", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(await migrationSqlThrough("007_envelope_assignee.sql"));
    const now = "2026-08-17T11:00:00.000Z";
    db.prepare("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run("u-reminder", "firebase-reminder", "reminder@example.com", "Reminder", "member", "active", 1, now, now);

    db.exec((await readFile(manualRemindersMigrationUrl, "utf8")).replaceAll("-- migrate:split", ""));
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='manual_reminders'").get().sql;
    assert.match(sql, /entity_type IN \('recurring_occurrence','budget','envelope_period','goal'\)/);
    assert.match(sql, /status IN \('scheduled','queued','cancelled'\)/);
    assert.match(sql, /row_version INTEGER NOT NULL DEFAULT 1 CHECK \(row_version >= 1\)/);
    assert.match(sql, /FOREIGN KEY \(user_id\) REFERENCES users\(user_id\) ON DELETE RESTRICT/);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_manual_reminders_active_entity'").get());
    assert.equal(db.prepare("SELECT value FROM system_config WHERE key='schema_version'").get().value, "10");

    const insert = "INSERT INTO manual_reminders(reminder_id,user_id,entity_type,entity_id,scheduled_at,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)";
    db.prepare(insert).run("m1", "u-reminder", "budget", "budget-1", "2026-08-18T01:00:00.000Z", "scheduled", 1, now, now);
    assert.throws(() => db.prepare(insert).run("m2", "u-reminder", "budget", "budget-1", "2026-08-18T02:00:00.000Z", "scheduled", 1, now, now));
    assert.throws(() => db.prepare(insert).run("m3", "missing-user", "goal", "goal-1", "2026-08-18T02:00:00.000Z", "scheduled", 1, now, now));
    assert.throws(() => db.prepare(insert).run("m4", "u-reminder", "transaction", "tx-1", "2026-08-18T02:00:00.000Z", "scheduled", 1, now, now));
  } finally {
    db.close();
  }
});


test("migration v11 menambah snapshot pembagian beban tanpa mengubah transaksi lama", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(await migrationSqlThrough("008_manual_reminders.sql"));
    const now = "2026-08-19T03:00:00.000Z";
    db.prepare("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run("u-cost", "uid-cost", "cost@example.com", "Cost", "owner", "active", 1, now, now);
    db.prepare("INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("a-cost", "Kas", "cash", "shared", null, 1000, "2026-01-01", 0, "active", 1, "u-cost", now, "u-cost", now);
    db.prepare("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run("c-cost", "Makan", "expense", "variable", "", "active", 1, "u-cost", now, "u-cost", now);
    db.prepare("INSERT INTO transactions(transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,recurring_occurrence_id,goal_id,amount,description,overspend_reason,merchant,payment_method,scope,owner_user_id,status,row_version,idempotency_key,created_by,created_at,updated_by,updated_at,cancelled_by,cancelled_at,cancellation_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("t-legacy", "2026-08-19", "expense", "a-cost", null, "c-cost", null, null, null, 100, "Legacy", "", "", "", "shared", null, "active", 1, "legacy-key", "u-cost", now, "u-cost", now, null, null, "");
    db.exec((await readFile(transactionCostSharingMigrationUrl, "utf8")).replaceAll("-- migrate:split", ""));
    const row = db.prepare("SELECT cost_share_mode,cost_share_json FROM transactions WHERE transaction_id='t-legacy'").get();
    assert.equal(row.cost_share_mode, "unspecified");
    assert.equal(row.cost_share_json, "[]");
    assert.equal(db.prepare("SELECT value FROM system_config WHERE key='schema_version'").get().value, "11");
  } finally { db.close(); }
});


test("migration v12 menambah registry sesi, binding environment, dan heartbeat tanpa menyentuh ledger", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(await migrationSqlThrough("009_transaction_cost_sharing.sql"));
    const now = "2026-08-23T00:00:00.000Z";
    db.prepare("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run("u-session", "uid-session", "session@example.com", "Session", "owner", "active", 1, now, now);
    db.exec((await readFile(environmentSessionsMigrationUrl, "utf8")).replaceAll("-- migrate:split", ""));
    assert.equal(db.prepare("SELECT value FROM system_config WHERE key='schema_version'").get().value, "12");
    assert.equal(db.prepare("SELECT value FROM system_config WHERE key='database_environment'").get().value, "unbound");
    const insert = "INSERT INTO user_sessions(session_id,user_id,verifier_hash,issued_at,expires_at,last_seen_at,revoked_at,revoked_reason,device_label,client_family,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)";
    db.prepare(insert).run("session-1234567890123456789012", "u-session", "a".repeat(64), now, "2026-08-24T00:00:00.000Z", now, null, null, "Chrome · Windows", "Chrome", 1, now, now);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM user_sessions").get().count, 1);
    assert.throws(() => db.prepare(insert).run("session-invalid-verifier-000001", "u-session", "raw-secret", now, "2026-08-24T00:00:00.000Z", now, null, null, "Chrome", "Chrome", 1, now, now));
  } finally { db.close(); }
});

test("migration v13 menambah bucket rate limit durable tanpa mengubah ledger atau binding environment", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(await migrationSqlThrough("010_environment_sessions.sql"));
    const beforeTransactions = db.prepare("SELECT COUNT(*) AS count FROM transactions").get().count;
    const beforeEnvironment = db.prepare("SELECT value FROM system_config WHERE key='database_environment'").get().value;
    db.exec((await readFile(distributedRateLimitsMigrationUrl, "utf8")).replaceAll("-- migrate:split", ""));
    assert.equal(db.prepare("SELECT value FROM system_config WHERE key='schema_version'").get().value, "13");
    assert.equal(db.prepare("SELECT value FROM system_config WHERE key='database_environment'").get().value, beforeEnvironment);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions").get().count, beforeTransactions);
    const insert = "INSERT INTO rate_limit_buckets(bucket_key,window_started_at_ms,reset_at_ms,request_count,updated_at) VALUES(?,?,?,?,?)";
    assert.throws(() => db.prepare(insert).run("short", 1, 2, 1, "2026-08-24T00:00:00.000Z"));
    assert.throws(() => db.prepare(insert).run("scope:abcdefghijklmnop", 10, 10, 1, "2026-08-24T00:00:00.000Z"));
    db.prepare(insert).run("scope:abcdefghijklmnop", 10, 20, 1, "2026-08-24T00:00:00.000Z");
    assert.equal(db.prepare("SELECT request_count FROM rate_limit_buckets WHERE bucket_key=?").get("scope:abcdefghijklmnop").request_count, 1);
  } finally { db.close(); }
});


test("migration v14 menambah kolaborasi Member secara additive tanpa mengubah ledger", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(await migrationSqlThrough("011_distributed_rate_limits.sql"));
    const now = "2026-08-25T08:00:00.000Z";
    db.prepare("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run("u-v14", "uid-v14", "v14@example.com", "V14", "member", "active", 1, now, now);
    const beforeTransactions = db.prepare("SELECT COUNT(*) AS count FROM transactions").get().count;

    db.exec((await readFile(memberCollaborationMigrationUrl, "utf8")).replaceAll("-- migrate:split", ""));

    assert.equal(db.prepare("SELECT value FROM system_config WHERE key='schema_version'").get().value, "14");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions").get().count, beforeTransactions);
    const photo = db.prepare("SELECT photo_url FROM users WHERE user_id='u-v14'").get();
    assert.equal(photo.photo_url, "");
    assert.throws(() => db.prepare("UPDATE users SET photo_url=? WHERE user_id='u-v14'").run("https://evil.example/avatar.png"));
    db.prepare("UPDATE users SET photo_url=? WHERE user_id='u-v14'").run("https://lh3.googleusercontent.com/a/example");
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='master_data_requests'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='transfer_requests'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_master_data_requests_pending_unique'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_transfer_requests_pending_unique'").get());
  } finally { db.close(); }
});
