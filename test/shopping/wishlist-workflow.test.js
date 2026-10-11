import test from "node:test";
import assert from "node:assert/strict";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { createWishlist, updateWishlist, listWishlist, changeWishlistState, purchaseWishlist, reopenWishlist, wishlistPlan } from "../../api/_lib/services/wishlist/index.js";
import { cancelTransaction } from "../../api/_lib/services/finance/transactionMutations.js";
import { ACTION_POLICIES } from "../../api/_lib/actions/policy.js";
import { ACTION_PERMISSIONS } from "../../api/_lib/security.js";
import { syncDependenciesForAction } from "../../api/_lib/syncRevisions.js";
import { snapshotDatabase, validateSnapshot } from "../../api/_lib/services/maintenance/shared.js";

const users = [{ user_id: "wish-owner", firebase_uid: "wish-firebase-owner", email: "wish-owner@example.com", role: "owner" }, { user_id: "wish-member", firebase_uid: "wish-firebase-member", email: "wish-member@example.com", role: "member" }];
const ctx = (actor, action, payload = {}, rowVersion = null) => ({ actor, action, payload, rowVersion, requestId: `test:${action}`, today: "2026-10-11", idempotencyKey: `test:${action}:${Math.random()}`, enqueueMirror: async () => {} });
const setup = async (db) => {
  const now = new Date().toISOString();
  for (const user of users) await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [user.user_id, user.firebase_uid, user.email, user.role, user.role, "active", 1, now, now]);
  for (const [id, scope, owner] of [["shared-wish-account", "shared", null], ["personal-wish-account", "personal", users[1].user_id]]) {
    await db.execute("INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [id, id, "cash", scope, owner, 1_000_000, "2026-01-01", 0, "active", 1, users[0].user_id, now, users[0].user_id, now]);
  }
  await db.execute("INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", ["wish-expense", "Wishlist", "expense", "variable", "shopping", "active", 1, users[0].user_id, now, users[0].user_id, now]);
};
const plan = (scope = "personal", extra = {}) => ({ scope, name: "Sepatu kerja", estimated_amount: 250_000, priority: "soon", funding_strategy: "gradual", monthly_plan: 50_000, ...extra });

test("canonical action policy, role allowlist, and sync invalidations include Wishlist", () => {
  for (const action of ["wishlist.list", "wishlist.create", "wishlist.update", "wishlist.state", "wishlist.purchase", "wishlist.reopen"]) {
    assert.ok(ACTION_POLICIES[action]);
    assert.ok(ACTION_PERMISSIONS.owner.has(action));
    assert.ok(ACTION_PERMISSIONS.member.has(action));
  }
  assert.ok(syncDependenciesForAction("wishlist.purchase").includes("transactions.list"));
  assert.ok(syncDependenciesForAction("wishlist.create").includes("wishlist.list"));
  assert.ok(syncDependenciesForAction("transactions.cancel").includes("wishlist.list"));
});

test("plan validation rejects missing funding, invalid amount, unsafe URL and unexpected choices", () => {
  assert.throws(() => wishlistPlan(plan("personal", { funding_strategy: "gradual", monthly_plan: 0 })), (e) => e.code === "WISHLIST_PLAN_REQUIRED");
  assert.throws(() => wishlistPlan(plan("personal", { estimated_amount: -2 })), (e) => e.code === "INVALID_AMOUNT");
  assert.throws(() => wishlistPlan(plan("personal", { product_url: "javascript:alert(1)" })), (e) => e.code === "WISHLIST_URL_INVALID");
  assert.throws(() => wishlistPlan(plan("personal", { priority: "forced" })), (e) => e.code === "WISHLIST_INVALID_CHOICE");
});

