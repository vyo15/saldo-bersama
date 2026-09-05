import { SchedulePeriodSection, ScheduleSummary } from "./RecurringSchedule.jsx";
import { scheduleMatchesFilter } from "./recurringPresentation.js";

const RecurringScheduleView = ({
  allItems,
  filteredItems,
  kind,
  setKind,
  filter,
  setFilter,
  actions,
  expandedId,
  setExpandedId,
  accounts,
  categories,
  budgets,
  canCreate,
}) => <>
  {allItems.length ? <ScheduleSummary items={allItems} onAttention={() => {
    const attentionItem = allItems.find((item) => scheduleMatchesFilter(item, "attention"));
    setFilter("attention");
    if (attentionItem) setKind(attentionItem.kind === "income" ? "income" : "expense");
    setExpandedId(null);
  }} /> : null}
  <SchedulePeriodSection
    items={filteredItems}
    allItems={allItems}
    kind={kind}
    setKind={setKind}
    filter={filter}
    setFilter={setFilter}
    actions={actions}
    expandedId={expandedId}
    setExpandedId={setExpandedId}
    accounts={accounts}
    categories={categories}
    budgets={budgets}
    canCreate={canCreate}
  />
</>;

export default RecurringScheduleView;
