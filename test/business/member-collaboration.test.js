import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { dispatchAction } from "../../api/_lib/actionDispatcher.js";
import { todayJakarta } from "../../api/_lib/services/core.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const owner = { user_id: "collab-owner", uid: "uid-collab-owner", email: "owner-collab@example.com", name: "Owner Collab", role: "owner" };
const member = { user_id: "collab-member", uid: "uid-collab-member", email: "member-collab@example.com", name: "Member Collab", role: "member" };
const other = { user_id: "collab-other", uid: "uid-collab-other", email: "other-collab@example.com", name: "Other Collab", role: "member" };

const signed = (actor) => ({ uid: actor.uid, email: actor.email, name: actor.name, role: actor.role });

const seedUser = async (db, actor) => {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [actor.user_id, actor.uid, actor.email, actor.name, actor.role, "active", 1, now, now],
  );
};

const dispatch = (db, actor, action, payload = {}, options = {}) => dispatchAction({
  signedActor: signed(actor),
  action,
  payload,
  requestId: `collab:${action}:${crypto.randomUUID()}`,
  idempotencyKey: options.read ? null : (options.idempotencyKey || `collab:${action}:${crypto.randomUUID()}`),
  rowVersion: options.rowVersion ?? payload.row_version ?? null,
  database: db,
});

const createAccount = (db, payload) => dispatch(db, owner, "accounts.create", {
  account_type: "bank",
  account_number: `123456${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`,
  initial_balance: 0,
  initial_balance_date: todayJakarta(),
  allow_negative: false,
  ...payload,
});

test("Member mengajukan rekening/kategori dan Administrator mereview tanpa membuka create langsung", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedUser(db, member);

    await assert.rejects(
      dispatch(db, member, "accounts.create", {
        name: "Tidak Boleh Langsung",
        account_type: "bank",
        account_number: "1234567890",
        owner_scope: "personal",
        initial_balance: 0,
        initial_balance_date: todayJakarta(),
      }),
      (error) => error?.code === "OWNER_ONLY",
    );

    const accountRequestPayload = {
      name: "Rekening Member Baru",
      account_type: "bank",
      account_number: "1234 5678 9012",
      owner_scope: "personal",
      initial_balance: 0,
      initial_balance_date: todayJakarta(),
      allow_negative: false,
    };
    const requested = await dispatch(db, member, "accounts.requestCreate", accountRequestPayload, { idempotencyKey: "member-account-request" });
    assert.equal(requested.status, "pending");
    assert.equal(requested.request_type, "account");
    assert.equal(requested.payload.owner_user_id, member.user_id);

    const duplicate = await dispatch(db, member, "accounts.requestCreate", accountRequestPayload, { idempotencyKey: "member-account-request-retry" });
    assert.equal(duplicate.request_id, requested.request_id);
    assert.equal(duplicate.duplicate_pending, true);

    const ownerList = await dispatch(db, owner, "masterDataRequests.list", { status: "pending" }, { read: true });
    assert.equal(ownerList.items.length, 1);
    const approved = await dispatch(db, owner, "masterDataRequests.review", {
      request_id: requested.request_id,
      row_version: requested.row_version,
      decision: "approve",
      reason: "Data valid",
    }, { rowVersion: requested.row_version, idempotencyKey: "approve-member-account" });
    assert.equal(approved.request.status, "approved");
    assert.equal(approved.request.row_version, 2);
    assert.equal(approved.entity.owner_scope, "personal");
    assert.equal(approved.entity.owner_user_id, member.user_id);

    const categoryRequest = await dispatch(db, member, "categories.requestCreate", {
      name: "Kebutuhan Member Baru",
      transaction_type: "expense",
      nature: "variable",
      icon: "wedding_ring",
    }, { idempotencyKey: "member-category-request" });
    const rejected = await dispatch(db, owner, "masterDataRequests.review", {
      request_id: categoryRequest.request_id,
      row_version: categoryRequest.row_version,
      decision: "reject",
      reason: "Gunakan kategori existing",
    }, { rowVersion: categoryRequest.row_version, idempotencyKey: "reject-member-category" });
    assert.equal(rejected.request.status, "rejected");
    assert.equal(rejected.entity, null);
  } finally {
    db.close();
  }
});

