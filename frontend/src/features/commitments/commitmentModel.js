const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const isDebtCommitment = (type) => type !== "arisan";

export const flatLoanEstimate = ({ originalAmount, totalInstallments, annualRatePercent }) => {
  const original = finiteNumber(originalAmount);
  const periods = Math.max(0, Math.trunc(finiteNumber(totalInstallments)));
  const annualRate = Math.max(0, finiteNumber(annualRatePercent));
  if (original <= 0 || periods <= 0) return { principal: 0, interest: 0, installment: 0 };
  const principal = Math.max(1, Math.round(original / periods));
  const interest = Math.max(0, Math.round(original * annualRate / 100 / 12));
  return { principal, interest, installment: principal + interest };
};

export const inferFlatAnnualRate = ({ originalAmount, totalInstallments, installmentAmount }) => {
  const original = finiteNumber(originalAmount);
  const periods = Math.max(0, Math.trunc(finiteNumber(totalInstallments)));
  const installment = finiteNumber(installmentAmount);
  if (original <= 0 || periods <= 0 || installment <= 0) return 0;
  const principal = Math.max(1, Math.round(original / periods));
  const monthlyInterest = Math.max(0, installment - principal);
  return monthlyInterest * 12 / original * 100;
};

export const applyFlatEstimate = (form, patch = {}) => {
  const next = { ...form, ...patch };
  if (!isDebtCommitment(next.commitment_type) || next.commitment_type === "mortgage") return next;
  const estimate = flatLoanEstimate({
    originalAmount: next.original_amount,
    totalInstallments: next.total_installments,
    annualRatePercent: next.flat_interest_rate,
  });
  return estimate.installment > 0 ? { ...next, installment_amount: String(estimate.installment) } : next;
};
