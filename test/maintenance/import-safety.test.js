import assert from "node:assert/strict";
import test from "node:test";
import { createTransactionInternal } from "../../api/_lib/services/finance.js";
import { applyImport, previewImport } from "../../api/_lib/services/maintenance/import.js";
import { nowIso } from "../../api/_lib/services/core.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const actor = {
  user_id: "import-owner",
  firebase_uid: "firebase-import-owner",
  email: "import-owner@example.com",
  name: "Import Owner",
  role: "owner",
  status: "active",
  row_version: 1,
};

const context = (action, payload = {}, idempotencyKey = `${action}:${crypto.randomUUID()}`) => ({
  actor,
  signedActor: { uid: actor.firebase_uid, email: actor.email, name: actor.name },
  allowedUsers: [{ email: actor.email, role: "owner" }],
  action,
  payload,
  requestId: `test:${action}`,
  idempotencyKey,
  enqueueMirror: async () => {},
  enqueueCalendar: async () => {},
  today: "2026-08-13",
});

const seed = async (db, { balance = 100_000, envelope = false } = {}) => {
  const timestamp = nowIso();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [actor.user_id, actor.firebase_uid, actor.email, actor.name, "owner", "active", 1, timestamp, timestamp],
  );
  await db.execute(
    "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["account-import", "Rekening Import", "bank", "shared", null, balance, "2026-01-01", 0, "active", 1, actor.user_id, timestamp, actor.user_id, timestamp],
  );
  await db.execute(
    "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ["category-import", "Belanja", "expense", "variable", "", "active", 1, actor.user_id, timestamp, actor.user_id, timestamp],
  );
  if (envelope) {
    await db.execute(
      "INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["rule-import", "Kantong Import", "monthly", "shared", null, 100_000, null, "unallocated", "block", "active", 1, actor.user_id, timestamp, actor.user_id, timestamp],
    );
    await db.execute(
      "INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["period-import", "rule-import", "Kantong Import", "2026-08-01", "2026-08-31", 100_000, 0, "active", 1, actor.user_id, timestamp, actor.user_id, timestamp, null, null],
    );
  }
};

const expense = (amount, description, extra = {}) => ({
  transaction_date: "2026-08-13",
  transaction_type: "expense",
  source_account_id: "account-import",
  category_id: "category-import",
  amount,
  description,
  ...extra,
});

const withBridgeStub = async (callback) => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.GOOGLE_BRIDGE_WEB_APP_URL;
  const originalSecret = process.env.GOOGLE_BRIDGE_SHARED_SECRET;
  process.env.GOOGLE_BRIDGE_WEB_APP_URL = "https://bridge.invalid.test";
  process.env.GOOGLE_BRIDGE_SHARED_SECRET = "test-secret-at-least-thirty-two-characters";
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    const { action } = JSON.parse(request.message);
    if (action === "backup.store") return { ok: true, text: async () => JSON.stringify({ ok: true, data: { fileId: `drive-${crypto.randomUUID()}` } }) };
    return { ok: false, text: async () => JSON.stringify({ ok: false, error: { code: "UNEXPECTED_ACTION" } }) };
  };
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.GOOGLE_BRIDGE_WEB_APP_URL; else process.env.GOOGLE_BRIDGE_WEB_APP_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.GOOGLE_BRIDGE_SHARED_SECRET; else process.env.GOOGLE_BRIDGE_SHARED_SECRET = originalSecret;
  }
};

test("import unacceptable tidak dapat partial apply", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const preview = await previewImport(db, context("import.preview", { records: [expense(10_000, "Valid"), expense(10_000, "Kategori invalid", { category_id: "missing" })] }));
    assert.equal(preview.acceptable, false);
    assert.equal(preview.validCount, 1);
    assert.equal(preview.invalid.length, 1);
    await assert.rejects(
      () => applyImport(db, context("import.apply", { previewToken: preview.previewToken, confirmation: "IMPORT TRANSAKSI" })),
      (error) => error.code === "IMPORT_PREVIEW_NOT_ACCEPTABLE",
    );
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM transactions")).count, 0);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM backup_runs")).count, 0, "Preview yang ditolak tidak boleh membuat safety backup sia-sia.");
  } finally { db.close(); }
});

