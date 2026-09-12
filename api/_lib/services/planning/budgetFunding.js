import { accountAllocatedRemaining, accountBalanceAsOf } from "../readModels.js";
import { appError, monthBounds, nowIso, publicRow, sanitizeText, todayJakarta } from "../core.js";
import { appendAudit } from "../audit.js";
import { nextVersionStamp } from "../versioning.js";
import { accountWithAccess, assertEnvelopeAssigneeAccess, assertOperationalPlanningAccount, assertPlanningManageScope } from "./shared.js";

const fundingPeriodRow = async (db, { envelopeRuleId, periodKey, envelopePeriodId = "" }) => {
  if (envelopePeriodId) {
    const exact = await db.one(`SELECT p.*,r.scope,r.owner_user_id,r.assignee_user_id,r.source_account_id,r.status AS rule_status
      FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
      WHERE p.envelope_period_id=? AND p.envelope_rule_id=? AND p.status='active' AND r.status='active'`, [envelopePeriodId, envelopeRuleId]);
    if (!exact) throw appError("BUDGET_ENVELOPE_PERIOD_INVALID", "Periode Alokasi Dana untuk Kebutuhan tidak ditemukan atau sudah tidak aktif.", 409);
    return exact;
  }
  const bounds = monthBounds(periodKey);
  const rows = await db.all(`SELECT p.*,r.scope,r.owner_user_id,r.assignee_user_id,r.source_account_id,r.status AS rule_status
    FROM envelope_periods p JOIN envelope_rules r ON r.envelope_rule_id=p.envelope_rule_id
    WHERE p.envelope_rule_id=? AND p.status='active' AND r.status='active'
      AND p.period_start<=? AND p.period_end>=?
    ORDER BY p.period_start DESC,p.envelope_period_id`, [envelopeRuleId, bounds.end, bounds.start]);
  if (!rows.length) throw appError("BUDGET_ENVELOPE_PERIOD_MISSING", "Periode aktif Alokasi Dana belum tersedia untuk Kebutuhan ini.", 409);
  if (rows.length > 1) throw appError("BUDGET_ENVELOPE_PERIOD_REQUIRED", "Pilih periode Alokasi Dana yang akan digunakan sebelum menyimpan Kebutuhan.", 409);
  return rows[0];
};

const assertFundingAvailable = async (db, account, amount) => {
  const balance = await accountBalanceAsOf(db, account, todayJakarta());
  const allocatedRemaining = await accountAllocatedRemaining(db, account.account_id);
  const availableAmount = balance - allocatedRemaining;
  if (amount <= availableAmount) return { balance, allocatedRemaining, availableAmount };
  const shortageAmount = Math.max(0, amount - availableAmount);
  throw appError(
    "BUDGET_FUNDING_INSUFFICIENT",
    `Dana belum mencukupi Rp ${shortageAmount.toLocaleString("id-ID")}. Kebutuhan memerlukan tambahan Rp ${amount.toLocaleString("id-ID")}, sementara dana yang tersedia Rp ${Math.max(0, availableAmount).toLocaleString("id-ID")}. Tambahkan saldo atau kurangi nominal Kebutuhan.`,
    409,
    { requiredAmount: amount, availableAmount, shortageAmount, accountBalance: balance, allocatedRemaining },
  );
};


