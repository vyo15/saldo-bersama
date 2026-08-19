import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { accountAllocatedRemaining, accountBalanceAsOf, envelopeItemsStatement, mapEnvelopeItemRows } from "../readModels.js";
import { addDays, appError, assertOwner, assertVersion, dateValue, nowIso, positiveInteger, publicRow, sanitizeText, strictBoolean, todayJakarta, uuid, visibleScopeSql } from "../core.js";
import { newVersionStamp, nextVersionStamp } from "../versioning.js";
import { cancelScheduledManualRemindersForEntity, cancelScheduledManualRemindersForEnvelopeRule } from "../reminders.js";
import { addMonths, accountWithAccess, assertOwnedAccess, assertPlanningManageScope, ruleScopeFromAccount } from "./shared.js";
const PERIOD_TYPES = new Set(["daily", "weekly", "biweekly", "monthly", "paycycle", "custom"]);
const ROLLOVER_POLICIES = new Set(["unallocated", "carry"]);
const OVERSPEND_POLICIES = new Set(["block", "confirm", "allow"]);

const resolveEnvelopeAssignee = async (db, value) => {
  const userId = String(value || "").trim();
  if (!userId) return null;
  const user = await db.one("SELECT user_id,email,name,role,status FROM users WHERE user_id=?", [userId]);
  if (!user || user.status !== "active") throw appError("INVALID_ENVELOPE_ASSIGNEE", "Pengguna alokasi harus merupakan pengguna aktif.", 400);
  return publicRow(user);
};

const assertEnvelopeAssigneeAccess = (actor, envelope) => {
  if (actor.role === "owner" || !envelope?.assignee_user_id || envelope.assignee_user_id === actor.user_id) return;
  throw appError("ENVELOPE_ASSIGNEE_FORBIDDEN", "Member hanya dapat menggunakan atau memindahkan Alokasi Dana Bersama dan alokasi miliknya sendiri.", 403);
};

const hasSameEnvelopeAssignee = (left, right) => String(left?.assignee_user_id || "") === String(right?.assignee_user_id || "");
const nextEnvelopeBounds = period => {
  const type = period.period_type;
  if (type === "daily") return {
    start: addDays(period.period_end, 1),
    end: addDays(period.period_end, 1)
  };
  if (type === "weekly") return {
    start: addDays(period.period_end, 1),
    end: addDays(period.period_end, 7)
  };
  if (type === "biweekly") return {
    start: addDays(period.period_end, 1),
    end: addDays(period.period_end, 14)
  };
  if (["monthly", "paycycle"].includes(type)) {
    const start = addDays(period.period_end, 1);
    return {
      start,
      end: addDays(addMonths(start, 1), -1)
    };
  }
  const length = Math.max(1, Math.round((new Date(`${period.period_end}T00:00:00Z`) - new Date(`${period.period_start}T00:00:00Z`)) / 86400000) + 1);
  return {
    start: addDays(period.period_end, 1),
    end: addDays(period.period_end, length)
  };
};
const assertAllocationAvailable = async (db, sourceAccount, amount, excludePeriodId = null) => {
  if (!sourceAccount) throw appError("ENVELOPE_SOURCE_ACCOUNT_REQUIRED", "Rekening sumber wajib dipilih agar dana alokasi memiliki asal yang jelas.", 400);
  const balance = await accountBalanceAsOf(db, sourceAccount, todayJakarta());
  const allocated = await accountAllocatedRemaining(db, sourceAccount.account_id, { excludePeriodId });
  const available = balance - allocated;
  if (amount > available) throw appError("ALLOCATION_EXCEEDS_AVAILABLE", "Alokasi melebihi dana rekening yang belum dialokasikan.", 409, {
    availableAmount: available,
    accountBalance: balance,
    allocatedRemaining: allocated,
  });
};
const envelopeRuleDependencyStatement = (ruleId) => ({
  sql: `SELECT
    COUNT(*) AS periods,
    SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_periods,
    SUM(CASE WHEN status='closed' OR closed_at IS NOT NULL THEN 1 ELSE 0 END) AS closed_periods,
    SUM(CASE WHEN status='archived' THEN 1 ELSE 0 END) AS archived_periods,
    SUM(CASE WHEN reserved_amount>0 THEN 1 ELSE 0 END) AS reserved_periods,
    (SELECT COUNT(*) FROM transactions WHERE envelope_period_id IN (SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=?)) AS transactions,
    (SELECT COUNT(*) FROM envelope_movements WHERE from_envelope_period_id IN (SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=?) OR to_envelope_period_id IN (SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=?)) AS movements,
    (SELECT COUNT(*) FROM budgets WHERE envelope_rule_id=?) AS budgets
    FROM envelope_periods WHERE envelope_rule_id=?`,
  args: [ruleId, ruleId, ruleId, ruleId, ruleId],
});

