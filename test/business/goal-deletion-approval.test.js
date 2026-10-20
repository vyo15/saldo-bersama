import assert from "node:assert/strict";
import test from "node:test";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { createGoal, listGoals } from "../../api/_lib/services/planning/goals.js";
import { requestGoalDeletion, withdrawGoalDeletion, reviewGoalDeletion, listGoalDeletionRequests } from "../../api/_lib/services/planning/goalDeletionRequests.js";
import { authorizeAction } from "../../api/_lib/security.js";

const owner = { user_id: "goal-approver", firebase_uid: "uid-goal-approver", role: "owner", email: "admin@sample.test", status: "active", name: "Admin" };
const member = { user_id: "goal-requester", firebase_uid: "uid-goal-requester", role: "member", email: "member@sample.test", status: "active", name: "Pemohon" };
const other = { user_id: "goal-other", firebase_uid: "uid-goal-other", role: "member", email: "other@sample.test", status: "active", name: "Anggota lain" };
const ctx = (actor, action, payload = {}) => ({ actor, action, payload, rowVersion: payload.row_version, requestId: `${action}:${Math.random()}`, enqueueMirror: async () => {} });
const setup = async () => {
  const db = await createSqliteTestDatabase();
  const now = new Date().toISOString();
  for (const user of [owner, member, other]) await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [user.user_id,user.firebase_uid,`${user.user_id}@example.com`,user.name,user.role,"active",1,now,now]);
  await db.execute("INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["goal-shared-bank","Tabungan","bank","shared",null,1000000,"2024-01-01",0,"active",1,owner.user_id,now,owner.user_id,now]);
  const goal = await createGoal(db, ctx(owner, "goals.create", { account_id: "goal-shared-bank", name: "Rumah bersama", target_amount: 10000000, target_date: "2027-12-31" }));
  return { db, goal };
};
const ask = (db, actor, goal, reason = "Rencana dibatalkan") => requestGoalDeletion(db, ctx(actor, "goalDeletionRequests.request", { goal_id: goal.goal_id, row_version: goal.row_version, reason }));
const decide = (db, actor, request, decision, reason = "Diperiksa") => reviewGoalDeletion(db, ctx(actor, "goalDeletionRequests.review", { request_id: request.request_id, row_version: request.row_version, decision, reason }));

test("hak akses: member dapat mengajukan, admin saja yang bisa menyetujui", () => {
  assert.equal(authorizeAction(member, "goalDeletionRequests.request"), true);
  assert.equal(authorizeAction(member, "goalDeletionRequests.review"), false);
  assert.equal(authorizeAction(owner, "goalDeletionRequests.review"), true);
  assert.equal(authorizeAction(owner, "goalDeletionRequests.request"), false);
  assert.equal(authorizeAction(owner, "goalDeletionRequests.withdraw"), false);
});

test("pengajuan tidak menghapus target atau mengubah saldo; daftar member lain tetap terlihat", async () => {
  const { db, goal } = await setup();
  try {
    const original = await db.one("SELECT initial_balance FROM accounts WHERE account_id='goal-shared-bank'");
    const { request } = await ask(db, member, goal);
    assert.equal(request.status, "pending");
    assert.equal((await db.one("SELECT status FROM savings_goals WHERE goal_id=?", [goal.goal_id])).status, "active");
    assert.equal((await listGoals(db, ctx(other, "goals.list"))).items.some((item) => item.goal_id === goal.goal_id), true);
    assert.equal((await db.one("SELECT initial_balance FROM accounts WHERE account_id='goal-shared-bank'")).initial_balance, original.initial_balance);
    assert.equal((await listGoalDeletionRequests(db, ctx(other, "goalDeletionRequests.list"))).items.length, 0);
    assert.equal((await listGoalDeletionRequests(db, ctx(member, "goalDeletionRequests.list"))).items[0].goal_id, goal.goal_id);
    assert.equal((await listGoalDeletionRequests(db, ctx(owner, "goalDeletionRequests.list"))).items.length, 1);
    assert.equal((await ask(db, member, goal)).duplicate_pending, true);
    await assert.rejects(ask(db, owner, goal), (err) => err.code === "MEMBER_REQUEST_ONLY");
  } finally { db.close(); }
});

