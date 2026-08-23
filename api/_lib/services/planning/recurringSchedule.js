import { addDays, monthBounds, nowIso, periodKey, todayJakarta, uuid } from "../core.js";
import { addMonths } from "./shared.js";

export const RECURRING_FREQUENCIES = new Set(["daily", "weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual"]);

// Only reproducible future projections may be regenerated. Historical/cancelled/paid
// occurrences are audit history and must survive schedule edits.
const frequencyMonthStep = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12
};
const datesForRule = (rule, startPeriod, endPeriod) => {
  const startBound = monthBounds(startPeriod).start;
  const endBound = monthBounds(endPeriod).end;
  const ruleStart = rule.start_date;
  const ruleEnd = rule.end_date || "9999-12-31";
  const lower = ruleStart > startBound ? ruleStart : startBound;
  const upper = ruleEnd < endBound ? ruleEnd : endBound;
  if (lower > upper) return [];
  const dates = [];
  if (["daily", "weekly", "biweekly"].includes(rule.frequency)) {
    const step = rule.frequency === "daily" ? 1 : rule.frequency === "weekly" ? 7 : 14;
    let cursor = rule.start_date;
    while (cursor < lower) cursor = addDays(cursor, step);
    while (cursor <= upper) {
      dates.push(cursor);
      cursor = addDays(cursor, step);
    }
    return dates;
  }
  const step = frequencyMonthStep[rule.frequency] || 1;
  const [sy, sm] = rule.start_date.split("-").map(Number);
  const [ey, em] = endPeriod.split("-").map(Number);
  let index = 0;
  while (index < 600) {
    const total = sm - 1 + index * step;
    const year = sy + Math.floor(total / 12);
    const month = (total % 12 + 12) % 12 + 1;
    if (year > ey || year === ey && month > em) break;
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const due = `${year}-${String(month).padStart(2, "0")}-${String(Math.min(Number(rule.due_day), last)).padStart(2, "0")}`;
    if (due >= lower && due <= upper) dates.push(due);
    index += 1;
  }
  return dates;
};
export const ensureRuleOccurrences = async (db, rule, {
  monthsAhead = 24
} = {}) => {
  const current = periodKey();
  const end = addMonths(`${current}-01`, monthsAhead).slice(0, 7);
  const dates = datesForRule(rule, current, end);
  const now = nowIso();
  for (const due of dates) {
    const existing = await db.one("SELECT occurrence_id FROM recurring_occurrences WHERE recurring_rule_id=? AND due_date=?", [rule.recurring_rule_id, due]);
    if (existing) continue;
    const occurrence = {
      occurrence_id: uuid(),
      recurring_rule_id: rule.recurring_rule_id,
      period_key: due.slice(0, 7),
      due_date: due,
      expected_amount: rule.expected_amount,
      actual_amount: 0,
      status: due < todayJakarta() ? "overdue" : "expected",
      transaction_ids_json: "[]",
      row_version: 1,
      created_at: now,
      updated_at: now
    };
    await db.execute("INSERT INTO recurring_occurrences(occurrence_id,recurring_rule_id,period_key,due_date,expected_amount,actual_amount,status,transaction_ids_json,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)", Object.values(occurrence));
  }
};
export const recurringScheduleChanged = (current, next) => ["frequency", "due_day", "start_date", "end_date", "expected_amount", "status"].some(field => String(current[field] ?? "") !== String(next[field] ?? ""));
export const enqueueRecurringRuleSync = async (db, context, ruleId) => {
  await context.enqueueCalendar?.(db, "recurring", ruleId);
  await context.enqueueMirror?.(db, "recurring", ruleId);
};

export const enqueueRecurringOccurrenceSync = async (db, context, occurrence) => {
  await context.enqueueCalendar?.(db, "recurring_occurrence", occurrence.occurrence_id);
  await context.enqueueMirror?.(db, "recurring", occurrence.recurring_rule_id);
};