test("control field confirm_duplicate dari file diabaikan dan duplicate tetap terdeteksi", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await createTransactionInternal(db, context("transactions.create", {}, "existing-transaction"), expense(10_000, "Duplikat"), { audit: false });
    const preview = await previewImport(db, context("import.preview", { records: [expense(10_000, "Duplikat", { confirm_duplicate: true, created_by: "attacker" })] }));
    assert.equal(preview.acceptable, false);
    assert.equal(preview.validCount, 0);
    assert.equal(preview.duplicates.length, 1);
    assert.equal(preview.duplicates[0].code, "POSSIBLE_DUPLICATE");
  } finally { db.close(); }
});

test("preview import mensimulasikan saldo secara kumulatif", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db, { balance: 100_000 });
    const preview = await previewImport(db, context("import.preview", { records: [expense(60_000, "Tahap 1"), expense(60_000, "Tahap 2")] }));
    assert.equal(preview.acceptable, false);
    assert.equal(preview.validCount, 1);
    assert.equal(preview.invalid.length, 1);
    assert.equal(preview.invalid[0].code, "INSUFFICIENT_BALANCE");
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM transactions")).count, 0, "Simulasi preview wajib rollback penuh.");
  } finally { db.close(); }
});

test("preview import mensimulasikan envelope secara kumulatif", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db, { balance: 500_000, envelope: true });
    const records = [expense(60_000, "Kantong 1", { envelope_period_id: "period-import" }), expense(60_000, "Kantong 2", { envelope_period_id: "period-import" })];
    const preview = await previewImport(db, context("import.preview", { records }));
    assert.equal(preview.acceptable, false);
    assert.equal(preview.validCount, 1);
    assert.equal(preview.invalid[0].code, "ENVELOPE_LIMIT");
  } finally { db.close(); }
});

test("import valid melakukan safety backup, apply atomik, integrity check, dan audit", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db, { balance: 500_000 });
    const preview = await previewImport(db, context("import.preview", { records: [expense(40_000, "Import A"), expense(30_000, "Import B")] }));
    assert.equal(preview.acceptable, true);
    const result = await withBridgeStub(() => applyImport(db, context("import.apply", { previewToken: preview.previewToken, confirmation: "IMPORT TRANSAKSI" }, "import-valid-apply")));
    assert.equal(result.applied, 2);
    assert.equal(result.integrityVerified, true);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM transactions WHERE status='active'")).count, 2);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM backup_runs WHERE backup_type='pre-import' AND status='verified'")).count, 1);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM audit_log WHERE action='import.apply' AND result='success'")).count, 1);
  } finally { db.close(); }
});

test("perubahan saldo setelah preview membuat apply rollback seluruh record import", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db, { balance: 100_000 });
    const preview = await previewImport(db, context("import.preview", { records: [expense(40_000, "Preview A"), expense(40_000, "Preview B")] }));
    assert.equal(preview.acceptable, true);
    await createTransactionInternal(db, context("transactions.create", {}, "external-after-preview"), expense(30_000, "Transaksi sesudah preview"), { audit: false });
    await assert.rejects(
      () => withBridgeStub(() => applyImport(db, context("import.apply", { previewToken: preview.previewToken, confirmation: "IMPORT TRANSAKSI" }, "import-stale-apply"))),
      (error) => error.code === "INSUFFICIENT_BALANCE",
    );
    const rows = await db.all("SELECT description FROM transactions WHERE status='active' ORDER BY created_at,transaction_id");
    assert.deepEqual(rows.map((row) => row.description), ["Transaksi sesudah preview"], "Record import pertama juga harus rollback ketika record berikutnya gagal.");
    const state = await db.one("SELECT status FROM import_previews WHERE preview_id=?", [preview.previewToken]);
    assert.equal(state.status, "pending", "Preview tetap dapat ditinjau ulang setelah transaction apply rollback.");
  } finally { db.close(); }
});
