import assert from "node:assert/strict";
import test from "node:test";
import { dispatchAction } from "../../api/_lib/actionDispatcher.js";
import { createTechnicalBackup, integrityWithMaintenanceRecovery, previewRestore } from "../../api/_lib/services/maintenance/index.js";
import { listSubscriptionsForUser } from "../../api/_lib/services/notifications.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { monthBounds, todayJakarta } from "../../api/_lib/services/core.js";

const OWNER_EMAIL = "owner@example.com";
const OWNER_ID = "user-owner";
const FIREBASE_UID = "firebase-owner";

const owner = {
  user_id: OWNER_ID,
  firebase_uid: FIREBASE_UID,
  email: OWNER_EMAIL,
  name: "Owner",
  role: "owner",
  status: "active",
  row_version: 1
};

const signedActor = {
  uid: FIREBASE_UID,
  email: OWNER_EMAIL,
  name: "Owner",
  role: "owner"
};

const contextFor = (action, payload = {}, overrides = {}) => ({
  actor: owner,
  signedActor,
  allowedUsers: [{ email: OWNER_EMAIL, role: "owner" }],
  requestId: `test:${action}`,
  action,
  payload,
  idempotencyKey: `test:${action}:${crypto.randomUUID()}`,
  enqueueMirror: async () => {},
  enqueueCalendar: async () => {},
  ...overrides
});

const seedFinanceMaster = async (db) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [OWNER_ID, FIREBASE_UID, OWNER_EMAIL, "Owner", "owner", "active", 1, now, now]
  );
  await db.execute(
    "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["account-main", "Rekening Utama", "bank", "shared", null, 1_000_000, "2026-01-01", 0, "active", 1, OWNER_ID, now, OWNER_ID, now]
  );
  await db.execute(
    "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ["category-expense", "Kebutuhan", "expense", "variable", "", "active", 1, OWNER_ID, now, OWNER_ID, now]
  );
};

const withGoogleBridgeStub = async (callback) => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.GOOGLE_BRIDGE_WEB_APP_URL;
  const originalSecret = process.env.GOOGLE_BRIDGE_SHARED_SECRET;
  const files = new Map();
  let sequence = 0;

  process.env.GOOGLE_BRIDGE_WEB_APP_URL = "https://script.google.com/macros/s/test-service-smoke/exec";
  process.env.GOOGLE_BRIDGE_SHARED_SECRET = "test-secret-at-least-thirty-two-characters";
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    const { action, payload } = JSON.parse(request.message);
    if (action === "backup.store") {
      sequence += 1;
      const fileId = `file-${sequence}`;
      files.set(fileId, payload.contentBase64);
      return { ok: true, text: async () => JSON.stringify({ ok: true, data: { fileId } }) };
    }
    if (action === "backup.read") {
      const contentBase64 = files.get(payload.fileId);
      return { ok: true, text: async () => JSON.stringify({ ok: true, data: { contentBase64 } }) };
    }
    return { ok: false, text: async () => JSON.stringify({ ok: false, error: { code: "UNEXPECTED_ACTION" } }) };
  };

  try {
    return await callback({ files });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.GOOGLE_BRIDGE_WEB_APP_URL;
    else process.env.GOOGLE_BRIDGE_WEB_APP_URL = originalUrl;
    if (originalSecret === undefined) delete process.env.GOOGLE_BRIDGE_SHARED_SECRET;
    else process.env.GOOGLE_BRIDGE_SHARED_SECRET = originalSecret;
  }
};