const envelopeRuleLifecycleResult = (current, row) => {
  const dependencies = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, Number(value || 0)]));
  const deleteBlockers = [];
  if (current.status !== "active") deleteBlockers.push("Hanya aturan alokasi aktif yang dapat dihapus sebagai data belum dipakai.");
  if (dependencies.periods !== 1 || dependencies.active_periods !== 1) deleteBlockers.push("Alokasi Dana harus hanya memiliki satu periode awal aktif yang belum menjadi histori.");
  if (dependencies.closed_periods) deleteBlockers.push("Alokasi Dana pernah memiliki periode yang ditutup.");
  if (dependencies.archived_periods) deleteBlockers.push("Alokasi Dana pernah memiliki periode yang diarsipkan.");
  if (dependencies.reserved_periods) deleteBlockers.push("Alokasi Dana masih atau pernah memiliki dana yang dipesan pada periode aktif.");
  if (dependencies.transactions) deleteBlockers.push("Alokasi Dana pernah digunakan transaksi, termasuk transaksi cancelled atau archived.");
  if (dependencies.movements) deleteBlockers.push("Alokasi Dana pernah terlibat mutasi atau rollover.");
  if (dependencies.budgets) deleteBlockers.push("Alokasi Dana pernah atau masih direferensikan kebutuhan.");
  return {
    rule: publicRow(current),
    dependencies,
    canArchive: current.status === "active",
    canDeleteUnused: deleteBlockers.length === 0,
    archiveBlockers: [],
    deleteBlockers,
  };
};

const envelopeRuleLifecycleImpact = async (db, current) => {
  const statement = envelopeRuleDependencyStatement(current.envelope_rule_id);
  return envelopeRuleLifecycleResult(current, await db.one(statement.sql, statement.args));
};

export const listEnvelopes = async (db, context) => {
  const itemStatement = envelopeItemsStatement(context.actor, { period: context.payload?.period || null, includeClosed: true });
  const access = visibleScopeSql(context.actor, "fr");
  const movementStatement = {
    sql: `SELECT m.*,fp.name AS from_name,tp.name AS to_name,fp.row_version AS from_row_version,tp.row_version AS to_row_version,
      fr.scope,fr.owner_user_id
      FROM envelope_movements m
      JOIN envelope_periods fp ON fp.envelope_period_id=m.from_envelope_period_id
      JOIN envelope_periods tp ON tp.envelope_period_id=m.to_envelope_period_id
      JOIN envelope_rules fr ON fr.envelope_rule_id=fp.envelope_rule_id
      WHERE m.status='active' AND m.movement_type='reallocation' AND ${access.sql}
      ORDER BY m.created_at DESC LIMIT 20`,
    args: access.args,
  };
  const statements = [itemStatement, movementStatement];
  const archivedIndex = context.actor.role === "owner" ? statements.push({
    sql: `SELECT r.*,COALESCE(NULLIF(TRIM(au.name),''),NULLIF(TRIM(au.email),''),'') AS assignee_name,au.role AS assignee_role
      FROM envelope_rules r LEFT JOIN users au ON au.user_id=r.assignee_user_id
      WHERE r.status='archived' ORDER BY r.updated_at DESC LIMIT 50`,
    args: [],
  }) - 1 : -1;
  const resultRows = await readBatchRows(db, statements);
  const items = mapEnvelopeItemRows(resultRows[0] || []);
  const recentMovements = resultRows[1] || [];
  const archivedRules = archivedIndex >= 0 ? resultRows[archivedIndex] || [] : [];
  return {
    items: items.map((item) => ({
      ...item,
      can_close: context.actor.role === "owner" && item.status === "active",
      can_archive_rule: context.actor.role === "owner" && item.status === "active",
    })),
    recentMovements: recentMovements.map((movement) => ({
      ...publicRow(movement),
      can_reverse: context.actor.role === "owner" || movement.created_by === context.actor.user_id,
    })),
    archivedRules: archivedRules.map((row) => publicRow(row)),
  };
};

