import test from "node:test";
import assert from "node:assert/strict";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { createWishlist, listWishlist } from "../../api/_lib/services/wishlist/index.js";
import { setItemVisibility } from "../../api/_lib/services/itemVisibility.js";
import { snapshotDatabase, validateSnapshot } from "../../api/_lib/services/maintenance/shared.js";

const users = [
  { user_id: "visibility-owner", firebase_uid: "visibility-owner-firebase", name: "Pemilik", email: "visibility-owner@example.com", role: "owner" },
  { user_id: "visibility-member", firebase_uid: "visibility-member-firebase", name: "Anggota", email: "visibility-member@example.com", role: "member" },
];
const ctx = (actor, action, payload = {}) => ({
  actor, action, payload, today: "2026-10-15", rowVersion: null,
  idempotencyKey: `${action}-${actor.user_id}`, requestId: `${action}-${actor.user_id}`,
});
const seed = async () => {
  const db = await createSqliteTestDatabase();
  for (const person of users) await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [person.user_id,person.firebase_uid,person.email,person.name,person.role,"active",1,"2026-10-15T00:00:00Z","2026-10-15T00:00:00Z"]);
  return db;
};
const add = (db, actor, scope) => createWishlist(db, ctx(actor, "wishlist.create", {
  name: `Barang ${scope}`, scope, estimated_amount: 150000, priority: "later", funding_strategy: "gradual", planning_enabled: false,
}));

test("Smart Delete preferensi pribadi tidak menghilangkan data bersama, histori, atau backup", async () => {
  const db = await seed();
  try {
    const shared = (await add(db, users[0], "shared")).item;
    const beforeAudit = (await db.one("SELECT COUNT(*) AS count FROM audit_log")).count;
    const result = await setItemVisibility(db, ctx(users[0], "visibility.set", { entity_kind: "wishlist_item", entity_id: shared.wishlist_item_id, hidden: true }));
    assert.equal(result.hidden, true);
    const ownerItems = await listWishlist(db, ctx(users[0], "wishlist.list"));
    const memberItems = await listWishlist(db, ctx(users[1], "wishlist.list"));
    assert.equal(ownerItems.items[0].is_hidden, 1);
    assert.equal(memberItems.items[0].is_hidden, 0, "menyembunyikan milik sendiri tidak menghilangkan wishlist anggota lain");
    assert.equal((await db.one("SELECT status FROM wishlist_items WHERE wishlist_item_id=?", [shared.wishlist_item_id])).status, "active");
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM audit_log")).count, beforeAudit);
    const backup = await snapshotDatabase(db);
    assert.equal(validateSnapshot(backup), backup.checksum);
    assert.equal(backup.tables.user_hidden_items.length, 1);
    await setItemVisibility(db, ctx(users[0], "visibility.set", { entity_kind: "wishlist_item", entity_id: shared.wishlist_item_id, hidden: false }));
    assert.equal((await listWishlist(db, ctx(users[0], "wishlist.list"))).items[0].is_hidden, 0);
  } finally { db.close(); }
});

test("Smart Delete menolak IDOR wishlist pribadi dan input visibility invalid", async () => {
  const db = await seed();
  try {
    const personal = (await add(db, users[0], "personal")).item;
    assert.equal((await listWishlist(db, ctx(users[1], "wishlist.list"))).items.length, 0);
    await assert.rejects(() => setItemVisibility(db, ctx(users[1], "visibility.set", { entity_kind: "wishlist_item", entity_id: personal.wishlist_item_id, hidden: true })), (error) => error.code === "VISIBILITY_NOT_FOUND");
    await assert.rejects(() => setItemVisibility(db, ctx(users[0], "visibility.set", { entity_kind: "accounts", entity_id: personal.wishlist_item_id, hidden: true })), (error) => error.code === "INVALID_VISIBILITY_INPUT");
    await assert.rejects(() => setItemVisibility(db, ctx(users[0], "visibility.set", { entity_kind: "wishlist_item", entity_id: personal.wishlist_item_id, hidden: "true" })), (error) => error.code === "INVALID_VISIBILITY_INPUT");
    assert.equal((await db.one("SELECT COUNT(*) AS count FROM user_hidden_items")).count, 0);
  } finally { db.close(); }
});
