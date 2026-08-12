import assert from "node:assert/strict";
import test from "node:test";
import { createEnvelope, listEnvelopes, moveEnvelope } from "../../api/_lib/services/planning/envelopes.js";
import { normalizeTransaction } from "../../api/_lib/services/finance.js";
import { deactivateUser } from "../../api/_lib/services/users.js";
import { normalizeRestoredRows } from "../../api/_lib/services/maintenance/shared.js";
import { monthBounds, todayJakarta } from "../../api/_lib/services/core.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";

const administrator = {
  user_id: "user-admin",
  firebase_uid: "firebase-admin",
  email: "admin@example.com",
  name: "Administrator",
  role: "owner",
  status: "active",
  row_version: 1,
};

const member = {
  user_id: "user-member",
  firebase_uid: "firebase-member",
  email: "member@example.com",
  name: "Member",
  role: "member",
  status: "active",
  row_version: 1,
};

const insertUser = (db, user, now) => db.execute(
  "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
  [user.user_id, user.firebase_uid, user.email, user.name, user.role, user.status, user.row_version, now, now],
);

const seed = async (db, { personalAccount = true } = {}) => {
  const now = new Date().toISOString();
  await insertUser(db, administrator, now);
  await insertUser(db, member, now);
  await db.execute(
    "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["account-shared", "Bank Bersama", "bank", "shared", null, 5_000_000, "2020-01-01", 0, "active", 1, administrator.user_id, now, administrator.user_id, now],
  );
  if (personalAccount) {
    await db.execute(
      "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["account-member", "Bank Member", "bank", "personal", member.user_id, 2_000_000, "2020-01-01", 0, "active", 1, administrator.user_id, now, administrator.user_id, now],
    );
  }
  await db.execute(
    "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ["category-food", "Makan", "expense", "variable", "", "active", 1, administrator.user_id, now, administrator.user_id, now],
  );
  return now;
};

const envelopePayload = (name, assigneeUserId, sourceAccountId = "account-shared") => {
  const period = monthBounds(todayJakarta().slice(0, 7));
  return {
    name,
    default_amount: 500_000,
    allocated_amount: 500_000,
    source_account_id: sourceAccountId,
    assignee_user_id: assigneeUserId,
    period_type: "monthly",
    period_start: period.start,
    period_end: period.end,
    rollover_policy: "unallocated",
    overspend_policy: "confirm",
  };
};

const adminContext = (action, payload) => ({
  actor: administrator,
  action,
  payload,
  requestId: `test:${action}:${Math.random()}`,
  enqueueMirror: async () => {},
});

const createAssignedEnvelope = (db, name, assigneeUserId, sourceAccountId) => createEnvelope(
  db,
  adminContext("envelopes.create", envelopePayload(name, assigneeUserId, sourceAccountId)),
);

test("Alokasi menyimpan penerima terpisah dari ownership ledger dan read model mengembalikan identitasnya", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const created = await createAssignedEnvelope(db, "Makan Member", member.user_id);
    assert.equal(created.rule.scope, "shared");
    assert.equal(created.rule.owner_user_id, "");
    assert.equal(created.rule.assignee_user_id, member.user_id);

    const listed = await listEnvelopes(db, { actor: administrator, payload: {} });
    const item = listed.items.find((row) => row.envelope_rule_id === created.rule.envelope_rule_id);
    assert.equal(item.assignee_user_id, member.user_id);
    assert.equal(item.assignee_name, member.name);
    assert.equal(item.assignee_role, "member");
  } finally {
    db.close();
  }
});

test("Member hanya dapat memakai Jatah Bersama atau jatahnya sendiri pada transaksi shared", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const mine = await createAssignedEnvelope(db, "Makan Member", member.user_id);
    const admin = await createAssignedEnvelope(db, "Makan Administrator", administrator.user_id);
    const date = todayJakarta();
    const base = {
      transaction_date: date,
      transaction_type: "expense",
      source_account_id: "account-shared",
      category_id: "category-food",
      amount: 10_000,
      description: "Makan siang",
      confirm_duplicate: true,
    };

    const normalized = await normalizeTransaction(db, { actor: member }, { ...base, envelope_period_id: mine.period.envelope_period_id });
    assert.equal(normalized.envelope_period_id, mine.period.envelope_period_id);
    assert.equal(normalized.scope, "shared");

    await assert.rejects(
      normalizeTransaction(db, { actor: member }, { ...base, description: "Makan admin", envelope_period_id: admin.period.envelope_period_id }),
      (error) => error.code === "ENVELOPE_ASSIGNEE_FORBIDDEN" && error.status === 403,
    );
  } finally {
    db.close();
  }
});

