import assert from "node:assert/strict";
import test from "node:test";
import { notificationCenter } from "../../api/_lib/services/notifications/subscriptions.js";
import { buildFinancialAlerts } from "../../api/_lib/services/reporting/dashboard/alerts.js";

test("notifications.center hanya membaca queue actor dan memetakan event privacy-safe", async () => {
  const calls = [];
  const db = {
    all: async (sql, args) => {
      calls.push({ sql, args });
      return [{
        notification_id: "notif-1",
        notification_type: "manual_reminder",
        title: "Cek tagihan",
        body: "Pengingat sudah waktunya.",
        target_path: "/perencanaan/jadwal",
        scheduled_at: "2026-09-11T02:00:00.000Z",
        status: "sent",
        created_at: "2026-09-11T01:59:00.000Z",
      }];
    },
  };

  const result = await notificationCenter(db, { actor: { user_id: "user-a" }, payload: { limit: 25 } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[0], "user-a");
  assert.equal(calls[0].args[1], 25);
  assert.match(calls[0].sql, /WHERE user_id=\?/);
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
  });
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
