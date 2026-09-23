const ownerKey = (item) => `${String(item?.scope || "shared")}|${String(item?.owner_user_id || "")}`;

const activeAllocationBudgetMap = (allocations = [], budgets = []) => {
  const allocationByRule = new Map((allocations || []).map((item) => [String(item.envelope_rule_id || ""), item]));
  const budgetToAllocation = new Map();
  for (const budget of budgets || []) {
    const allocation = allocationByRule.get(String(budget.envelope_rule_id || ""));
    if (allocation && budget?.budget_id) budgetToAllocation.set(String(budget.budget_id), allocation);
  }
  return budgetToAllocation;
};

const groupByAllocation = (items = [], budgetToAllocation) => {
  const grouped = new Map();
  for (const item of items || []) {
    const allocation = budgetToAllocation.get(String(item?.budget_id || ""));
    if (!allocation) continue;
    const key = String(allocation.envelope_rule_id || "");
    const current = grouped.get(key) || [];
    current.push(item);
    grouped.set(key, current);
  }
  return grouped;
};

const activeRule = (item) => String(item?.rule_status || "active") === "active";
const expenseRecurring = (item) => item?.kind === "expense" && activeRule(item);
const activeCommitment = (item) => item?.status === "active";

export const buildPlanningActiveItems = ({ allocations = [], budgets = [], recurringItems = [], commitments = [] } = {}) => {
  const activeAllocations = allocations.filter((item) => item?.status === "active");
  const budgetToAllocation = activeAllocationBudgetMap(activeAllocations, budgets);
  const activeCommitments = commitments.filter(activeCommitment);
  const expenseRecurringItems = recurringItems.filter(expenseRecurring);
  const commitmentsByAllocation = groupByAllocation(activeCommitments, budgetToAllocation);
  const recurringByAllocation = groupByAllocation(expenseRecurringItems, budgetToAllocation);

  const allocationRows = activeAllocations.map((allocation) => ({
    id: `allocation:${allocation.envelope_period_id || allocation.envelope_rule_id}`,
    kind: "allocation",
    allocation,
    commitments: commitmentsByAllocation.get(String(allocation.envelope_rule_id || "")) || [],
    recurring: recurringByAllocation.get(String(allocation.envelope_rule_id || "")) || [],
    scope: allocation.scope,
    owner_user_id: allocation.owner_user_id,
    assignee_user_id: allocation.assignee_user_id,
  }));

  const standaloneCommitments = activeCommitments
    .filter((item) => !budgetToAllocation.has(String(item.budget_id || "")))
    .map((commitment) => ({
      id: `commitment:${commitment.commitment_id}`,
      kind: "commitment",
      commitment,
      scope: commitment.scope,
      owner_user_id: commitment.owner_user_id,
    }));

  const standaloneRecurring = expenseRecurringItems
    .filter((item) => !item.commitment_id)
    .filter((item) => !budgetToAllocation.has(String(item.budget_id || "")))
    .map((recurring) => ({
      id: `recurring:${recurring.occurrence_id || recurring.recurring_rule_id}`,
      kind: "recurring",
      recurring,
      scope: recurring.scope,
      owner_user_id: recurring.owner_user_id,
    }));

  return [...allocationRows, ...standaloneCommitments, ...standaloneRecurring];
};

export const planningActiveOwnership = (rows = [], actor = null) => {
  const actorId = String(actor?.user_id || "");
  if (!actorId) return { showFilter: false, hasShared: false, hasMine: false };
  const hasShared = rows.some((row) => row.kind === "allocation" ? !row.assignee_user_id : ownerKey(row) === "shared|");
  const hasMine = rows.some((row) => row.kind === "allocation"
    ? String(row.assignee_user_id || "") === actorId
    : String(row.owner_user_id || "") === actorId);
  return { showFilter: hasShared && hasMine, hasShared, hasMine };
};

export const filterPlanningActiveItems = (rows = [], filter = "all", actor = null) => {
  if (filter === "all") return rows;
  const actorId = String(actor?.user_id || "");
  if (filter === "shared") return rows.filter((row) => row.kind === "allocation" ? !row.assignee_user_id : ownerKey(row) === "shared|");
  if (filter === "mine" && actorId) return rows.filter((row) => row.kind === "allocation"
    ? String(row.assignee_user_id || "") === actorId
    : String(row.owner_user_id || "") === actorId);
  return rows;
};
