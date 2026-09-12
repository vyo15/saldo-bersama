import { readBatchRows } from "../../db/readBatchRows.js";
import { appendAudit } from "../audit.js";
import { appError, assertOwner, assertVersion, monthBounds, normalizeOwnedScope, nowIso, periodKey, positiveInteger, publicRow, sanitizeText, todayJakarta, uuid, visibleScopeSql } from "../core.js";
import { newVersionStamp, nextVersionStamp } from "../versioning.js";
import { assertEnvelopeAssigneeAccess, assertPlanningManageScope } from "./shared.js";
import { cancelScheduledManualRemindersForEntity } from "../reminders.js";
import { createRecurringRule } from "./recurring.js";
import { adjustEnvelopeForBudgetDelta } from "./budgetFunding.js";

const BUDGET_IDENTITY_SQL = "period_key=? AND category_id=? AND scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'') AND COALESCE(envelope_rule_id,'')=COALESCE(?,'')";
const budgetIdentityArgs = ({ period_key, category_id, scope, owner_user_id, envelope_rule_id }) => [period_key, category_id, scope, owner_user_id, envelope_rule_id || null];
export const budgetListStatement = (context) => {
  const period = periodKey(context.payload?.period);
  const access = visibleScopeSql(context.actor, "b");
  const bounds = monthBounds(period);
  return {
    sql: `SELECT b.*,COALESCE(c.name,b.name) AS display_name,
      COALESCE((
        SELECT SUM(t.amount)
        FROM transactions t
        LEFT JOIN envelope_periods ep ON ep.envelope_period_id=t.envelope_period_id
        WHERE t.status='active'
          AND t.transaction_type='expense'
          AND t.transaction_date BETWEEN ? AND ?
          AND t.category_id=b.category_id
          AND t.scope=b.scope
          AND COALESCE(t.owner_user_id,'')=COALESCE(b.owner_user_id,'')
          AND (b.envelope_rule_id IS NULL OR ep.envelope_rule_id=b.envelope_rule_id)
      ),0) AS used_amount,
      bu.name AS owner_name,bu.role AS owner_role,
      er.name AS envelope_name,er.source_account_id AS envelope_source_account_id,
      er.assignee_user_id AS envelope_assignee_user_id
    FROM budgets b
    LEFT JOIN categories c ON c.category_id=b.category_id
    LEFT JOIN users bu ON bu.user_id=b.owner_user_id
    LEFT JOIN envelope_rules er ON er.envelope_rule_id=b.envelope_rule_id
    WHERE b.period_key=? AND b.status='active' AND ${access.sql}
    ORDER BY display_name`,
    args: [bounds.start, bounds.end, period, ...access.args],
  };
};

const budgetUsageAmount = async (db, budget) => {
  const bounds = monthBounds(budget.period_key);
  const row = await db.one(`SELECT COALESCE(SUM(t.amount),0) AS used
    FROM transactions t
    LEFT JOIN envelope_periods ep ON ep.envelope_period_id=t.envelope_period_id
    WHERE t.status='active'
      AND t.transaction_type='expense'
      AND t.transaction_date BETWEEN ? AND ?
      AND t.category_id=?
      AND t.scope=?
      AND COALESCE(t.owner_user_id,'')=COALESCE(?,'')
      AND (? IS NULL OR ep.envelope_rule_id=?)`, [
    bounds.start,
    bounds.end,
    budget.category_id,
    budget.scope,
    budget.owner_user_id,
    budget.envelope_rule_id || null,
    budget.envelope_rule_id || null,
  ]);
  return Math.max(0, Number(row?.used || 0));
};

const canManageBudget = (actor, row) => {
  if (!actor || !row) return false;
  const scopeAllowed = actor.role === "owner"
    || (row.scope === "shared" && !row.owner_user_id)
    || (row.scope === "personal" && row.owner_user_id === actor.user_id);
  if (!scopeAllowed) return false;
  return actor.role === "owner" || !row.envelope_assignee_user_id || row.envelope_assignee_user_id === actor.user_id;
};