const budgetUsedAmount = async (db, budget) => {
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
      AND (
        t.budget_id=?
        OR (t.budget_id IS NULL AND (? IS NULL OR ep.envelope_rule_id=?))
      )`, [
    bounds.start, bounds.end, budget.category_id, budget.scope, budget.owner_user_id, budget.budget_id,
    budget.envelope_rule_id || null, budget.envelope_rule_id || null,
  ]);
  return Math.max(0, Number(row?.used || 0));
};

const activeBudgetRemainingNeeds = async (db, { envelopeRuleId, periodKey, excludeBudgetId = null }) => {
  const budgets = await db.all(`SELECT * FROM budgets
    WHERE period_key=? AND envelope_rule_id=? AND status='active'
      ${excludeBudgetId ? "AND budget_id<>?" : ""}
    ORDER BY budget_id`, [periodKey, envelopeRuleId, ...(excludeBudgetId ? [excludeBudgetId] : [])]);
  let total = 0;
  for (const budget of budgets) {
    const used = await budgetUsedAmount(db, budget);
    total += Math.max(0, Number(budget.amount || 0) - used);
  }
  return total;
};

const envelopeCommittedAmount = async (db, period) => {
  const usage = await db.one("SELECT COALESCE(SUM(amount),0) AS used FROM transactions WHERE status='active' AND transaction_type='expense' AND envelope_period_id=?", [period.envelope_period_id]);
  return Math.max(0, Number(period.reserved_amount || 0)) + Math.max(0, Number(usage?.used || 0));
};

const updateFundingPeriod = async (db, context, period, nextAmount, adjustment) => {
  if (nextAmount === Number(period.allocated_amount || 0) || adjustment.amount <= 0) return { period: publicRow(period), ...adjustment };
  const timestamp = nowIso();
  const next = { ...period, allocated_amount: nextAmount, ...nextVersionStamp(period, context.actor.user_id, timestamp) };
  const result = await db.execute(
    "UPDATE envelope_periods SET allocated_amount=?,row_version=?,updated_by=?,updated_at=? WHERE envelope_period_id=? AND row_version=? AND status='active'",
    [next.allocated_amount, next.row_version, next.updated_by, next.updated_at, period.envelope_period_id, period.row_version],
  );
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Alokasi berubah di perangkat lain. Muat ulang lalu coba lagi.", 409);
  await appendAudit(db, context, {
    entityType: "envelope_period",
    entityId: period.envelope_period_id,
    previous: publicRow(period),
    next: { ...publicRow(next), allocation_adjustment: adjustment },
  });
  await context.enqueueMirror?.(db, "envelope", period.envelope_period_id);
  return { period: publicRow(next), ...adjustment };
};

export const adjustEnvelopeForBudgetDelta = async (db, context, {
  envelopeRuleId,
  envelopePeriodId = "",
  periodKey,
  delta,
  reason = "Penyesuaian otomatis dari Kebutuhan",
}) => {
  const normalizedDelta = Number(delta || 0);
  if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) return { direction: "none", amount: 0, requestedAmount: 0 };
  const period = await fundingPeriodRow(db, { envelopeRuleId, periodKey, envelopePeriodId: sanitizeText(envelopePeriodId, 100) });
  assertPlanningManageScope(context.actor, period, { allowOwnedPersonal: true });
  assertEnvelopeAssigneeAccess(context.actor, period);
  const account = await accountWithAccess(db, context.actor, period.source_account_id);
  assertOperationalPlanningAccount(account, "Alokasi Dana");

  if (normalizedDelta > 0) {
    await assertFundingAvailable(db, account, normalizedDelta);
    return updateFundingPeriod(db, context, period, Number(period.allocated_amount || 0) + normalizedDelta, {
      direction: "fund",
      amount: normalizedDelta,
      requestedAmount: normalizedDelta,
      reason: sanitizeText(reason, 180),
      automatic: true,
      source: "budget",
    });
  }

  const requestedAmount = Math.abs(normalizedDelta);
  const committed = await envelopeCommittedAmount(db, period);
  const removable = Math.max(0, Number(period.allocated_amount || 0) - committed);
  const amount = Math.min(requestedAmount, removable);
  if (amount <= 0) return { period: publicRow(period), direction: "release", amount: 0, requestedAmount, removableAmount: removable };
  return updateFundingPeriod(db, context, period, Number(period.allocated_amount || 0) - amount, {
    direction: "release",
    amount,
    requestedAmount,
    removableAmount: removable,
    reason: sanitizeText(reason, 180),
    automatic: true,
    source: "budget",
  });
};

const budgetRemovalAdjustment = async (db, context, {
  budget,
  envelopePeriodId = "",
  requestedAmount = null,
  reason = "Sisa dana Kebutuhan dikembalikan otomatis",
}) => {
  if (!budget?.envelope_rule_id) return { period: null, direction: "none", amount: 0, requestedAmount: 0 };
  const period = await fundingPeriodRow(db, {
    envelopeRuleId: budget.envelope_rule_id,
    periodKey: budget.period_key,
    envelopePeriodId: sanitizeText(envelopePeriodId, 100),
  });
  assertPlanningManageScope(context.actor, period, { allowOwnedPersonal: true });
  assertEnvelopeAssigneeAccess(context.actor, period);
  const account = await accountWithAccess(db, context.actor, period.source_account_id);
  assertOperationalPlanningAccount(account, "Alokasi Dana");

  const [usedAmount, otherRemainingNeeds, committed] = await Promise.all([
    budgetUsedAmount(db, budget),
    activeBudgetRemainingNeeds(db, { envelopeRuleId: budget.envelope_rule_id, periodKey: budget.period_key, excludeBudgetId: budget.budget_id }),
    envelopeCommittedAmount(db, period),
  ]);
  const currentRemainingNeed = Math.max(0, Number(budget.amount || 0) - usedAmount);
  const normalizedRequested = requestedAmount === null
    ? currentRemainingNeed
    : Math.min(currentRemainingNeed, Math.max(0, Number(requestedAmount || 0)));
  const currentPool = Math.max(0, Number(period.allocated_amount || 0) - committed);
  // Buffer is the portion of the free pool that exceeds all currently planned remaining needs.
  // Preserve it when a single need is removed so an intentional contingency reserve is never swept away.
  const inferredBuffer = Math.max(0, currentPool - otherRemainingNeeds - currentRemainingNeed);
  const releasableWithoutTouchingOtherNeeds = Math.max(0, currentPool - otherRemainingNeeds - inferredBuffer);
  const amount = Math.min(normalizedRequested, releasableWithoutTouchingOtherNeeds);
  return {
    period,
    direction: "release",
    amount,
    requestedAmount: normalizedRequested,
    removableAmount: releasableWithoutTouchingOtherNeeds,
    currentRemainingNeed,
    otherRemainingNeeds,
    inferredBuffer,
    reason: sanitizeText(reason, 180),
    automatic: true,
    source: "budget",
  };
};

export const releaseEnvelopeForBudgetRemoval = async (db, context, options) => {
  const adjustment = await budgetRemovalAdjustment(db, context, options);
  const { period, ...result } = adjustment;
  if (!period || result.amount <= 0) return { ...(period ? { period: publicRow(period) } : {}), ...result };
  return updateFundingPeriod(db, context, period, Number(period.allocated_amount || 0) - result.amount, result);
};
