import { buildPlanningRelationshipResolver, planningBudgetsForAllocation } from "../../shared/workflows/planningRelationships.js";

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

// Penerima Alokasi berbeda dari pemilik rekening sumber. Data pribadi lama bisa
// belum memiliki assignee_user_id, sehingga owner_user_id menjadi fallback.
export const planningRowAudience = (row, actor = null) => {
  const actorId = String(actor?.user_id || "");
  const recipientId = row.kind === "allocation"
    ? String(row.assignee_user_id || (row.scope === "personal" ? row.owner_user_id || "" : ""))
    : String(row.scope === "personal" ? row.owner_user_id || "" : "");
  if (!recipientId) return "shared";
  if (!actorId) return "partner";
  return recipientId === actorId ? "mine" : "partner";
};

export const planningActiveOwnership = (rows = [], actor = null) => {
  if (!actor?.user_id) return { showFilter: false, hasShared: false, hasMine: false, hasPartner: false };
  const groups = new Set(rows.map((row) => planningRowAudience(row, actor)));
  return {
    showFilter: groups.size > 1,
    hasShared: groups.has("shared"),
    hasMine: groups.has("mine"),
    hasPartner: groups.has("partner"),
  };
};

export const filterPlanningActiveItems = (rows = [], filter = "all", actor = null) => {
  if (filter === "all" || !["shared", "mine", "partner"].includes(filter)) return rows;
  if (!actor?.user_id && filter !== "shared") return rows;
  return rows.filter((row) => planningRowAudience(row, actor) === filter);
};