export const mapBudgetListRows = (rows, context) => ({
  items: rows.map((row) => ({
    ...publicRow(row),
    name: row.display_name,
    can_manage: canManageBudget(context?.actor, row),
  })),
});

export const listBudgets = async (db, context) => {
  const statement = budgetListStatement(context);
  return mapBudgetListRows(await db.all(statement.sql, statement.args), context);
};

export const copyEnvelopeNeedsToPeriod = async (db, context, { envelopeRuleId, sourcePeriodKey, targetPeriodKey }) => {
  const sourcePeriod = periodKey(sourcePeriodKey);
  const targetPeriod = periodKey(targetPeriodKey);
  if (sourcePeriod === targetPeriod) return { copied: 0, skipped: 0, copied_amount: 0, source_period_key: sourcePeriod, target_period_key: targetPeriod };
  const sourceItems = await db.all(`SELECT b.* FROM budgets b
    JOIN categories c ON c.category_id=b.category_id
    WHERE b.period_key=? AND b.envelope_rule_id=? AND b.status='active'
      AND c.status='active' AND c.transaction_type='expense'
    ORDER BY b.budget_id`, [sourcePeriod, envelopeRuleId]);
  let copied = 0;
  let skipped = 0;
  let copiedAmount = 0;
  for (const current of sourceItems) {
    const identityArgs = budgetIdentityArgs({
      period_key: targetPeriod,
      category_id: current.category_id,
      scope: current.scope,
      owner_user_id: current.owner_user_id,
      envelope_rule_id: current.envelope_rule_id,
    });
    const existing = await db.one(`SELECT * FROM budgets WHERE ${BUDGET_IDENTITY_SQL}`, identityArgs);
    if (existing) {
      skipped += 1;
      continue;
    }
    const timestamp = nowIso();
    const next = {
      budget_id: uuid(),
      period_key: targetPeriod,
      category_id: current.category_id,
      envelope_rule_id: current.envelope_rule_id,
      name: current.name,
      amount: Number(current.amount),
      warning_threshold: Number(current.warning_threshold || 80),
      status: 'active',
      ...newVersionStamp(context.actor.user_id, timestamp),
      scope: current.scope,
      owner_user_id: current.owner_user_id,
    };
    await db.execute("INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", Object.values(next));
    await appendAudit(db, context, {
      entityType: 'budget',
      entityId: next.budget_id,
      previous: null,
      next: { ...publicRow(next), continuity_from_budget_id: current.budget_id },
    });
    await context.enqueueMirror?.(db, 'budget', next.budget_id);
    copied += 1;
    copiedAmount += Number(next.amount || 0);
  }
  return { copied, skipped, copied_amount: copiedAmount, source_period_key: sourcePeriod, target_period_key: targetPeriod };
};

const resolveBudgetEnvelope = async (db, actor, envelopeRuleId, owned) => {
  if (!envelopeRuleId) return null;
  const envelope = await db.one("SELECT * FROM envelope_rules WHERE envelope_rule_id=? AND status='active'", [envelopeRuleId]);
  if (!envelope) throw appError("INVALID_ENVELOPE", "Alokasi Dana untuk kebutuhan tidak valid atau sudah diarsipkan.", 400);
  if (envelope.scope !== owned.scope || String(envelope.owner_user_id || "") !== String(owned.owner_user_id || "")) {
    throw appError("BUDGET_ENVELOPE_SCOPE_MISMATCH", "Alokasi Dana dan kebutuhan harus memiliki kepemilikan yang sama.", 409);
  }
  assertEnvelopeAssigneeAccess(actor, envelope);
  return envelope;
};

const BUDGET_BATCH_LIMIT = 20;

