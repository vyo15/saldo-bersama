import { readBatchRows } from "../../db/readBatchRows.js";
import { DATABASE_SCHEMA_VERSION } from "../../db/schema.js";
import { appendAudit } from "../audit.js";
import { appError, assertOwner, assertVersion, canonicalJson, monthBounds, nowIso, periodKey, publicRow, sanitizeText, todayJakarta, uuid } from "../core.js";
import { monthlyReport } from "./dashboard.js";
import { integrityBaseStatements, integrityIssuesFromBaseRows } from "./integrity.js";
import { hash } from "./shared.js";
const compactSnapshot = async (db, context, period) => {
  const report = await monthlyReport(db, {
    ...context,
    payload: {
      period
    }
  });
  const overview = report.overview;
  const snapshot = {
    schemaVersion: DATABASE_SCHEMA_VERSION,
    periodKey: period,
    generatedAt: nowIso(),
    totals: {
      totalBalance: overview.totalBalance,
      liquidBalance: overview.liquidBalance,
      safeToSpend: overview.safeToSpend,
      protectedBalance: overview.protectedBalance,
      emergencyBalance: overview.emergencyBalance,
      reservedBills: overview.reservedBills,
      unallocatedFunds: overview.unallocatedFunds,
      allocatedRemaining: overview.allocatedRemaining,
      ...overview.cashFlow
    },
    accountBalances: overview.accountBalances.map(({
      account_id,
      name,
      balance,
      status
    }) => ({
      account_id,
      name,
      balance,
      status
    })),
    categoryExpenses: overview.categoryExpenses,
    budgets: report.budgets.map(({
      budget_id,
      category_id,
      name,
      amount,
      used_amount,
      status
    }) => ({
      budget_id,
      category_id,
      name,
      amount,
      used_amount,
      status
    })),
    envelopes: overview.envelopes.map(({
      envelope_period_id,
      envelope_rule_id,
      name,
      allocated_amount,
      reserved_amount,
      used_amount,
      status
    }) => ({
      envelope_period_id,
      envelope_rule_id,
      name,
      allocated_amount,
      reserved_amount,
      used_amount,
      status
    })),
    recurring: overview.recurring.map(({
      occurrence_id,
      recurring_rule_id,
      name,
      due_date,
      expected_amount,
      actual_amount,
      status
    }) => ({
      occurrence_id,
      recurring_rule_id,
      name,
      due_date,
      expected_amount,
      actual_amount,
      status
    })),
    goals: overview.goals.map(({
      goal_id,
      current_amount
    }) => ({
      goal_id,
      current_amount
    }))
  };
  snapshot.financialFingerprint = hash(canonicalJson(snapshot));
  return snapshot;
};
export const listPeriods = async db => {
  const rows = await db.all("SELECT * FROM period_closures ORDER BY period_key DESC,closed_at DESC");
  return {
    items: rows.map(row => {
      const item = publicRow(row);
      const raw = item.snapshot_json || "";
      delete item.snapshot_json;
      return {
        ...item,
        snapshot_length: raw.length,
        snapshot_checksum: item.snapshot_hash
      };
    })
  };
};

const assertPeriodCanBePreviewed = (period, current, bounds) => {
  if (period > current) throw appError("FUTURE_PERIOD", "Periode masa depan belum dapat ditutup.", 400);
  if (period === current && todayJakarta() < bounds.end) {
    throw appError("PERIOD_NOT_ENDED", "Periode berjalan baru dapat ditutup pada hari terakhir bulan.", 409, { earliestCloseDate: bounds.end });
  }
};

const periodStatistics = async (db, period) => {
  const integrityStatements = integrityBaseStatements();
  const unallocatedStatement = {
    sql: "SELECT COUNT(*) AS count FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id IS NULL AND substr(transaction_date,1,7)=?",
    args: [period],
  };
  const statisticsStatement = {
    sql: `SELECT
      COUNT(*) AS transaction_count,
      SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
      COALESCE(SUM(CASE WHEN status='active' AND transaction_type IN ('income','refund') THEN amount ELSE 0 END),0) AS income_total,
      COALESCE(SUM(CASE WHEN status='active' AND transaction_type='expense' THEN amount ELSE 0 END),0) AS expense_total
      FROM transactions WHERE substr(transaction_date,1,7)=?`,
    args: [period],
  };
  const rows = await readBatchRows(db, [...integrityStatements, unallocatedStatement, statisticsStatement]);
  const integrity = integrityIssuesFromBaseRows(rows.slice(0, integrityStatements.length));
  return [
    integrity,
    rows[integrityStatements.length]?.[0] || null,
    rows[integrityStatements.length + 1]?.[0] || null,
  ];
};

const closeIssues = (integrity, unallocated, period) => {
  const issues = [...integrity];
  const count = Number(unallocated?.count || 0);
  if (count) issues.push({ code: "UNALLOCATED_EXPENSE", count, periodKey: period });
  return issues;
};

