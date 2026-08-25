import assert from "node:assert/strict";
import test from "node:test";
import { archiveEnvelopeRule, createEnvelope, listEnvelopes, moveEnvelope, restoreEnvelopeRule, reverseEnvelopeMovement } from "../../api/_lib/services/planning/envelopes.js";
import { listBudgets, upsertBudget } from "../../api/_lib/services/planning/budgets.js";
import { normalizeTransaction } from "../../api/_lib/services/finance.js";
import { dashboardOverview } from "../../api/_lib/services/reporting/dashboard.js";
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
  await db.execute(
    "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["account-shared-2", "Bank Bersama 2", "bank", "shared", null, 5_000_000, "2020-01-01", 0, "active", 1, administrator.user_id, now, administrator.user_id, now],
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
    assert.equal(item.source_account_id, "account-shared");
    assert.equal(item.source_account_name, "Bank Bersama");
  } finally {
    db.close();
  }
});

test("capability Alokasi dan Kebutuhan shared mengikuti assignee backend", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const mine = await createAssignedEnvelope(db, "Jatah Member", member.user_id);
    const other = await createAssignedEnvelope(db, "Jatah Administrator", administrator.user_id);
    const period = todayJakarta().slice(0, 7);

    const mineBudget = await upsertBudget(db, adminContext("budgets.upsert", {
      period_key: period, category_id: "category-food", envelope_rule_id: mine.rule.envelope_rule_id,
      name: "Makan Member", amount: 200_000, warning_threshold: 80, scope: "shared",
    }));
    const otherBudget = await upsertBudget(db, adminContext("budgets.upsert", {
      period_key: period, category_id: "category-food", envelope_rule_id: other.rule.envelope_rule_id,
      name: "Makan Administrator", amount: 200_000, warning_threshold: 80, scope: "shared",
    }));

    const memberContext = { actor: member, payload: { period } };
    const listed = await listEnvelopes(db, memberContext);
    const mineItem = listed.items.find((item) => item.envelope_rule_id === mine.rule.envelope_rule_id);
    const otherItem = listed.items.find((item) => item.envelope_rule_id === other.rule.envelope_rule_id);
    assert.equal(mineItem?.can_adjust, true);
    assert.equal(mineItem?.can_manage_needs, true);
    assert.equal(mineItem?.can_record_expense, true);
    assert.equal(otherItem?.can_adjust, false);
    assert.equal(otherItem?.can_manage_needs, false);
    assert.equal(otherItem?.can_record_expense, false);

    const dashboard = await dashboardOverview(db, memberContext);
    const dashboardMine = dashboard.envelopes.find((item) => item.envelope_rule_id === mine.rule.envelope_rule_id);
    const dashboardOther = dashboard.envelopes.find((item) => item.envelope_rule_id === other.rule.envelope_rule_id);
    assert.equal(dashboardMine?.can_manage_needs, true);
    assert.equal(dashboardMine?.can_record_expense, true);
    assert.equal(dashboardOther?.can_manage_needs, false);
    assert.equal(dashboardOther?.can_record_expense, false);

    const budgets = await listBudgets(db, memberContext);
    assert.equal(budgets.items.find((item) => item.budget_id === mineBudget.budget_id)?.can_manage, true);
    assert.equal(budgets.items.find((item) => item.budget_id === otherBudget.budget_id)?.can_manage, false);

    await assert.rejects(
      () => upsertBudget(db, { ...memberContext, action: "budgets.upsert", rowVersion: otherBudget.row_version, payload: {
        period_key: period, category_id: "category-food", envelope_rule_id: other.rule.envelope_rule_id,
        name: "Tidak boleh", amount: 210_000, warning_threshold: 80, scope: "shared", row_version: otherBudget.row_version,
      } }),
      (error) => error.code === "ENVELOPE_ASSIGNEE_FORBIDDEN" && error.status === 403,
    );
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

test("Kantong baru wajib memiliki rekening sumber aktif", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    await assert.rejects(
      createEnvelope(db, adminContext("envelopes.create", envelopePayload("Tanpa sumber", "", ""))),
      (error) => error.code === "ENVELOPE_SOURCE_ACCOUNT_REQUIRED" && error.status === 400,
    );
  } finally {
    db.close();
  }
});

test("Realokasi lintas rekening sumber ditolak dan harus memakai Transfer", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const from = await createAssignedEnvelope(db, "Makan BCA", "", "account-shared");
    const to = await createAssignedEnvelope(db, "Transport Mandiri", "", "account-shared-2");

    await assert.rejects(
      moveEnvelope(db, {
        actor: administrator,
        action: "envelopes.move",
        payload: {
          fromEnvelopePeriodId: from.period.envelope_period_id,
          toEnvelopePeriodId: to.period.envelope_period_id,
          amount: 10_000,
          reason: "uji lintas rekening",
          from_row_version: from.period.row_version,
          to_row_version: to.period.row_version,
        },
        requestId: "test:cross-account-move",
        enqueueMirror: async () => {},
      }),
      (error) => error.code === "ENVELOPE_SOURCE_ACCOUNT_MISMATCH" && error.status === 409,
    );
  } finally {
    db.close();
  }
});


