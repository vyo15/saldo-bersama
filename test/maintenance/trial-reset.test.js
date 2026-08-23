import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTrialDataReset, previewTrialDataReset, readTrialDataResetStatus, TRIAL_RESET_CONFIRMATION,
  TRIAL_RESET_SCOPE_ACTIVITY, TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES,
} from "../../api/_lib/services/maintenance/reset.js";
import { integrityWithMaintenanceRecovery } from "../../api/_lib/services/maintenance/integrity.js";
import { decodeBackup, digest } from "../../api/_lib/services/maintenance/shared.js";
import { nowIso } from "../../api/_lib/services/core.js";
import { cleanupExpiredEphemeralState } from "../../api/_lib/services/maintenance/housekeeping.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = {
  user_id: "reset-owner", firebase_uid: "firebase-reset-owner", email: "reset-owner@example.com",
  name: "Reset Owner", role: "owner", status: "active", row_version: 1,
};
const member = { ...owner, user_id: "reset-member", firebase_uid: "firebase-reset-member", email: "reset-member@example.com", role: "member" };

const context = (actor, action, payload = {}) => ({
  actor,
  signedActor: { uid: actor.firebase_uid, email: actor.email, name: actor.name },
  action,
  payload,
  requestId: `test:${action}`,
  idempotencyKey: `test:${action}`,
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
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["account-reset", "BTN", "bank", "shared", null, 0, "2026-08-01", 0, "active", 1, owner.user_id, now, owner.user_id, now, "", "btn", "generic"]);
  await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["category-salary", "Gaji", "income", "fixed", "salary", "active", 1, owner.user_id, now, owner.user_id, now]);
  await db.execute(`INSERT INTO transactions(transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,recurring_occurrence_id,goal_id,amount,description,overspend_reason,merchant,payment_method,scope,owner_user_id,status,row_version,idempotency_key,created_by,created_at,updated_by,updated_at,cancelled_by,cancelled_at,cancellation_reason)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["tx-reset", "2026-08-10", "income", null, "account-reset", "category-salary", null, null, null, 1_300_000, "Gaji uji", "", "", "transfer", "shared", null, "active", 1, "tx-reset-key", owner.user_id, now, owner.user_id, now, null, null, ""]);
  await db.execute("INSERT INTO reconciliations(reconciliation_id,account_id,reconciled_at,system_balance,actual_balance,difference,notes,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", ["recon-reset", "account-reset", now, 1_300_000, 1_250_000, -50_000, "Uji", "difference", owner.user_id, now]);
};

const withBridgeStub = async (fn) => {
  const previous = {
    url: process.env.GOOGLE_BRIDGE_WEB_APP_URL,
    secret: process.env.GOOGLE_BRIDGE_SHARED_SECRET,
    fetch: globalThis.fetch,
  };
  const calls = [];
  process.env.GOOGLE_BRIDGE_WEB_APP_URL = "https://script.google.com/macros/s/test-trial-reset/exec";
  process.env.GOOGLE_BRIDGE_SHARED_SECRET = "reset-test-secret-at-least-thirty-two-characters";
  globalThis.fetch = async (_url, options) => {
    const envelope = JSON.parse(options.body);
    const message = JSON.parse(envelope.message);
    calls.push(message);
    return new Response(JSON.stringify({ ok: true, data: { fileId: "drive-reset-backup" } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try { return await fn(calls); }
  finally {
    if (previous.url === undefined) delete process.env.GOOGLE_BRIDGE_WEB_APP_URL; else process.env.GOOGLE_BRIDGE_WEB_APP_URL = previous.url;
    if (previous.secret === undefined) delete process.env.GOOGLE_BRIDGE_SHARED_SECRET; else process.env.GOOGLE_BRIDGE_SHARED_SECRET = previous.secret;
    globalThis.fetch = previous.fetch;
  }
};

test("bersihkan data testing owner-only, preview-aware, membuat safety backup, purge terarah, dan mempertahankan master/audit", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await assert.rejects(() => previewTrialDataReset(db, context(member, "reset.preview")), (error) => error.code === "OWNER_ONLY");

    await db.execute(`INSERT INTO integration_outbox(outbox_id,provider,event_type,entity_type,entity_id,event_key,payload_json,status,attempt_count,next_attempt_at,locked_at,locked_by,last_error_code,last_error_message,created_at,updated_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["outbox-reset", "sheets", "upsert", "transaction", "tx-reset", "sheets:upsert:transaction:tx-reset", "{}", "pending", 0, nowIso(), null, null, "", "", nowIso(), nowIso(), null]);
    await db.execute(`INSERT INTO integration_outbox(outbox_id,provider,event_type,entity_type,entity_id,event_key,payload_json,status,attempt_count,next_attempt_at,locked_at,locked_by,last_error_code,last_error_message,created_at,updated_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["outbox-system-rebuild", "sheets", "rebuild", "system", "mirror", "sheets:rebuild:system:mirror", JSON.stringify({ reason: "trial-reset", resetId: "older-reset" }), "pending", 0, nowIso(), null, null, "", "", nowIso(), nowIso(), null]);
    await db.execute("INSERT INTO import_previews(preview_id,actor_id,records_json,fingerprint,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,'pending',NULL,NULL,?,?)", ["import-reset", owner.user_id, "[]", "fp-reset", "{}", new Date(Date.now() + 60_000).toISOString(), nowIso()]);

    const preview = await previewTrialDataReset(db, context(owner, "reset.preview"));
    assert.equal(preview.summary.transactions, 1);
    assert.equal(preview.summary.reconciliations, 1);
    assert.equal(preview.summary.integrationOutbox, 1, "Queue rebuild sistem tidak boleh dihitung sebagai data testing.");
    assert.equal(preview.summary.importPreviews, 1);
    assert.equal(preview.summary.businessRows, 2);
    assert.equal(preview.summary.operationalRows, 2);
    assert.equal(preview.summary.totalRows, 4);
    assert.equal(preview.preserved.accounts, 1);
    assert.equal(preview.preserved.categories, 1);
    assert.equal(preview.preserved.users, 2);

    await assert.rejects(
      () => applyTrialDataReset(db, context(owner, "reset.apply", { previewFingerprint: preview.previewFingerprint, confirmation: "SALAH", acknowledged: true, reason: "Data uji" })),
      (error) => error.code === "RESET_CONFIRMATION_REQUIRED",
    );

    await withBridgeStub(async (calls) => {
      const result = await applyTrialDataReset(db, context(owner, "reset.apply", {
        previewFingerprint: preview.previewFingerprint,
        confirmation: TRIAL_RESET_CONFIRMATION,
        acknowledged: true,
        reason: "Membersihkan data uji",
      }));
      assert.equal(result.reset, true);
      assert.equal(result.safetyBackupFileId, "drive-reset-backup");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].action, "backup.store");
      const safetySnapshot = decodeBackup(calls[0].payload.contentBase64);
      assert.equal(safetySnapshot.tables.transactions.length, 1, "Safety backup harus dibuat sebelum purge.");
      assert.equal(safetySnapshot.tables.reconciliations.length, 1);
    });

    assert.equal((await db.one("SELECT COUNT(*) AS count FROM transactions")).count, 0);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM reconciliations")).count, 0);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM import_previews")).count, 0);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM accounts")).count, 1);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM categories")).count, 1);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM users")).count, 2);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM audit_log WHERE action='reset.apply'")).count, 1);
    assert.equal((await db.one("SELECT value FROM system_config WHERE key='maintenance_mode'")).value, "false");
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM integration_outbox WHERE event_type='rebuild'")).count, 2);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM integration_outbox WHERE outbox_id='outbox-system-rebuild'")).count, 1, "Queue rebuild canonical hasil reset harus dipertahankan/reuse, bukan dihapus diam-diam.");

    const after = await previewTrialDataReset(db, context(owner, "reset.preview"));
    assert.equal(after.summary.integrationOutbox, 0, "Queue rebuild hasil reset adalah state sistem dan tidak boleh dihitung sebagai data testing baru.");
    assert.equal(after.summary.totalRows, 0);
    await assert.rejects(
      () => applyTrialDataReset(db, context(owner, "reset.apply", {
        previewFingerprint: after.previewFingerprint,
        confirmation: TRIAL_RESET_CONFIRMATION,
        acknowledged: true,
        reason: "Tidak ada data lagi",
      })),
      (error) => error.code === "RESET_NOTHING_TO_CLEAN",
    );
  } finally {
    db.close();
  }
});

test("reset menangani payload outbox legacy yang bukan JSON tanpa menghapus queue rebuild canonical", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const timestamp = nowIso();
    await db.execute(`INSERT INTO integration_outbox(outbox_id,provider,event_type,entity_type,entity_id,event_key,payload_json,status,attempt_count,next_attempt_at,locked_at,locked_by,last_error_code,last_error_message,created_at,updated_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["outbox-invalid-json", "sheets", "upsert", "transaction", "legacy-row", "sheets:upsert:transaction:legacy-row", "{invalid", "pending", 0, timestamp, null, null, "", "", timestamp, timestamp, null]);
    await db.execute(`INSERT INTO integration_outbox(outbox_id,provider,event_type,entity_type,entity_id,event_key,payload_json,status,attempt_count,next_attempt_at,locked_at,locked_by,last_error_code,last_error_message,created_at,updated_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["outbox-canonical-reset", "calendar", "rebuild", "system", "calendar", "calendar:rebuild:system:calendar", JSON.stringify({ reason: "trial-reset", resetId: "existing" }), "pending", 0, timestamp, null, null, "", "", timestamp, timestamp, null]);

    const preview = await previewTrialDataReset(db, context(owner, "reset.preview"));
    assert.equal(preview.summary.integrationOutbox, 1, "Payload legacy invalid tetap dihitung sebagai data testing, bukan dianggap queue sistem.");

    await withBridgeStub(async () => applyTrialDataReset(db, context(owner, "reset.apply", {
      previewFingerprint: preview.previewFingerprint,
      confirmation: TRIAL_RESET_CONFIRMATION,
      acknowledged: true,
      reason: "Membersihkan data uji",
    })));

    assert.equal((await db.one("SELECT COUNT(*) AS count FROM integration_outbox WHERE outbox_id='outbox-invalid-json'")).count, 0);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM integration_outbox WHERE outbox_id='outbox-canonical-reset'")).count, 1);
  } finally {
    db.close();
  }
});

test("reset.status memakai count batch dan tidak membaca seluruh row operasional", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const originalBatch = db.batch;
    const batches = [];
    db.batch = async (statements) => {
      batches.push(statements.map((statement) => statement.sql));
      return originalBatch(statements);
    };

    const status = await readTrialDataResetStatus(db, context(owner, "reset.status"));
    assert.equal(status.currentSummary.transactions, 1);
    assert.ok(batches.length >= 1);
    const statusSql = batches[0].slice(0, 16).join("\n");
    assert.doesNotMatch(statusSql, /SELECT \* FROM/i, "Status ringan tidak boleh membaca isi penuh tabel hanya untuk ringkasan.");
    assert.match(statusSql, /SELECT COUNT\(\*\) AS count FROM ["`]transactions["`]/i);
    assert.match(statusSql, /SELECT COUNT\(\*\) AS count FROM integration_outbox/i);
  } finally {
    db.close();
  }
});

