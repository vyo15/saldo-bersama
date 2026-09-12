import { appendAudit } from "../audit.js";
import { appError, assertVersion, normalizeOwnedScope, nowIso, periodKey, positiveInteger, publicRow, sanitizeText, todayJakarta, uuid } from "../core.js";
import { newVersionStamp, nextVersionStamp } from "../versioning.js";
import { createRecurringRule } from "./recurring.js";
import { adjustEnvelopeForBudgetDelta } from "./budgetFunding.js";
import { assertEnvelopeAssigneeAccess, assertPlanningManageScope } from "./shared.js";
import { BUDGET_IDENTITY_SQL, budgetIdentityArgs, budgetUsageAmount } from "./budgetShared.js";

export const copyEnvelopeNeedsToPeriod = async (db, context, { envelopeRuleId, sourcePeriodKey, targetPeriodKey }) => {
  const sourcePeriod = periodKey(sourcePeriodKey);
  const targetPeriod = periodKey(targetPeriodKey);
  if (sourcePeriod === targetPeriod) return { copied: 0, skipped: 0, copied_amount: 0, source_period_key: sourcePeriod, target_period_key: targetPeriod };
  const sourceItems = await db.all(`SELECT q.* FROM (
      SELECT b.* FROM budgets b WHERE b.period_key=? AND b.envelope_rule_id=? AND b.status='active'
      UNION ALL
      SELECT h.budget_id,h.period_key,h.category_id,h.envelope_rule_id,h.name,h.amount,h.warning_threshold,'active' AS status,h.row_version,h.created_by,h.created_at,h.updated_by,h.updated_at,h.scope,h.owner_user_id,h.released_amount,h.ended_reason,h.ended_by,h.ended_at,h.recording_mode
      FROM budget_history h WHERE h.period_key=? AND h.envelope_rule_id=? AND h.final_status='closed'
    ) q JOIN categories c ON c.category_id=q.category_id
    WHERE c.status='active' AND c.transaction_type='expense'
    ORDER BY q.budget_id`, [sourcePeriod, envelopeRuleId, sourcePeriod, envelopeRuleId]);
  let copied = 0;
  let skipped = 0;
  let copiedAmount = 0;
  for (const current of sourceItems) {
    const identityArgs = budgetIdentityArgs({
      period_key: targetPeriod,
      name: current.name,
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
      recording_mode: current.recording_mode || "flexible",
    };
    await db.execute("INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id,recording_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [next.budget_id,next.period_key,next.category_id,next.envelope_rule_id,next.name,next.amount,next.warning_threshold,next.status,next.row_version,next.created_by,next.created_at,next.updated_by,next.updated_at,next.scope,next.owner_user_id,next.recording_mode]);
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
    name: item.name,
    scope: owned.scope,
    owner_user_id: owned.owner_user_id,
    envelope_rule_id: envelopeRuleId,
  };
  const exact = await db.one(`SELECT * FROM budgets WHERE ${BUDGET_IDENTITY_SQL}`, budgetIdentityArgs(identity));
  if (exact) throw appError("BUDGET_ALREADY_EXISTS", "Nama kebutuhan ini sudah dipakai pada Alokasi Dana tersebut.", 409, { name: item.name });
  const legacy = await db.one(
    "SELECT * FROM budgets WHERE period_key=? AND category_id=? AND lower(trim(name))=lower(trim(?)) AND scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'') AND envelope_rule_id IS NULL",
    [period, item.category_id, item.name, owned.scope, owned.owner_user_id],
  );
  if (!legacy) return null;
  assertVersion(legacy, item.row_version);
  return legacy;
};

const recurringContextForBudgetBatch = (context, payload) => ({ ...context, payload, rowVersion: null });

const normalizeBudgetRecordingMode = (value, { allowEmpty = false } = {}) => {
  const requested = String(value || (allowEmpty ? "" : "flexible"));
  const normalized = requested === "scheduled" ? "recurring" : requested;
  if (normalized && !["flexible", "fixed_once", "recurring"].includes(normalized)) {
    throw appError("INVALID_BUDGET_RECORDING_MODE", "Pola kebutuhan tidak valid.", 400);
  }
  return normalized;
};

const normalizeBudgetBatchItem = (rawItem, index, seenNames) => {
  const item = rawItem || {};
  const categoryId = sanitizeText(item.category_id, 100);
  if (!categoryId) throw appError("INVALID_CATEGORY", `Kategori kebutuhan ${index + 1} belum dipilih.`, 400);
  const name = sanitizeText(item.name, 100);
  if (!name) throw appError("BUDGET_NAME_REQUIRED", `Nama kebutuhan ${index + 1} belum diisi.`, 400);
  const nameKey = name.toLocaleLowerCase("id-ID");
  if (seenNames.has(nameKey)) throw appError("BUDGET_BATCH_DUPLICATE_NAME", "Nama kebutuhan yang sama tidak dapat ditambahkan dua kali ke Alokasi Dana yang sama.", 409, { name });
  seenNames.add(nameKey);
  return {
    name,
    category_id: categoryId,
    amount: positiveInteger(item.amount, `Nominal kebutuhan ${index + 1}`),
    warning_threshold: Math.min(100, Math.max(1, Number(item.warning_threshold || 80))),
    row_version: item.row_version ?? null,
    recording_mode: normalizeBudgetRecordingMode(item.recording_mode),
    schedule_frequency: sanitizeText(item.schedule_frequency || "monthly", 30),
    schedule_due_day: item.schedule_due_day ?? 20,
    schedule_start_date: item.schedule_start_date || todayJakarta(),
    schedule_payment_method: sanitizeText(item.schedule_payment_method || "transfer", 40),
  };
};

const normalizeBudgetBatchItems = (rawItems) => {
  if (!rawItems.length) throw appError("BUDGET_BATCH_EMPTY", "Tambahkan minimal satu kebutuhan.", 400);
  if (rawItems.length > BUDGET_BATCH_LIMIT) throw appError("BUDGET_BATCH_LIMIT", `Maksimal ${BUDGET_BATCH_LIMIT} kebutuhan dapat disimpan sekaligus.`, 400);
  const seenNames = new Set();
  return rawItems.map((item, index) => normalizeBudgetBatchItem(item, index, seenNames));
};

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
  const items = normalizeBudgetBatchItems(rawItems);

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
        name: item.name,
        category_id: category.category_id,
        recording_mode: item.recording_mode,
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
    if (item.recording_mode === "recurring") {
      schedule = await createRecurringRule(db, recurringContextForBudgetBatch(context, {
        name: item.name || category.name || "Pembayaran rutin",
        kind: "expense",
        category_id: category.category_id,
        expected_amount: item.amount,
        frequency: item.schedule_frequency,
        due_day: item.schedule_due_day,
        default_account_id: envelope.source_account_id,
        payment_method: item.schedule_payment_method,
        start_date: item.schedule_start_date,
        auto_debit: false,
        budget_id: budget.budget_id,
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

const assertBudgetCurrentScope = (current, period, owned) => {
  if (!current) return;
  if (current.period_key !== period || current.scope !== owned.scope || String(current.owner_user_id || "") !== String(owned.owner_user_id || "")) {
    throw appError("BUDGET_SCOPE_MISMATCH", "Kebutuhan tidak cocok dengan periode atau kepemilikan yang dipilih.", 409);
  }
};

const assertBudgetEnvelopeImmutable = (current, explicitBudgetId, envelopeRuleId) => {
  if (!current || !explicitBudgetId) return;
  if (String(current.envelope_rule_id || "") !== String(envelopeRuleId || "")) {
    throw appError("BUDGET_ENVELOPE_IMMUTABLE", "Alokasi Dana kebutuhan yang sudah tersimpan tidak dapat dipindahkan melalui edit.", 409);
  }
};

const assertBudgetCurrentUsable = (current, categoryId) => {
  if (!current) return;
  if (current.category_id !== categoryId) throw appError("BUDGET_CATEGORY_IMMUTABLE", "Kategori kebutuhan yang sudah tersimpan tidak dapat diubah. Buat kebutuhan baru bila kategorinya berbeda.", 409);
  if (current.status !== "active") {
    throw appError("BUDGET_ENDED", "Kebutuhan ini sudah dihentikan pada periode yang sama. Histori tidak akan ditimpa; Administrator dapat memulihkannya bila memang diperlukan.", 409, { budgetId: current.budget_id });
  }
};

const findBudgetForUpsert = async (db, { p, period, owned, envelopeRuleId, category, name }) => {
  const explicitBudgetId = sanitizeText(p.budget_id, 100);
  let current = explicitBudgetId ? await db.one("SELECT * FROM budgets WHERE budget_id=?", [explicitBudgetId]) : null;
  if (explicitBudgetId && !current) throw appError("NOT_FOUND", "Kebutuhan tidak ditemukan.", 404);
  assertBudgetCurrentScope(current, period, owned);
  assertBudgetEnvelopeImmutable(current, explicitBudgetId, envelopeRuleId);

  const identityArgs = budgetIdentityArgs({ period_key: period, name, scope: owned.scope, owner_user_id: owned.owner_user_id, envelope_rule_id: envelopeRuleId });
  if (current) {
    const duplicateByName = await db.one(
      `SELECT budget_id FROM budgets WHERE budget_id<>? AND status='active' AND ${BUDGET_IDENTITY_SQL} LIMIT 1`,
      [current.budget_id, ...identityArgs],
    );
    if (duplicateByName) throw appError("BUDGET_ALREADY_EXISTS", "Nama kebutuhan ini sudah dipakai pada Alokasi Dana tersebut.", 409, { name });
  }
  if (!current) current = await db.one(`SELECT * FROM budgets WHERE ${BUDGET_IDENTITY_SQL}`, identityArgs);
  if (!current && envelopeRuleId) {
    current = await db.one(
      "SELECT * FROM budgets WHERE period_key=? AND category_id=? AND lower(trim(name))=lower(trim(?)) AND scope=? AND COALESCE(owner_user_id,'')=COALESCE(?,'') AND envelope_rule_id IS NULL",
      [period, category.category_id, name, owned.scope, owned.owner_user_id],
    );
  }
  assertBudgetCurrentUsable(current, category.category_id);
  return current;
};

const persistBudgetUpsert = async (db, context, { current, period, category, owned, envelopeRuleId, name, amount, normalizedMode, threshold, now, rowVersion }) => {
  if (current) {
    assertVersion(current, rowVersion);
    const next = {
      ...current,
      envelope_rule_id: envelopeRuleId,
      name,
      amount,
      recording_mode: normalizedMode || current.recording_mode || "flexible",
      warning_threshold: threshold,
      status: "active",
      ...nextVersionStamp(current, context.actor.user_id, now),
    };
    const result = await db.execute("UPDATE budgets SET envelope_rule_id=?,name=?,amount=?,warning_threshold=?,recording_mode=?,status='active',row_version=?,updated_by=?,updated_at=? WHERE budget_id=? AND row_version=?", [next.envelope_rule_id, next.name, amount, threshold, next.recording_mode, next.row_version, next.updated_by, next.updated_at, current.budget_id, current.row_version]);
    if (result.rowsAffected !== 1) throw appError("CONFLICT", "Kebutuhan berubah di perangkat lain.", 409);
    return next;
  }

  const next = {
    budget_id: uuid(),
    period_key: period,
    category_id: category.category_id,
    envelope_rule_id: envelopeRuleId,
    name,
    amount,
    recording_mode: normalizedMode || "flexible",
    warning_threshold: threshold,
    status: "active",
    ...newVersionStamp(context.actor.user_id, now),
    scope: owned.scope,
    owner_user_id: owned.owner_user_id,
  };
  await db.execute("INSERT INTO budgets(budget_id,period_key,category_id,envelope_rule_id,name,amount,warning_threshold,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id,recording_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [next.budget_id,next.period_key,next.category_id,next.envelope_rule_id,next.name,next.amount,next.warning_threshold,next.status,next.row_version,next.created_by,next.created_at,next.updated_by,next.updated_at,next.scope,next.owner_user_id,next.recording_mode]);
  return next;
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
  const name = sanitizeText(p.name || category.name, 100);
  const normalizedMode = normalizeBudgetRecordingMode(p.recording_mode, { allowEmpty: true });
  const current = await findBudgetForUpsert(db, { p, period, owned, envelopeRuleId, category, name });
  const amount = positiveInteger(p.amount, "Anggaran kebutuhan");
  const threshold = Math.min(100, Math.max(1, Number(p.warning_threshold || 80)));
  await syncBudgetFundingForUpsert(db, context, {
    current,
    envelopeRuleId,
    envelopePeriodId: sanitizeText(p.envelope_period_id, 100),
    period,
    amount,
  });
  const next = await persistBudgetUpsert(db, context, {
    current,
    period,
    category,
    owned,
    envelopeRuleId,
    name,
    amount,
    normalizedMode,
    threshold,
    now: nowIso(),
    rowVersion: context.rowVersion ?? p.row_version,
  });
  await appendAudit(db, context, {
    entityType: "budget",
    entityId: next.budget_id,
    previous: current ? publicRow(current) : null,
    next: publicRow(next)
  });
  await context.enqueueMirror?.(db, "budget", next.budget_id);
  return publicRow(next);
};
