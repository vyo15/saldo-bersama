const nonNegativeAmount = (value) => Math.max(0, Number(value || 0));

export const summarizeGoals = (items = []) => {
  const active = (Array.isArray(items) ? items : []).filter((item) => item?.status === "active");
  const totals = active.reduce((sum, item) => ({
    current: sum.current + nonNegativeAmount(item.current_amount),
    target: sum.target + nonNegativeAmount(item.target_amount),
    remaining: sum.remaining + nonNegativeAmount(item.remaining_amount),
    monthly: sum.monthly + nonNegativeAmount(item.required_monthly_amount),
    attention: sum.attention + (["behind", "overdue"].includes(item.pace_status) ? 1 : 0),
  }), { current: 0, target: 0, remaining: 0, monthly: 0, attention: 0 });
  return { ...totals, activeCount: active.length };
};