test("penarikan dan penolakan mengembalikan Target tanpa menyentuh record asli", async () => {
  const { db, goal } = await setup();
  try {
    const { request } = await ask(db, member, goal);
    await assert.rejects(withdrawGoalDeletion(db, ctx(other, "goalDeletionRequests.withdraw", { request_id: request.request_id, row_version: request.row_version, reason: "Tidak jadi" })), (err) => err.code === "REQUEST_NOT_FOUND");
    await assert.rejects(decide(db, member, request, "approve"), (err) => err.code === "FORBIDDEN" || err.code === "OWNER_ONLY");
    const { request: withdrawn } = await withdrawGoalDeletion(db, ctx(member, "goalDeletionRequests.withdraw", { request_id: request.request_id, row_version: request.row_version, reason: "Dibutuhkan kembali" }));
    assert.equal(withdrawn.status, "cancelled");
    await assert.rejects(decide(db, owner, withdrawn, "approve"), (err) => err.code === "REQUEST_NOT_PENDING");
    const next = (await ask(db, member, goal)).request;
    const rejected = await decide(db, owner, next, "reject", "Jangan hapus target");
    assert.equal(rejected.request.status, "rejected");
    assert.equal((await db.one("SELECT status FROM savings_goals WHERE goal_id=?", [goal.goal_id])).status, "active");
  } finally { db.close(); }
});

test("persetujuan menghapus target Rp0 yang tidak pernah digunakan, tetap mempertahankan jejak pengajuan", async () => {
  const { db, goal } = await setup();
  try {
    const one = (await ask(db, member, goal)).request;
    const two = (await ask(db, other, goal)).request;
    const result = await decide(db, owner, one, "approve");
    assert.equal(result.outcome, "deleted");
    assert.equal(await db.one("SELECT goal_id FROM savings_goals WHERE goal_id=?", [goal.goal_id]), null);
    assert.equal((await db.one("SELECT status FROM goal_deletion_requests WHERE request_id=?", [one.request_id])).status, "approved");
    assert.equal((await db.one("SELECT status FROM goal_deletion_requests WHERE request_id=?", [two.request_id])).status, "approved");
    assert.equal((await db.one("SELECT initial_balance FROM accounts WHERE account_id='goal-shared-bank'")).initial_balance, 1000000);
    assert.ok((await db.one("SELECT COUNT(*) AS count FROM audit_log WHERE entity_id=?", [one.request_id])).count >= 2);
  } finally { db.close(); }
});

test("persetujuan mengarsipkan Target yang punya histori tanpa menghapus saldo dan mutasi", async () => {
  const { db, goal } = await setup();
  try {
    const now = new Date().toISOString();
    await db.execute(
      "INSERT INTO goal_movements(goal_movement_id,goal_id,transaction_id,movement_type,amount,reason,status,row_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["goal-movement-historic", goal.goal_id, null, "deposit", 25000, "Setoran historis", "active", 1, owner.user_id, now],
    );
    const { request } = await ask(db, member, goal, "Tidak dilanjutkan");
    const result = await decide(db, owner, request, "approve");
    assert.equal(result.outcome, "archived");
    assert.equal((await db.one("SELECT status FROM savings_goals WHERE goal_id=?", [goal.goal_id])).status, "archived");
    assert.equal((await db.one("SELECT amount FROM goal_movements WHERE goal_movement_id='goal-movement-historic'")).amount, 25000);
    assert.equal((await db.one("SELECT initial_balance FROM accounts WHERE account_id='goal-shared-bank'")).initial_balance, 1000000);
    assert.equal((await db.one("SELECT status,outcome FROM goal_deletion_requests WHERE request_id=?", [request.request_id])).outcome, "archived");
  } finally { db.close(); }
});

test("persetujuan dengan versi Target usang ditolak tanpa menghapus Target", async () => {
  const { db, goal } = await setup();
  try {
    const { request } = await ask(db, member, goal);
    await db.execute("UPDATE savings_goals SET row_version=row_version+1 WHERE goal_id=?", [goal.goal_id]);
    await assert.rejects(decide(db, owner, request, "approve"), (err) => err.code === "GOAL_CHANGED");
    assert.equal((await db.one("SELECT status FROM savings_goals WHERE goal_id=?", [goal.goal_id])).status, "active");
  } finally { db.close(); }
});