test("Transfer shared ke personal Member wajib approval dan approval menghasilkan tepat satu ledger canonical", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedUser(db, member);
    await seedUser(db, other);

    const shared = await createAccount(db, { name: "Dana Bersama", owner_scope: "shared", initial_balance: 500_000 });
    const memberPersonal = await createAccount(db, { name: "Pribadi Member", owner_scope: "personal", owner_user_id: member.user_id });
    const otherPersonal = await createAccount(db, { name: "Pribadi Lain", owner_scope: "personal", owner_user_id: other.user_id });

    const transferPayload = {
      transaction_type: "transfer",
      transaction_date: todayJakarta(),
      source_account_id: shared.account_id,
      destination_account_id: memberPersonal.account_id,
      amount: 50_000,
      description: "Jatah pribadi Member",
    };

    await assert.rejects(
      dispatch(db, member, "transactions.create", transferPayload, { idempotencyKey: "direct-shared-personal" }),
      (error) => error?.code === "TRANSFER_APPROVAL_REQUIRED",
    );

    const request = await dispatch(db, member, "transferRequests.request", transferPayload, { idempotencyKey: "transfer-request" });
    assert.equal(request.status, "pending");
    assert.equal(request.payload.destination_account_id, memberPersonal.account_id);

    const partnerRequest = await dispatch(db, member, "transferRequests.request", { ...transferPayload, destination_account_id: otherPersonal.account_id }, { idempotencyKey: "transfer-request-other" });
    assert.equal(partnerRequest.status, "pending");
    assert.equal(partnerRequest.payload.destination_account_id, otherPersonal.account_id);

    const approved = await dispatch(db, owner, "transferRequests.review", {
      request_id: request.request_id,
      row_version: request.row_version,
      decision: "approve",
      reason: "Disetujui",
    }, { rowVersion: request.row_version, idempotencyKey: "approve-transfer-request" });
    assert.equal(approved.request.status, "approved");
    assert.ok(approved.transaction?.transaction_id);
    assert.equal(approved.transaction.scope, "shared");
    assert.equal(approved.transaction.owner_user_id, "");
    assert.equal(approved.transaction.amount, 50_000);

    const count = await db.one("SELECT COUNT(*) AS count FROM transactions WHERE transaction_id=?", [approved.transaction.transaction_id]);
    assert.equal(Number(count.count), 1);
    const requestRow = await db.one("SELECT status,row_version,approved_transaction_id FROM transfer_requests WHERE request_id=?", [request.request_id]);
    assert.equal(requestRow.status, "approved");
    assert.equal(requestRow.row_version, 2);
    assert.equal(requestRow.approved_transaction_id, approved.transaction.transaction_id);

    const crossPersonal = await dispatch(db, member, "transactions.create", {
      transaction_type: "transfer",
      transaction_date: todayJakarta(),
      source_account_id: memberPersonal.account_id,
      destination_account_id: otherPersonal.account_id,
      amount: 10_000,
    }, { idempotencyKey: "cross-personal-member" });
    assert.equal(crossPersonal.scope, "personal");
    assert.equal(crossPersonal.owner_user_id, member.user_id);
  } finally {
    db.close();
  }
});


test("transfer request menolak rekening sumber dan tujuan yang sama sebelum menyimpan request", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner);
    await seedUser(db, member);
    const shared = await createAccount(db, { name: "Dana Bersama Same", owner_scope: "shared", initial_balance: 500_000 });
    await assert.rejects(
      dispatch(db, member, "transferRequests.request", {
        transaction_type: "transfer", transaction_date: todayJakarta(), source_account_id: shared.account_id,
        destination_account_id: shared.account_id, amount: 10_000, description: "Tidak valid",
      }, { idempotencyKey: "same-account-request" }),
      (error) => error?.code === "SAME_TRANSFER_ACCOUNT" && error?.status === 400,
    );
    const count = await db.one("SELECT COUNT(*) AS count FROM transfer_requests");
    assert.equal(Number(count.count), 0);
  } finally { db.close(); }
});

