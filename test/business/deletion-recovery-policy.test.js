import assert from "node:assert/strict";
import test from "node:test";
import { dispatchAction } from "../../api/_lib/actionDispatcher.js";
import { todayJakarta } from "../../api/_lib/services/core.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const OWNER_ID = "owner-policy";
const OWNER_UID = "firebase-owner-policy";
const OWNER_EMAIL = "owner-policy@example.com";
const signedActor = { uid: OWNER_UID, email: OWNER_EMAIL, name: "Owner Policy", role: "owner" };

const seedOwner = async (db) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [OWNER_ID, OWNER_UID, OWNER_EMAIL, "Owner Policy", "owner", "active", 1, now, now],
  );
};

const dispatch = (db, action, payload = {}, options = {}) => dispatchAction({
  signedActor: options.actor || signedActor,
  action,
  payload,
  requestId: `policy:${action}:${crypto.randomUUID()}`,
  idempotencyKey: options.idempotencyKey ?? (options.write === false ? null : `policy:${action}:${crypto.randomUUID()}`),
  rowVersion: options.rowVersion ?? payload.row_version ?? null,
  database: db,
});

const createAccount = (db, name, initialBalance = 0) => dispatch(db, "accounts.create", {
  name,
  account_type: "bank",
  account_number: `123456${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`,
  owner_scope: "shared",
  initial_balance: initialBalance,
  initial_balance_date: todayJakarta(),
  allow_negative: false,
});

const previousPeriod = () => {
  const [year, month] = todayJakarta().slice(0, 7).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

test("owner hanya dapat menghapus permanen rekening Rp0 yang belum pernah dipakai dan audit tetap tersedia", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedOwner(db);
    const account = await createAccount(db, "ATM Kosong");
    const preview = await dispatch(db, "accounts.previewLifecycle", {
      account_id: account.account_id,
      row_version: account.row_version,
    }, { write: false, rowVersion: account.row_version });
    assert.equal(preview.canDeleteUnused, true);
    assert.equal(preview.currentBalance, 0);
    assert.equal(preview.dependencies.transactions, 0);

    const idempotencyKey = "policy-delete-unused-account";
    const payload = {
      account_id: account.account_id,
      row_version: account.row_version,
      reason: "Rekening salah dibuat dan belum pernah digunakan",
      confirmation: preview.deleteConfirmation,
      acknowledged: true,
    };
    await assert.rejects(
      () => dispatch(db, "accounts.deleteUnused", { ...payload, acknowledged: false }, { rowVersion: account.row_version, idempotencyKey: "policy-delete-no-ack" }),
      (error) => error?.code === "ACKNOWLEDGEMENT_REQUIRED",
    );
    await assert.rejects(
      () => dispatch(db, "accounts.deleteUnused", { ...payload, confirmation: "SALAH" }, { rowVersion: account.row_version, idempotencyKey: "policy-delete-wrong-phrase" }),
      (error) => error?.code === "CONFIRMATION_MISMATCH",
    );
    await assert.rejects(
      () => dispatch(db, "accounts.deleteUnused", { ...payload, row_version: account.row_version + 1 }, { rowVersion: account.row_version + 1, idempotencyKey: "policy-delete-stale" }),
      (error) => error?.code === "CONFLICT",
    );
    const deleted = await dispatch(db, "accounts.deleteUnused", payload, { rowVersion: account.row_version, idempotencyKey });
    assert.equal(deleted.deleted, true);
    assert.equal(await db.one("SELECT account_id FROM accounts WHERE account_id=?", [account.account_id]), null);

    const audit = await db.one("SELECT action,entity_id,new_value FROM audit_log WHERE entity_type='account' AND entity_id=? ORDER BY timestamp DESC LIMIT 1", [account.account_id]);
    assert.equal(audit.action, "accounts.deleteUnused");
    assert.equal(JSON.parse(audit.new_value).audit_preserved, true);

    const retried = await dispatch(db, "accounts.deleteUnused", payload, { rowVersion: account.row_version, idempotencyKey });
    assert.deepEqual(retried, deleted);
    const auditCount = await db.one("SELECT COUNT(*) AS count FROM audit_log WHERE action='accounts.deleteUnused' AND entity_id=?", [account.account_id]);
    assert.equal(Number(auditCount.count), 1);
  } finally {
    db.close();
  }
});