const budgetBatchExistingRows = async (db, { period, owned, envelopeRuleId, item }) => {
  const identity = {
    period_key: period,
    category_id: item.category_id,
    scope: owned.scope,
    owner_user_id: owned.owner_user_id,
    envelope_rule_id: envelopeRuleId,
  };
  const exact = await db.one(`SELECT * FROM budgets WHERE ${BUDGET_IDENTITY_SQL}`, budgetIdentityArgs(identity));
  if (exact) throw appError("BUDGET_ALREADY_EXISTS", "Kategori ini sudah menjadi Kebutuhan pada Alokasi Dana tersebut.", 409, { categoryId: item.category_id });
  const legacy = await db.one(
    "SELECT * FROM budgets WHERE period_key=? AND category_id=? AND scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'') AND envelope_rule_id IS NULL",
    [period, item.category_id, owned.scope, owned.owner_user_id],
  );
  if (!legacy) return null;
  assertVersion(legacy, item.row_version);
  return legacy;
};

const recurringContextForBudgetBatch = (context, payload) => ({ ...context, payload, rowVersion: null });

export const createBudgetsBatch = async (db, context) => {
  const p = context.payload || {};
  const period = periodKey(p.period_key);
  const owned = await normalizeOwnedScope(db, context.actor, p);
  assertPlanningManageScope(context.actor, owned, { allowOwnedPersonal: true });
  const envelopeRuleId = sanitizeText(p.envelope_rule_id, 100);
  if (!envelopeRuleId) throw appError("BUDGET_BATCH_ENVELOPE_REQUIRED", "Alokasi Dana wajib dipilih untuk menambah beberapa kebutuhan sekaligus.", 400);
  const envelope = await resolveBudgetEnvelope(db, context.actor, envelopeRuleId, owned);
  if (!envelope?.source_account_id) throw appError("BUDGET_BATCH_SOURCE_ACCOUNT_REQUIRED", "Rekening sumber Alokasi Dana belum tersedia.", 409);

  const rawItems = Array.isArray(p.items) ? p.items : [];
  const items = (() => {
    if (!rawItems.length) throw appError("BUDGET_BATCH_EMPTY", "Tambahkan minimal satu kebutuhan.", 400);
    if (rawItems.length > BUDGET_BATCH_LIMIT) throw appError("BUDGET_BATCH_LIMIT", `Maksimal ${BUDGET_BATCH_LIMIT} kebutuhan dapat disimpan sekaligus.`, 400);
    const seen = new Set();
    return rawItems.map((item, index) => {
      const categoryId = sanitizeText(item?.category_id, 100);
      if (!categoryId) throw appError("INVALID_CATEGORY", `Kategori kebutuhan ${index + 1} belum dipilih.`, 400);
      if (seen.has(categoryId)) throw appError("BUDGET_BATCH_DUPLICATE_CATEGORY", "Kategori yang sama tidak dapat ditambahkan dua kali ke Alokasi Dana yang sama.", 409, { categoryId });
      seen.add(categoryId);
      const recordingMode = String(item?.recording_mode || "flexible");
      if (!["flexible", "scheduled"].includes(recordingMode)) throw appError("INVALID_BUDGET_RECORDING_MODE", "Cara mencatat kebutuhan tidak valid.", 400);
      return {
        category_id: categoryId,
        amount: positiveInteger(item?.amount, `Nominal kebutuhan ${index + 1}`),
        warning_threshold: Math.min(100, Math.max(1, Number(item?.warning_threshold || 80))),
        row_version: item?.row_version ?? null,
        recording_mode: recordingMode,
        schedule_frequency: sanitizeText(item?.schedule_frequency || "monthly", 30),
        schedule_due_day: item?.schedule_due_day ?? 20,
        schedule_start_date: item?.schedule_start_date || todayJakarta(),
        schedule_payment_method: sanitizeText(item?.schedule_payment_method || "transfer", 40),
      };
    });
  })();

  const prepared = [];
  for (const item of items) {
    const category = await db.one("SELECT * FROM categories WHERE category_id=? AND status='active' AND transaction_type='expense'", [item.category_id]);
    if (!category) throw appError("INVALID_CATEGORY", "Kategori pengeluaran tidak valid.", 400, { categoryId: item.category_id });
    const legacy = await budgetBatchExistingRows(db, { period, owned, envelopeRuleId, item });
    prepared.push({ item, category, legacy });
  }

  const funding = await adjustEnvelopeForBudgetDelta(db, context, {
    envelopeRuleId,
    envelopePeriodId: sanitizeText(p.envelope_period_id, 100),
    periodKey: period,
    delta: prepared.reduce((total, entry) => total + Number(entry.item.amount || 0), 0),
    reason: `Pendanaan otomatis ${prepared.length} Kebutuhan`,
  });

  const created = [];
  for (const entry of prepared) {
    const { item, category, legacy } = entry;
    const budget = await upsertBudget(db, {
      ...context,
      skipEnvelopeFunding: true,
      rowVersion: legacy?.row_version ?? null,
      payload: {
        category_id: category.category_id,
        warning_threshold: item.warning_threshold,
        scope: owned.scope,
        period_key: period,
        amount: item.amount,
        envelope_rule_id: envelopeRuleId,
        owner_user_id: owned.owner_user_id,
        row_version: legacy?.row_version ?? null,
      },
    });
    let schedule = null;
    if (item.recording_mode === "scheduled") {
      schedule = await createRecurringRule(db, recurringContextForBudgetBatch(context, {
        name: category.name || "Pembayaran rutin",
        kind: "expense",
        category_id: category.category_id,
        expected_amount: item.amount,
        frequency: item.schedule_frequency,
        due_day: item.schedule_due_day,
        default_account_id: envelope.source_account_id,
        payment_method: item.schedule_payment_method,
        start_date: item.schedule_start_date,
        auto_debit: false,
      }));
      if (schedule.scope !== owned.scope || String(schedule.owner_user_id || "") !== String(owned.owner_user_id || "")) {
        throw appError("BUDGET_SCHEDULE_SCOPE_MISMATCH", "Jadwal pembayaran dan Kebutuhan harus memiliki kepemilikan yang sama.", 409);
      }
    }
    created.push({ budget, schedule });
  }
  return { count: created.length, items: created, funding };
};

