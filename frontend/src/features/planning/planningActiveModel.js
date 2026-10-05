import { buildPlanningRelationshipResolver, planningBudgetsForAllocation } from "../../shared/workflows/planningRelationships.js";

const ownerKey = (item) => `${String(item?.scope || "shared")}|${String(item?.owner_user_id || "")}`;

const groupByAllocation = (items = [], allocationForItem) => {
  const grouped = new Map();
  for (const item of items || []) {
    const allocation = allocationForItem(item);
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
  const resolver = buildPlanningRelationshipResolver({ allocations: activeAllocations, budgets });
  const activeCommitments = commitments.filter(activeCommitment);
  const expenseRecurringItems = recurringItems.filter(expenseRecurring);
  const commitmentsByAllocation = groupByAllocation(activeCommitments, resolver.allocationForItem);
  const recurringByAllocation = groupByAllocation(expenseRecurringItems, resolver.allocationForItem);

  const allocationRows = activeAllocations.map((allocation) => ({
    id: `allocation:${allocation.envelope_period_id || allocation.envelope_rule_id}`,
    kind: "allocation",
    allocation,
    budgets: planningBudgetsForAllocation(budgets, allocation),
    commitments: commitmentsByAllocation.get(String(allocation.envelope_rule_id || "")) || [],
    recurring: recurringByAllocation.get(String(allocation.envelope_rule_id || "")) || [],
    scope: allocation.scope,
    owner_user_id: allocation.owner_user_id,
    assignee_user_id: allocation.assignee_user_id,
  }));

  const standaloneCommitments = activeCommitments
    .filter((item) => !resolver.allocationForItem(item))
    .map((commitment) => ({
      id: `commitment:${commitment.commitment_id}`,
      kind: "commitment",
      commitment,
      scope: commitment.scope,
      owner_user_id: commitment.owner_user_id,
    }));

  const standaloneRecurring = expenseRecurringItems
    .filter((item) => !item.commitment_id)
    .filter((item) => !resolver.allocationForItem(item))
    .map((recurring) => ({
      id: `recurring:${recurring.occurrence_id || recurring.recurring_rule_id}`,
      kind: "recurring",
      recurring,
      scope: recurring.scope,
      owner_user_id: recurring.owner_user_id,
    }));

  return [...allocationRows, ...standaloneCommitments, ...standaloneRecurring];
};

const searchable = (...values) => values.flat().filter(Boolean).map((value) => String(value)).join(" ");

export const planningActiveSearchText = (row) => {
  if (row.kind === "allocation") return searchable(
    row.allocation?.name,
    row.allocation?.source_account_name,
    (row.budgets || []).flatMap((item) => [item.name, item.category_name]),
    (row.commitments || []).flatMap((item) => [item.name, item.provider, item.commitment_type, item.category_name]),
    (row.recurring || []).flatMap((item) => [item.name, item.category_name]),
  );
  if (row.kind === "commitment") return searchable(row.commitment?.name, row.commitment?.provider, row.commitment?.commitment_type, row.commitment?.category_name, row.commitment?.account_name);
  return searchable(row.recurring?.name, row.recurring?.category_name, row.recurring?.account_name);
};

export const filterPlanningActiveItemsByQuery = (rows = [], query = "") => {
  const normalized = String(query || "").trim().toLocaleLowerCase("id-ID");
  if (!normalized) return rows;
  return rows.filter((row) => planningActiveSearchText(row).toLocaleLowerCase("id-ID").includes(normalized));
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
