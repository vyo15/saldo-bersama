import assert from "node:assert/strict";
import test from "node:test";
import { createTransaction, updateTransaction } from "../../api/_lib/services/finance.js";
import { monthlyReport } from "../../api/_lib/services/reporting/dashboard.js";
import { visibleAccounts } from "../../api/_lib/services/readModels.js";
import { todayJakarta } from "../../api/_lib/services/core.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = { user_id: "owner-cost", firebase_uid: "uid-owner-cost", email: "owner-cost@example.com", name: "Owner", role: "owner", status: "active", row_version: 1 };
const member = { user_id: "member-cost", firebase_uid: "uid-member-cost", email: "member-cost@example.com", name: "Member", role: "member", status: "active", row_version: 1 };

const context = (action, payload = {}, suffix = Math.random().toString(36).slice(2)) => ({
  actor: owner,
  action,
  payload,
  requestId: `cost:${action}:${suffix}`,
  idempotencyKey: `cost-key:${action}:${suffix}`,
  enqueueMirror: async () => {},
});

const seed = async (db) => {
  const now = new Date().toISOString();
  for (const user of [owner, member]) {
    await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [user.user_id, user.firebase_uid, user.email, user.name, user.role, user.status, 1, now, now]);
  }
  await db.execute(`INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["shared-cost", "Bersama", "cash", "shared", null, 1_000_000, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now]);
  await db.execute(`INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["personal-cost", "Pribadi", "cash", "personal", owner.user_id, 1_000_000, "2020-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now]);
  await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["cost-food", "Makan", "expense", "variable", "", "active", 1, owner.user_id, now, owner.user_id, now]);
};

const expensePayload = (overrides = {}) => ({
  transaction_type: "expense",
  transaction_date: todayJakarta(),
  source_account_id: "shared-cost",
  category_id: "cost-food",
  amount: 101,
  description: "Biaya bersama",
  confirm_duplicate: true,
  ...overrides,
});

test("pembagian beban equal tepat Rupiah dan tidak mengubah rumus saldo ledger", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const before = (await visibleAccounts(db, owner)).find((item) => item.account_id === "shared-cost").balance;
    const created = await createTransaction(db, context("transactions.create", expensePayload({ cost_share_mode: "equal" }), "equal"));
    assert.equal(created.cost_share_mode, "equal");
    assert.equal(created.cost_share.reduce((sum, item) => sum + item.basis_points, 0), 10_000);
    assert.equal(created.cost_share.reduce((sum, item) => sum + item.share_amount, 0), 101);
    assert.deepEqual(created.cost_share.map((item) => item.share_amount).sort((a, b) => a - b), [50, 51]);
    const after = (await visibleAccounts(db, owner)).find((item) => item.account_id === "shared-cost").balance;
    assert.equal(before - after, 101, "Split analitik tidak boleh menambah dampak saldo selain transaksi asli.");
  } finally { db.close(); }
});

test("persentase wajib 100 persen dan edit nominal menghitung ulang snapshot", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await assert.rejects(() => createTransaction(db, context("transactions.create", expensePayload({
      cost_share_mode: "percentage",
      cost_share_percentages: [{ user_id: owner.user_id, percentage: 60 }, { user_id: member.user_id, percentage: 30 }],
    }), "invalid-percent")), (error) => error.code === "COST_SHARE_TOTAL_INVALID");

    const created = await createTransaction(db, context("transactions.create", expensePayload({
      amount: 1000,
      cost_share_mode: "percentage",
      cost_share_percentages: [{ user_id: owner.user_id, percentage: 60 }, { user_id: member.user_id, percentage: 40 }],
    }), "percent"));
    const now = new Date().toISOString();
    await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", ["later-member", "uid-later-member", "later@example.com", "Later", "member", "active", 1, now, now]);
    const updated = await updateTransaction(db, { ...context("transactions.update", { transaction_id: created.transaction_id }, "percent-update"), rowVersion: created.row_version, payload: { transaction_id: created.transaction_id, row_version: created.row_version, amount: 2000 } });
    const shares = Object.fromEntries(updated.cost_share.map((item) => [item.user_id, item.share_amount]));
    assert.equal(shares[owner.user_id], 1200);
    assert.equal(shares[member.user_id], 800);
    assert.equal(shares["later-member"], undefined, "Perubahan daftar pengguna tidak boleh mengubah snapshot split historis saat field split tidak diedit.");
  } finally { db.close(); }
});

test("edit transaksi equal mempertahankan peserta snapshot meski anggota aktif berubah", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const created = await createTransaction(db, context("transactions.create", expensePayload({ amount: 1000, cost_share_mode: "equal" }), "equal-snapshot"));
    const now = new Date().toISOString();
    await db.execute("UPDATE users SET status='inactive',updated_at=? WHERE user_id=?", [now, member.user_id]);
    const updated = await updateTransaction(db, {
      ...context("transactions.update", {}, "equal-snapshot-update"),
      rowVersion: created.row_version,
      payload: { transaction_id: created.transaction_id, row_version: created.row_version, amount: 1200, cost_share_mode: "equal", cost_share_percentages: [] },
    });
    assert.deepEqual(updated.cost_share.map((item) => item.user_id).sort(), [member.user_id, owner.user_id].sort());
    assert.equal(updated.cost_share.reduce((sum, item) => sum + item.share_amount, 0), 1200);
  } finally { db.close(); }
});

test("transaksi personal selalu unspecified dan laporan pembagian hanya memakai shared expense yang ditentukan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const personal = await createTransaction(db, context("transactions.create", expensePayload({ source_account_id: "personal-cost", amount: 250, cost_share_mode: "equal" }), "personal"));
    assert.equal(personal.cost_share_mode, "unspecified");
    assert.deepEqual(personal.cost_share, []);
    await createTransaction(db, context("transactions.create", expensePayload({ amount: 1000, cost_share_mode: "equal" }), "shared-report"));
    const report = await monthlyReport(db, { actor: owner, payload: { period: todayJakarta().slice(0, 7), trend_months: 3 } });
    assert.equal(report.costShareExpenses.reduce((sum, item) => sum + item.amount, 0), 1000);
    assert.equal(report.costShareExpenses.length, 2);
  } finally { db.close(); }
});