const syncBudgetFundingForUpsert = async (db, context, { current, envelopeRuleId, envelopePeriodId, period, amount }) => {
  if (!envelopeRuleId || context.skipEnvelopeFunding) return;
  const alreadyLinked = current?.envelope_rule_id === envelopeRuleId;
  const previousFundedAmount = alreadyLinked ? Number(current.amount || 0) : 0;
  if (alreadyLinked && amount < previousFundedAmount) {
    const usedAmount = await budgetUsageAmount(db, current);
    if (amount < usedAmount) {
      throw appError(
        "BUDGET_AMOUNT_BELOW_USED",
        `Nominal Kebutuhan tidak dapat lebih kecil dari dana yang sudah terpakai Rp ${usedAmount.toLocaleString("id-ID")}.`,
        409,
        { amount, usedAmount, minimumAmount: usedAmount },
      );
    }
  }
  await adjustEnvelopeForBudgetDelta(db, context, {
    envelopeRuleId,
    envelopePeriodId,
    periodKey: period,
    delta: amount - previousFundedAmount,
    reason: current ? "Penyesuaian otomatis nominal Kebutuhan" : "Pendanaan otomatis Kebutuhan",
  });
};

export const upsertBudget = async (db, context) => {
  const p = context.payload || {};
  const period = periodKey(p.period_key);
  const category = await db.one("SELECT * FROM categories WHERE category_id=? AND status='active' AND transaction_type='expense'", [p.category_id]);
  if (!category) throw appError("INVALID_CATEGORY", "Kategori pengeluaran tidak valid.", 400);
  const owned = await normalizeOwnedScope(db, context.actor, p);
  assertPlanningManageScope(context.actor, owned, { allowOwnedPersonal: true });
  const envelopeRuleId = sanitizeText(p.envelope_rule_id, 100) || null;
  await resolveBudgetEnvelope(db, context.actor, envelopeRuleId, owned);
  const identityArgs = budgetIdentityArgs({ period_key: period, category_id: category.category_id, scope: owned.scope, owner_user_id: owned.owner_user_id, envelope_rule_id: envelopeRuleId });
  let current = await db.one(`SELECT * FROM budgets WHERE ${BUDGET_IDENTITY_SQL}`, identityArgs);
  if (!current && envelopeRuleId) {
    current = await db.one(
      "SELECT * FROM budgets WHERE period_key=? AND category_id=? AND scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'') AND envelope_rule_id IS NULL",
      identityArgs.slice(0, 4),
    );
  }
  const amount = positiveInteger(p.amount, "Anggaran kebutuhan");
  const threshold = Math.min(100, Math.max(1, Number(p.warning_threshold || 80)));
  await syncBudgetFundingForUpsert(db, context, {
    current,
    envelopeRuleId,
    envelopePeriodId: sanitizeText(p.envelope_period_id, 100),
    period,
    amount,
  });
  const now = nowIso();
  let next;
  if (current) {
    assertVersion(current, context.rowVersion ?? p.row_version);
    next = {
      ...current,
      envelope_rule_id: envelopeRuleId,
      name: sanitizeText(p.name || category.name, 100),
      amount,
      warning_threshold: threshold,
      status: "active",
      ...nextVersionStamp(current, context.actor.user_id, now)
    };
    const result = await db.execute("UPDATE budgets SET envelope_rule_id=?,name=?,amount=?,warning_threshold=?,status='active',row_version=?,updated_by=?,updated_at=? WHERE budget_id=? AND row_version=?", [next.envelope_rule_id, next.name, amount, threshold, next.row_version, next.updated_by, next.updated_at, current.budget_id, current.row_version]);
    if (result.rowsAffected !== 1) throw appError("CONFLICT", "Kebutuhan berubah di perangkat lain.", 409);
  } else {
    next = {
      budget_id: uuid(),
      period_key: period,
      category_id: category.category_id,
      envelope_rule_id: envelopeRuleId,
      name: sanitizeText(p.name || category.name, 100),
      amount,
      warning_threshold: threshold,
      status: "active",
      ...newVersionStamp(context.actor.user_id, now),
      scope: owned.scope,
      owner_user_id: owned.owner_user_id
    };
    await db.execute("INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", Object.values(next));
  }
  await appendAudit(db, context, {
    entityType: "budget",
    entityId: next.budget_id,
    previous: current ? publicRow(current) : null,
    next: publicRow(next)
  });
  await context.enqueueMirror?.(db, "budget", next.budget_id);
  return publicRow(next);
};
const budgetLifecycleResult = (current, dependencies) => {
  const normalizedDependencies = {
    transactions: Number(dependencies?.transactions || 0),
    period_closures: Number(dependencies?.period_closures || 0),
  };
  const canDeleteUnused = current.status === "active"
    && normalizedDependencies.transactions === 0
    && normalizedDependencies.period_closures === 0;
  return {
    budget_id: current.budget_id,
    status: current.status,
    row_version: current.row_version,
    canDeleteUnused,
    canArchive: current.status === "active",
    dependencies: normalizedDependencies,
    blockers: canDeleteUnused ? [] : [
      ...(normalizedDependencies.transactions ? ["Kebutuhan sudah berada pada periode/kategori yang memiliki histori transaksi."] : []),
      ...(normalizedDependencies.period_closures ? ["Periode kebutuhan sudah pernah ditutup dan merupakan histori perencanaan."] : [])
    ]
  };
};

