import assert from "node:assert/strict";
import test from "node:test";
import { dispatchAction } from "../../api/_lib/actionDispatcher.js";
import { createTechnicalBackup, integrityWithMaintenanceRecovery, previewRestore, applyRestore } from "../../api/_lib/services/maintenance/index.js";
import { listSubscriptionsForUser } from "../../api/_lib/services/notifications.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { todayJakarta } from "../../api/_lib/services/core.js";

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

  process.env.GOOGLE_BRIDGE_WEB_APP_URL = "https://bridge.invalid.test";
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

test("budget dan recurring hasil pemecahan service tetap dapat create, update, pay, dan reverse", async () => {
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

    const occurrence = await db.one("SELECT * FROM recurring_occurrences WHERE recurring_rule_id=? ORDER BY due_date LIMIT 1", [recurring.recurring_rule_id]);
    assert.ok(occurrence);
    const paid = await dispatchAction({
      signedActor,
      action: "recurring.payOccurrence",
      payload: { occurrence_id: occurrence.occurrence_id, account_id: "account-main", amount: 50_000, transaction_date: todayJakarta(), row_version: occurrence.row_version },
      rowVersion: occurrence.row_version,
      requestId: "test:recurring-pay",
      idempotencyKey: "test-recurring-pay",
      database: db
    });
    assert.equal(paid.occurrence.actual_amount, 50_000);

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
      const restored = await applyRestore(db, contextFor("restore.apply", {
        previewToken: restorePreview.previewToken,
        backupFileId: backup.fileId,
        confirmation: "RESTORE SALDO BERSAMA"
      }));
      assert.equal(restored.restored, true);

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
