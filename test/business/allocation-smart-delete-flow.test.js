import assert from "node:assert/strict";
import test from "node:test";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { archiveEnvelopeRule, previewEnvelopeRuleLifecycle } from "../../api/_lib/services/planning/envelopes.js";
import { accountAllocatedRemaining, accountBalanceAsOf } from "../../api/_lib/services/readModels.js";

const owner = { user_id: "delete-rumah-owner", firebase_uid: "delete-rumah-firebase", email: "owner-rumah@example.com", name: "Owner", role: "owner", status: "active" };
const context = (action, payload) => ({ actor: owner, action, payload, rowVersion: payload.row_version, requestId: `rumah:${action}`, enqueueMirror: async () => {} });

test("hapus Alokasi Rumah dengan 2 Kebutuhan dan Rp700.000 melepaskan dana, bukan menghapus saldo atau histori kebutuhan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = new Date().toISOString();
    await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [owner.user_id, owner.firebase_uid, owner.email, owner.name, owner.role, owner.status, 1, now, now]);
    await db.execute("INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["rekening-rumah", "Rekening Rumah", "bank", "shared", null, 1_000_000, "2026-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now]);
    for (const [id, name] of [["kat-belanja", "Belanja"], ["kat-listrik", "Listrik"]]) {
      await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", [id, name, "expense", "fixed", "home", "active", 1, owner.user_id, now, owner.user_id, now]);
    }
    await db.execute("INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["alokasi-rumah", "Rumah", "monthly", "shared", null, 700_000, "rekening-rumah", "unallocated", "confirm", "active", 1, owner.user_id, now, owner.user_id, now]);
    await db.execute("INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["periode-rumah", "alokasi-rumah", "Rumah", "2026-10-01", "2026-10-31", 700_000, 0, "active", 1, owner.user_id, now, owner.user_id, now, null, null]);
    for (const [id, name, categoryId, amount] of [["need-belanja", "Belanja Bulanan", "kat-belanja", 500_000], ["need-listrik", "Listrik", "kat-listrik", 200_000]]) {
      await db.execute("INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [id, "2026-10", categoryId, "alokasi-rumah", name, amount, 80, "active", 1, owner.user_id, now, owner.user_id, now, "shared", null]);
    }
    const before = await accountBalanceAsOf(db, await db.one("SELECT * FROM accounts WHERE account_id=?", ["rekening-rumah"]), "2026-10-16");
    assert.equal(before, 1_000_000);
    assert.equal(await accountAllocatedRemaining(db, "rekening-rumah"), 700_000);
    const preview = await previewEnvelopeRuleLifecycle(db, context("envelopes.previewRuleLifecycle", { envelope_rule_id: "alokasi-rumah", row_version: 1 }));
    assert.equal(preview.canDeleteUnused, false);
    assert.equal(preview.canArchive, true);
    const result = await archiveEnvelopeRule(db, context("envelopes.archiveRule", { envelope_rule_id: "alokasi-rumah", row_version: 1, reason: "Rumah tidak dipakai lagi" }));
    assert.equal(result.status, "archived");
    assert.equal(await accountAllocatedRemaining(db, "rekening-rumah"), 0);
    assert.equal(await accountBalanceAsOf(db, await db.one("SELECT * FROM accounts WHERE account_id=?", ["rekening-rumah"]), "2026-10-16"), before);
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM budgets WHERE envelope_rule_id='alokasi-rumah'")).count), 2);
    assert.equal((await db.one("SELECT status FROM envelope_periods WHERE envelope_period_id='periode-rumah'")).status, "archived");
    assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action='envelopes.archiveRule' AND entity_id='alokasi-rumah'"));
  } finally { db.close(); }
});