const budgetLifecycleImpact = async (db, current) => {
  const bounds = monthBounds(current.period_key);
  const envelopeClause = current.envelope_rule_id
    ? " AND envelope_period_id IN (SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=?)"
    : "";
  const transactionCount = await db.one(`SELECT COUNT(*) AS count FROM transactions
      WHERE category_id=?
        AND transaction_date BETWEEN ? AND ?
        AND scope=?
        AND COALESCE(owner_user_id,'')=COALESCE(?,'')${envelopeClause}`,
    [current.category_id, bounds.start, bounds.end, current.scope, current.owner_user_id, ...(current.envelope_rule_id ? [current.envelope_rule_id] : [])]);
  const closures = await db.one("SELECT COUNT(*) AS count FROM period_closures WHERE period_key=?", [current.period_key]);
  return budgetLifecycleResult(current, {
    transactions: Number(transactionCount?.count || 0),
    period_closures: Number(closures?.count || 0),
  });
};

const budgetLifecycleDependencyStatement = (budgetId) => ({
  sql: `WITH current AS (SELECT * FROM budgets WHERE budget_id=?)
    SELECT (
      SELECT COUNT(*) FROM transactions t
      WHERE t.category_id=b.category_id
        AND t.transaction_date BETWEEN b.period_key||'-01' AND date(b.period_key||'-01','+1 month','-1 day')
        AND t.scope=b.scope
        AND COALESCE(t.owner_user_id,'')=COALESCE(b.owner_user_id,'')
        AND (b.envelope_rule_id IS NULL OR t.envelope_period_id IN (
          SELECT envelope_period_id FROM envelope_periods WHERE envelope_rule_id=b.envelope_rule_id
        ))
    ) AS transactions,
    (SELECT COUNT(*) FROM period_closures pc WHERE pc.period_key=b.period_key) AS period_closures
    FROM current b`,
  args: [budgetId],
});