test("hard delete rekening ditolak untuk member, saldo nonzero, dan referensi historis", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedOwner(db);
    const now = new Date().toISOString();
    const memberActor = { uid: "firebase-member-policy", email: "member-delete-policy@example.com", name: "Member Policy", role: "member" };
    await db.execute(
      "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      ["member-delete-policy", memberActor.uid, memberActor.email, memberActor.name, "member", "active", 1, now, now],
    );

    const emptyAccount = await createAccount(db, "ATM Owner Only");
    const emptyPreview = await dispatch(db, "accounts.previewLifecycle", {
      account_id: emptyAccount.account_id,
      row_version: emptyAccount.row_version,
    }, { write: false, rowVersion: emptyAccount.row_version });
    await assert.rejects(
      () => dispatch(db, "accounts.deleteUnused", {
        account_id: emptyAccount.account_id,
        row_version: emptyAccount.row_version,
        reason: "Member tidak boleh menghapus",
        confirmation: emptyPreview.deleteConfirmation,
        acknowledged: true,
      }, { actor: memberActor, rowVersion: emptyAccount.row_version }),
      (error) => error?.code === "OWNER_ONLY",
    );

    const nonZero = await createAccount(db, "ATM Saldo Awal", 50_000);
    const nonZeroPreview = await dispatch(db, "accounts.previewLifecycle", {
      account_id: nonZero.account_id,
      row_version: nonZero.row_version,
    }, { write: false, rowVersion: nonZero.row_version });
    assert.equal(nonZeroPreview.canDeleteUnused, false);
    assert.match(nonZeroPreview.deleteBlockers.join(" "), /Saldo awal harus Rp0/);

    const referenced = await createAccount(db, "ATM Referensi Lama");
    await db.execute(
      "INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["envelope-delete-policy", "Kantong lama", "monthly", "shared", null, 0, referenced.account_id, "unallocated", "confirm", "archived", 1, OWNER_ID, now, OWNER_ID, now],
    );
    await db.execute(
      "INSERT INTO reconciliations(reconciliation_id,account_id,reconciled_at,system_balance,actual_balance,difference,notes,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["reconciliation-delete-policy", referenced.account_id, now, 0, 0, 0, "Riwayat", "matched", OWNER_ID, now],
    );
    const referencedPreview = await dispatch(db, "accounts.previewLifecycle", {
      account_id: referenced.account_id,
      row_version: referenced.row_version,
    }, { write: false, rowVersion: referenced.row_version });
    assert.equal(referencedPreview.canDeleteUnused, false);
    assert.equal(referencedPreview.dependencies.envelopes, 1);
    assert.equal(referencedPreview.dependencies.reconciliations, 1);
    await assert.rejects(
      () => dispatch(db, "accounts.deleteUnused", {
        account_id: referenced.account_id,
        row_version: referenced.row_version,
        reason: "Referensi lama harus memblokir",
        confirmation: referencedPreview.deleteConfirmation,
        acknowledged: true,
      }, { rowVersion: referenced.row_version }),
      (error) => error?.code === "ACCOUNT_DELETE_BLOCKED",
    );
  } finally {
    db.close();
  }
});

test("rekening dengan transaksi cancelled tetap tidak dapat dihapus permanen walaupun saldo kembali Rp0", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedOwner(db);
    const account = await createAccount(db, "ATM Pernah Dipakai");
    const now = new Date().toISOString();
    await db.execute(
      "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ["income-policy", "Pemasukan Uji", "income", "other", "", "active", 1, OWNER_ID, now, OWNER_ID, now],
    );
    const transaction = await dispatch(db, "transactions.create", {
      transaction_date: todayJakarta(),
      transaction_type: "income",
      destination_account_id: account.account_id,
      category_id: "income-policy",
      amount: 10_000,
      description: "Uji histori rekening",
    });
    await dispatch(db, "transactions.cancel", {
      transaction_id: transaction.transaction_id,
      row_version: transaction.row_version,
      reason: "Mengembalikan saldo untuk uji",
    }, { rowVersion: transaction.row_version });

    const latest = await db.one("SELECT * FROM accounts WHERE account_id=?", [account.account_id]);
    const preview = await dispatch(db, "accounts.previewLifecycle", {
      account_id: account.account_id,
      row_version: latest.row_version,
    }, { write: false, rowVersion: latest.row_version });
    assert.equal(preview.currentBalance, 0);
    assert.equal(preview.dependencies.transactions, 1);
    assert.equal(preview.canDeleteUnused, false);

    await assert.rejects(
      () => dispatch(db, "accounts.deleteUnused", {
        account_id: account.account_id,
        row_version: latest.row_version,
        reason: "Tidak boleh berhasil",
        confirmation: preview.deleteConfirmation,
        acknowledged: true,
      }, { rowVersion: latest.row_version }),
      (error) => error?.code === "ACCOUNT_DELETE_BLOCKED",
    );
    assert.ok(await db.one("SELECT account_id FROM accounts WHERE account_id=?", [account.account_id]));
  } finally {
    db.close();
  }
});

