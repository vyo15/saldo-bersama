import assert from "node:assert/strict";
import test from "node:test";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { visibleAccounts } from "../../api/_lib/services/readModels.js";
import { cancelTransaction, listTransactions, updateTransaction } from "../../api/_lib/services/finance.js";
import { dashboardOverview } from "../../api/_lib/services/reporting/dashboard.js";
import { createReconciliation, listReconciliations } from "../../api/_lib/services/reporting/reconciliations.js";

const now = "2026-08-03T03:00:00.000Z";
const member = { user_id: "member-1", email: "member@example.com", name: "Member Satu", role: "member", status: "active" };

const seed = async (db) => {
  for (const user of [
    { user_id: "owner-1", firebase_uid: "fb-owner", email: "owner@example.com", name: "Vio Yusup", role: "owner" },
    { user_id: "member-1", firebase_uid: "fb-member", email: "member@example.com", name: "Pasangan", role: "member" },
  ]) {
    await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [user.user_id, user.firebase_uid, user.email, user.name, user.role, "active", 1, now, now]);
  }
  const accounts = [
    ["shared", "Rekening Bersama", "shared", null],
    ["member-personal", "Rekening Pasangan", "personal", "member-1"],
    ["owner-personal", "Rekening Vio", "personal", "owner-1"],
  ];
  for (const [id, name, scope, ownerId] of accounts) {
    await db.execute("INSERT INTO accounts(account_id,name,account_type,account_number,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [id, name, "bank", `123456${id.length}`, scope, ownerId, 100_000, "2026-01-01", 0, "active", 1, "owner-1", now, "owner-1", now]);
  }
  await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["cat-income", "Gaji", "income", "fixed", "", "active", 1, "owner-1", now, "owner-1", now]);
  await db.execute(`INSERT INTO transactions(transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,recurring_occurrence_id,goal_id,amount,description,overspend_reason,merchant,payment_method,scope,owner_user_id,status,row_version,idempotency_key,created_by,created_at,updated_by,updated_at,cancelled_by,cancelled_at,cancellation_reason)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["tx-owner", "2026-08-01", "income", null, "owner-personal", "cat-income", null, null, null, 50_000, "Gaji owner", "", "", "transfer", "personal", "owner-1", "active", 1, "tx-owner-key", "owner-1", now, "owner-1", now, null, null, ""]);
  await db.execute(`INSERT INTO transactions(transaction_id,transaction_date,transaction_type,source_account_id,destination_account_id,category_id,envelope_period_id,recurring_occurrence_id,goal_id,amount,description,overspend_reason,merchant,payment_method,scope,owner_user_id,status,row_version,idempotency_key,created_by,created_at,updated_by,updated_at,cancelled_by,cancelled_at,cancellation_reason)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["tx-member-legacy", "2026-08-02", "income", null, "owner-personal", "cat-income", null, null, null, 25_000, "Data legacy dibuat member", "", "", "transfer", "personal", "owner-1", "active", 1, "tx-member-legacy-key", "member-1", now, "member-1", now, null, null, ""]);
};

test("member membaca semua rekening dan ledger pasangan tetapi capability tulis tetap dibatasi", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const accounts = await visibleAccounts(db, member);
    assert.equal(accounts.length, 3);
    const ownerAccount = accounts.find((item) => item.account_id === "owner-personal");
    const memberAccount = accounts.find((item) => item.account_id === "member-personal");
    assert.equal(ownerAccount.owner_name, "Vio Yusup");
    assert.equal(ownerAccount.can_transact, false);
    assert.equal(ownerAccount.can_reconcile, false);
    assert.equal(ownerAccount.read_only, true);
    assert.equal(memberAccount.can_transact, true);
    assert.equal(memberAccount.is_owned_by_actor, true);

    const overview = await dashboardOverview(db, { actor: member, payload: { period: "2026-08" } });
    assert.equal(overview.totalBalance, 375_000, "Total transparan harus mencakup rekening pasangan.");
    assert.equal(overview.safeToSpend, 200_000, "Saldo aman member hanya boleh memakai rekening shared dan personal miliknya.");
    assert.equal(overview.unallocatedFunds, 200_000, "Dana belum dialokasikan tidak boleh menganggap rekening personal pasangan dapat dioperasikan member.");

    const transactions = await listTransactions(db, { actor: member, payload: { period: "2026-08", limit: 20, offset: 0 } });
    assert.equal(transactions.items.some((item) => item.transaction_id === "tx-owner"), true, "Ledger rekening pasangan harus tetap dapat ditelusuri.");
    const legacyMemberTransaction = transactions.items.find((item) => item.transaction_id === "tx-member-legacy");
    assert.equal(legacyMemberTransaction.can_edit, false, "Creator tidak boleh mengubah transaksi legacy pada rekening pasangan yang tidak lagi operable.");
    assert.equal(legacyMemberTransaction.can_cancel, false, "Creator tidak boleh membatalkan transaksi legacy pada rekening pasangan yang tidak lagi operable.");

    await assert.rejects(
      () => updateTransaction(db, { actor: member, payload: { transaction_id: "tx-member-legacy", row_version: 1 }, rowVersion: 1 }),
      (error) => error?.code === "FORBIDDEN",
    );
    await assert.rejects(
      () => cancelTransaction(db, { actor: member, payload: { transaction_id: "tx-member-legacy", row_version: 999, reason: "Tidak boleh" }, rowVersion: 999 }),
      (error) => error?.code === "FORBIDDEN",
      "Authorization wajib diputuskan sebelum row_version agar transaksi yang tidak boleh dimodifikasi tidak membocorkan state konflik.",
    );
    await assert.rejects(
      () => cancelTransaction(db, { actor: member, payload: { transaction_id: "tx-member-legacy", row_version: 1, reason: "Tidak boleh" }, rowVersion: 1 }),
      (error) => error?.code === "FORBIDDEN",
    );

    await db.execute(
      "INSERT INTO reconciliations(reconciliation_id,account_id,reconciled_at,system_balance,actual_balance,difference,notes,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["recon-owner", "owner-personal", now, 175_000, 175_000, 0, "Cocok", "matched", "owner-1", now],
    );
    const reconciliations = await listReconciliations(db, { actor: member, payload: { limit: 30 } });
    assert.equal(reconciliations.items[0].account_name, "Rekening Vio · Pribadi · Vio Yusup");

    await assert.rejects(
      () => createReconciliation(db, { actor: member, payload: { account_id: "owner-personal", actual_balance: 150_000, notes: "Tidak boleh" } }),
      (error) => error?.code === "INVALID_ACCOUNT",
    );
  } finally {
    db.close();
  }
});