test("authenticated app.initialState menjalankan reporting hasil refactor tanpa ReferenceError", async () => {
  const db = await createSqliteTestDatabase();
  const originalAllowlist = process.env.ALLOWED_USERS_JSON;
  process.env.ALLOWED_USERS_JSON = JSON.stringify([{ email: OWNER_EMAIL, role: "owner" }]);
  try {
    await seedFinanceMaster(db);
    const result = await dispatchAction({
      signedActor,
      action: "app.initialState",
      payload: { period: todayJakarta().slice(0, 7) },
      requestId: "test:initial-state",
      database: db
    });
    assert.equal(result.bootstrap.user.email, OWNER_EMAIL);
    assert.match(result.overview.lastSyncedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(result.overview.totalBalance, 1_000_000);

    const timestamp = new Date().toISOString();
    await db.execute(
      "INSERT INTO reconciliations(reconciliation_id,account_id,reconciled_at,system_balance,actual_balance,difference,notes,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["reconciliation-1", "account-main", timestamp, 1_000_000, 1_000_000, 0, "Uji", "matched", OWNER_ID, timestamp]
    );
    const reconciliations = await dispatchAction({
      signedActor,
      action: "reconciliations.list",
      payload: { limit: 10 },
      requestId: "test:reconciliations-list",
      database: db
    });
    assert.equal(reconciliations.items[0].reconciliation_id, "reconciliation-1");

    await db.execute(
      "INSERT INTO push_subscriptions(subscription_id,user_id,endpoint,p256dh,auth,user_agent,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      ["push-1", OWNER_ID, "https://push.example.test/1", "p256dh", "auth", "test", "active", timestamp, timestamp]
    );
    const subscriptions = await listSubscriptionsForUser(db, OWNER_ID);
    assert.equal(subscriptions[0].endpoint, "https://push.example.test/1");
  } finally {
    db.close();
    if (originalAllowlist === undefined) delete process.env.ALLOWED_USERS_JSON;
    else process.env.ALLOWED_USERS_JSON = originalAllowlist;
  }
});

test("rekening bank mewajibkan nomor digit dan audit hanya menyimpan empat digit terakhir", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedFinanceMaster(db);
    const created = await dispatchAction({
      signedActor,
      action: "accounts.create",
      payload: {
        name: "Tabungan BNI",
        account_type: "bank",
        account_number: "1234-5678 9012 3456",
        bank_template: "bni",
        owner_scope: "shared",
        initial_balance: 0,
        initial_balance_date: todayJakarta(),
        allow_negative: false
      },
      requestId: "test:account-number-create",
      idempotencyKey: "test-account-number-create",
      database: db
    });
    assert.equal(created.account_number, "1234567890123456");
    assert.equal(created.bank_template, "bni");

    const audit = await db.one("SELECT new_value FROM audit_log WHERE entity_type='account' AND entity_id=? ORDER BY timestamp DESC LIMIT 1", [created.account_id]);
    assert.ok(audit);
    assert.equal(JSON.parse(audit.new_value).account_number, "••••3456");
    assert.doesNotMatch(audit.new_value, /1234567890123456/);

    const updated = await dispatchAction({
      signedActor,
      action: "accounts.update",
      payload: {
        account_id: created.account_id,
        name: "Tabungan nikah",
        account_number: created.account_number,
        bank_template: "mandiri",
        owner_scope: "shared",
        allow_negative: false,
        row_version: created.row_version,
      },
      rowVersion: created.row_version,
      requestId: "test:account-template-update",
      idempotencyKey: "test-account-template-update",
      database: db,
    });
    assert.equal(updated.name, "Tabungan nikah");
    assert.equal(updated.bank_template, "mandiri");
    assert.equal(updated.ewallet_template, "generic");

    const wallet = await dispatchAction({
      signedActor,
      action: "accounts.create",
      payload: { name: "Belanja harian", account_type: "ewallet", ewallet_template: "dana", owner_scope: "shared", initial_balance: 0, initial_balance_date: todayJakarta() },
      requestId: "test:account-ewallet-create", idempotencyKey: "test-account-ewallet-create", database: db,
    });
    assert.equal(wallet.ewallet_template, "dana");
    assert.equal(wallet.bank_template, "generic");

    const walletUpdated = await dispatchAction({
      signedActor,
      action: "accounts.update",
      payload: { account_id: wallet.account_id, name: "Belanja harian", ewallet_template: "gopay", owner_scope: "shared", allow_negative: false, row_version: wallet.row_version },
      rowVersion: wallet.row_version, requestId: "test:account-ewallet-update", idempotencyKey: "test-account-ewallet-update", database: db,
    });
    assert.equal(walletUpdated.ewallet_template, "gopay");

    await assert.rejects(
      () => dispatchAction({ signedActor, action: "accounts.create", payload: { name: "Wallet invalid", account_type: "ewallet", ewallet_template: "paypal", owner_scope: "shared", initial_balance: 0, initial_balance_date: todayJakarta() }, requestId: "test:account-ewallet-invalid", idempotencyKey: "test-account-ewallet-invalid", database: db }),
      (error) => error?.code === "INVALID_EWALLET_TEMPLATE"
    );

    await assert.rejects(
      () => dispatchAction({ signedActor, action: "accounts.create", payload: { name: "Cash invalid provider", account_type: "cash", ewallet_template: "dana", owner_scope: "shared", initial_balance: 0, initial_balance_date: todayJakarta() }, requestId: "test:account-ewallet-non-wallet", idempotencyKey: "test-account-ewallet-non-wallet", database: db }),
      (error) => error?.code === "EWALLET_TEMPLATE_EWALLET_ONLY"
    );

    await assert.rejects(
      () => dispatchAction({
        signedActor,
        action: "accounts.update",
        payload: { account_id: wallet.account_id, account_type: "bank", name: wallet.name, owner_scope: "shared", allow_negative: false, row_version: walletUpdated.row_version },
        rowVersion: walletUpdated.row_version,
        requestId: "test:account-type-immutable",
        idempotencyKey: "test-account-type-immutable",
        database: db,
      }),
      (error) => error?.code === "ACCOUNT_TYPE_IMMUTABLE"
    );

    await assert.rejects(
      () => dispatchAction({
        signedActor,
        action: "accounts.create",
        payload: { name: "Template invalid", account_type: "bank", account_number: "123456789012", bank_template: "visa", owner_scope: "shared", initial_balance: 0, initial_balance_date: todayJakarta() },
        requestId: "test:account-template-invalid",
        idempotencyKey: "test-account-template-invalid",
        database: db,
      }),
      (error) => error?.code === "INVALID_BANK_TEMPLATE"
    );

    await assert.rejects(
      () => dispatchAction({
        signedActor,
        action: "accounts.create",
        payload: { name: "Bank tanpa nomor", account_type: "bank", owner_scope: "shared", initial_balance: 0, initial_balance_date: todayJakarta() },
        requestId: "test:account-number-required",
        idempotencyKey: "test-account-number-required",
        database: db
      }),
      (error) => error?.code === "ACCOUNT_NUMBER_REQUIRED"
    );
  } finally {
    db.close();
  }
});

