import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFullDataReset, previewFullDataReset, readFullDataResetStatus, FULL_RESET_CONFIRMATION,
} from "../../api/_lib/services/maintenance/fullReset.js";
import { decodeBackup } from "../../api/_lib/services/maintenance/shared.js";
import { nowIso } from "../../api/_lib/services/core.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = {
  user_id: "full-reset-owner", firebase_uid: "firebase-full-reset-owner", email: "full-reset-owner@example.com",
  name: "Full Reset Owner", role: "owner", status: "active", row_version: 1,
};
const member = { ...owner, user_id: "full-reset-member", firebase_uid: "firebase-full-reset-member", email: "full-reset-member@example.com", role: "member" };

const context = (actor, action, payload = {}, idempotencyKey = `test:${action}`) => ({
  actor,
  signedActor: { uid: actor.firebase_uid, email: actor.email, name: actor.name },
  action,
  payload,
  requestId: `request:${action}`,
  idempotencyKey,
  rowVersion: null,
  today: "2026-08-13",
  allowedUsers: [{ email: owner.email, role: "owner" }, { email: member.email, role: "member" }],
});

const seed = async (db) => {
  const now = nowIso();
  for (const user of [owner, member]) {
    await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [user.user_id, user.firebase_uid, user.email, user.name, user.role, user.status, 1, now, now]);
  }
  await db.execute(`INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at,account_number,bank_template,ewallet_template)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["account-full", "BCA", "bank", "shared", null, 250_000, "2026-08-01", 0, "active", 1, owner.user_id, now, owner.user_id, now, "", "bca", "generic"]);
  await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["category-full", "Makan", "expense", "variable", "food", "active", 1, owner.user_id, now, owner.user_id, now]);
  await db.execute(`INSERT INTO transactions(transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,recurring_occurrence_id,goal_id,amount,description,overspend_reason,merchant,payment_method,scope,owner_user_id,status,row_version,idempotency_key,created_by,created_at,updated_by,updated_at,cancelled_by,cancelled_at,cancellation_reason)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["tx-full", "2026-08-10", "expense", "account-full", null, "category-full", null, null, null, 50_000, "Makan uji", "", "", "cash", "shared", null, "active", 1, "tx-full-key", owner.user_id, now, owner.user_id, now, null, null, ""]);
  await db.execute("INSERT INTO audit_log(audit_id,request_id,timestamp,actor_id,actor_email,action,entity_type,entity_id,previous_value,new_value,result) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["audit-before-full", "request-before-full", now, owner.user_id, owner.email, "seed", "test", "seed", "{}", "{}", "success"]);
  await db.execute("INSERT INTO integrity_runs(integrity_run_id,status,issues_json,created_by,created_at) VALUES(?,?,?,?,?)", ["integrity-before-full", "passed", "[]", owner.user_id, now]);
  await db.execute("INSERT INTO idempotency_keys(actor_id,idempotency_key,action,request_fingerprint,entity_id,response_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)", [owner.user_id, "keep-idempotency", "transactions.create", "keep-fp", null, JSON.stringify({ ok: true }), now, new Date(Date.now() + 3_600_000).toISOString()]);
  await db.execute("INSERT INTO request_nonces(nonce,channel,expires_at,created_at) VALUES(?,?,?,?)", ["keep-replay-nonce", "scheduled_job", new Date(Date.now() + 60_000).toISOString(), now]);
};

