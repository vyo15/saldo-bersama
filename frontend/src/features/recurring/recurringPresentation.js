const COMPLETED_STATUSES = new Set(["paid", "received"]);
const ATTENTION_STATUSES = new Set(["overdue", "late", "partial"]);
const OPEN_STATUSES = new Set(["expected", "partial", "overdue", "late", "scheduled"]);

export const scheduleMatchesFilter = (item, filter) => {
  if (filter === "attention") return ATTENTION_STATUSES.has(item.status);
  if (filter === "open") return OPEN_STATUSES.has(item.status);
  if (filter === "done") return COMPLETED_STATUSES.has(item.status);
  if (filter === "cancelled") return item.status === "cancelled";
  return true;
};