const periodCloseImpact = async (db, period) => {
  const current = todayJakarta().slice(0, 7);
  const bounds = monthBounds(period);
  assertPeriodCanBePreviewed(period, current, bounds);
  const existing = await db.one("SELECT * FROM period_closures WHERE period_key=? AND scope='shared'", [period]);
  if (existing?.status === "closed") throw appError("PERIOD_ALREADY_CLOSED", "Periode sudah ditutup.", 409);
  const [integrity, unallocated, statistics] = await periodStatistics(db, period);
  const issues = closeIssues(integrity, unallocated, period);
  return {
    periodKey: period,
    canClose: issues.length === 0,
    issues,
    transactionCount: Number(statistics?.transaction_count || 0),
    activeTransactionCount: Number(statistics?.active_count || 0),
    cancelledTransactionCount: Number(statistics?.cancelled_count || 0),
    incomeTotal: Number(statistics?.income_total || 0),
    expenseTotal: Number(statistics?.expense_total || 0),
    unallocatedExpenseCount: Number(unallocated?.count || 0),
    confirmation: `TUTUP PERIODE ${period}`,
    existingClosureId: existing?.closure_id || "",
  };
};

export const previewClosePeriod = async (db, context) => {
  assertOwner(context.actor);
  const period = periodKey(context.payload?.period_key);
  return periodCloseImpact(db, period);
};

export const closePeriod = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const period = periodKey(p.period_key);
  const impact = await periodCloseImpact(db, period);
  if (!impact.canClose) throw appError("PERIOD_INTEGRITY_FAILED", "Periode belum dapat ditutup karena integrity check gagal.", 409, impact.issues);
  if (String(p.confirmation || "").trim() !== impact.confirmation) throw appError("CONFIRMATION_MISMATCH", "Frasa konfirmasi penutupan periode tidak sesuai.", 400, { expected: impact.confirmation });
  const existing = impact.existingClosureId ? await db.one("SELECT * FROM period_closures WHERE closure_id=?", [impact.existingClosureId]) : null;
  const snapshot = await compactSnapshot(db, context, period);
  const snapshotJson = canonicalJson(snapshot);
  if (snapshotJson.length > 100_000) throw appError("SNAPSHOT_TOO_LARGE", "Snapshot tutup buku terlalu besar.", 409);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Catatan penutupan periode wajib diisi.", 400);
  const timestamp = nowIso();
  let next;
  if (existing) {
    next = {
      ...existing,
      status: "closed",
      snapshot_json: snapshotJson,
      snapshot_hash: hash(snapshotJson),
      reason,
      row_version: Number(existing.row_version) + 1,
      closed_by: context.actor.user_id,
      closed_at: timestamp
    };
    const result = await db.execute("UPDATE period_closures SET status='closed',snapshot_json=?,snapshot_hash=?,reason=?,row_version=?,closed_by=?,closed_at=? WHERE closure_id=? AND row_version=?", [next.snapshot_json, next.snapshot_hash, next.reason, next.row_version, next.closed_by, next.closed_at, existing.closure_id, existing.row_version]);
    if (result.rowsAffected !== 1) throw appError("CONFLICT", "Status periode berubah di perangkat lain.", 409);
  } else {
    next = {
      closure_id: uuid(),
      period_key: period,
      scope: "shared",
      status: "closed",
      snapshot_json: snapshotJson,
      snapshot_hash: hash(snapshotJson),
      reason,
      row_version: 1,
      closed_by: context.actor.user_id,
      closed_at: timestamp,
      reopened_by: null,
      reopened_at: null
    };
    await db.execute("INSERT INTO period_closures(closure_id,period_key,scope,status,snapshot_json,snapshot_hash,reason,row_version,closed_by,closed_at,reopened_by,reopened_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", Object.values(next));
  }
  await appendAudit(db, context, {
    entityType: "period_closure",
    entityId: next.closure_id,
    previous: existing ? {
      status: existing.status,
      row_version: existing.row_version
    } : null,
    next: {
      status: next.status,
      row_version: next.row_version,
      snapshot_checksum: next.snapshot_hash,
      snapshot_length: snapshotJson.length
    }
  });
  const output = publicRow(next);
  delete output.snapshot_json;
  return {
    ...output,
    snapshot_length: snapshotJson.length,
    snapshot_checksum: next.snapshot_hash
  };
};
export const reopenPeriod = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM period_closures WHERE closure_id=? AND status='closed'", [p.closure_id]);
  if (!current) throw appError("NOT_FOUND", "Periode tertutup tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const later = await db.one("SELECT closure_id,period_key FROM period_closures WHERE status='closed' AND period_key>? ORDER BY period_key DESC LIMIT 1", [current.period_key]);
  if (later) throw appError("LATER_PERIOD_CLOSED", "Periode harus dibuka kembali dari bulan tertutup paling akhir.", 409, {
    latestClosedPeriod: later.period_key,
    latestClosureId: later.closure_id
  });
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan membuka periode wajib diisi.", 400);
  const timestamp = nowIso();
  const next = {
    ...current,
    status: "reopened",
    reason,
    row_version: Number(current.row_version) + 1,
    reopened_by: context.actor.user_id,
    reopened_at: timestamp
  };
  const result = await db.execute("UPDATE period_closures SET status='reopened',reason=?,row_version=?,reopened_by=?,reopened_at=? WHERE closure_id=? AND row_version=?", [reason, next.row_version, next.reopened_by, next.reopened_at, current.closure_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Status periode berubah di perangkat lain.", 409);
  await appendAudit(db, context, {
    entityType: "period_closure",
    entityId: current.closure_id,
    previous: {
      status: current.status,
      row_version: current.row_version
    },
    next: {
      status: next.status,
      row_version: next.row_version,
      reason
    }
  });
  const output = publicRow(next);
  delete output.snapshot_json;
  return output;
};
