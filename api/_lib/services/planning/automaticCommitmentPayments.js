import { todayJakarta } from "../core.js";
import { integrationEnqueuers } from "../integrations.js";
import { payOccurrence } from "./recurringOccurrences.js";
import { refreshRecurringProjectionHorizon } from "./recurringSchedule.js";
import { fundedBudgetCapacity, resolveBudgetEnvelopePeriodForDate, resolveRecurringBudgetForPeriod } from "./recurringBudgetLink.js";

const operationalSkipCodes = new Set([
  "BUDGET_DATE_MISMATCH",
  "BUDGET_ENVELOPE_MISMATCH",
  "BUDGET_INACTIVE",
  "ENVELOPE_DATE_MISMATCH",
  "ENVELOPE_LIMIT",
  "ENVELOPE_SOURCE_ACCOUNT_MISMATCH",
  "INSUFFICIENT_BALANCE",
  "OCCURRENCE_ALREADY_COMPLETE",
  "OVERSPEND_REASON_REQUIRED",
  "POSSIBLE_DUPLICATE",
  "UNALLOCATED_FUNDS_INSUFFICIENT",
]);

const automaticActor = async (db, rule) => {
  if (rule.scope === "personal" && rule.owner_user_id) {
    const personal = await db.one("SELECT * FROM users WHERE user_id=? AND status='active'", [rule.owner_user_id]);
    if (personal) return personal;
  }
  return db.one("SELECT * FROM users WHERE role='owner' AND status='active' ORDER BY created_at,user_id LIMIT 1");
};

const dueCommitmentOccurrences = (db, today) => db.all(`SELECT o.*,r.*,o.row_version AS occurrence_row_version,c.status AS commitment_status,
    c.commitment_type,c.current_balance AS commitment_current_balance,c.original_amount AS commitment_original_amount,
    c.total_installments AS commitment_total_installments,c.installment_amount AS commitment_installment_amount
  FROM recurring_occurrences o
  JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
  JOIN commitments c ON c.commitment_id=r.commitment_id
  WHERE o.due_date<=? AND o.status IN ('expected','overdue') AND o.actual_amount=0
    AND r.status='active' AND r.kind='expense' AND r.budget_id IS NOT NULL
    AND c.status='active'
  ORDER BY o.due_date,o.occurrence_id
  LIMIT 100`, [today]);

const fundedPaymentPlan = async (db, row) => {
  const budget = await resolveRecurringBudgetForPeriod(db, row, row.period_key);
  if (!budget?.envelope_rule_id) return null;
  const envelope = await resolveBudgetEnvelopePeriodForDate(db, budget, row.due_date, row.default_account_id);
  if (!envelope) return null;
  const capacity = await fundedBudgetCapacity(db, budget, envelope);
  const expectedRemaining = Math.max(0, Number(row.expected_amount || 0) - Number(row.actual_amount || 0));
  let amount = expectedRemaining;
  const currentBalance = Math.max(0, Number(row.commitment_current_balance || 0));
  if (row.commitment_type === "arisan" && currentBalance > 0) {
    amount = Math.min(amount, currentBalance);
  } else {
    const original = Math.max(0, Number(row.commitment_original_amount || 0));
    const periods = Math.max(0, Number(row.commitment_total_installments || 0));
    const installment = Math.max(0, Number(row.commitment_installment_amount || row.expected_amount || 0));
    if (currentBalance > 0 && original > 0 && periods > 0) {
      const principal = Math.max(1, Math.round(original / periods));
      const flatInterest = Math.max(0, installment - principal);
      amount = Math.min(amount, currentBalance + flatInterest);
    }
  }
  if (!amount || !capacity.ready || capacity.budgetRemaining < amount || capacity.envelopeRemaining < amount) return null;
  return { amount, budget, envelope };
};

const settleOne = async (db, row, today) => {
  const actor = await automaticActor(db, row);
  if (!actor) return { settled: false, reason: "NO_ACTIVE_ACTOR" };
  const plan = await fundedPaymentPlan(db, row);
  if (!plan) return { settled: false, reason: "FUNDS_NOT_READY" };
  const requestId = `auto-commitment:${row.occurrence_id}:${today}`;
  const baseContext = {
    actor,
    signedActor: null,
    action: "recurring.payOccurrence",
    payload: {},
    rowVersion: row.occurrence_row_version,
    requestId,
    idempotencyKey: requestId,
  };
  const context = { ...baseContext, ...integrationEnqueuers(baseContext) };
  await payOccurrence(db, {
    ...context,
    payload: {
      occurrence_id: row.occurrence_id,
      row_version: row.occurrence_row_version,
      account_id: row.default_account_id,
      amount: plan.amount,
      transaction_date: today,
      envelope_period_id: plan.envelope.envelope_period_id,
    },
  });
  return { settled: true, amount: plan.amount };
};

export const processFundedCommitmentPayments = async (db, { today = todayJakarta() } = {}) => {
  const projection = await refreshRecurringProjectionHorizon(db, { today });
  const candidates = await dueCommitmentOccurrences(db, today);
  const result = { candidates: candidates.length, settled: 0, skipped: 0, amount: 0, skip_reasons: {}, projection };
  for (const row of candidates) {
    try {
      const outcome = await db.transaction((tx) => settleOne(tx, row, today));
      if (outcome.settled) {
        result.settled += 1;
        result.amount += Number(outcome.amount || 0);
      } else {
        result.skipped += 1;
        result.skip_reasons[outcome.reason] = Number(result.skip_reasons[outcome.reason] || 0) + 1;
      }
    } catch (error) {
      if (!operationalSkipCodes.has(error?.code)) throw error;
      result.skipped += 1;
      result.skip_reasons[error.code] = Number(result.skip_reasons[error.code] || 0) + 1;
    }
  }
  return result;
};
