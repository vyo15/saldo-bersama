import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { dispatchAction } from "../../api/_lib/actionDispatcher.js";
import { authorizeAction } from "../../api/_lib/security.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = { user_id: "withdraw-owner", uid: "withdraw-uid-owner", email: "withdraw-owner@example.com", name: "Owner", role: "owner" };
const member = { user_id: "withdraw-member", uid: "withdraw-uid-member", email: "withdraw-member@example.com", name: "Member", role: "member" };
const other = { user_id: "withdraw-other", uid: "withdraw-uid-other", email: "withdraw-other@example.com", name: "Other", role: "member" };

const seedUser = (db, actor) => db.execute(
  "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
  [actor.user_id, actor.uid, actor.email, actor.name, actor.role, "active", 1, new Date().toISOString(), new Date().toISOString()],
);
const call = (db, actor, action, payload = {}, { read = false } = {}) => dispatchAction({
  signedActor: { uid: actor.uid, email: actor.email, name: actor.name, role: actor.role },
  action, payload, database: db, requestId: `withdraw:${crypto.randomUUID()}`,
  idempotencyKey: read ? null : `withdraw:${crypto.randomUUID()}`,
  rowVersion: payload.row_version ?? null,
});
const requestCategory = (db, name) => call(db, member, "categories.requestCreate", {
  name, transaction_type: "expense", nature: "variable", icon: "wedding_ring",
});

const setup = async () => {
  const db = await createSqliteTestDatabase();
  await seedUser(db, owner);
  await seedUser(db, member);
  await seedUser(db, other);
  return db;
};

test("Pengajuan pending sendiri dapat ditarik, tanpa membuat kategori atau menghapus audit", async () => {
  const db = await setup();
  try {
    assert.equal(authorizeAction(member, "masterDataRequests.withdraw"), true);
    assert.equal(authorizeAction(owner, "masterDataRequests.withdraw"), true);
    const request = await requestCategory(db, "Kategori Tidak Jadi");
    const before = await db.one("SELECT COUNT(*) AS total FROM audit_log WHERE entity_id=?", [request.request_id]);
    const result = await call(db, member, "masterDataRequests.withdraw", {
      request_id: request.request_id, row_version: request.row_version, reason: "Tidak diperlukan lagi",
    });
    assert.equal(result.request.status, "cancelled");
    assert.equal(result.request.row_version, request.row_version + 1);
    assert.equal(result.request.review_reason, "Tidak diperlukan lagi");
    assert.equal((await db.one("SELECT status FROM master_data_requests WHERE request_id=?", [request.request_id])).status, "cancelled");
    assert.equal(Number((await db.one("SELECT COUNT(*) AS total FROM categories WHERE name=?", ["Kategori Tidak Jadi"])).total), 0);
    const after = await db.one("SELECT COUNT(*) AS total FROM audit_log WHERE entity_id=?", [request.request_id]);
    assert.equal(Number(after.total), Number(before.total) + 1);
    const filtered = await call(db, member, "masterDataRequests.list", { status: "cancelled" }, { read: true });
    assert.ok(filtered.items.some((row) => row.request_id === request.request_id));
    await assert.rejects(call(db, owner, "masterDataRequests.review", {
      request_id: request.request_id, row_version: result.request.row_version, decision: "approve",
    }), (error) => error.code === "REQUEST_NOT_PENDING");
  } finally { db.close(); }
});

test("Penarikan hanya milik pemohon, menolak stale version, alasan kosong, dan pengajuan selesai", async () => {
  const db = await setup();
  try {
    const request = await requestCategory(db, "Permintaan Terbatas");
    const payload = { request_id: request.request_id, row_version: request.row_version, reason: "Berubah pikiran" };
    for (const actor of [owner, other]) {
      await assert.rejects(call(db, actor, "masterDataRequests.withdraw", payload), (error) => error.code === "REQUEST_NOT_FOUND");
    }
    await assert.rejects(call(db, member, "masterDataRequests.withdraw", { ...payload, row_version: 99 }), (error) => error.code === "CONFLICT" || error.code === "VERSION_CONFLICT");
    await assert.rejects(call(db, member, "masterDataRequests.withdraw", { ...payload, reason: "" }), (error) => error.code === "REASON_REQUIRED");
    const withdrawn = await call(db, member, "masterDataRequests.withdraw", payload);
    await assert.rejects(call(db, member, "masterDataRequests.withdraw", {
      ...payload, row_version: withdrawn.request.row_version,
    }), (error) => error.code === "REQUEST_NOT_PENDING");
  } finally { db.close(); }
});