test("budget dan recurring tetap dapat create, update, pay, reverse, skip, dan restore occurrence", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedFinanceMaster(db);
    const period = todayJakarta().slice(0, 7);
    const budget = await dispatchAction({
      signedActor,
      action: "budgets.upsert",
      payload: { period_key: period, category_id: "category-expense", amount: 250_000, scope: "shared" },
      requestId: "test:budget",
      idempotencyKey: "test-budget-upsert",
      database: db
    });
    assert.equal(budget.amount, 250_000);

    const listed = await dispatchAction({
      signedActor,
      action: "budgets.list",
      payload: { period },
      requestId: "test:budget-list",
      database: db
    });
    assert.equal(listed.items.length, 1);

    const recurring = await dispatchAction({
      signedActor,
      action: "recurring.createRule",
      payload: {
        name: "Tagihan Uji",
        kind: "expense",
        category_id: "category-expense",
        expected_amount: 50_000,
        frequency: "monthly",
        due_day: Number(todayJakarta().slice(-2)),
        default_account_id: "account-main",
        start_date: todayJakarta(),
        scope: "shared"
      },
      requestId: "test:recurring-create",
      idempotencyKey: "test-recurring-create",
      database: db
    });

    const updated = await dispatchAction({
      signedActor,
      action: "recurring.updateRule",
      payload: { recurring_rule_id: recurring.recurring_rule_id, name: "Tagihan Uji Diperbarui", row_version: recurring.row_version },
      rowVersion: recurring.row_version,
      requestId: "test:recurring-update",
      idempotencyKey: "test-recurring-update",
      database: db
    });
    assert.equal(updated.name, "Tagihan Uji Diperbarui");

    const recurringPeriod = monthBounds(todayJakarta().slice(0, 7));
    const envelope = await dispatchAction({
      signedActor,
      action: "envelopes.create",
      payload: {
        name: "Kantong Tagihan Uji",
        default_amount: 200_000,
        allocated_amount: 200_000,
        source_account_id: "account-main",
        period_type: "monthly",
        period_start: recurringPeriod.start,
        period_end: recurringPeriod.end,
        rollover_policy: "unallocated",
        overspend_policy: "confirm",
      },
      requestId: "test:recurring-envelope-create",
      idempotencyKey: "test-recurring-envelope-create",
      database: db,
    });

    const occurrence = await db.one("SELECT * FROM recurring_occurrences WHERE recurring_rule_id=? ORDER BY due_date LIMIT 1", [recurring.recurring_rule_id]);
    assert.ok(occurrence);
    const beforePaymentState = await dispatchAction({
      signedActor,
      action: "app.initialState",
      payload: { period },
      requestId: "test:recurring-before-payment",
      database: db,
    });
    const paid = await dispatchAction({
      signedActor,
      action: "recurring.payOccurrence",
      payload: { occurrence_id: occurrence.occurrence_id, account_id: "account-main", amount: 50_000, transaction_date: todayJakarta(), envelope_period_id: envelope.period.envelope_period_id, row_version: occurrence.row_version },
      rowVersion: occurrence.row_version,
      requestId: "test:recurring-pay",
      idempotencyKey: "test-recurring-pay",
      database: db
    });
    assert.equal(paid.occurrence.actual_amount, 50_000);
    assert.equal(paid.transaction.envelope_period_id, envelope.period.envelope_period_id);
    assert.equal(paid.transaction.recurring_occurrence_id, occurrence.occurrence_id);
    const linkedActiveTransactions = await db.one("SELECT COUNT(*) AS count FROM transactions WHERE recurring_occurrence_id=? AND envelope_period_id=? AND status='active'", [occurrence.occurrence_id, envelope.period.envelope_period_id]);
    assert.equal(Number(linkedActiveTransactions.count), 1, "pembayaran rutin dengan kantong harus tetap membuat tepat satu transaksi ledger");
    const afterPaymentState = await dispatchAction({
      signedActor,
      action: "app.initialState",
      payload: { period },
      requestId: "test:recurring-after-payment",
      database: db,
    });
    assert.equal(afterPaymentState.overview.totalBalance, beforePaymentState.overview.totalBalance - 50_000);
    assert.equal(afterPaymentState.overview.reservedBills, beforePaymentState.overview.reservedBills - 50_000);
    assert.equal(afterPaymentState.overview.safeToSpend, beforePaymentState.overview.safeToSpend, "tagihan yang sudah dibayar penuh mengganti reserve dengan pengurangan saldo aktual, bukan dihitung ganda");
    const envelopeAfterPayment = await dispatchAction({
      signedActor,
      action: "envelopes.list",
      payload: {},
      requestId: "test:recurring-envelope-after-payment",
      database: db,
    });
    assert.equal(envelopeAfterPayment.items.find((item) => item.envelope_period_id === envelope.period.envelope_period_id)?.remaining_amount, 150_000);

    const reversed = await dispatchAction({
      signedActor,
      action: "recurring.reversePayment",
      payload: {
        occurrence_id: occurrence.occurrence_id,
        transaction_id: paid.transaction.transaction_id,
        reason: "Uji pembatalan",
        row_version: paid.occurrence.row_version
      },
      rowVersion: paid.occurrence.row_version,
      requestId: "test:recurring-reverse",
      idempotencyKey: "test-recurring-reverse",
      database: db
    });
    assert.equal(reversed.transaction.status, "cancelled");
    const envelopeAfterReverse = await dispatchAction({
      signedActor,
      action: "envelopes.list",
      payload: {},
      requestId: "test:recurring-envelope-after-reverse",
      database: db,
    });
    assert.equal(envelopeAfterReverse.items.find((item) => item.envelope_period_id === envelope.period.envelope_period_id)?.remaining_amount, 200_000);
    const afterReverseState = await dispatchAction({
      signedActor,
      action: "app.initialState",
      payload: { period },
      requestId: "test:recurring-after-reverse",
      database: db,
    });
    assert.equal(afterReverseState.overview.totalBalance, beforePaymentState.overview.totalBalance);
    assert.equal(afterReverseState.overview.reservedBills, beforePaymentState.overview.reservedBills);
    assert.equal(afterReverseState.overview.safeToSpend, beforePaymentState.overview.safeToSpend);

    const skipped = await dispatchAction({
      signedActor,
      action: "recurring.cancelOccurrence",
      payload: { occurrence_id: occurrence.occurrence_id, reason: "Libur satu periode", row_version: reversed.occurrence.row_version },
      rowVersion: reversed.occurrence.row_version,
      requestId: "test:recurring-skip",
      idempotencyKey: "test-recurring-skip",
      database: db,
    });
    assert.equal(skipped.status, "cancelled");
    assert.equal(skipped.actual_amount, 0);
    const activeAfterSkip = await db.one("SELECT COUNT(*) AS count FROM transactions WHERE recurring_occurrence_id=? AND status='active'", [occurrence.occurrence_id]);
    assert.equal(Number(activeAfterSkip.count), 0);
    const skippedList = await dispatchAction({
      signedActor,
      action: "recurring.list",
      payload: { period: occurrence.due_date.slice(0, 7) },
      requestId: "test:recurring-list-skipped",
      database: db,
    });
    const skippedItem = skippedList.items.find((item) => item.occurrence_id === occurrence.occurrence_id);
    assert.equal(skippedItem?.status, "cancelled");
    assert.equal(skippedItem?.can_pay, false);
    assert.equal(skippedItem?.can_restore_occurrence, true);

    const archivedRule = await dispatchAction({
      signedActor,
      action: "recurring.archiveRule",
      payload: { recurring_rule_id: recurring.recurring_rule_id, reason: "Uji arsip setelah skip", row_version: updated.row_version },
      rowVersion: updated.row_version,
      requestId: "test:recurring-archive-after-skip",
      idempotencyKey: "test-recurring-archive-after-skip",
      database: db,
    });
    const skippedAfterArchive = await db.one("SELECT status FROM recurring_occurrences WHERE occurrence_id=?", [occurrence.occurrence_id]);
    assert.equal(skippedAfterArchive.status, "cancelled", "arsip rule tidak boleh menghapus occurrence yang sengaja dilewati");
    const restoredRule = await dispatchAction({
      signedActor,
      action: "recurring.restoreRule",
      payload: { recurring_rule_id: recurring.recurring_rule_id, reason: "Aktifkan kembali rule", row_version: archivedRule.row_version },
      rowVersion: archivedRule.row_version,
      requestId: "test:recurring-restore-rule-after-skip",
      idempotencyKey: "test-recurring-restore-rule-after-skip",
      database: db,
    });
    assert.equal(restoredRule.status, "active");
    const skippedAfterRuleRestore = await db.one("SELECT status FROM recurring_occurrences WHERE occurrence_id=?", [occurrence.occurrence_id]);
    assert.equal(skippedAfterRuleRestore.status, "cancelled", "restore rule tidak boleh membuat ulang periode skipped sebagai expected");

    await assert.rejects(
      () => dispatchAction({
        signedActor,
        action: "recurring.payOccurrence",
        payload: { occurrence_id: occurrence.occurrence_id, account_id: "account-main", amount: 50_000, transaction_date: todayJakarta(), row_version: skipped.row_version },
        rowVersion: skipped.row_version,
        requestId: "test:recurring-pay-skipped",
        idempotencyKey: "test-recurring-pay-skipped",
        database: db,
      }),
      (error) => error?.code === "OCCURRENCE_CANCELLED",
    );

    // Defense-in-depth: bahkan jika metadata occurrence rusak dan tidak lagi mencantumkan
    // transaction ID, restore harus fail closed bila ledger masih memiliki transaksi aktif.
    await db.execute(
      "UPDATE transactions SET status='active',cancelled_by=NULL,cancelled_at=NULL,cancellation_reason='' WHERE transaction_id=?",
      [paid.transaction.transaction_id],
    );
    await assert.rejects(
      () => dispatchAction({
        signedActor,
        action: "recurring.restoreOccurrence",
        payload: { occurrence_id: occurrence.occurrence_id, reason: "Uji fail closed", row_version: skipped.row_version },
        rowVersion: skipped.row_version,
        requestId: "test:recurring-restore-occurrence-corrupt-link",
        idempotencyKey: "test-recurring-restore-occurrence-corrupt-link",
        database: db,
      }),
      (error) => error?.code === "INTEGRITY_ERROR",
    );
    await db.execute(
      "UPDATE transactions SET status='cancelled',cancelled_by=?,cancelled_at=?,cancellation_reason=? WHERE transaction_id=?",
      [reversed.transaction.cancelled_by, reversed.transaction.cancelled_at, reversed.transaction.cancellation_reason, paid.transaction.transaction_id],
    );

    const restoredOccurrence = await dispatchAction({
      signedActor,
      action: "recurring.restoreOccurrence",
      payload: { occurrence_id: occurrence.occurrence_id, reason: "Jadwal aktif kembali", row_version: skipped.row_version },
      rowVersion: skipped.row_version,
      requestId: "test:recurring-restore-occurrence",
      idempotencyKey: "test-recurring-restore-occurrence",
      database: db,
    });
    assert.ok(["expected", "overdue"].includes(restoredOccurrence.status));
    assert.equal(restoredOccurrence.actual_amount, 0);

    const integrationKeys = await db.all("SELECT provider,event_key FROM integration_outbox WHERE status IN ('pending','failed') ORDER BY provider,event_key");
    const eventKeys = integrationKeys.map((row) => row.event_key);
    assert.ok(eventKeys.includes(`calendar:upsert:recurring:${recurring.recurring_rule_id}`));
    assert.ok(eventKeys.includes(`calendar:upsert:recurring_occurrence:${occurrence.occurrence_id}`));
    assert.ok(eventKeys.includes(`sheets:upsert:recurring:${recurring.recurring_rule_id}`));
    assert.equal(eventKeys.includes(`calendar:upsert:recurring:${occurrence.occurrence_id}`), false, "occurrence tidak boleh memakai key calendar level-rule");
    assert.equal(eventKeys.includes(`sheets:upsert:recurring:${occurrence.occurrence_id}`), false, "mirror recurring occurrence harus rebuild melalui rule id");
  } finally {
    db.close();
  }
});

