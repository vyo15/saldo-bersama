import assert from "node:assert/strict";
import test from "node:test";
import { archiveEnvelopeRule, createEnvelope, deleteUnusedEnvelopeRule, listEnvelopes, previewEnvelopeRuleLifecycle } from "../../api/_lib/services/planning/envelopes.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { accountAllocatedRemaining, accountBalanceAsOf } from "../../api/_lib/services/readModels.js";
import { monthBounds, todayJakarta } from "../../api/_lib/services/core.js";
import { ACTION_PERMISSIONS } from "../../api/_lib/security.js";

const admin = { user_id: "admin-delete", firebase_uid: "firebase-admin-delete", email: "admin@test.local", name: "Admin", role: "owner", status: "active", row_version: 1 };
const memberA = { user_id: "member-delete-a", firebase_uid: "firebase-member-delete-a", email: "membera@test.local", name: "Anggota A", role: "member", status: "active", row_version: 1 };
const memberB = { user_id: "member-delete-b", firebase_uid: "firebase-member-delete-b", email: "memberb@test.local", name: "Anggota B", role: "member", status: "active", row_version: 1 };
const ctx = (actor, action, payload) => ({ actor, action, payload, rowVersion: payload?.row_version, requestId: `${action}:${Math.random()}`, enqueueMirror: async () => {} });
const seed = async (db) => {
  const now = new Date().toISOString();
  for (const actor of [admin, memberA, memberB]) await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [actor.user_id, actor.firebase_uid, actor.email, actor.name, actor.role, actor.status, 1, now, now]);
  for (const [id, scope, owner] of [["rekening-bersama", "shared", null], ["rekening-pribadi-a", "personal", memberA.user_id]]) {
    await db.execute("INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [id, id, "bank", scope, owner, 1_000_000, "2020-01-01", 0, "active", 1, admin.user_id, now, admin.user_id, now]);
  }
};
const makeRule = (db, actor, name, source = "rekening-bersama", assignee = "") => {
  const bounds = monthBounds(todayJakarta().slice(0, 7));
  return createEnvelope(db, ctx(actor, "envelopes.create", { name, source_account_id: source, assignee_user_id: assignee || (source === "rekening-pribadi-a" ? memberA.user_id : ""), default_amount: 250_000, allocated_amount: 250_000, period_type: "monthly", period_start: bounds.start, period_end: bounds.end, rollover_policy: "unallocated", overspend_policy: "confirm" }));
};
const preview = (db, actor, rule) => previewEnvelopeRuleLifecycle(db, ctx(actor, "envelopes.previewRuleLifecycle", { envelope_rule_id: rule.envelope_rule_id, row_version: rule.row_version }));
const archive = (db, actor, rule, reason = "Alokasi tidak diperlukan") => archiveEnvelopeRule(db, ctx(actor, "envelopes.archiveRule", { envelope_rule_id: rule.envelope_rule_id, row_version: rule.row_version, reason }));
const remove = (db, actor, rule, reason = "Duplikat") => deleteUnusedEnvelopeRule(db, ctx(actor, "envelopes.deleteUnusedRule", { envelope_rule_id: rule.envelope_rule_id, row_version: rule.row_version, reason, acknowledged: true }));

test("izin role member mencakup preview, arsip, dan hapus permanen wadah Alokasi", () => {
  for (const action of ["envelopes.previewRuleLifecycle", "envelopes.archiveRule", "envelopes.deleteUnusedRule"]) assert.equal(ACTION_PERMISSIONS.member.has(action), true);
  for (const action of ["envelopes.close", "envelopes.restoreRule"]) assert.equal(ACTION_PERMISSIONS.member.has(action), false);
});