test("personal privacy, shared ownership, planning no ledger, OCC, archive and purchase reconciliation", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await setup(db);
    const member = users[1]; const owner = users[0];
    const personal = await db.transaction((tx) => createWishlist(tx, ctx(member, "wishlist.create", plan("personal"))));
    assert.equal(Number((await db.one("SELECT COUNT(*) AS n FROM transactions")).n), 0);
    assert.equal((await listWishlist(db, ctx(member, "wishlist.list"))).items.length, 1);
    assert.equal((await listWishlist(db, ctx(owner, "wishlist.list"))).items.length, 0, "personal hidden from other members");
    await assert.rejects(db.transaction((tx) => updateWishlist(tx, ctx(owner, "wishlist.update", { wishlist_item_id: personal.item.wishlist_item_id, row_version: 1, name: "stolen" }))), (e) => e.code === "WISHLIST_NOT_FOUND");
    const shared = await db.transaction((tx) => createWishlist(tx, ctx(member, "wishlist.create", plan("shared", { name: "Meja kerja", estimated_amount: 400_000 }))));
    assert.equal((await listWishlist(db, ctx(owner, "wishlist.list"))).items.length, 1);
    const edited = await db.transaction((tx) => updateWishlist(tx, ctx(owner, "wishlist.update", { wishlist_item_id: shared.item.wishlist_item_id, row_version: 1, priority: "later" })));
    assert.equal(edited.item.priority, "later");
    await assert.rejects(db.transaction((tx) => updateWishlist(tx, ctx(owner, "wishlist.update", { wishlist_item_id: shared.item.wishlist_item_id, row_version: 1, priority: "soon" }))), (e) => e.code === "CONFLICT");
    await assert.rejects(db.transaction((tx) => purchaseWishlist(tx, ctx(member, "wishlist.purchase", { wishlist_item_id: shared.item.wishlist_item_id, row_version: 2, amount: 2_000_000, transaction_date: "2026-10-11", category_id: "wish-expense", source_account_id: "shared-wish-account" }))), (e) => ["INSUFFICIENT_BALANCE", "UNALLOCATED_FUNDS_INSUFFICIENT"].includes(e.code));
    assert.equal(Number((await db.one("SELECT COUNT(*) AS n FROM transactions")).n), 0);
    await assert.rejects(db.transaction((tx) => purchaseWishlist(tx, ctx(member, "wishlist.purchase", { wishlist_item_id: shared.item.wishlist_item_id, row_version: 2, amount: 100, category_id: "wish-expense", source_account_id: "personal-wish-account", transaction_date: "2026-10-11" }))), (e) => e.code === "WISHLIST_ACCOUNT_SCOPE_MISMATCH");
    await assert.rejects(db.transaction((tx) => purchaseWishlist(tx, ctx(member, "wishlist.purchase", { wishlist_item_id: personal.item.wishlist_item_id, row_version: 1, amount: 100, category_id: "wish-expense", source_account_id: "shared-wish-account", transaction_date: "2026-10-11" }))), (e) => e.code === "WISHLIST_ACCOUNT_SCOPE_MISMATCH");
    assert.equal(Number((await db.one("SELECT COUNT(*) AS n FROM transactions")).n), 0);
    const bought = await db.transaction((tx) => purchaseWishlist(tx, ctx(member, "wishlist.purchase", { wishlist_item_id: shared.item.wishlist_item_id, row_version: 2, amount: 402_000, category_id: "wish-expense", source_account_id: "shared-wish-account", transaction_date: "2026-10-11" })));
    assert.equal(bought.item.status, "purchased");
    assert.equal(Number((await db.one("SELECT COUNT(*) AS n FROM transactions")).n), 1);
    assert.equal((await db.one("SELECT amount FROM transactions WHERE transaction_id=?", [bought.transaction.transaction_id])).amount, 402_000);
    const snapshot = await snapshotDatabase(db);
    assert.equal(validateSnapshot(snapshot), snapshot.checksum);
    assert.equal(snapshot.manifest.tables.wishlist_items, 2);
    assert.equal(snapshot.tables.wishlist_items.find((entry) => entry.status === "purchased")?.purchase_transaction_id, bought.transaction.transaction_id);
    assert.equal((await listWishlist(db, ctx(owner, "wishlist.list"))).items[0].displayed_purchased_amount, 402_000);
    await assert.rejects(db.transaction((tx) => purchaseWishlist(tx, ctx(member, "wishlist.purchase", { wishlist_item_id: shared.item.wishlist_item_id, row_version: 3, amount: 402_000 }))), (e) => e.code === "WISHLIST_NOT_ACTIVE");
    await assert.rejects(db.transaction((tx) => reopenWishlist(tx, ctx(member, "wishlist.reopen", { wishlist_item_id: shared.item.wishlist_item_id, row_version: 3 }))), (e) => e.code === "WISHLIST_PAYMENT_ACTIVE");
    await db.transaction((tx) => cancelTransaction(tx, ctx(member, "transactions.cancel", { transaction_id: bought.transaction.transaction_id, row_version: 1, reason: "Pesanan dibatalkan" })));
    const afterCancel = (await listWishlist(db, ctx(owner, "wishlist.list"))).items[0];
    assert.equal(afterCancel.purchase_transaction_status, "cancelled");
    const reopened = await db.transaction((tx) => reopenWishlist(tx, ctx(member, "wishlist.reopen", { wishlist_item_id: shared.item.wishlist_item_id, row_version: 3 })));
    assert.equal(reopened.item.status, "active");
    assert.equal(reopened.item.purchase_transaction_id, "");
    const archived = await db.transaction((tx) => changeWishlistState(tx, ctx(member, "wishlist.state", { wishlist_item_id: personal.item.wishlist_item_id, row_version: 1, status: "archived" })));
    assert.equal(archived.item.status, "archived");
  } finally { db.close(); }
});