test("rekening personal mengunci jatah ke pemilik rekening dan Administrator tetap dapat realokasi lintas penerima shared", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await assert.rejects(
      createAssignedEnvelope(db, "Personal salah", administrator.user_id, "account-member"),
      (error) => error.code === "ENVELOPE_ASSIGNEE_SCOPE_MISMATCH" && error.status === 409,
    );

    const memberEnvelope = await createAssignedEnvelope(db, "Bensin Member", member.user_id);
    const adminEnvelope = await createAssignedEnvelope(db, "Bensin Administrator", administrator.user_id);

    await assert.rejects(
      moveEnvelope(db, {
        actor: member,
        action: "envelopes.move",
        payload: {
          fromEnvelopePeriodId: memberEnvelope.period.envelope_period_id,
          toEnvelopePeriodId: adminEnvelope.period.envelope_period_id,
          amount: 10_000,
          reason: "uji akses",
          from_row_version: memberEnvelope.period.row_version,
          to_row_version: adminEnvelope.period.row_version,
        },
        requestId: "test:member-move",
      }),
      (error) => error.code === "ENVELOPE_ASSIGNEE_FORBIDDEN" && error.status === 403,
    );

    const movement = await moveEnvelope(db, {
      actor: administrator,
      action: "envelopes.move",
      payload: {
        fromEnvelopePeriodId: memberEnvelope.period.envelope_period_id,
        toEnvelopePeriodId: adminEnvelope.period.envelope_period_id,
        amount: 10_000,
        reason: "penyesuaian Administrator",
        from_row_version: memberEnvelope.period.row_version,
        to_row_version: adminEnvelope.period.row_version,
      },
      requestId: "test:admin-move",
      enqueueMirror: async () => {},
    });
    assert.equal(movement.amount, 10_000);
  } finally {
    db.close();
  }
});

test("Member dengan jatah aktif tidak dapat dinonaktifkan sampai dependency jatah diselesaikan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db, { personalAccount: false });
    await createAssignedEnvelope(db, "Jatah Member", member.user_id);
    await assert.rejects(
      deactivateUser(db, {
        actor: administrator,
        action: "users.deactivate",
        payload: { user_id: member.user_id, row_version: member.row_version, reason: "uji dependency" },
        rowVersion: member.row_version,
        requestId: "test:deactivate",
      }),
      (error) => error.code === "USER_HAS_ACTIVE_DATA" && Number(error.details?.assigned_envelopes || 0) === 1,
    );
  } finally {
    db.close();
  }
});

test("Member dengan anggaran personal aktif tidak dapat dinonaktifkan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seed(db, { personalAccount: false });
    const period = todayJakarta().slice(0, 7);
    await db.execute(
      "INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["budget-member-active", period, "category-food", null, "Makan Member", 250_000, 80, "active", 1, administrator.user_id, now, administrator.user_id, now, "personal", member.user_id],
    );
    await assert.rejects(
      deactivateUser(db, {
        actor: administrator,
        action: "users.deactivate",
        payload: { user_id: member.user_id, row_version: member.row_version, reason: "uji budget personal" },
        rowVersion: member.row_version,
        requestId: "test:deactivate-budget",
      }),
      (error) => error.code === "USER_HAS_ACTIVE_DATA" && Number(error.details?.budgets || 0) === 1,
    );
  } finally {
    db.close();
  }
});

test("restore backup legacy memberi assignee personal ke pemilik dan shared tetap Bersama", () => {
  const restored = normalizeRestoredRows("envelope_rules", [
    { envelope_rule_id: "personal", scope: "personal", owner_user_id: member.user_id },
    { envelope_rule_id: "shared", scope: "shared", owner_user_id: null },
  ]);
  assert.equal(restored[0].assignee_user_id, member.user_id);
  assert.equal(restored[1].assignee_user_id, null);
});