test("anggota melihat tombol lifecycle semua Alokasi Bersama, dan dapat hard-delete wadah belum terpakai", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const shared = await makeRule(db, admin, "Kebutuhan Keluarga", "rekening-bersama", admin.user_id);
    const list = await listEnvelopes(db, ctx(memberB, "envelopes.list", {}));
    assert.equal(list.items.find((row) => row.envelope_rule_id === shared.rule.envelope_rule_id)?.can_archive_rule, true);
    assert.equal(list.items.find((row) => row.envelope_rule_id === shared.rule.envelope_rule_id)?.can_manage_needs, false, "hak memakai dana tetap berdasarkan assignee");
    assert.equal((await preview(db, memberB, shared.rule)).canDeleteUnused, true);
    const account = await db.one("SELECT * FROM accounts WHERE account_id='rekening-bersama'");
    const balanceBefore = await accountBalanceAsOf(db, account, todayJakarta());
    await remove(db, memberB, shared.rule);
    assert.equal(await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=?", [shared.rule.envelope_rule_id]), null);
    assert.equal(await accountAllocatedRemaining(db, account.account_id), 0);
    assert.equal(await accountBalanceAsOf(db, account, todayJakarta()), balanceBefore);
    assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action='envelopes.deleteUnusedRule' AND entity_id=? AND actor_id=?", [shared.rule.envelope_rule_id, memberB.user_id]));
  } finally { db.close(); }
});

test("member mengarsipkan wadah Bersama yang sudah punya kebutuhan tanpa menghapus saldo atau histori", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const created = await makeRule(db, admin, "Alokasi Dengan Kebutuhan", "rekening-bersama", memberA.user_id);
    const now = new Date().toISOString();
    await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["kategori-delete", "Belanja", "expense", "fixed", "shopping", "active", 1, admin.user_id, now, admin.user_id, now]);
    await db.execute("INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["budget-delete", todayJakarta().slice(0, 7), "kategori-delete", created.rule.envelope_rule_id, "Belanja", 250_000, 80, "active", 1, admin.user_id, now, admin.user_id, now, "shared", null]);
    assert.equal((await preview(db, memberB, created.rule)).canDeleteUnused, false);
    const account = await db.one("SELECT * FROM accounts WHERE account_id='rekening-bersama'");
    const balanceBefore = await accountBalanceAsOf(db, account, todayJakarta());
    const result = await archive(db, memberB, created.rule);
    assert.equal(result.status, "archived");
    assert.equal(await accountAllocatedRemaining(db, account.account_id), 0);
    assert.equal(await accountBalanceAsOf(db, account, todayJakarta()), balanceBefore);
    assert.equal((await db.one("SELECT status FROM budgets WHERE budget_id='budget-delete'")).status, "active", "histori Kebutuhan dipertahankan");
    assert.equal((await db.one("SELECT status FROM envelope_periods WHERE envelope_rule_id=?", [created.rule.envelope_rule_id])).status, "archived");
    assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action='envelopes.archiveRule' AND entity_id=? AND actor_id=?", [created.rule.envelope_rule_id, memberB.user_id]));
    assert.equal((await listEnvelopes(db, ctx(memberB, "envelopes.list", {}))).items.some((item) => item.envelope_rule_id === created.rule.envelope_rule_id && item.status === "active"), false);
  } finally { db.close(); }
});

test("member tidak dapat menghapus wadah pribadi orang lain dengan memanggil API langsung", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const personal = await makeRule(db, memberA, "Alokasi Pribadi", "rekening-pribadi-a");
    for (const stranger of [memberB, admin]) {
      for (const action of [() => preview(db, stranger, personal.rule), () => archive(db, stranger, personal.rule), () => remove(db, stranger, personal.rule)]) {
        await assert.rejects(action, (error) => error.status === 403 && error.code === "ENVELOPE_LIFECYCLE_FORBIDDEN");
      }
    }
    const shared = await makeRule(db, admin, "Alokasi Bersama Aktif");
    await assert.rejects(() => preview(db, { ...memberB, status: "inactive" }, shared.rule), (error) => error.code === "ENVELOPE_LIFECYCLE_FORBIDDEN");
    assert.equal((await preview(db, memberA, personal.rule)).canDeleteUnused, true);
    await remove(db, memberA, personal.rule);
    assert.equal(await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=?", [personal.rule.envelope_rule_id]), null);
  } finally { db.close(); }
});

test("version lama dan alasan kosong menolak penghapusan Alokasi member", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const created = await makeRule(db, admin, "Jatah Bersama");
    await assert.rejects(() => archive(db, memberB, { ...created.rule, row_version: 999 }), (error) => error.status === 409);
    await assert.rejects(() => archive(db, memberB, created.rule, ""), (error) => error.code === "REASON_REQUIRED");
    assert.equal((await db.one("SELECT status FROM envelope_rules WHERE envelope_rule_id=?", [created.rule.envelope_rule_id])).status, "active");
  } finally { db.close(); }
});