test("reset ditolak jika data berubah setelah preview", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const preview = await previewTrialDataReset(db, context(owner, "reset.preview"));
    await db.execute("UPDATE transactions SET amount=amount+1,row_version=row_version+1 WHERE transaction_id='tx-reset'");
    await assert.rejects(
      () => applyTrialDataReset(db, context(owner, "reset.apply", {
        previewFingerprint: preview.previewFingerprint,
        confirmation: TRIAL_RESET_CONFIRMATION,
        acknowledged: true,
        reason: "Membersihkan data uji",
      })),
      (error) => error.code === "RESET_PREVIEW_CHANGED",
    );
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM backup_runs")).count, 0, "Backup tidak boleh dibuat jika preview sudah stale.");
  } finally {
    db.close();
  }
});

test("reset melepaskan maintenance jika data berubah saat safety backup sebelum purge dimulai", async () => {
  const db = await createSqliteTestDatabase();
  const previous = {
    url: process.env.GOOGLE_BRIDGE_WEB_APP_URL,
    secret: process.env.GOOGLE_BRIDGE_SHARED_SECRET,
    fetch: globalThis.fetch,
  };
  try {
    await seed(db);
    const preview = await previewTrialDataReset(db, context(owner, "reset.preview"));
    process.env.GOOGLE_BRIDGE_WEB_APP_URL = "https://script.google.com/macros/s/test-trial-reset/exec";
    process.env.GOOGLE_BRIDGE_SHARED_SECRET = "reset-test-secret-at-least-thirty-two-characters";
    globalThis.fetch = async () => {
      await db.execute("UPDATE transactions SET amount=amount+1,row_version=row_version+1 WHERE transaction_id='tx-reset'");
      return new Response(JSON.stringify({ ok: true, data: { fileId: "drive-race-backup" } }), { status: 200, headers: { "content-type": "application/json" } });
    };

    await assert.rejects(
      () => applyTrialDataReset(db, context(owner, "reset.apply", {
        previewFingerprint: preview.previewFingerprint,
        confirmation: TRIAL_RESET_CONFIRMATION,
        acknowledged: true,
        reason: "Membersihkan data uji",
      })),
      (error) => error.code === "RESET_PREVIEW_CHANGED",
    );
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM transactions")).count, 1);
    assert.equal((await db.one("SELECT value FROM system_config WHERE key='maintenance_mode'")).value, "false");
  } finally {
    if (previous.url === undefined) delete process.env.GOOGLE_BRIDGE_WEB_APP_URL; else process.env.GOOGLE_BRIDGE_WEB_APP_URL = previous.url;
    if (previous.secret === undefined) delete process.env.GOOGLE_BRIDGE_SHARED_SECRET; else process.env.GOOGLE_BRIDGE_SHARED_SECRET = previous.secret;
    globalThis.fetch = previous.fetch;
    db.close();
  }
});


