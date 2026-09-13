import assert from "node:assert/strict";
import test from "node:test";
import { markNotificationRead } from "../../api/_lib/services/notifications/attentionState.js";
import { notificationCenter } from "../../api/_lib/services/notifications/subscriptions.js";
import { buildFinancialAlerts } from "../../api/_lib/services/reporting/dashboard/alerts.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

test("notifications.center hanya membaca queue actor dan memetakan event privacy-safe", async () => {
  const calls = [];
  const db = {
    all: async (sql, args) => {
      calls.push({ sql, args });
      if (sql.includes("notification_read_states")) return [{ notification_key: "event:notif-old", fingerprint: "v1:old", read_at: "2026-09-10T00:00:00.000Z" }];
      return [{
        notification_id: "notif-1",
        notification_type: "manual_reminder",
        title: "Cek tagihan",
        body: "Pengingat sudah waktunya.",
        target_path: "/perencanaan/jadwal",
        scheduled_at: "2026-09-11T02:00:00.000Z",
        status: "sent",
        created_at: "2026-09-11T01:59:00.000Z",
        dedupe_key: "manual-reminder:reminder-1",
      }];
    },
  };

  const result = await notificationCenter(db, { actor: { user_id: "user-a" }, payload: { limit: 25 } });
  assert.equal(calls.length, 2);
  const queueCall = calls.find((call) => call.sql.includes("notification_queue"));
  const readCall = calls.find((call) => call.sql.includes("notification_read_states"));
  assert.equal(queueCall.args[0], "user-a");
  assert.equal(queueCall.args[1], 25);
  assert.equal(readCall.args[0], "user-a");
  assert.match(queueCall.sql, /WHERE user_id=\?/);
  assert.deepEqual(result.readStates, [{ key: "event:notif-old", fingerprint: "v1:old", readAt: "2026-09-10T00:00:00.000Z" }]);
  assert.deepEqual(result.items[0], {
    id: "event:notif-1",
    source: "event",
    notificationId: "notif-1",
    type: "manual_reminder",
    title: "Cek tagihan",
    message: "Pengingat sudah waktunya.",
    targetPath: "/perencanaan/jadwal",
    occurredAt: "2026-09-11T02:00:00.000Z",
    deliveryStatus: "sent",
    severity: "info",
    guidanceId: "",
  });
});

test("status baca notifikasi tersimpan server-side per actor dan fingerprint baru dapat muncul lagi", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = "2026-09-13T00:00:00.000Z";
    for (const id of ["reader-a", "reader-b"]) {
      await db.execute(
        "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        [id, `firebase-${id}`, `${id}@example.com`, id, id === "reader-a" ? "owner" : "member", "active", 1, now, now],
      );
    }
    await markNotificationRead(db, {
      actor: { user_id: "reader-a" },
      payload: { items: [{ key: "budget:abc:80", fingerprint: "v1:budget_threshold:budget:abc:80" }] },
    });
    await markNotificationRead(db, {
      actor: { user_id: "reader-a" },
      payload: { items: [{ key: "budget:abc:90", fingerprint: "v1:budget_threshold:budget:abc:90" }] },
    });
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM notification_read_states WHERE user_id=?", ["reader-a"])).count), 2);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM notification_read_states WHERE user_id=?", ["reader-b"])).count), 0);
  } finally { db.close(); }
});

test("dashboard menghasilkan attention rekonsiliasi investasi stale dan mismatch", () => {
  const base = {
    period: "2026-09",
    historical: false,
    accounts: [],
    envelopes: [],
    recurring: [],
    goals: [],
    budgets: [],
    unallocatedCount: 0,
    reconciliationRows: [],
  };

  const mismatch = buildFinancialAlerts({
    ...base,
    investmentReconciliationRows: [{ rdn_account_id: "rdn-1", name: "Portofolio", reconciliation_date: "2026-09-10", status: "mismatch" }],
  });
  assert.equal(mismatch[0].type, "investment_reconciliation_difference");
  assert.equal(mismatch[0].targetPath, "/investasi");

  const stale = buildFinancialAlerts({
    ...base,
    investmentReconciliationRows: [{ rdn_account_id: "rdn-2", name: "Reksa Dana", reconciliation_date: null, status: null }],
  });
  assert.equal(stale[0].type, "investment_reconciliation_stale");
  assert.equal(stale[0].targetPath, "/investasi");
});
