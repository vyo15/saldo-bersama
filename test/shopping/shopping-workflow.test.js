import test from "node:test";
import assert from "node:assert/strict";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { createShoppingItem, createShoppingList, setShoppingItemState, checkoutShoppingList } from "../../api/_lib/services/shopping/mutations.js";
import { shoppingDetail } from "../../api/_lib/services/shopping/queries.js";

const owner = { user_id: "shopping-owner", firebase_uid: "firebase-shopping-owner", email: "shopping@example.com", name: "Owner", role: "owner", status: "active" };
const PERIOD = "2026-10";
const context = (action, payload = {}, rowVersion = null) => ({
  actor: owner,
  signedActor: { uid: owner.firebase_uid, email: owner.email, name: owner.name },
  action,
  payload,
  rowVersion,
  today: `${PERIOD}-16`,
  requestId: `${action}:request`,
  idempotencyKey: `${action}:${Math.random()}`,
  enqueueMirror: async () => {},
});

const seedPlanning = async (db) => {
  const now = "2026-10-01T00:00:00.000Z";
  await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [owner.user_id, owner.firebase_uid, owner.email, owner.name, owner.role, "active", 1, now, now]);
  await db.execute("INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["bank-shopping", "BCA Belanja", "bank", "shared", null, 5_000_000, "2026-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now]);
  await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["expense-shopping", "Belanja Bulanan", "expense", "variable", "shopping", "active", 1, owner.user_id, now, owner.user_id, now]);
  await db.execute("INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,assignee_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["envelope-shopping", "Rumah Tangga", "monthly", "shared", null, null, 2_500_000, "bank-shopping", "unallocated", "block", "active", 1, owner.user_id, now, owner.user_id, now]);
  await db.execute("INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["period-shopping", "envelope-shopping", "Rumah Tangga Oktober", `${PERIOD}-01`, `${PERIOD}-31`, 2_500_000, 0, "active", 1, owner.user_id, now, owner.user_id, now, null, null]);
  await db.execute("INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["budget-shopping", PERIOD, "expense-shopping", "envelope-shopping", "Belanja Bulanan", 2_500_000, 80, "active", 1, owner.user_id, now, owner.user_id, now, "shared", null]);
};

test("shopping checklist tidak mengubah ledger dan partial checkout memakai transaksi canonical", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedPlanning(db);
    const list = await createShoppingList(db, context("shopping.create", { budget_id: "budget-shopping", name: "Belanja Oktober 2026" }));
    const first = await createShoppingItem(db, context("shopping.itemCreate", { shopping_list_id: list.shopping_list_id, list_row_version: list.row_version, name: "Beras", quantity_milli: 10_000, unit_key: "kg", estimated_unit_price: 16_500 }));
    const second = await createShoppingItem(db, context("shopping.itemCreate", { shopping_list_id: list.shopping_list_id, list_row_version: first.list.row_version, name: "Minyak goreng", quantity_milli: 2_000, unit_key: "pcs", estimated_unit_price: 21_000 }));
    const cart = await setShoppingItemState(db, context("shopping.itemState", { shopping_item_id: first.item.shopping_item_id, row_version: first.item.row_version, status: "in_cart", actual_amount: 172_500 }, first.item.row_version));

    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM transactions")).count), 0, "checkbox tidak boleh membuat transaksi");
    const detailBefore = await shoppingDetail(db, context("shopping.detail", { budget_id: "budget-shopping" }));
    assert.equal(detailBefore.summary.in_cart_items, 1);
    assert.equal(detailBefore.summary.pending_items, 1);

    const checkout = await db.transaction((tx) => checkoutShoppingList(tx, context("shopping.checkout", {
      shopping_list_id: list.shopping_list_id,
      row_version: cart.list.row_version,
      total_amount: 172_500,
      checkout_date: `${PERIOD}-16`,
      leftover_action: "keep",
    }, cart.list.row_version)));

    assert.equal(checkout.checkout.item_count, 1);
    assert.equal(checkout.list.status, "active", "pending item membuat daftar tetap aktif");
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM transactions")).count), 1);
    const transaction = await db.one("SELECT * FROM transactions WHERE transaction_id=?", [checkout.transaction.transaction_id]);
    assert.equal(transaction.amount, 172_500);
    assert.equal(transaction.budget_id, "budget-shopping");
    assert.equal(transaction.envelope_period_id, "period-shopping");
    assert.equal((await db.one("SELECT status FROM shopping_items WHERE shopping_item_id=?", [first.item.shopping_item_id])).status, "purchased");
    assert.equal((await db.one("SELECT status FROM shopping_items WHERE shopping_item_id=?", [second.item.shopping_item_id])).status, "pending");

    const secondCart = await setShoppingItemState(db, context("shopping.itemState", { shopping_item_id: second.item.shopping_item_id, row_version: second.item.row_version, status: "in_cart", actual_amount: 43_000 }, second.item.row_version));
    const secondCheckout = await db.transaction((tx) => checkoutShoppingList(tx, context("shopping.checkout", {
      shopping_list_id: list.shopping_list_id,
      row_version: secondCart.list.row_version,
      total_amount: 43_000,
      checkout_date: `${PERIOD}-17`,
      leftover_action: "keep",
    }, secondCart.list.row_version)));
    assert.equal(secondCheckout.list.status, "completed");
    assert.equal(Number((await db.one("SELECT COUNT(*) AS count FROM transactions")).count), 2);

    const nextList = await createShoppingList(db, context("shopping.create", { budget_id: "budget-shopping", name: "Belanja Tambahan" }));
    assert.notEqual(nextList.shopping_list_id, list.shopping_list_id);
    assert.equal(nextList.status, "active");
  } finally { db.close(); }
});
