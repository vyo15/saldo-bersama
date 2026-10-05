const sameOwnership = (left, right) => String(left?.scope || "") === String(right?.scope || "")
  && String(left?.owner_user_id || "") === String(right?.owner_user_id || "");

export const planningBudgetsForAllocation = (budgets = [], allocation = null) => allocation
  ? (budgets || []).filter((budget) => budget.envelope_rule_id === allocation.envelope_rule_id)
  : [];

const explicitAllocationForItem = (item, budgetToAllocation) => budgetToAllocation.get(String(item?.budget_id || "")) || null;

const legacyAllocationForItem = ({ item, allocations, budgets }) => {
  if (!item?.category_id || !item?.default_account_id) return null;
  const candidates = [];
  for (const allocation of allocations || []) {
    if (!allocation?.source_account_id || allocation.source_account_id !== item.default_account_id) continue;
    if (!sameOwnership(allocation, item)) continue;
    const matchingBudgets = planningBudgetsForAllocation(budgets, allocation)
      .filter((budget) => budget?.category_id === item.category_id);
    if (matchingBudgets.length) candidates.push(allocation);
  }
  return candidates.length === 1 ? candidates[0] : null;
};

export const buildPlanningRelationshipResolver = ({ allocations = [], budgets = [] } = {}) => {
  const allocationByRule = new Map((allocations || []).map((item) => [String(item.envelope_rule_id || ""), item]));
  const budgetToAllocation = new Map();
  for (const budget of budgets || []) {
    const allocation = allocationByRule.get(String(budget?.envelope_rule_id || ""));
    if (allocation && budget?.budget_id) budgetToAllocation.set(String(budget.budget_id), allocation);
  }

  const allocationForItem = (item, { allowLegacyFallback = true } = {}) => explicitAllocationForItem(item, budgetToAllocation)
    || (allowLegacyFallback && !item?.budget_id ? legacyAllocationForItem({ item, allocations, budgets }) : null);

  return { budgetToAllocation, allocationForItem };
};