export const previewBudgetLifecycle = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const budgetId = p.budget_id;
  const [currentRows, dependencyRows] = await readBatchRows(db, [{
    sql: "SELECT * FROM budgets WHERE budget_id=?",
    args: [budgetId],
  }, budgetLifecycleDependencyStatement(budgetId)]);
  const current = currentRows[0] || null;
  if (!current) throw appError("NOT_FOUND", "Kebutuhan tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  return budgetLifecycleResult(current, dependencyRows[0] || {});
};

export const deleteUnusedBudget = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM budgets WHERE budget_id=? AND status='active'", [p.budget_id]);
  if (!current) throw appError("NOT_FOUND", "Kebutuhan aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan penghapusan kebutuhan wajib diisi.", 400);
  const impact = await budgetLifecycleImpact(db, current);
  if (!impact.canDeleteUnused) throw appError("BUDGET_HAS_HISTORY", "Kebutuhan sudah menjadi bagian histori dan hanya dapat diarsipkan.", 409, { lifecycle: impact });
  if (current.envelope_rule_id) await adjustEnvelopeForBudgetDelta(db, context, {
    envelopeRuleId: current.envelope_rule_id,
    envelopePeriodId: sanitizeText(p.envelope_period_id, 100),
    periodKey: current.period_key,
    delta: -Number(current.amount || 0),
    reason: "Dana Kebutuhan yang dihapus dikembalikan otomatis",
  });
  await cancelScheduledManualRemindersForEntity(db, context, "budget", current.budget_id, "ENTITY_DELETED");
  await appendAudit(db, context, {
    entityType: "budget",
    entityId: current.budget_id,
    previous: publicRow(current),
    next: {
      deleted: true,
      deletion_type: "unused_budget_only",
      reason,
      dependencies: impact.dependencies,
      audit_preserved: true
    }
  });
  const deleted = await db.execute("DELETE FROM budgets WHERE budget_id=? AND row_version=? AND status='active'", [current.budget_id, current.row_version]);
  if (deleted.rowsAffected !== 1) throw appError("CONFLICT", "Kebutuhan berubah di perangkat lain.", 409);
  await context.enqueueMirror?.(db, "budget", current.budget_id);
  return { budget_id: current.budget_id, deleted: true, audit_preserved: true };
};

