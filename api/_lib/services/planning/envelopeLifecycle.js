import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { accountAllocatedRemaining, accountBalanceAsOf } from "../readModels.js";
import { addDays, appError, assertOwner, assertVersion, nowIso, publicRow, sanitizeText, strictBoolean, todayJakarta, uuid } from "../core.js";
import { newVersionStamp, nextVersionStamp } from "../versioning.js";
import { cancelScheduledManualRemindersForEntity, cancelScheduledManualRemindersForEnvelopeRule } from "../reminders.js";
import { addMonths } from "./shared.js";
import { copyEnvelopeNeedsToPeriod } from "./budgets.js";

// Envelope lifecycle owns period close/rollover and archive/delete/restore safeguards.
// Historical periods, movements, budgets, and active reservations block destructive deletion.
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
const ensureNextEnvelopePeriod = async (db, context, period, allocatedAmount) => {
  const bounds = nextEnvelopeBounds(period);
  let next = await db.one("SELECT * FROM envelope_periods WHERE envelope_rule_id=? AND period_start=? AND period_end=?", [period.envelope_rule_id, bounds.start, bounds.end]);
  if (next && next.status !== "active") throw appError("ENVELOPE_NEXT_PERIOD_CONFLICT", "Periode lanjutan Alokasi Dana sudah ada tetapi tidak aktif. Periksa histori sebelum menutup periode ini.", 409);
  if (next && allocatedAmount > 0) {
    const timestamp = nowIso();
    const updated = await db.execute("UPDATE envelope_periods SET allocated_amount=allocated_amount+?,row_version=row_version+1,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=? AND status='active'", [allocatedAmount, context.actor.user_id, timestamp, next.envelope_period_id, next.row_version]);
    if (updated.rowsAffected !== 1) throw appError("CONFLICT", "Periode lanjutan Alokasi Dana berubah di perangkat lain.", 409);
    next = {
      ...next,
      allocated_amount: Number(next.allocated_amount) + allocatedAmount,
      ...nextVersionStamp(next, context.actor.user_id, timestamp),
    };
  }
  if (!next) {
    const timestamp = nowIso();
    next = {
      envelope_period_id: uuid(),
      envelope_rule_id: period.envelope_rule_id,
      name: period.rule_name,
      period_start: bounds.start,
      period_end: bounds.end,
      allocated_amount: allocatedAmount,
      reserved_amount: 0,
      status: "active",
      ...newVersionStamp(context.actor.user_id, timestamp),
      closed_by: null,
      closed_at: null,
    };
    await db.execute(`INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(next));
  }
  return next;
};

const recordEnvelopeRollover = async (db, context, period, nextPeriod, amount) => {
  if (amount <= 0) return null;
  const movement = {
    movement_id: uuid(),
    from_envelope_period_id: period.envelope_period_id,
    to_envelope_period_id: nextPeriod.envelope_period_id,
    amount,
    movement_type: "rollover",
    reason: "Rollover sisa periode",
    status: "active",
    row_version: 1,
    created_by: context.actor.user_id,
    created_at: nowIso(),
  };
  await db.execute("INSERT INTO envelope_movements(movement_id,from_envelope_period_id,to_envelope_period_id,amount,movement_type,reason,status,row_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", Object.values(movement));
  return { amount, to_envelope_period_id: nextPeriod.envelope_period_id };
};

export const assertAllocationAvailable = async (db, sourceAccount, amount, excludePeriodId = null) => {
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

export const envelopeRuleLifecycleImpact = async (db, current) => {
  const statement = envelopeRuleDependencyStatement(current.envelope_rule_id);
  return envelopeRuleLifecycleResult(current, await db.one(statement.sql, statement.args));
};

export const closeEnvelope = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const period = await db.one(`SELECT p.*,r.name AS rule_name,r.period_type,r.rollover_policy,r.scope,r.owner_user_id,r.source_account_id,r.default_amount
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id WHERE p.envelope_period_id=? AND p.status='active'`, [payload.envelope_period_id]);
  if (!period) throw appError("NOT_FOUND", "Periode alokasi aktif tidak ditemukan.", 404);
  assertVersion(period, context.rowVersion ?? payload.row_version);
  const reuseNeeds = strictBoolean(payload.reuse_needs, false);
  const usage = await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?", [period.envelope_period_id]);
  const remaining = Math.max(0, Number(period.allocated_amount) - Number(period.reserved_amount) - Number(usage?.used || 0));
  const carryAmount = period.rollover_policy === "carry" ? remaining : 0;
  if (carryAmount > 0 && !period.source_account_id) throw appError("ENVELOPE_SOURCE_ACCOUNT_REQUIRED", "Alokasi Dana lama tanpa rekening sumber tidak dapat membawa sisa ke periode berikutnya. Arsipkan alokasi lalu buat ulang dengan rekening sumber.", 409);

  const nextPeriod = await ensureNextEnvelopePeriod(db, context, period, carryAmount);
  const rollover = await recordEnvelopeRollover(db, context, period, nextPeriod, carryAmount);
  const needsContinuity = reuseNeeds
    ? await copyEnvelopeNeedsToPeriod(db, context, {
      envelopeRuleId: period.envelope_rule_id,
      sourcePeriodKey: period.period_start.slice(0, 7),
      targetPeriodKey: nextPeriod.period_start.slice(0, 7),
    })
    : { copied: 0, skipped: 0, source_period_key: period.period_start.slice(0, 7), target_period_key: nextPeriod.period_start.slice(0, 7) };

  const timestamp = nowIso();
  const next = {
    ...period,
    status: "closed",
    closed_by: context.actor.user_id,
    closed_at: timestamp,
    ...nextVersionStamp(period, context.actor.user_id, timestamp),
  };
  const result = await db.execute("UPDATE envelope_periods SET status='closed',closed_by=?,closed_at=?,row_version=?,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=?", [next.closed_by, next.closed_at, next.row_version, next.updated_by, next.updated_at, period.envelope_period_id, period.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Periode alokasi berubah di perangkat lain.", 409);
  await cancelScheduledManualRemindersForEntity(db, context, "envelope_period", period.envelope_period_id, "ENTITY_CLOSED");
  const response = {
    period: publicRow(next),
    next_period: publicRow(nextPeriod),
    released_amount: period.rollover_policy === "carry" ? 0 : remaining,
    rollover,
    needs_continuity: needsContinuity,
  };
  await appendAudit(db, context, {
    entityType: "envelope_period",
    entityId: period.envelope_period_id,
    previous: publicRow(period),
    next: response,
  });
  await context.enqueueMirror?.(db, "envelope", period.envelope_period_id);
  await context.enqueueMirror?.(db, "envelope", nextPeriod.envelope_period_id);
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
