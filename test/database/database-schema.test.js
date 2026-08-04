import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrationDirectory = new URL("../../database/migrations/", import.meta.url);
const initialMigrationUrl = new URL("001_initial_schema.sql", migrationDirectory);
const accountNumberMigrationUrl = new URL("002_account_number.sql", migrationDirectory);
const bankTemplateMigrationUrl = new URL("003_account_bank_template.sql", migrationDirectory);

const migrationSql = async () => {
  const files = (await readdir(migrationDirectory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  const sources = await Promise.all(files.map((name) => readFile(new URL(name, migrationDirectory), "utf8")));
  return sources.join("\n").replaceAll("-- migrate:split", "");
};

const validateWithSqlite = async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(await migrationSql());
    const now = "2026-08-01T15:00:00.000Z";
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?)").run("u1", "firebase-1", "owner@example.com", "Owner", "owner", "active", 1, now, now);
    const accountInsert = "INSERT INTO accounts(account_id,name,account_type,account_number,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    db.prepare(accountInsert).run("a1", "Kas", "cash", "", "shared", null, 100000, "2026-01-01", 0, "active", 1, "u1", now, "u1", now);
    db.prepare(accountInsert).run("a2", "Bank", "bank", "1234567890", "shared", null, 0, "2026-01-01", 0, "active", 1, "u1", now, "u1", now);
    db.prepare("UPDATE accounts SET bank_template='bni' WHERE account_id='a2'").run();
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

test("schema Turso/SQLite v5 dapat dibuat lengkap dan foreign key aktif", async () => {
  const result = await validateWithSqlite();
  assert.equal(result.schema_version, "5");
  assert.ok(result.table_count >= 24);
  assert.equal(result.foreign_keys, 1);
  assert.equal(result.strict_transactions, true);
});

test("constraint finansial, audit append-only, dan outbox coalescing ditegakkan database", async () => {
  const result = await validateWithSqlite();
  for (const key of ["float_rejected", "same_account_rejected", "foreign_key_rejected", "duplicate_idempotency_rejected", "invalid_expense_shape_rejected", "invalid_cancellation_metadata_rejected", "negative_initial_without_permission_rejected", "invalid_account_number_rejected", "non_bank_account_number_rejected", "invalid_bank_template_rejected", "non_bank_template_rejected", "bank_template_saved", "audit_update_rejected", "audit_delete_rejected", "second_pending_rejected", "processing_and_pending_coexist"]) {
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
