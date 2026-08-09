import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTransaction } from "../../api/_lib/services/finance.js";
import { todayJakarta } from "../../api/_lib/services/core.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = { user_id: "owner-normalize", role: "owner", email: "owner-normalize@example.com" };
const member = { user_id: "member-normalize", role: "member", email: "member-normalize@example.com" };

const contextFor = (actor = owner) => ({ actor, today: todayJakarta() });

const seedReferenceData = async (db) => {
  const now = new Date().toISOString();
  for (const actor of [owner, member]) {
    await db.execute(
      "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [actor.user_id, `uid-${actor.user_id}`, actor.email, actor.user_id, actor.role, "active", 1, now, now],
    );
  }
  for (const [accountId, name] of [["account-a", "Rekening A"], ["account-b", "Rekening B"]]) {
    await db.execute(
      `INSERT INTO accounts(account_id,name,account_type,account_number,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [accountId, name, "bank", accountId === "account-a" ? "1234567890" : "9876543210", "shared", null, 500_000, todayJakarta(), 0, "active", 1, owner.user_id, now, owner.user_id, now],
    );
  }
  for (const [categoryId, type] of [["category-expense", "expense"], ["category-income", "income"], ["category-refund", "refund"]]) {
    await db.execute(
      "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      [categoryId, categoryId, type, type === "expense" ? "variable" : "other", "", "active", 1, owner.user_id, now, owner.user_id, now],
    );
  }
};

test("normalisasi transaksi mempertahankan guard type, category, account, dan reserved field", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedReferenceData(db);

    await assert.rejects(
      () => normalizeTransaction(db, contextFor(member), {
        transaction_type: "adjustment",
        transaction_date: todayJakarta(),
        source_account_id: "account-a",
        amount: 10_000,
        description: "Koreksi",
      }),
      (error) => error?.code === "ADJUSTMENT_OWNER_ONLY" && error?.status === 403,
    );

    await assert.rejects(
      () => normalizeTransaction(db, contextFor(), {
        transaction_type: "expense",
        transaction_date: todayJakarta(),
        source_account_id: "account-a",
        amount: 10_000,
        description: "Tanpa kategori",
      }),
      (error) => error?.code === "CATEGORY_REQUIRED" && error?.status === 400,
    );

    await assert.rejects(
      () => normalizeTransaction(db, contextFor(), {
        transaction_type: "transfer",
        transaction_date: todayJakarta(),
        source_account_id: "account-a",
        destination_account_id: "account-a",
        amount: 10_000,
        description: "Transfer salah",
      }),
      (error) => error?.code === "SAME_TRANSFER_ACCOUNT" && error?.status === 400,
    );

    await assert.rejects(
      () => normalizeTransaction(db, contextFor(), {
        transaction_type: "income",
        transaction_date: todayJakarta(),
        destination_account_id: "account-a",
        category_id: "category-income",
        amount: 10_000,
        description: "Pemasukan",
        created_by: "forged-client-value",
      }),
      (error) => error?.code === "RESERVED_TRANSACTION_FIELD" && error?.details?.field === "created_by",
    );
  } finally {
    db.close();
  }
});

test("normalisasi transfer valid tetap menghasilkan record canonical tanpa kategori", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedReferenceData(db);
    const record = await normalizeTransaction(db, contextFor(), {
      transaction_type: "transfer",
      transaction_date: todayJakarta(),
      source_account_id: "account-a",
      destination_account_id: "account-b",
      category_id: "category-expense",
      amount: 25_000,
      description: "Pindah dana",
      merchant: "",
      payment_method: "transfer",
    });

    assert.deepEqual({
      type: record.transaction_type,
      source: record.source_account_id,
      destination: record.destination_account_id,
      category: record.category_id,
      scope: record.scope,
      owner: record.owner_user_id,
      amount: record.amount,
    }, {
      type: "transfer",
      source: "account-a",
      destination: "account-b",
      category: null,
      scope: "shared",
      owner: null,
      amount: 25_000,
    });
  } finally {
    db.close();
  }
});