export const createEnvelopeRule = async (db, context, payload = context.payload || {}) => {
  const name = sanitizeText(payload.name, 100);
  const periodType = String(payload.period_type || "monthly");
  const rollover = String(payload.rollover_policy || "unallocated");
  const overspend = String(payload.overspend_policy || "confirm");
  if (!name) throw appError("NAME_REQUIRED", "Nama alokasi wajib diisi.", 400);
  if (!PERIOD_TYPES.has(periodType) || !ROLLOVER_POLICIES.has(rollover) || !OVERSPEND_POLICIES.has(overspend)) throw appError("INVALID_ENVELOPE_RULE", "Aturan alokasi tidak valid.", 400);
  const sourceAccountId = sanitizeText(payload.source_account_id, 100);
  if (!sourceAccountId) throw appError("ENVELOPE_SOURCE_ACCOUNT_REQUIRED", "Rekening sumber wajib dipilih agar dana alokasi memiliki asal yang jelas.", 400);
  const account = await accountWithAccess(db, context.actor, sourceAccountId);
  const owned = ruleScopeFromAccount(account);
  assertPlanningManageScope(context.actor, owned);
  const legacyAssignee = owned.scope === "personal" ? owned.owner_user_id : null;
  const requestedAssignee = Object.hasOwn(payload, "assignee_user_id") ? payload.assignee_user_id : legacyAssignee;
  const assignee = await resolveEnvelopeAssignee(db, requestedAssignee);
  if (owned.scope === "personal" && assignee?.user_id !== owned.owner_user_id) {
    throw appError("ENVELOPE_ASSIGNEE_SCOPE_MISMATCH", "Alokasi Dana dari rekening personal hanya dapat digunakan oleh pemilik rekening tersebut.", 409);
  }
  const amount = positiveInteger(payload.default_amount, "Nominal alokasi");
  const timestamp = nowIso();
  const record = {
    envelope_rule_id: uuid(),
    name,
    period_type: periodType,
    scope: owned.scope,
    owner_user_id: owned.owner_user_id,
    assignee_user_id: assignee?.user_id || null,
    default_amount: amount,
    source_account_id: account?.account_id || null,
    rollover_policy: rollover,
    overspend_policy: overspend,
    status: "active",
    ...newVersionStamp(context.actor.user_id, timestamp)
  };
  assertEnvelopeAssigneeAccess(context.actor, record);
  await db.execute(`INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,assignee_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  return record;
};
export const createEnvelopePeriod = async (db, context, payload = context.payload || {}) => {
  const rule = await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='active'", [payload.envelope_rule_id]);
  if (!rule) throw appError("INVALID_ENVELOPE_RULE", "Aturan alokasi tidak ditemukan.", 404);
  assertPlanningManageScope(context.actor, rule);
  assertEnvelopeAssigneeAccess(context.actor, rule);
  const start = dateValue(payload.period_start, "Tanggal mulai alokasi");
  const end = dateValue(payload.period_end, "Tanggal akhir alokasi");
  if (start > end) throw appError("INVALID_PERIOD_RANGE", "Tanggal akhir harus setelah tanggal mulai.", 400);
  const amount = positiveInteger(payload.allocated_amount ?? rule.default_amount, "Nominal alokasi");
  const source = rule.source_account_id ? await accountWithAccess(db, context.actor, rule.source_account_id) : null;
  await assertAllocationAvailable(db, source, amount);
  const duplicate = await db.one("SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=? AND period_start=? AND period_end=?", [rule.envelope_rule_id, start, end]);
  if (duplicate) throw appError("DUPLICATE_ENVELOPE_PERIOD", "Periode alokasi yang sama sudah ada.", 409);
  const timestamp = nowIso();
  const record = {
    envelope_period_id: uuid(),
    envelope_rule_id: rule.envelope_rule_id,
    name: sanitizeText(payload.name || rule.name, 100),
    period_start: start,
    period_end: end,
    allocated_amount: amount,
    reserved_amount: 0,
    status: "active",
    ...newVersionStamp(context.actor.user_id, timestamp),
    closed_by: null,
    closed_at: null
  };
  await db.execute(`INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  return record;
};
export const createEnvelope = async (db, context) => {
  const rule = await createEnvelopeRule(db, context, context.payload || {});
  const period = await createEnvelopePeriod(db, context, {
    ...context.payload,
    envelope_rule_id: rule.envelope_rule_id,
    name: rule.name
  });
  const result = {
    rule: publicRow(rule),
    period: publicRow(period)
  };
  await appendAudit(db, context, {
    entityType: "envelope",
    entityId: period.envelope_period_id,
    next: result
  });
  await context.enqueueMirror?.(db, "envelope", period.envelope_period_id);
  return result;
};
const resolveEnvelopeMove = async (db, context) => {
  const payload = context.payload || {};
  const fromId = payload.fromEnvelopePeriodId || payload.from_envelope_period_id;
  const toId = payload.toEnvelopePeriodId || payload.to_envelope_period_id;
  if (!fromId || !toId || fromId === toId) throw appError("INVALID_ENVELOPE_MOVE", "Alokasi sumber dan tujuan harus berbeda.", 400);
  const query = `SELECT p.*,r.scope,r.owner_user_id,r.assignee_user_id,r.source_account_id FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active'`;
  const [from, to] = await Promise.all([db.one(query, [fromId]), db.one(query, [toId])]);
  if (!from || !to) throw appError("INVALID_ENVELOPE", "Alokasi Dana aktif tidak ditemukan.", 404);
  assertOwnedAccess(context.actor, from);
  assertOwnedAccess(context.actor, to);
  assertEnvelopeAssigneeAccess(context.actor, from);
  assertEnvelopeAssigneeAccess(context.actor, to);
  assertVersion(from, payload.from_row_version);
  assertVersion(to, payload.to_row_version);
  if (from.scope !== to.scope || String(from.owner_user_id || "") !== String(to.owner_user_id || "")) throw appError("ENVELOPE_SCOPE_MISMATCH", "Dana hanya dapat dipindahkan antar alokasi dengan kepemilikan ledger yang sama.", 409);
  if (!from.source_account_id || !to.source_account_id) throw appError("ENVELOPE_SOURCE_ACCOUNT_REQUIRED", "Pemindahan dana memerlukan rekening sumber yang jelas pada kedua alokasi.", 409);
  if (from.source_account_id !== to.source_account_id) throw appError("ENVELOPE_SOURCE_ACCOUNT_MISMATCH", "Dana hanya dapat dipindahkan antar alokasi dari rekening sumber yang sama. Gunakan Transfer untuk memindahkan uang antar rekening.", 409);
  if (context.actor.role !== "owner" && !hasSameEnvelopeAssignee(from, to)) throw appError("ENVELOPE_ASSIGNEE_MISMATCH", "Member hanya dapat memindahkan dana antar alokasi dengan pengguna yang sama.", 409);
  return { payload, fromId, toId, from, to };
};

const assertEnvelopeMoveCapacity = async (db, fromId, from, amount) => {
  const usage = await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?", [fromId]);
  const remaining = Number(from.allocated_amount) - Number(from.reserved_amount) - Number(usage?.used || 0);
  if (amount > remaining) throw appError("INSUFFICIENT_ENVELOPE", "Nominal melebihi dana tersisa pada alokasi sumber.", 409, { remainingAmount: remaining });
};

const applyEnvelopeMoveBalances = async (db, context, { fromId, toId, from, to, amount, timestamp }) => {
  const fromUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount-?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [amount, context.actor.user_id, timestamp, fromId, from.row_version]);
  if (fromUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Alokasi sumber berubah di perangkat lain.", 409);
  const toUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount+?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [amount, context.actor.user_id, timestamp, toId, to.row_version]);
  if (toUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Alokasi tujuan berubah di perangkat lain.", 409);
};

export const moveEnvelope = async (db, context) => {
  const move = await resolveEnvelopeMove(db, context);
  const amount = positiveInteger(move.payload.amount, "Nominal realokasi");
  await assertEnvelopeMoveCapacity(db, move.fromId, move.from, amount);
  const reason = sanitizeText(move.payload.reason, 180);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan realokasi wajib diisi.", 400);
  const timestamp = nowIso();
  const movement = {
    movement_id: uuid(), from_envelope_period_id: move.fromId, to_envelope_period_id: move.toId, amount,
    movement_type: "reallocation", reason, status: "active", row_version: 1, created_by: context.actor.user_id, created_at: timestamp,
  };
  await applyEnvelopeMoveBalances(db, context, { ...move, amount, timestamp });
  await db.execute("INSERT INTO envelope_movements(movement_id,from_envelope_period_id,to_envelope_period_id,amount,movement_type,reason,status,row_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", Object.values(movement));
  await appendAudit(db, context, { entityType: "envelope_movement", entityId: movement.movement_id, next: publicRow(movement) });
  await context.enqueueMirror?.(db, "envelope", move.fromId);
  return publicRow(movement);
};

const envelopePeriodForAdjustment = async (db, periodId) => db.one(`SELECT p.*,r.scope,r.owner_user_id,r.assignee_user_id,r.source_account_id
  FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
  WHERE p.envelope_period_id=? AND p.status='active' AND r.status='active'`, [periodId]);

export const adjustEnvelopeAllocation = async (db, context) => {
  const payload = context.payload || {};
  const periodId = sanitizeText(payload.envelope_period_id, 100);
  const direction = String(payload.direction || "fund");
  const amount = positiveInteger(payload.amount, "Nominal alokasi");
  if (!periodId) throw appError("ENVELOPE_REQUIRED", "Alokasi Dana aktif wajib dipilih.", 400);
  if (!["fund", "release"].includes(direction)) throw appError("INVALID_ALLOCATION_DIRECTION", "Arah perubahan alokasi tidak valid.", 400);
  const current = await envelopePeriodForAdjustment(db, periodId);
  if (!current) throw appError("INVALID_ENVELOPE", "Alokasi Dana aktif tidak ditemukan.", 404);
  assertOwnedAccess(context.actor, current);
  assertPlanningManageScope(context.actor, current);
  assertEnvelopeAssigneeAccess(context.actor, current);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const source = await accountWithAccess(db, context.actor, current.source_account_id);
  if (direction === "fund") {
    await assertAllocationAvailable(db, source, amount);
  } else {
    const usage = await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?", [periodId]);
    const removable = Number(current.allocated_amount) - Number(current.reserved_amount) - Number(usage?.used || 0);
    if (amount > removable) throw appError("INSUFFICIENT_ENVELOPE", "Nominal melebihi dana alokasi yang belum terpakai atau dipesan.", 409, { removableAmount: Math.max(0, removable) });
  }
  const timestamp = nowIso();
  const nextAmount = Number(current.allocated_amount) + (direction === "fund" ? amount : -amount);
  const next = { ...current, allocated_amount: nextAmount, ...nextVersionStamp(current, context.actor.user_id, timestamp) };
  const result = await db.execute("UPDATE envelope_periods SET allocated_amount=?,row_version=?,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=? AND status='active'", [next.allocated_amount, next.row_version, next.updated_by, next.updated_at, periodId, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Alokasi berubah di perangkat lain.", 409);
  const reason = sanitizeText(payload.reason, 180) || (direction === "fund" ? "Tambah dana dari dana tersedia" : "Kembalikan dana ke dana tersedia");
  await appendAudit(db, context, {
    entityType: "envelope_period",
    entityId: periodId,
    previous: publicRow(current),
    next: { ...publicRow(next), allocation_adjustment: { direction, amount, reason } },
  });
  await context.enqueueMirror?.(db, "envelope", periodId);
  return { period: publicRow(next), direction, amount };
};
export const closeEnvelope = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const period = await db.one(`SELECT p.*,r.name AS rule_name,r.period_type,r.rollover_policy,r.scope,r.owner_user_id,r.source_account_id,r.default_amount
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active'`, [payload.envelope_period_id]);
  if (!period) throw appError("NOT_FOUND", "Periode alokasi aktif tidak ditemukan.", 404);
  assertVersion(period, context.rowVersion ?? payload.row_version);
  const usage = await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?", [period.envelope_period_id]);
  const remaining = Math.max(0, Number(period.allocated_amount) - Number(period.reserved_amount) - Number(usage?.used || 0));
  let rollover = null;
  if (period.rollover_policy === "carry" && remaining > 0) {
    if (!period.source_account_id) throw appError("ENVELOPE_SOURCE_ACCOUNT_REQUIRED", "Alokasi Dana lama tanpa rekening sumber tidak dapat membuat periode lanjutan. Arsipkan alokasi lalu buat ulang dengan rekening sumber.", 409);
    const bounds = nextEnvelopeBounds(period);
    let next = await db.one("SELECT * FROM envelope_periods WHERE envelope_rule_id=? AND period_start=? AND period_end=?", [period.envelope_rule_id, bounds.start, bounds.end]);
    if (next) {
      const timestamp = nowIso();
      const nextUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount+?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [remaining, context.actor.user_id, timestamp, next.envelope_period_id, next.row_version]);
      if (nextUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Periode lanjutan alokasi berubah di perangkat lain.", 409);
      next = {
        ...next,
        allocated_amount: Number(next.allocated_amount) + remaining,
        ...nextVersionStamp(next, context.actor.user_id, timestamp)
      };
    } else {
      const timestamp = nowIso();
      next = {
        envelope_period_id: uuid(),
        envelope_rule_id: period.envelope_rule_id,
        name: period.rule_name,
        period_start: bounds.start,
        period_end: bounds.end,
        allocated_amount: remaining,
        reserved_amount: 0,
        status: "active",
        ...newVersionStamp(context.actor.user_id, timestamp),
        closed_by: null,
        closed_at: null
      };
      await db.execute(`INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(next));
    }
    const movement = {
      movement_id: uuid(),
      from_envelope_period_id: period.envelope_period_id,
      to_envelope_period_id: next.envelope_period_id,
      amount: remaining,
      movement_type: "rollover",
      reason: "Rollover sisa periode",
      status: "active",
      row_version: 1,
      created_by: context.actor.user_id,
      created_at: nowIso()
    };
    await db.execute("INSERT INTO envelope_movements(movement_id,from_envelope_period_id,to_envelope_period_id,amount,movement_type,reason,status,row_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", Object.values(movement));
    rollover = {
      amount: remaining,
      to_envelope_period_id: next.envelope_period_id
    };
  }
  const timestamp = nowIso();
  const next = {
    ...period,
    status: "closed",
    closed_by: context.actor.user_id,
    closed_at: timestamp,
    ...nextVersionStamp(period, context.actor.user_id, timestamp)
  };
  const result = await db.execute("UPDATE envelope_periods SET status='closed',closed_by=?,closed_at=?,row_version=?,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [next.closed_by, next.closed_at, next.row_version, next.updated_by, next.updated_at, period.envelope_period_id, period.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Periode alokasi berubah di perangkat lain.", 409);
  await cancelScheduledManualRemindersForEntity(db, context, "envelope_period", period.envelope_period_id, "ENTITY_CLOSED");
  const response = {
    period: publicRow(next),
    rollover
  };
  await appendAudit(db, context, {
    entityType: "envelope_period",
    entityId: period.envelope_period_id,
    previous: publicRow(period),
    next: response
  });
  await context.enqueueMirror?.(db, "envelope", period.envelope_period_id);
  return response;
};

export const previewEnvelopeRuleLifecycle = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const ruleId = payload.envelope_rule_id;
  const [currentRows, dependencyRows] = await readBatchRows(db, [{
    sql: "SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='active'",
    args: [ruleId],
  }, envelopeRuleDependencyStatement(ruleId)]);
  const current = currentRows[0] || null;
  if (!current) throw appError("NOT_FOUND", "Aturan alokasi aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  return envelopeRuleLifecycleResult(current, dependencyRows[0] || {});
};

export const deleteUnusedEnvelopeRule = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='active'", [payload.envelope_rule_id]);
  if (!current) throw appError("NOT_FOUND", "Aturan alokasi aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penghapusan alokasi wajib diisi.", 400);
  if (!strictBoolean(payload.acknowledged, false)) throw appError("ACKNOWLEDGEMENT_REQUIRED", "Konfirmasi pemahaman penghapusan alokasi wajib dicentang.", 400);
  const impact = await envelopeRuleLifecycleImpact(db, current);
  if (!impact.canDeleteUnused) throw appError("ENVELOPE_DELETE_BLOCKED", "Alokasi Dana tidak memenuhi syarat sebagai alokasi yang belum pernah digunakan.", 409, impact);
  const period = await db.one("SELECT * FROM envelope_periods WHERE envelope_rule_id=?", [current.envelope_rule_id]);
  if (!period || period.status !== "active") throw appError("ENVELOPE_DELETE_BLOCKED", "Periode awal alokasi tidak lagi aman untuk dihapus.", 409, impact);
  await cancelScheduledManualRemindersForEnvelopeRule(db, context, current.envelope_rule_id, "ENTITY_DELETED");
  await appendAudit(db, context, {
    entityType: "envelope_rule",
    entityId: current.envelope_rule_id,
    previous: { rule: publicRow(current), period: publicRow(period) },
    next: { deleted: true, deletion_type: "unused_envelope_only", reason, dependencies: impact.dependencies, audit_preserved: true },
  });
  const periodDelete = await db.execute("DELETE FROM envelope_periods WHERE envelope_period_id=? AND envelope_rule_id=? AND row_version=? AND status='active'", [period.envelope_period_id, current.envelope_rule_id, period.row_version]);
  if (periodDelete.rowsAffected !== 1) throw appError("CONFLICT", "Periode alokasi berubah atau baru saja digunakan di perangkat lain.", 409);
  const ruleDelete = await db.execute("DELETE FROM envelope_rules WHERE envelope_rule_id=? AND row_version=? AND status='active'", [current.envelope_rule_id, current.row_version]);
  if (ruleDelete.rowsAffected !== 1) throw appError("CONFLICT", "Aturan alokasi berubah di perangkat lain.", 409);
  await context.enqueueMirror?.(db, "envelope", current.envelope_rule_id);
  return { envelope_rule_id: current.envelope_rule_id, deleted: true, audit_preserved: true };
};

export const archiveEnvelopeRule = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='active'", [payload.envelope_rule_id]);
  if (!current) throw appError("NOT_FOUND", "Aturan alokasi aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan arsip alokasi wajib diisi.", 400);
  const timestamp = nowIso();
  const next = { ...current, status: "archived", ...nextVersionStamp(current, context.actor.user_id, timestamp) };
  const update = await db.execute("UPDATE envelope_rules SET status='archived',row_version=?,updated_by=?,updated_at=? WHERE envelope_rule_id=? AND row_version=? AND status='active'", [next.row_version, next.updated_by, next.updated_at, current.envelope_rule_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Aturan alokasi berubah di perangkat lain.", 409);
  await cancelScheduledManualRemindersForEnvelopeRule(db, context, current.envelope_rule_id, "ENTITY_ARCHIVED");
  await db.execute("UPDATE envelope_periods SET status='archived',row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_rule_id=? AND status='active'", [context.actor.user_id, timestamp, current.envelope_rule_id]);
  await appendAudit(db, context, { entityType: "envelope_rule", entityId: current.envelope_rule_id, previous: publicRow(current), next: { ...publicRow(next), reason } });
  await context.enqueueMirror?.(db, "envelope", current.envelope_rule_id);
  return publicRow(next);
};

export const restoreEnvelopeRule = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='archived'", [payload.envelope_rule_id]);
  if (!current) throw appError("NOT_FOUND", "Aturan alokasi arsip tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pemulihan alokasi wajib diisi.", 400);
  if (!current.source_account_id) throw appError("ENVELOPE_SOURCE_ACCOUNT_REQUIRED", "Alokasi Dana lama tanpa rekening sumber tidak dapat dipulihkan. Buat ulang alokasi dengan rekening sumber yang aktif.", 409);
  const account = await db.one("SELECT * FROM accounts WHERE account_id=?", [current.source_account_id]);
  if (!account || account.status !== "active") throw appError("ACCOUNT_INACTIVE", "Rekening sumber alokasi harus aktif sebelum dipulihkan.", 409);
  const archivedPeriods = await db.all(`SELECT p.allocated_amount,COALESCE((SELECT SUM(t.amount) FROM transactions t
      WHERE t.status='active' AND t.transaction_type='expense' AND t.envelope_period_id=p.envelope_period_id AND t.transaction_date<=?),0) AS used_amount
    FROM envelope_periods p WHERE p.envelope_rule_id=? AND p.status='archived' AND p.updated_at=?`, [todayJakarta(), current.envelope_rule_id, current.updated_at]);
  const restoreAllocation = archivedPeriods.reduce((sum, period) => sum + Math.max(0, Number(period.allocated_amount || 0) - Number(period.used_amount || 0)), 0);
  await assertAllocationAvailable(db, account, restoreAllocation);
  if (current.assignee_user_id) {
    const assignee = await db.one("SELECT status FROM users WHERE user_id=?", [current.assignee_user_id]);
    if (!assignee || assignee.status !== "active") throw appError("ASSIGNEE_INACTIVE", "Pengguna alokasi harus aktif sebelum alokasi dipulihkan.", 409);
  }
  const timestamp = nowIso();
  const next = { ...current, status: "active", ...nextVersionStamp(current, context.actor.user_id, timestamp) };
  const update = await db.execute("UPDATE envelope_rules SET status='active',row_version=?,updated_by=?,updated_at=? WHERE envelope_rule_id=? AND row_version=? AND status='archived'", [next.row_version, next.updated_by, next.updated_at, current.envelope_rule_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Aturan alokasi berubah di perangkat lain.", 409);
  await db.execute("UPDATE envelope_periods SET status='active',row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_rule_id=? AND status='archived' AND updated_at=?", [context.actor.user_id, timestamp, current.envelope_rule_id, current.updated_at]);
  await appendAudit(db, context, { entityType: "envelope_rule", entityId: current.envelope_rule_id, previous: publicRow(current), next: { ...publicRow(next), reason } });
  await context.enqueueMirror?.(db, "envelope", current.envelope_rule_id);
  return publicRow(next);
};

export const reverseEnvelopeMovement = async (db, context) => {
  const payload = context.payload || {};
  const movement = await db.one("SELECT * FROM envelope_movements WHERE movement_id=? AND movement_type='reallocation' AND status='active'", [payload.movement_id]);
  if (!movement) throw appError("NOT_FOUND", "Mutasi alokasi aktif tidak ditemukan.", 404);
  if (context.actor.role !== "owner" && movement.created_by !== context.actor.user_id) throw appError("FORBIDDEN", "Member hanya dapat membatalkan mutasi alokasi yang dibuat sendiri.", 403);
  assertVersion(movement, context.rowVersion ?? payload.row_version);
  const [from, to] = await Promise.all([
    db.one(`SELECT p.*,r.scope,r.owner_user_id,r.assignee_user_id,r.source_account_id FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active' AND r.status='active'`, [movement.from_envelope_period_id]),
    db.one(`SELECT p.*,r.scope,r.owner_user_id,r.assignee_user_id,r.source_account_id FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active' AND r.status='active'`, [movement.to_envelope_period_id]),
  ]);
  if (!from || !to) throw appError("ENVELOPE_MOVEMENT_LOCKED", "Pemindahan dana hanya dapat dibatalkan ketika kedua alokasi masih aktif.", 409);
  assertOwnedAccess(context.actor, from);
  assertOwnedAccess(context.actor, to);
  assertEnvelopeAssigneeAccess(context.actor, from);
  assertEnvelopeAssigneeAccess(context.actor, to);
  if (context.actor.role !== "owner" && !hasSameEnvelopeAssignee(from, to)) throw appError("ENVELOPE_ASSIGNEE_MISMATCH", "Member hanya dapat membatalkan pemindahan antar alokasi dengan pengguna yang sama.", 409);
  assertVersion(from, payload.from_row_version);
  assertVersion(to, payload.to_row_version);
  const usage = await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?", [to.envelope_period_id]);
  const removable = Number(to.allocated_amount) - Number(to.reserved_amount) - Number(usage?.used || 0);
  if (Number(movement.amount) > removable) throw appError("ENVELOPE_MOVEMENT_IN_USE", "Dana hasil realokasi sudah terpakai atau dipesan sehingga mutasi tidak dapat dibatalkan.", 409, { removableAmount: removable });
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pembatalan mutasi wajib diisi.", 400);
  const timestamp = nowIso();
  const fromUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount+?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [movement.amount, context.actor.user_id, timestamp, from.envelope_period_id, from.row_version]);
  if (fromUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Alokasi sumber berubah di perangkat lain.", 409);
  const toUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount-?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [movement.amount, context.actor.user_id, timestamp, to.envelope_period_id, to.row_version]);
  if (toUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Alokasi tujuan berubah di perangkat lain.", 409);
  const next = { ...movement, status: "reversed", row_version: Number(movement.row_version) + 1 };
  const movementUpdate = await db.execute("UPDATE envelope_movements SET status='reversed',row_version=? WHERE movement_id=? AND row_version=? AND status='active'", [next.row_version, movement.movement_id, movement.row_version]);
  if (movementUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Mutasi alokasi berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "envelope_movement", entityId: movement.movement_id, previous: publicRow(movement), next: { ...publicRow(next), reversal_reason: reason } });
  await context.enqueueMirror?.(db, "envelope", from.envelope_period_id);
  return publicRow(next);
};