test("preview reset ikut berubah jika sisa operasional berubah", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const preview = await previewTrialDataReset(db, context(owner, "reset.preview"));
    await db.execute(`INSERT INTO integration_outbox(outbox_id,provider,event_type,entity_type,entity_id,event_key,payload_json,status,attempt_count,next_attempt_at,locked_at,locked_by,last_error_code,last_error_message,created_at,updated_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["outbox-after-preview", "calendar", "rebuild", "system", "calendar", "calendar:rebuild:system:calendar", "{}", "pending", 0, nowIso(), null, null, "", "", nowIso(), nowIso(), null]);
    await assert.rejects(
      () => applyTrialDataReset(db, context(owner, "reset.apply", {
        previewFingerprint: preview.previewFingerprint,
        confirmation: TRIAL_RESET_CONFIRMATION,
        acknowledged: true,
        reason: "Membersihkan data uji",
      })),
      (error) => error.code === "RESET_PREVIEW_CHANGED",
    );
  } finally {
    db.close();
  }
});


test("reset.status merekonsiliasi outcome unknown dari audit dan safety backup tanpa mengulang reset", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const preview = await previewTrialDataReset(db, context(owner, "reset.preview"));
    await withBridgeStub(async () => applyTrialDataReset(db, context(owner, "reset.apply", {
      previewFingerprint: preview.previewFingerprint,
      confirmation: TRIAL_RESET_CONFIRMATION,
      acknowledged: true,
      reason: "Membersihkan data uji",
    })));
    const now = nowIso();
    await db.execute(
      "INSERT INTO idempotency_keys(actor_id,idempotency_key,action,request_fingerprint,entity_id,response_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
      [owner.user_id, "test:reset.apply", "reset.apply", "unknown-reset-fingerprint", null, JSON.stringify({ __idempotency_state: "unknown" }), now, new Date(Date.now() + 60_000).toISOString()],
    );

    const status = await readTrialDataResetStatus(db, context(owner, "reset.status", { idempotencyKey: "test:reset.apply" }));
    assert.equal(status.outcome, "committed");
    assert.equal(status.intent.state, "unknown");
    assert.equal(status.maintenanceMode, false);
    assert.equal(status.committedReset.summary.totalRows, 2);
    assert.equal(status.committedReset.safetyBackupFileId, "drive-reset-backup");
    assert.equal(status.canStartNewIntent, true);

    const recoveredWithoutClientToken = await readTrialDataResetStatus(db, context(owner, "reset.status"));
    assert.equal(recoveredWithoutClientToken.outcome, "committed", "Reload browser harus tetap menemukan unresolved reset milik owner dari idempotency server.");
    assert.equal(recoveredWithoutClientToken.intent.state, "unknown");
  } finally {
    db.close();
  }
});


test("reset.status explicit key menemukan audit commit lama tanpa bergantung pada 12 audit terbaru", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const idempotencyKey = "reset-committed-long-ago";
    const safetyBackupId = `bkp_${digest(`${owner.user_id}:backup.safety:pre-trial-reset:${idempotencyKey}`).slice(0, 32)}`;
    const oldTimestamp = "2026-07-01T00:00:00.000Z";
    await db.execute(
      "INSERT INTO audit_log(audit_id,request_id,timestamp,actor_id,actor_email,action,entity_type,entity_id,previous_value,new_value,result) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ["audit-old-reset", "request-old-reset", oldTimestamp, owner.user_id, owner.email, "reset.apply", "maintenance_reset", "reset-old", JSON.stringify({ previewFingerprint: "old", summary: { totalRows: 3 } }), JSON.stringify({ resetAt: oldTimestamp, safetyBackupId }), "success"],
    );
    for (let index = 0; index < 13; index += 1) {
      const timestamp = `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`;
      await db.execute(
        "INSERT INTO audit_log(audit_id,request_id,timestamp,actor_id,actor_email,action,entity_type,entity_id,previous_value,new_value,result) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        [`audit-new-${index}`, `request-new-${index}`, timestamp, owner.user_id, owner.email, "reset.apply", "maintenance_reset", `reset-new-${index}`, "{}", JSON.stringify({ resetAt: timestamp, safetyBackupId: `other-backup-${index}` }), "success"],
      );
    }

    const status = await readTrialDataResetStatus(db, context(owner, "reset.status", { idempotencyKey }));
    assert.equal(status.outcome, "committed");
    assert.equal(status.committedReset.resetId, "reset-old");
    assert.equal(status.committedReset.safetyBackupId, safetyBackupId);
    assert.equal(status.committedReset.summary.totalRows, 3);
  } finally {
    db.close();
  }
});

test("reset.status membedakan unknown yang tidak commit dan maintenance recovery diaudit", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const now = nowIso();
    await db.execute(
      "INSERT INTO idempotency_keys(actor_id,idempotency_key,action,request_fingerprint,entity_id,response_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
      [owner.user_id, "unknown-reset", "reset.apply", "unknown-no-commit", null, JSON.stringify({ __idempotency_state: "unknown" }), now, new Date(Date.now() + 60_000).toISOString()],
    );
    let status = await readTrialDataResetStatus(db, context(owner, "reset.status", { idempotencyKey: "unknown-reset" }));
    assert.equal(status.outcome, "not_committed");
    assert.equal(status.canStartNewIntent, true);

    await db.execute("UPDATE system_config SET value='true',updated_at=? WHERE key='maintenance_mode'", [nowIso()]);
    status = await readTrialDataResetStatus(db, context(owner, "reset.status", { idempotencyKey: "unknown-reset" }));
    assert.equal(status.outcome, "recovery_required");
    assert.equal(status.requiresAttention, true);
    assert.equal(status.canStartNewIntent, false);

    const recovery = await integrityWithMaintenanceRecovery(db, context(owner, "integrity.run", { clearMaintenance: true }));
    assert.equal(recovery.ok, true);
    assert.equal(recovery.maintenanceCleared, true);
    assert.equal((await db.one("SELECT value FROM system_config WHERE key='maintenance_mode'")).value, "false");
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM audit_log WHERE action='maintenance.recover'")).count, 1);
  } finally {
    db.close();
  }
});


test("maintenance recovery rollback jika audit recovery gagal", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await db.execute("UPDATE system_config SET value='true',updated_at=? WHERE key='maintenance_mode'", [nowIso()]);
    await db.execute(`CREATE TRIGGER block_maintenance_recovery_audit
      BEFORE INSERT ON audit_log
      WHEN NEW.action='maintenance.recover'
      BEGIN
        SELECT RAISE(ABORT, 'maintenance recovery audit blocked');
      END`);

    await assert.rejects(
      () => integrityWithMaintenanceRecovery(db, context(owner, "integrity.run", { clearMaintenance: true })),
      /maintenance recovery audit blocked/,
    );
    assert.equal(
      (await db.one("SELECT value FROM system_config WHERE key='maintenance_mode'")).value,
      "true",
      "Maintenance tidak boleh terbuka jika audit recovery gagal ditulis.",
    );
  } finally {
    db.close();
  }
});

test("reset.status menemukan processing tanpa token client dan mengabaikan histori completed yang sudah definitif", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const created = nowIso();
    await db.execute(
      "INSERT INTO idempotency_keys(actor_id,idempotency_key,action,request_fingerprint,entity_id,response_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
      [owner.user_id, "completed-reset-old", "reset.apply", "completed-fp", null, JSON.stringify({ reset: true, resetId: "done", resetAt: created, safetyBackupId: "done-backup", summary: { totalRows: 1 } }), created, new Date(Date.now() + 60_000).toISOString()],
    );
    let status = await readTrialDataResetStatus(db, context(owner, "reset.status"));
    assert.equal(status.outcome, "idle", "Histori completed tidak boleh membuat panel recovery muncul terus setelah operasi sudah definitif.");

    const processingAt = new Date(Date.now() + 1_000).toISOString();
    await db.execute(
      "INSERT INTO idempotency_keys(actor_id,idempotency_key,action,request_fingerprint,entity_id,response_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
      [owner.user_id, "processing-reset", "reset.apply", "processing-fp", null, JSON.stringify({ __idempotency_state: "processing" }), processingAt, new Date(Date.now() + 60_000).toISOString()],
    );
    status = await readTrialDataResetStatus(db, context(owner, "reset.status"));
    assert.equal(status.outcome, "processing");
    assert.equal(status.intent.state, "processing");
    assert.equal(status.canStartNewIntent, false);
  } finally {
    db.close();
  }
});

test("housekeeping scheduler hanya menghapus state ephemeral yang expired dan tidak menyentuh applying", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const expired = "2026-08-01T00:00:00.000Z";
    const future = "2026-09-01T00:00:00.000Z";
    await db.execute("INSERT INTO idempotency_keys(actor_id,idempotency_key,action,request_fingerprint,entity_id,response_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)", [owner.user_id, "expired-idem", "transactions.create", "fp", null, "{}", expired, expired]);
    await db.execute("INSERT INTO idempotency_keys(actor_id,idempotency_key,action,request_fingerprint,entity_id,response_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)", [owner.user_id, "active-idem", "transactions.create", "fp2", null, "{}", expired, future]);
    await db.execute("INSERT INTO import_previews(preview_id,actor_id,records_json,fingerprint,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", ["expired-import", owner.user_id, "[]", "fp", "{}", "pending", null, null, expired, expired]);
    await db.execute("INSERT INTO import_previews(preview_id,actor_id,records_json,fingerprint,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", ["applying-import", owner.user_id, "[]", "fp", "{}", "applying", null, null, expired, expired]);
    await db.execute("INSERT INTO backup_runs(backup_id,backup_type,external_file_id,file_name,schema_version,status,checksum,created_by,created_at,verified_at,error_code) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["backup-preview", "manual", "drive-id", "backup.json.gz", 8, "verified", "checksum", owner.user_id, expired, expired, null]);
    await db.execute("INSERT INTO restore_previews(preview_id,backup_id,actor_id,checksum,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", ["expired-restore", "backup-preview", owner.user_id, "checksum", "{}", "pending", null, null, expired, expired]);
    await db.execute("INSERT INTO restore_previews(preview_id,backup_id,actor_id,checksum,summary_json,status,result_json,applied_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", ["applying-restore", "backup-preview", owner.user_id, "checksum", "{}", "applying", null, null, expired, expired]);

    const result = await cleanupExpiredEphemeralState(db, "2026-08-12T00:00:00.000Z");
    assert.deepEqual(result, { idempotencyKeys: 1, importPreviews: 1, restorePreviews: 1, userSessions: 0 });
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM idempotency_keys")).count, 1);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM import_previews")).count, 1);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM restore_previews")).count, 1);
  } finally {
    db.close();
  }
});


test("reset data testing dapat mempertahankan saldo awal atau menolkan saldo sesuai scope", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await db.execute("UPDATE accounts SET initial_balance=?,initial_balance_date=?,row_version=? WHERE account_id=?", [500_000, "2026-08-01", 3, "account-reset"]);

    const activityPreview = await previewTrialDataReset(db, context(owner, "reset.preview", { resetScope: TRIAL_RESET_SCOPE_ACTIVITY }));
    assert.equal(activityPreview.resetScope, TRIAL_RESET_SCOPE_ACTIVITY);
    assert.equal(activityPreview.balanceReset, null);

    const balancePreview = await previewTrialDataReset(db, context(owner, "reset.preview", { resetScope: TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES }));
    assert.equal(balancePreview.resetScope, TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES);
    assert.equal(balancePreview.balanceReset.accountsAffected, 1);
    assert.equal(balancePreview.balanceReset.totalInitialBalance, 500_000);
    assert.equal(balancePreview.balanceReset.totalCurrentBalance, 1_800_000);
    assert.equal(balancePreview.balanceReset.accounts[0].currentBalance, 1_800_000);
    assert.equal(balancePreview.balanceReset.accounts[0].nextBalance, 0);

    await withBridgeStub(async () => applyTrialDataReset(db, context(owner, "reset.apply", {
      resetScope: TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES,
      previewFingerprint: balancePreview.previewFingerprint,
      confirmation: TRIAL_RESET_CONFIRMATION,
      acknowledged: true,
      reason: "Menghapus trial dan nolkan saldo",
    })));

    const account = await db.one("SELECT initial_balance,initial_balance_date,row_version FROM accounts WHERE account_id=?", ["account-reset"]);
    assert.equal(account.initial_balance, 0);
    assert.equal(account.initial_balance_date, "2026-08-13");
    assert.equal(account.row_version, 4, "Nolkan saldo wajib menaikkan row_version rekening.");
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM transactions")).count, 0);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM accounts")).count, 1);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM categories")).count, 1);
  } finally { await db.close(); }
});

test("perubahan saldo awal setelah preview membatalkan reset scope saldo", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const preview = await previewTrialDataReset(db, context(owner, "reset.preview", { resetScope: TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES }));
    await db.execute("UPDATE accounts SET initial_balance=initial_balance+1,row_version=row_version+1 WHERE account_id=?", ["account-reset"]);
    await assert.rejects(
      () => withBridgeStub(async () => applyTrialDataReset(db, context(owner, "reset.apply", {
        resetScope: TRIAL_RESET_SCOPE_ACTIVITY_AND_BALANCES,
        previewFingerprint: preview.previewFingerprint,
        confirmation: TRIAL_RESET_CONFIRMATION,
        acknowledged: true,
        reason: "Data berubah setelah preview",
      }))),
      (error) => error.code === "RESET_PREVIEW_CHANGED",
    );
  } finally { await db.close(); }
});

test("reset activity membersihkan history tetapi mempertahankan saldo awal rekening", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await db.execute("UPDATE accounts SET initial_balance=500000,initial_balance_date='2026-08-01',row_version=3 WHERE account_id='account-reset'");
    const preview = await previewTrialDataReset(db, context(owner, "reset.preview", { resetScope: TRIAL_RESET_SCOPE_ACTIVITY }));
    await withBridgeStub(async () => applyTrialDataReset(db, context(owner, "reset.apply", {
      resetScope: TRIAL_RESET_SCOPE_ACTIVITY,
      previewFingerprint: preview.previewFingerprint,
      confirmation: TRIAL_RESET_CONFIRMATION,
      acknowledged: true,
      reason: "Hapus aktivitas trial saja",
    })));
    const account = await db.one("SELECT initial_balance,initial_balance_date,row_version FROM accounts WHERE account_id='account-reset'");
    assert.equal(account.initial_balance, 500000);
    assert.equal(account.initial_balance_date, "2026-08-01");
    assert.equal(account.row_version, 3);
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM transactions")).count, 0);
  } finally { await db.close(); }
});
