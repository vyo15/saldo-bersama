export const compatiblePlanningNeeds = ({ budgets = [], categoryId = "", accountId = "" } = {}) => (budgets || []).filter((budget) => {
  if (budget?.can_manage === false) return false;
  if (!budget?.budget_id || !budget?.envelope_rule_id || !budget?.envelope_source_account_id) return false;
  if (categoryId && budget.category_id !== categoryId) return false;
  if (accountId && budget.envelope_source_account_id !== accountId) return false;
  return true;
});

export const planningNeedSelectionPatch = ({ budgets = [], categoryId = "", accountId = "", budgetId = "" } = {}) => {
  if (!categoryId) return { budget_id: "", account_id: accountId };
  const categoryCandidates = compatiblePlanningNeeds({ budgets, categoryId });
  const current = categoryCandidates.find((budget) => budget.budget_id === budgetId) || null;
  if (current && (!accountId || current.envelope_source_account_id === accountId)) {
    return { budget_id: current.budget_id, account_id: current.envelope_source_account_id };
  }
  const accountCandidates = accountId ? compatiblePlanningNeeds({ budgets, categoryId, accountId }) : [];
  if (accountCandidates.length === 1) {
    return { budget_id: accountCandidates[0].budget_id, account_id: accountCandidates[0].envelope_source_account_id };
  }
  if (!accountId && categoryCandidates.length === 1) {
    return { budget_id: categoryCandidates[0].budget_id, account_id: categoryCandidates[0].envelope_source_account_id };
  }
  return { budget_id: "", account_id: accountId };
};

export const planningNeedLinkState = ({ budgets = [], categoryId = "", accountId = "", budgetId = "" } = {}) => {
  const categoryCandidates = compatiblePlanningNeeds({ budgets, categoryId });
  const candidates = accountId ? compatiblePlanningNeeds({ budgets, categoryId, accountId }) : categoryCandidates;
  const selected = categoryCandidates.find((budget) => budget.budget_id === budgetId) || null;
  return { categoryCandidates, candidates, selected };
};