const withBridgeStub = async (fn) => {
  const previous = { url: process.env.GOOGLE_BRIDGE_WEB_APP_URL, secret: process.env.GOOGLE_BRIDGE_SHARED_SECRET, fetch: globalThis.fetch };
  const calls = [];
  process.env.GOOGLE_BRIDGE_WEB_APP_URL = "https://script.google.com/macros/s/test-full-reset/exec";
  process.env.GOOGLE_BRIDGE_SHARED_SECRET = "full-reset-test-secret-at-least-thirty-two-characters";
  globalThis.fetch = async (_url, options = {}) => {
    if (!options.body) return new Response(JSON.stringify({ service: "saldo-bersama-google-bridge", version: 3, timestamp: new Date().toISOString() }), { status: 200, headers: { "content-type": "application/json" } });
    const envelope = JSON.parse(options.body);
    const message = JSON.parse(envelope.message);
    calls.push(message);
    return new Response(JSON.stringify({ ok: true, data: { fileId: "drive-full-reset-backup" } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try { return await fn(calls); }
  finally {
    if (previous.url === undefined) delete process.env.GOOGLE_BRIDGE_WEB_APP_URL; else process.env.GOOGLE_BRIDGE_WEB_APP_URL = previous.url;
    if (previous.secret === undefined) delete process.env.GOOGLE_BRIDGE_SHARED_SECRET; else process.env.GOOGLE_BRIDGE_SHARED_SECRET = previous.secret;
    globalThis.fetch = previous.fetch;
  }
};

test("full reset owner-only, preview-aware, safety-backup, dan mempertahankan backbone recovery", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await assert.rejects(() => previewFullDataReset(db, context(member, "fullReset.preview")), (error) => error.code === "OWNER_ONLY");
    const preview = await previewFullDataReset(db, context(owner, "fullReset.preview"));
    assert.equal(preview.summary.accounts, 1);
    assert.equal(preview.summary.categories, 1);
    assert.equal(preview.summary.transactions, 1);
    assert.equal(preview.summary.totalRows, 3);
    assert.equal(preview.preserved.users, 2);
    assert.equal(preview.preserved.audit, 1);
    assert.equal(preview.preserved.integrityRuns, 1);
    assert.equal(preview.preserved.idempotencyKeys, 1);
    assert.equal(preview.preserved.requestNonces, 1);

    await assert.rejects(
      () => applyFullDataReset(db, context(owner, "fullReset.apply", { previewFingerprint: preview.previewFingerprint, confirmation: "SALAH", acknowledged: true, reason: "Reset total" })),
      (error) => error.code === "FULL_RESET_CONFIRMATION_REQUIRED",
    );

    await withBridgeStub(async (calls) => {
      const result = await applyFullDataReset(db, context(owner, "fullReset.apply", {
        previewFingerprint: preview.previewFingerprint,
        confirmation: FULL_RESET_CONFIRMATION,
        acknowledged: true,
        reason: "Kembali ke kondisi awal aplikasi",
      }, "full-reset-intent"));
      assert.equal(result.fullReset, true);
      assert.equal(result.summary.totalRows, 3);
      assert.equal(result.safetyBackupFileId, "drive-full-reset-backup");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].action, "backup.store");
      const backup = decodeBackup(calls[0].payload.contentBase64);
      assert.equal(backup.tables.accounts.length, 1);
      assert.equal(backup.tables.categories.length, 1);
      assert.equal(backup.tables.transactions.length, 1);
    });

    assert.equal((await db.one("SELECT COUNT(*) AS count FROM accounts")).count, 0);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM categories")).count, 0);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM transactions")).count, 0);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM users")).count, 2, "Pengguna tidak boleh dihapus full reset data.");
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM audit_log WHERE audit_id='audit-before-full'")).count, 1, "Audit lama wajib dipertahankan.");
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM audit_log WHERE action='fullReset.apply'")).count, 1);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM backup_runs")).count, 1, "Safety backup wajib tetap tersimpan setelah purge.");
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM integrity_runs WHERE integrity_run_id='integrity-before-full'")).count, 1);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM idempotency_keys WHERE idempotency_key='keep-idempotency'")).count, 1);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM request_nonces WHERE nonce='keep-replay-nonce'")).count, 1, "Nonce anti-replay tidak boleh dihapus full reset.");
    assert.equal((await db.one("SELECT value FROM system_config WHERE key='maintenance_mode'")).value, "false");
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM integration_outbox WHERE event_type='rebuild'")).count, 2);
    const after = await previewFullDataReset(db, context(owner, "fullReset.preview"));
    assert.equal(after.summary.totalRows, 0, "Queue rebuild canonical full reset tidak boleh membuat aplikasi terlihat belum bersih.");
    assert.equal(after.summary.integrationOutbox, 0);
  } finally { await db.close(); }
});

test("full reset menolak stale preview sebelum safety backup/purge", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const preview = await previewFullDataReset(db, context(owner, "fullReset.preview"));
    await db.execute("UPDATE accounts SET row_version=row_version+1 WHERE account_id='account-full'");
    await assert.rejects(
      () => withBridgeStub(async () => applyFullDataReset(db, context(owner, "fullReset.apply", {
        previewFingerprint: preview.previewFingerprint,
        confirmation: FULL_RESET_CONFIRMATION,
        acknowledged: true,
        reason: "Preview sudah berubah",
      }, "stale-full-reset"))),
      (error) => error.code === "FULL_RESET_PREVIEW_CHANGED",
    );
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM accounts")).count, 1);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM transactions")).count, 1);
  } finally { await db.close(); }
});

test("full reset status merekonsiliasi commit melalui safety backup deterministik", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const preview = await previewFullDataReset(db, context(owner, "fullReset.preview"));
    const key = "full-reset-recovery-key";
    await withBridgeStub(async () => applyFullDataReset(db, context(owner, "fullReset.apply", {
      previewFingerprint: preview.previewFingerprint,
      confirmation: FULL_RESET_CONFIRMATION,
      acknowledged: true,
      reason: "Menguji reconciliation full reset",
    }, key)));
    const status = await readFullDataResetStatus(db, context(owner, "fullReset.status", { idempotencyKey: key }, key));
    assert.equal(status.outcome, "committed");
    assert.equal(status.committedReset.summary.totalRows, 3);
    assert.equal(status.maintenanceMode, false);
    assert.equal(status.canStartNewIntent, true);
  } finally { await db.close(); }
});

test("full reset rollback seluruh purge dan tetap fail-closed jika audit final gagal", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const preview = await previewFullDataReset(db, context(owner, "fullReset.preview"));
    const originalTransaction = db.transaction;
    db.transaction = (callback) => originalTransaction(async (tx) => {
      const guardedTx = Object.create(tx);
      guardedTx.execute = async (sql, args = []) => {
        if (/^\s*INSERT\s+INTO\s+audit_log/i.test(sql)) throw new Error("forced full reset audit failure");
        return tx.execute(sql, args);
      };
      guardedTx.all = tx.all;
      guardedTx.one = tx.one;
      guardedTx.batch = tx.batch;
      return callback(guardedTx);
    });

    await assert.rejects(
      () => withBridgeStub(async () => applyFullDataReset(db, context(owner, "fullReset.apply", {
        previewFingerprint: preview.previewFingerprint,
        confirmation: FULL_RESET_CONFIRMATION,
        acknowledged: true,
        reason: "Menguji rollback audit",
      }, "full-reset-audit-fail"))),
      /forced full reset audit failure/,
    );
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM accounts")).count, 1, "Delete accounts harus rollback.");
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM categories")).count, 1);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM transactions")).count, 1);
    assert.equal((await db.one("SELECT value FROM system_config WHERE key='maintenance_mode'")).value, "true", "Setelah purge sempat dimulai, maintenance harus tetap aktif sampai recovery integrity.");
  } finally { await db.close(); }
});
