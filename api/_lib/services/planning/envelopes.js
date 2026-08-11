import { appendAudit } from "../audit.js";
import { accountBalanceAsOf, envelopeItems } from "../readModels.js";
import { addDays, appError, assertOwner, assertVersion, dateValue, nowIso, positiveInteger, publicRow, sanitizeText, strictBoolean, todayJakarta, uuid, visibleScopeSql } from "../core.js";
import { nextVersionStamp } from "../versioning.js";
import { addMonths, accountWithAccess, assertOwnedAccess, ruleScopeFromAccount } from "./shared.js";
const PERIOD_TYPES = new Set(["daily", "weekly", "biweekly", "monthly", "paycycle", "custom"]);
const ROLLOVER_POLICIES = new Set(["unallocated", "carry"]);
const OVERSPEND_POLICIES = new Set(["block", "confirm", "allow"]);
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
  if (!sourceAccount) return;
  const balance = await accountBalanceAsOf(db, sourceAccount, todayJakarta());
  const allocated = await db.one(`SELECT COALESCE(SUM(p.allocated_amount - p.reserved_amount - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.status='active' AND t.transaction_type='expense' AND t.envelope_period_id=p.envelope_period_id),0)),0) AS total
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    WHERE p.status='active' AND r.status='active' AND r.source_account_id=? ${excludePeriodId ? "AND p.envelope_period_id<>?" : ""}`, [sourceAccount.account_id, ...(excludePeriodId ? [excludePeriodId] : [])]);
  const available = balance - Number(allocated?.total || 0);
  if (amount > available) throw appError("ALLOCATION_EXCEEDS_AVAILABLE", "Alokasi melebihi dana rekening yang belum dialokasikan.", 409, {
    availableAmount: available,
    accountBalance: balance
  });
};
const envelopeRuleLifecycleImpact = async (db, current) => {
  const row = await db.one(`SELECT
    COUNT(*) AS periods,
    SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_periods,
    SUM(CASE WHEN status='closed' OR closed_at IS NOT NULL THEN 1 ELSE 0 END) AS closed_periods,
    SUM(CASE WHEN status='archived' THEN 1 ELSE 0 END) AS archived_periods,
    SUM(CASE WHEN reserved_amount>0 THEN 1 ELSE 0 END) AS reserved_periods,
    (SELECT COUNT(*) FROM transactions WHERE envelope_period_id IN (SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=?)) AS transactions,
    (SELECT COUNT(*) FROM envelope_movements WHERE from_envelope_period_id IN (SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=?) OR to_envelope_period_id IN (SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=?)) AS movements,
    (SELECT COUNT(*) FROM budgets WHERE envelope_rule_id=?) AS budgets
    FROM envelope_periods WHERE envelope_rule_id=?`, [current.envelope_rule_id, current.envelope_rule_id, current.envelope_rule_id, current.envelope_rule_id, current.envelope_rule_id]);
  const dependencies = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, Number(value || 0)]));
  const deleteBlockers = [];
  if (current.status !== "active") deleteBlockers.push("Hanya aturan kantong aktif yang dapat dihapus sebagai data belum dipakai.");
  if (dependencies.periods !== 1 || dependencies.active_periods !== 1) deleteBlockers.push("Kantong harus hanya memiliki satu periode awal aktif yang belum menjadi histori.");
  if (dependencies.closed_periods) deleteBlockers.push("Kantong pernah memiliki periode yang ditutup.");
  if (dependencies.archived_periods) deleteBlockers.push("Kantong pernah memiliki periode yang diarsipkan.");
  if (dependencies.reserved_periods) deleteBlockers.push("Kantong masih atau pernah memiliki dana yang dipesan pada periode aktif.");
  if (dependencies.transactions) deleteBlockers.push("Kantong pernah digunakan transaksi, termasuk transaksi cancelled atau archived.");
  if (dependencies.movements) deleteBlockers.push("Kantong pernah terlibat mutasi atau rollover.");
  if (dependencies.budgets) deleteBlockers.push("Kantong pernah atau masih direferensikan anggaran.");
  return {
    rule: publicRow(current),
    dependencies,
    canArchive: current.status === "active",
    canDeleteUnused: deleteBlockers.length === 0,
    archiveBlockers: [],
    deleteBlockers,
  };
};