test("rekening, kategori, dan transaksi cancelled dapat dipulihkan satu per satu dengan alasan dan row version", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedOwner(db);
    const account = await createAccount(db, "Rekening Recovery", 100_000);
    const category = await dispatch(db, "categories.create", {
      name: "Kategori Recovery",
      transaction_type: "expense",
      nature: "variable",
    });
    const transaction = await dispatch(db, "transactions.create", {
      transaction_date: todayJakarta(),
      transaction_type: "expense",
      source_account_id: account.account_id,
      category_id: category.category_id,
      amount: 10_000,
      description: "Transaksi recovery",
    });
    const cancelled = await dispatch(db, "transactions.cancel", {
      transaction_id: transaction.transaction_id,
      row_version: transaction.row_version,
      reason: "Uji pembatalan",
    }, { rowVersion: transaction.row_version });
    const restoredTransaction = await dispatch(db, "transactions.restore", {
      transaction_id: cancelled.transaction_id,
      row_version: cancelled.row_version,
      reason: "Pembatalan dilakukan secara tidak sengaja",
    }, { rowVersion: cancelled.row_version });
    assert.equal(restoredTransaction.status, "active");

    const cancelledAgain = await dispatch(db, "transactions.cancel", {
      transaction_id: restoredTransaction.transaction_id,
      row_version: restoredTransaction.row_version,
      reason: "Kosongkan rekening sebelum arsip",
    }, { rowVersion: restoredTransaction.row_version });
    assert.equal(cancelledAgain.status, "cancelled");

    const archivedCategory = await dispatch(db, "categories.archive", {
      category_id: category.category_id,
      row_version: category.row_version,
      reason: "Kategori tidak dipakai untuk transaksi baru",
    }, { rowVersion: category.row_version });
    const restoredCategory = await dispatch(db, "categories.restore", {
      category_id: archivedCategory.category_id,
      row_version: archivedCategory.row_version,
      reason: "Kategori masih diperlukan",
    }, { rowVersion: archivedCategory.row_version });
    assert.equal(restoredCategory.status, "active");

    const emptyAccount = await createAccount(db, "Rekening Arsip");
    const archivedAccount = await dispatch(db, "accounts.archive", {
      account_id: emptyAccount.account_id,
      row_version: emptyAccount.row_version,
      reason: "Rekening tidak dipakai lagi",
    }, { rowVersion: emptyAccount.row_version });
    assert.equal(archivedAccount.status, "archived");
    const restoredAccount = await dispatch(db, "accounts.restore", {
      account_id: archivedAccount.account_id,
      row_version: archivedAccount.row_version,
      reason: "Rekening masih diperlukan",
    }, { rowVersion: archivedAccount.row_version });
    assert.equal(restoredAccount.status, "active");
    assert.equal(emptyAccount.account_id, restoredAccount.account_id);
  } finally {
    db.close();
  }
});

test("reaktivasi anggota dan tutup periode memakai tindakan eksplisit serta konfirmasi server", async () => {
  const db = await createSqliteTestDatabase();
  const memberEmail = "member-policy@example.com";
  try {
    await seedOwner(db);
    const now = new Date().toISOString();
    await db.execute(
      "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      ["member-policy", null, memberEmail, "Member Policy", "member", "inactive", 1, now, now],
    );
    const reactivated = await dispatch(db, "users.reactivate", {
      user_id: "member-policy",
      row_version: 1,
      reason: "Akses pasangan dipulihkan",
    }, { rowVersion: 1 });
    assert.equal(reactivated.status, "active");

    const period = previousPeriod();
    const preview = await dispatch(db, "periods.previewClose", { period_key: period }, { write: false });
    assert.equal(preview.canClose, true);
    await assert.rejects(
      () => dispatch(db, "periods.close", { period_key: period, reason: "Rekonsiliasi selesai", confirmation: "SALAH" }),
      (error) => error?.code === "CONFIRMATION_MISMATCH",
    );
    const closed = await dispatch(db, "periods.close", {
      period_key: period,
      reason: "Rekonsiliasi selesai",
      confirmation: preview.confirmation,
    });
    assert.equal(closed.status, "closed");
  } finally {
    db.close();
  }
});