test("Kantong arsip tanpa rekening sumber tidak dapat dipulihkan", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const created = await createAssignedEnvelope(db, "Arsip legacy", "", "account-shared");
    const archived = await archiveEnvelopeRule(db, adminContext("envelopes.archiveRule", {
      envelope_rule_id: created.rule.envelope_rule_id,
      row_version: created.rule.row_version,
      reason: "uji arsip sebelum restore",
    }));
    await db.execute("UPDATE envelope_rules SET source_account_id=NULL WHERE envelope_rule_id=?", [created.rule.envelope_rule_id]);

    await assert.rejects(
      restoreEnvelopeRule(db, adminContext("envelopes.restoreRule", {
        envelope_rule_id: created.rule.envelope_rule_id,
        row_version: archived.row_version,
        reason: "uji restore legacy tanpa sumber",
      })),
      (error) => error.code === "ENVELOPE_SOURCE_ACCOUNT_REQUIRED" && error.status === 409,
    );
  } finally {
    db.close();
  }
});

test("Restore kantong ditolak jika dana tersedia tidak lagi cukup", async () => {
  const db = await createSqliteTestDatabase();
  try {
    await seed(db);
    const first = await createAssignedEnvelope(db, "Dana lama", "", "account-shared");
    const archived = await archiveEnvelopeRule(db, adminContext("envelopes.archiveRule", {
      envelope_rule_id: first.rule.envelope_rule_id,
      row_version: first.rule.row_version,
      reason: "uji ketersediaan restore",
    }));
    await createEnvelope(db, adminContext("envelopes.create", {
      ...envelopePayload("Dana pengganti", "", "account-shared"),
      default_amount: 4_700_000,
      allocated_amount: 4_700_000,
    }));

    await assert.rejects(
      restoreEnvelopeRule(db, adminContext("envelopes.restoreRule", {
        envelope_rule_id: first.rule.envelope_rule_id,
        row_version: archived.row_version,
        reason: "uji dana restore tidak cukup",
      })),
      (error) => error.code === "ALLOCATION_EXCEEDS_AVAILABLE" && error.status === 409,
    );
  } finally {
    db.close();
  }
});

test("Pembatalan realokasi legacy lintas rekening tetap dapat memulihkan alokasi", async () => {
  const db = await createSqliteTestDatabase();
  try {
    const now = await seed(db);
    const from = await createAssignedEnvelope(db, "Legacy A", "", "account-shared");
    const to = await createAssignedEnvelope(db, "Legacy B", "", "account-shared-2");
    await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount-100000,row_version=row_version+1 WHERE envelope_period_id=?", [from.period.envelope_period_id]);
    await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount+100000,row_version=row_version+1 WHERE envelope_period_id=?", [to.period.envelope_period_id]);
    await db.execute(
      "INSERT INTO envelope_movements(movement_id,from_envelope_period_id,to_envelope_period_id,amount,movement_type,reason,status,row_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ["legacy-cross-move", from.period.envelope_period_id, to.period.envelope_period_id, 100_000, "reallocation", "legacy cross-account", "active", 1, administrator.user_id, now],
    );
    const [fromCurrent, toCurrent] = await Promise.all([
      db.one("SELECT row_version FROM envelope_periods WHERE envelope_period_id=?", [from.period.envelope_period_id]),
      db.one("SELECT row_version FROM envelope_periods WHERE envelope_period_id=?", [to.period.envelope_period_id]),
    ]);

    const reversed = await reverseEnvelopeMovement(db, adminContext("envelopes.reverseMovement", {
      movement_id: "legacy-cross-move",
      row_version: 1,
      from_row_version: fromCurrent.row_version,
      to_row_version: toCurrent.row_version,
      reason: "pulihkan realokasi legacy",
    }));
    assert.equal(reversed.status, "reversed");
    const [fromAfter, toAfter] = await Promise.all([
      db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_period_id=?", [from.period.envelope_period_id]),
      db.one("SELECT allocated_amount FROM envelope_periods WHERE envelope_period_id=?", [to.period.envelope_period_id]),
    ]);
    assert.equal(Number(fromAfter.allocated_amount), 500_000);
    assert.equal(Number(toAfter.allocated_amount), 500_000);
  } finally {
    db.close();
  }
});