export const listEnvelopes = async (db, context) => {
  const items = await envelopeItems(db, context.actor, { period: context.payload?.period || null, includeClosed: true });
  const access = visibleScopeSql(context.actor, "fr");
  const recentMovements = await db.all(`SELECT m.*,fp.name AS from_name,tp.name AS to_name,fp.row_version AS from_row_version,tp.row_version AS to_row_version,
      fr.scope,fr.owner_user_id
    FROM envelope_movements m
    JOIN envelope_periods fp ON fp.envelope_period_id=m.from_envelope_period_id
    JOIN envelope_periods tp ON tp.envelope_period_id=m.to_envelope_period_id
    JOIN envelope_rules fr ON fr.envelope_rule_id=fp.envelope_rule_id
    WHERE m.status='active' AND m.movement_type='reallocation' AND ${access.sql}
    ORDER BY m.created_at DESC LIMIT 20`, access.args);
  const archivedRules = context.actor.role === "owner"
    ? await db.all("SELECT * FROM envelope_rules WHERE status='archived' ORDER BY updated_at DESC LIMIT 50")
    : [];
  return {
    items: items.map(item => ({
      ...item,
      can_close: context.actor.role === "owner" && item.status === "active",
      can_archive_rule: context.actor.role === "owner" && item.status === "active"
    })),
    recentMovements: recentMovements.map((movement) => ({
      ...publicRow(movement),
      can_reverse: context.actor.role === "owner" || movement.created_by === context.actor.user_id,
    })),
    archivedRules: archivedRules.map((row) => publicRow(row)),
  };
};
export const createEnvelopeRule = async (db, context, payload = context.payload || {}) => {
  assertOwner(context.actor);
  const name = sanitizeText(payload.name, 100);
  const periodType = String(payload.period_type || "monthly");
  const rollover = String(payload.rollover_policy || "unallocated");
  const overspend = String(payload.overspend_policy || "confirm");
  if (!name) throw appError("NAME_REQUIRED", "Nama kantong wajib diisi.", 400);
  if (!PERIOD_TYPES.has(periodType) || !ROLLOVER_POLICIES.has(rollover) || !OVERSPEND_POLICIES.has(overspend)) throw appError("INVALID_ENVELOPE_RULE", "Aturan kantong tidak valid.", 400);
  const account = await accountWithAccess(db, context.actor, payload.source_account_id, {
    optional: true
  });
  const owned = ruleScopeFromAccount(account);
  const amount = positiveInteger(payload.default_amount, "Nominal alokasi");
  const timestamp = nowIso();
  const record = {
    envelope_rule_id: uuid(),
    name,
    period_type: periodType,
    scope: owned.scope,
    owner_user_id: owned.owner_user_id,
    default_amount: amount,
    source_account_id: account?.account_id || null,
    rollover_policy: rollover,
    overspend_policy: overspend,
    status: "active",
    row_version: 1,
    created_by: context.actor.user_id,
    created_at: timestamp,
    updated_by: context.actor.user_id,
    updated_at: timestamp
  };
  await db.execute(`INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  return record;
};
export const createEnvelopePeriod = async (db, context, payload = context.payload || {}) => {
  assertOwner(context.actor);
  const rule = await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='active'", [payload.envelope_rule_id]);
  if (!rule) throw appError("INVALID_ENVELOPE_RULE", "Aturan kantong tidak ditemukan.", 404);
  const start = dateValue(payload.period_start, "Tanggal mulai kantong");
  const end = dateValue(payload.period_end, "Tanggal akhir kantong");
  if (start > end) throw appError("INVALID_PERIOD_RANGE", "Tanggal akhir harus setelah tanggal mulai.", 400);
  const amount = positiveInteger(payload.allocated_amount ?? rule.default_amount, "Nominal alokasi");
  const source = rule.source_account_id ? await accountWithAccess(db, context.actor, rule.source_account_id) : null;
  await assertAllocationAvailable(db, source, amount);
  const duplicate = await db.one("SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=? AND period_start=? AND period_end=?", [rule.envelope_rule_id, start, end]);
  if (duplicate) throw appError("DUPLICATE_ENVELOPE_PERIOD", "Periode kantong yang sama sudah ada.", 409);
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
    row_version: 1,
    created_by: context.actor.user_id,
    created_at: timestamp,
    updated_by: context.actor.user_id,
    updated_at: timestamp,
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
export const moveEnvelope = async (db, context) => {
  const payload = context.payload || {};
  const fromId = payload.fromEnvelopePeriodId || payload.from_envelope_period_id;
  const toId = payload.toEnvelopePeriodId || payload.to_envelope_period_id;
  if (!fromId || !toId || fromId === toId) throw appError("INVALID_ENVELOPE_MOVE", "Kantong sumber dan tujuan harus berbeda.", 400);
  const [from, to] = await Promise.all([db.one(`SELECT p.*,r.scope,r.owner_user_id FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active'`, [fromId]), db.one(`SELECT p.*,r.scope,r.owner_user_id FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active'`, [toId])]);
  if (!from || !to) throw appError("INVALID_ENVELOPE", "Kantong aktif tidak ditemukan.", 404);
  assertOwnedAccess(context.actor, from);
  assertOwnedAccess(context.actor, to);
  assertVersion(from, payload.from_row_version);
  assertVersion(to, payload.to_row_version);
  if (from.scope !== to.scope || String(from.owner_user_id || "") !== String(to.owner_user_id || "")) throw appError("ENVELOPE_SCOPE_MISMATCH", "Alokasi hanya dapat dipindahkan antar kantong dengan kepemilikan sama.", 409);
  const amount = positiveInteger(payload.amount, "Nominal realokasi");
  const usage = await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?", [fromId]);
  const remaining = Number(from.allocated_amount) - Number(from.reserved_amount) - Number(usage?.used || 0);
  if (amount > remaining) throw appError("INSUFFICIENT_ENVELOPE", "Nominal melebihi sisa kantong sumber.", 409, {
    remainingAmount: remaining
  });
  const reason = sanitizeText(payload.reason, 180);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan realokasi wajib diisi.", 400);
  const timestamp = nowIso();
  const movement = {
    movement_id: uuid(),
    from_envelope_period_id: fromId,
    to_envelope_period_id: toId,
    amount,
    movement_type: "reallocation",
    reason,
    status: "active",
    row_version: 1,
    created_by: context.actor.user_id,
    created_at: timestamp
  };
  const fromUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount-?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [amount, context.actor.user_id, timestamp, fromId, from.row_version]);
  if (fromUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Kantong sumber berubah di perangkat lain.", 409);
  const toUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount+?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [amount, context.actor.user_id, timestamp, toId, to.row_version]);
  if (toUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Kantong tujuan berubah di perangkat lain.", 409);
  await db.execute("INSERT INTO envelope_movements(movement_id,from_envelope_period_id,to_envelope_period_id,amount,movement_type,reason,status,row_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", Object.values(movement));
  await appendAudit(db, context, {
    entityType: "envelope_movement",
    entityId: movement.movement_id,
    next: publicRow(movement)
  });
  await context.enqueueMirror?.(db, "envelope", fromId);
  return publicRow(movement);
};
export const closeEnvelope = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const period = await db.one(`SELECT p.*,r.name AS rule_name,r.period_type,r.rollover_policy,r.scope,r.owner_user_id,r.source_account_id,r.default_amount
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active'`, [payload.envelope_period_id]);
  if (!period) throw appError("NOT_FOUND", "Periode kantong aktif tidak ditemukan.", 404);
  assertVersion(period, context.rowVersion ?? payload.row_version);
  const usage = await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?", [period.envelope_period_id]);
  const remaining = Math.max(0, Number(period.allocated_amount) - Number(period.reserved_amount) - Number(usage?.used || 0));
  let rollover = null;
  if (period.rollover_policy === "carry" && remaining > 0) {
    const bounds = nextEnvelopeBounds(period);
    let next = await db.one("SELECT * FROM envelope_periods WHERE envelope_rule_id=? AND period_start=? AND period_end=?", [period.envelope_rule_id, bounds.start, bounds.end]);
    if (next) {
      const timestamp = nowIso();
      const nextUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount+?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [remaining, context.actor.user_id, timestamp, next.envelope_period_id, next.row_version]);
      if (nextUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Kantong rollover berubah di perangkat lain.", 409);
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
        row_version: 1,
        created_by: context.actor.user_id,
        created_at: timestamp,
        updated_by: context.actor.user_id,
        updated_at: timestamp,
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
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Periode kantong berubah di perangkat lain.", 409);
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
  const current = await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='active'", [payload.envelope_rule_id]);
  if (!current) throw appError("NOT_FOUND", "Aturan kantong aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  return envelopeRuleLifecycleImpact(db, current);
};

export const deleteUnusedEnvelopeRule = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='active'", [payload.envelope_rule_id]);
  if (!current) throw appError("NOT_FOUND", "Aturan kantong aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penghapusan kantong wajib diisi.", 400);
  if (!strictBoolean(payload.acknowledged, false)) throw appError("ACKNOWLEDGEMENT_REQUIRED", "Konfirmasi pemahaman penghapusan kantong wajib dicentang.", 400);
  const impact = await envelopeRuleLifecycleImpact(db, current);
  if (!impact.canDeleteUnused) throw appError("ENVELOPE_DELETE_BLOCKED", "Kantong tidak memenuhi syarat sebagai kantong belum pernah digunakan.", 409, impact);
  const period = await db.one("SELECT * FROM envelope_periods WHERE envelope_rule_id=?", [current.envelope_rule_id]);
  if (!period || period.status !== "active") throw appError("ENVELOPE_DELETE_BLOCKED", "Periode awal kantong tidak lagi aman untuk dihapus.", 409, impact);
  await appendAudit(db, context, {
    entityType: "envelope_rule",
    entityId: current.envelope_rule_id,
    previous: { rule: publicRow(current), period: publicRow(period) },
    next: { deleted: true, deletion_type: "unused_envelope_only", reason, dependencies: impact.dependencies, audit_preserved: true },
  });
  const periodDelete = await db.execute("DELETE FROM envelope_periods WHERE envelope_period_id=? AND envelope_rule_id=? AND row_version=? AND status='active'", [period.envelope_period_id, current.envelope_rule_id, period.row_version]);
  if (periodDelete.rowsAffected !== 1) throw appError("CONFLICT", "Periode kantong berubah atau baru saja digunakan di perangkat lain.", 409);
  const ruleDelete = await db.execute("DELETE FROM envelope_rules WHERE envelope_rule_id=? AND row_version=? AND status='active'", [current.envelope_rule_id, current.row_version]);
  if (ruleDelete.rowsAffected !== 1) throw appError("CONFLICT", "Aturan kantong berubah di perangkat lain.", 409);
  await context.enqueueMirror?.(db, "envelope", current.envelope_rule_id);
  return { envelope_rule_id: current.envelope_rule_id, deleted: true, audit_preserved: true };
};

export const archiveEnvelopeRule = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='active'", [payload.envelope_rule_id]);
  if (!current) throw appError("NOT_FOUND", "Aturan kantong aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan arsip kantong wajib diisi.", 400);
  const timestamp = nowIso();
  const next = { ...current, status: "archived", ...nextVersionStamp(current, context.actor.user_id, timestamp) };
  const update = await db.execute("UPDATE envelope_rules SET status='archived',row_version=?,updated_by=?,updated_at=? WHERE envelope_rule_id=? AND row_version=? AND status='active'", [next.row_version, next.updated_by, next.updated_at, current.envelope_rule_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Aturan kantong berubah di perangkat lain.", 409);
  await db.execute("UPDATE envelope_periods SET status='archived',row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_rule_id=? AND status='active'", [context.actor.user_id, timestamp, current.envelope_rule_id]);
  await appendAudit(db, context, { entityType: "envelope_rule", entityId: current.envelope_rule_id, previous: publicRow(current), next: { ...publicRow(next), reason } });
  await context.enqueueMirror?.(db, "envelope", current.envelope_rule_id);
  return publicRow(next);
};

export const restoreEnvelopeRule = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const current = await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='archived'", [payload.envelope_rule_id]);
  if (!current) throw appError("NOT_FOUND", "Aturan kantong arsip tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? payload.row_version);
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pemulihan kantong wajib diisi.", 400);
  if (current.source_account_id) {
    const account = await db.one("SELECT status FROM accounts WHERE account_id=?", [current.source_account_id]);
    if (!account || account.status !== "active") throw appError("ACCOUNT_INACTIVE", "Rekening sumber kantong harus aktif sebelum dipulihkan.", 409);
  }
  const timestamp = nowIso();
  const next = { ...current, status: "active", ...nextVersionStamp(current, context.actor.user_id, timestamp) };
  const update = await db.execute("UPDATE envelope_rules SET status='active',row_version=?,updated_by=?,updated_at=? WHERE envelope_rule_id=? AND row_version=? AND status='archived'", [next.row_version, next.updated_by, next.updated_at, current.envelope_rule_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Aturan kantong berubah di perangkat lain.", 409);
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
    db.one(`SELECT p.*,r.scope,r.owner_user_id FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active' AND r.status='active'`, [movement.from_envelope_period_id]),
    db.one(`SELECT p.*,r.scope,r.owner_user_id FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active' AND r.status='active'`, [movement.to_envelope_period_id]),
  ]);
  if (!from || !to) throw appError("ENVELOPE_MOVEMENT_LOCKED", "Mutasi hanya dapat dibatalkan ketika kedua kantong masih aktif.", 409);
  assertOwnedAccess(context.actor, from);
  assertOwnedAccess(context.actor, to);
  assertVersion(from, payload.from_row_version);
  assertVersion(to, payload.to_row_version);
  const usage = await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?", [to.envelope_period_id]);
  const removable = Number(to.allocated_amount) - Number(to.reserved_amount) - Number(usage?.used || 0);
  if (Number(movement.amount) > removable) throw appError("ENVELOPE_MOVEMENT_IN_USE", "Dana hasil realokasi sudah terpakai atau dipesan sehingga mutasi tidak dapat dibatalkan.", 409, { removableAmount: removable });
  const reason = sanitizeText(payload.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pembatalan mutasi wajib diisi.", 400);
  const timestamp = nowIso();
  const fromUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount+?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [movement.amount, context.actor.user_id, timestamp, from.envelope_period_id, from.row_version]);
  if (fromUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Kantong sumber berubah di perangkat lain.", 409);
  const toUpdate = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount-?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [movement.amount, context.actor.user_id, timestamp, to.envelope_period_id, to.row_version]);
  if (toUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Kantong tujuan berubah di perangkat lain.", 409);
  const next = { ...movement, status: "reversed", row_version: Number(movement.row_version) + 1 };
  const movementUpdate = await db.execute("UPDATE envelope_movements SET status='reversed',row_version=? WHERE movement_id=? AND row_version=? AND status='active'", [next.row_version, movement.movement_id, movement.row_version]);
  if (movementUpdate.rowsAffected !== 1) throw appError("CONFLICT", "Mutasi alokasi berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "envelope_movement", entityId: movement.movement_id, previous: publicRow(movement), next: { ...publicRow(next), reversal_reason: reason } });
  await context.enqueueMirror?.(db, "envelope", from.envelope_period_id);
  return publicRow(next);
};