export const archiveBudget = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM budgets WHERE budget_id=? AND status='active'", [p.budget_id]);
  if (!current) throw appError("NOT_FOUND", "Kebutuhan aktif tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pengarsipan kebutuhan wajib diisi.", 400);
  if (current.envelope_rule_id) {
    const usedAmount = await budgetUsageAmount(db, current);
    const releasableAmount = Math.max(0, Number(current.amount || 0) - usedAmount);
    await adjustEnvelopeForBudgetDelta(db, context, {
      envelopeRuleId: current.envelope_rule_id,
      envelopePeriodId: sanitizeText(p.envelope_period_id, 100),
      periodKey: current.period_key,
      delta: -releasableAmount,
      reason: "Sisa dana Kebutuhan yang diarsipkan dikembalikan otomatis",
    });
  }
  const next = {
    ...current,
    status: "archived",
    ...nextVersionStamp(current, context.actor.user_id)
  };
  const r = await db.execute("UPDATE budgets SET status='archived',row_version=?,updated_by=?,updated_at=? WHERE budget_id=? AND row_version=?", [next.row_version, next.updated_by, next.updated_at, current.budget_id, current.row_version]);
  if (r.rowsAffected !== 1) throw appError("CONFLICT", "Kebutuhan berubah di perangkat lain.", 409);
  await cancelScheduledManualRemindersForEntity(db, context, "budget", current.budget_id, "ENTITY_ARCHIVED");
  await appendAudit(db, context, {
    entityType: "budget",
    entityId: current.budget_id,
    previous: publicRow(current),
    next: { ...publicRow(next), archive_reason: reason }
  });
  await context.enqueueMirror?.(db, "budget", current.budget_id);
  return publicRow(next);
};
export const restoreBudget = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM budgets WHERE budget_id=? AND status='archived'", [p.budget_id]);
  if (!current) throw appError("NOT_FOUND", "Kebutuhan arsip tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const reason = sanitizeText(p.reason, 200);
  if (!reason) throw appError("REASON_REQUIRED", "Alasan pemulihan kebutuhan wajib diisi.", 400);
  const category = await db.one("SELECT status,transaction_type FROM categories WHERE category_id=?", [current.category_id]);
  if (!category || category.status !== "active" || category.transaction_type !== "expense") throw appError("CATEGORY_INACTIVE", "Kategori pengeluaran harus aktif sebelum kebutuhan dipulihkan.", 409);
  if (current.envelope_rule_id) {
    const envelope = await db.one("SELECT status,scope,owner_user_id FROM envelope_rules WHERE envelope_rule_id=?", [current.envelope_rule_id]);
    if (!envelope || envelope.status !== "active") throw appError("ENVELOPE_INACTIVE", "Alokasi Dana terkait harus aktif sebelum kebutuhan dipulihkan.", 409);
    if (envelope.scope !== current.scope || String(envelope.owner_user_id || "") !== String(current.owner_user_id || "")) throw appError("BUDGET_ENVELOPE_SCOPE_MISMATCH", "Alokasi Dana dan kebutuhan harus memiliki kepemilikan yang sama.", 409);
  }
  const duplicate = await db.one(`SELECT budget_id FROM budgets WHERE budget_id<>? AND ${BUDGET_IDENTITY_SQL} AND status='active' LIMIT 1`, [current.budget_id, ...budgetIdentityArgs(current)]);
  if (duplicate) throw appError("DUPLICATE_BUDGET", "Sudah ada Kebutuhan aktif untuk kategori, periode, dan Alokasi Dana yang sama.", 409);
  if (current.envelope_rule_id) {
    const usedAmount = await budgetUsageAmount(db, current);
    const remainingNeed = Math.max(0, Number(current.amount || 0) - usedAmount);
    await adjustEnvelopeForBudgetDelta(db, context, {
      envelopeRuleId: current.envelope_rule_id,
      envelopePeriodId: sanitizeText(p.envelope_period_id, 100),
      periodKey: current.period_key,
      delta: remainingNeed,
      reason: "Pendanaan otomatis Kebutuhan yang dipulihkan",
    });
  }
  const next = { ...current, status: "active", ...nextVersionStamp(current, context.actor.user_id) };
  const update = await db.execute("UPDATE budgets SET status='active',row_version=?,updated_by=?,updated_at=? WHERE budget_id=? AND row_version=? AND status='archived'", [next.row_version, next.updated_by, next.updated_at, current.budget_id, current.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Kebutuhan berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "budget", entityId: current.budget_id, previous: publicRow(current), next: { ...publicRow(next), restore_reason: reason } });
  await context.enqueueMirror?.(db, "budget", current.budget_id);
  return publicRow(next);
};
