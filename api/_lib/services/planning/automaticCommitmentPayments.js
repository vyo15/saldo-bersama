import { todayJakarta } from "../core.js";
import { accountBalanceAsOf } from "../readModels.js";
import { refreshRecurringProjectionHorizon } from "./recurringSchedule.js";
import { fundedBudgetCapacity, resolveBudgetEnvelopePeriodForDate, resolveRecurringBudgetForPeriod } from "./recurringBudgetLink.js";

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
  `, [today]);

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
  return { amount, budget, envelope, capacity };
};

// Dana dialokasikan != bank sudah membayar. Scheduler hanya melaporkan dana
// siap; pembayaran benar-benar dicatat lewat konfirmasi recurring.payOccurrence.
// Jangan otomatis membuat transaksi atau melunasi kewajiban dari jadwal cron.
export const processFundedCommitmentPayments = async (db, { today = todayJakarta() } = {}) => {
  const projection = await refreshRecurringProjectionHorizon(db, { today });
  const candidates = await dueCommitmentOccurrences(db, today);
  const result = { candidates: candidates.length, ready: 0, ready_amount: 0, settled: 0, skipped: 0, amount: 0, skip_reasons: {}, projection };
  const accountFunds = new Map();
  const budgetFunds = new Map();
  const envelopeFunds = new Map();
  for (const row of candidates) {
    try {
      const plan = await fundedPaymentPlan(db, row);
      let reason = "FUNDS_NOT_READY";
      if (plan) {
        const accountId = row.default_account_id;
        // Different unpaid occurrences can point at the same funded Kebutuhan
        // and Alokasi. Reserve their simulated capacity together or the
        // scheduler could report the same allocated money as ready twice.
        const budgetId = plan.budget.budget_id;
        const envelopeId = plan.envelope.envelope_period_id;
        if (!budgetFunds.has(budgetId)) budgetFunds.set(budgetId, plan.capacity.budgetRemaining);
        if (!envelopeFunds.has(envelopeId)) envelopeFunds.set(envelopeId, plan.capacity.envelopeRemaining);
        const budgetAvailable = budgetFunds.get(budgetId);
        const envelopeAvailable = envelopeFunds.get(envelopeId);
        if (budgetAvailable < plan.amount || envelopeAvailable < plan.amount) {
          result.skipped += 1;
          result.skip_reasons.FUNDED_CAPACITY_RESERVED = Number(result.skip_reasons.FUNDED_CAPACITY_RESERVED || 0) + 1;
          continue;
        }
        if (!accountFunds.has(accountId)) {
          const account = await db.one("SELECT * FROM accounts WHERE account_id=?", [accountId]);
          const available = account?.status === "active" && account.account_type !== "investment"
            ? await accountBalanceAsOf(db, account, today)
            : 0;
          accountFunds.set(accountId, Math.max(0, available));
        }
        const remainingCash = accountFunds.get(accountId);
        if (remainingCash >= plan.amount) {
          accountFunds.set(accountId, remainingCash - plan.amount);
          budgetFunds.set(budgetId, budgetAvailable - plan.amount);
          envelopeFunds.set(envelopeId, envelopeAvailable - plan.amount);
          result.ready += 1;
          result.ready_amount += plan.amount;
          continue;
        }
        reason = "ACCOUNT_FUNDS_NOT_READY";
      }
      result.skipped += 1;
      result.skip_reasons[reason] = Number(result.skip_reasons[reason] || 0) + 1;
    } catch (error) {
      // A corrupted/closed historical item must not mask all later obligations;
      // retain visibility of the individual operational error in scheduler logs.
      result.skipped += 1;
      const code = String(error?.code || "ASSESSMENT_FAILED");
      result.skip_reasons[code] = Number(result.skip_reasons[code] || 0) + 1;
    }
  }
  return result;
};