test("approval transfer idempotent dan second approval tidak menggandakan ledger", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seedUser(db, owner); await seedUser(db, member);
    const shared = await createAccount(db, { name: "Dana Approval", owner_scope: "shared", initial_balance: 500_000 });
    const personal = await createAccount(db, { name: "Tujuan Approval", owner_scope: "personal", owner_user_id: member.user_id });
    const payload = { transaction_type: "transfer", transaction_date: todayJakarta(), source_account_id: shared.account_id, destination_account_id: personal.account_id, amount: 50_000, description: "Approval aman" };
    const request = await dispatch(db, member, "transferRequests.request", payload, { idempotencyKey: "approval-safe-request" });
    const reviewPayload = { request_id: request.request_id, row_version: request.row_version, decision: "approve", reason: "Setuju" };
    const first = await dispatch(db, owner, "transferRequests.review", reviewPayload, { rowVersion: request.row_version, idempotencyKey: "approval-safe-review" });
    const retry = await dispatch(db, owner, "transferRequests.review", reviewPayload, { rowVersion: request.row_version, idempotencyKey: "approval-safe-review" });
    assert.equal(retry.transaction.transaction_id, first.transaction.transaction_id);

    await assert.rejects(
      dispatch(db, owner, "transferRequests.review", reviewPayload, { rowVersion: request.row_version, idempotencyKey: "approval-second-intent" }),
      (error) => error?.code === "REQUEST_NOT_PENDING" && error?.status === 409,
    );
    const transactionCount = await db.one("SELECT COUNT(*) AS count FROM transactions WHERE source_account_id=? AND destination_account_id=? AND amount=? AND status='active'", [shared.account_id, personal.account_id, 50_000]);
    assert.equal(Number(transactionCount.count), 1);
    const approvalAudits = await db.one("SELECT COUNT(*) AS count FROM audit_log WHERE action='transferRequests.review' AND entity_id=?", [request.request_id]);
    assert.equal(Number(approvalAudits.count), 1);
  } finally { db.close(); }
});

test("approval transfer mengulang validasi saldo, status rekening, dan period closure terbaru", async () => {
  const scenarios = ["balance", "account", "period"];
  for (const scenario of scenarios) {
    const db = await createSqliteTestDatabase();
    try {
      await seedUser(db, owner); await seedUser(db, member);
      const shared = await createAccount(db, { name: `Dana ${scenario}`, owner_scope: "shared", initial_balance: 500_000 });
      const personal = await createAccount(db, { name: `Tujuan ${scenario}`, owner_scope: "personal", owner_user_id: member.user_id });
      const amount = scenario === "balance" ? 450_000 : 50_000;
      const payload = { transaction_type: "transfer", transaction_date: todayJakarta(), source_account_id: shared.account_id, destination_account_id: personal.account_id, amount, description: `Stale ${scenario}` };
      const request = await dispatch(db, member, "transferRequests.request", payload, { idempotencyKey: `stale-${scenario}-request` });

      if (scenario === "balance") {
        const sink = await createAccount(db, { name: "Saldo berubah", owner_scope: "shared", initial_balance: 0 });
        await dispatch(db, owner, "transactions.create", {
          transaction_type: "transfer", transaction_date: todayJakarta(), source_account_id: shared.account_id,
          destination_account_id: sink.account_id, amount: 100_000, description: "Mengubah saldo setelah request",
        }, { idempotencyKey: "stale-balance-transfer" });
      } else if (scenario === "account") {
        await db.execute("UPDATE accounts SET status='archived',row_version=row_version+1 WHERE account_id=?", [personal.account_id]);
      } else {
        const now = new Date().toISOString();
        await db.execute("INSERT INTO period_closures(closure_id,period_key,scope,status,snapshot_json,snapshot_hash,reason,row_version,closed_by,closed_at,reopened_by,reopened_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", [
          "closure-stale-transfer", todayJakarta().slice(0, 7), "shared", "closed", "{}", "test-hash", "Uji stale approval", 1, owner.user_id, now, null, null,
        ]);
      }

      const expectedCode = scenario === "balance" ? "UNALLOCATED_FUNDS_INSUFFICIENT" : scenario === "account" ? "INVALID_ACCOUNT" : "PERIOD_CLOSED";
      await assert.rejects(
        dispatch(db, owner, "transferRequests.review", { request_id: request.request_id, row_version: request.row_version, decision: "approve", reason: "Setuju" }, { rowVersion: request.row_version, idempotencyKey: `stale-${scenario}-review` }),
        (error) => error?.code === expectedCode,
      );
      const row = await db.one("SELECT status,row_version,approved_transaction_id FROM transfer_requests WHERE request_id=?", [request.request_id]);
      assert.equal(row.status, "pending");
      assert.equal(row.row_version, 1);
      assert.equal(row.approved_transaction_id, null);
      const transferCount = await db.one("SELECT COUNT(*) AS count FROM transactions WHERE transaction_type='transfer' AND source_account_id=? AND destination_account_id=?", [shared.account_id, personal.account_id]);
      assert.equal(Number(transferCount.count), 0);
    } finally { db.close(); }
  }
});