test("import, restore, dan integrity recovery menjalankan dependency hasil pemecahan service", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedFinanceMaster(db);
    await withGoogleBridgeStub(async () => {
      const preview = await dispatchAction({
        signedActor,
        action: "import.preview",
        payload: {
          records: [{
            transaction_type: "expense",
            transaction_date: todayJakarta(),
            source_account_id: "account-main",
            category_id: "category-expense",
            amount: 25_000,
            description: "Import uji"
          }]
        },
        requestId: "test:import-preview",
        idempotencyKey: "test-import-preview",
        database: db
      });
      assert.equal(preview.acceptable, true);

      const applied = await dispatchAction({
        signedActor,
        action: "import.apply",
        payload: { previewToken: preview.previewToken, confirmation: "IMPORT TRANSAKSI" },
        requestId: "test:import-apply",
        idempotencyKey: "test-import-apply",
        database: db
      });
      assert.equal(applied.applied, 1);

      const backup = await createTechnicalBackup(db, contextFor("backup.create", { type: "manual" }), { type: "manual" });
      const restorePreview = await previewRestore(db, contextFor("restore.preview", { backupFileId: backup.fileId }));
      const restored = await dispatchAction({
        signedActor,
        action: "restore.apply",
        payload: {
          previewToken: restorePreview.previewToken,
          backupFileId: backup.fileId,
          confirmation: "RESTORE SALDO BERSAMA",
          acknowledged: true,
          reason: "Memulihkan backup uji service"
        },
        requestId: "test:restore-apply",
        idempotencyKey: "test-restore-apply",
        database: db
      });
      assert.equal(restored.restored, true);
      const restoreReplay = await dispatchAction({
        signedActor,
        action: "restore.apply",
        payload: {
          previewToken: restorePreview.previewToken,
          backupFileId: backup.fileId,
          confirmation: "RESTORE SALDO BERSAMA",
          acknowledged: true,
          reason: "Memulihkan backup uji service"
        },
        requestId: "test:restore-apply-replay",
        idempotencyKey: "test-restore-apply",
        database: db
      });
      assert.deepEqual(restoreReplay, restored, "Reservation restore harus bertahan setelah idempotency table dipulihkan agar retry same-key menjadi replay, bukan restore kedua.");

      await db.execute("UPDATE system_config SET value='true' WHERE key='maintenance_mode'");
      const integrity = await integrityWithMaintenanceRecovery(db, contextFor("integrity.run", { clearMaintenance: true }));
      assert.equal(integrity.ok, true);
      const maintenance = await db.one("SELECT value FROM system_config WHERE key='maintenance_mode'");
      assert.equal(maintenance.value, "false");
    });
  } finally {
    db.close();
  }
});
