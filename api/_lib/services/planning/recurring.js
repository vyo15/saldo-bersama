import { appendAudit } from "../audit.js";
import { cancelTransactionInternal, createTransactionInternal, assertTransactionDateUnlocked } from "../finance.js";
import { addDays, appError, assertOwner, assertVersion, dateValue, normalizeOwnedScope, nowIso, periodKey, positiveInteger, publicRow, sanitizeText, strictBoolean, todayJakarta, uuid, visibleAccountSql, visibleScopeSql } from "../core.js";
import { addMonths, accountWithAccess, dueDayValue, ruleScopeFromAccount } from "./shared.js";
const FREQUENCIES = new Set(["daily", "weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual"]);
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
const recurringScheduleChanged = (current, next) => ["frequency", "due_day", "start_date", "end_date", "expected_amount", "status"].some(field => String(current[field] ?? "") !== String(next[field] ?? ""));
const removeUnpaidFutureOccurrences = async (db, ruleId, cutoff = todayJakarta()) => {
  await db.execute(`DELETE FROM recurring_occurrences
    WHERE recurring_rule_id=?
      AND due_date>=?
      AND actual_amount=0
      AND transaction_ids_json='[]'
      AND NOT EXISTS (
        SELECT 1 FROM transactions t
        WHERE t.recurring_occurrence_id=recurring_occurrences.occurrence_id
      )`, [ruleId, cutoff]);
};
export const createRecurringRule = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const name = sanitizeText(p.name, 100);
  const kind = String(p.kind || "expense");
  const frequency = String(p.frequency || "monthly");
  if (!name || !["expense", "income"].includes(kind) || !FREQUENCIES.has(frequency)) throw appError("INVALID_RECURRING_RULE", "Aturan rutin tidak valid.", 400);
  const category = await db.one("SELECT * FROM categories WHERE category_id=? AND status='active'", [p.category_id]);
  if (!category || category.transaction_type !== kind) throw appError("INVALID_CATEGORY", "Kategori jadwal tidak valid.", 400);
  const account = await accountWithAccess(db, context.actor, p.default_account_id);
  const owned = ruleScopeFromAccount(account);
  const start = dateValue(p.start_date || todayJakarta(), "Tanggal mulai");
  const end = p.end_date ? dateValue(p.end_date, "Tanggal akhir") : null;
  if (end && end < start) throw appError("INVALID_DATE_RANGE", "Tanggal akhir sebelum tanggal mulai.", 400);
  const now = nowIso();
  const rule = {
    recurring_rule_id: uuid(),
    name,
    kind,
    category_id: category.category_id,
    expected_amount: positiveInteger(p.expected_amount, "Nominal rutin"),
    frequency,
    due_day: dueDayValue(p.due_day ?? 1),
    default_account_id: account.account_id,
    payment_method: sanitizeText(p.payment_method, 40),
    auto_debit: strictBoolean(p.auto_debit, false) ? 1 : 0,
    start_date: start,
    end_date: end,
    priority: ["low", "normal", "high"].includes(String(p.priority || "normal")) ? String(p.priority || "normal") : "normal",
    status: "active",
    row_version: 1,
    created_by: context.actor.user_id,
    created_at: now,
    updated_by: context.actor.user_id,
    updated_at: now,
    scope: owned.scope,
    owner_user_id: owned.owner_user_id
  };
  await db.execute(`INSERT INTO recurring_rules(recurring_rule_id,name,kind,category_id,expected_amount,frequency,due_day,default_account_id,payment_method,auto_debit,start_date,end_date,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(rule));
  await ensureRuleOccurrences(db, rule);
  await appendAudit(db, context, {
    entityType: "recurring_rule",
    entityId: rule.recurring_rule_id,
    next: publicRow(rule, ["auto_debit"])
  });
  await context.enqueueCalendar?.(db, "recurring", rule.recurring_rule_id);
  await context.enqueueMirror?.(db, "recurring", rule.recurring_rule_id);
  return publicRow(rule, ["auto_debit"]);
};
export const updateRecurringRule = async (db, context) => {
  assertOwner(context.actor);
  const p = context.payload || {};
  const current = await db.one("SELECT * FROM recurring_rules WHERE recurring_rule_id=?", [p.recurring_rule_id]);
  if (!current) throw appError("NOT_FOUND", "Aturan rutin tidak ditemukan.", 404);
  assertVersion(current, context.rowVersion ?? p.row_version);
  const status = p.status === undefined ? current.status : String(p.status);
  if (!["active", "archived"].includes(status)) throw appError("INVALID_STATUS", "Status aturan tidak valid.", 400);
  let account = await accountWithAccess(db, context.actor, p.default_account_id ?? current.default_account_id);
  const owned = ruleScopeFromAccount(account);
  const kind = String(p.kind ?? current.kind),
    frequency = String(p.frequency ?? current.frequency);
  const category = await db.one("SELECT * FROM categories WHERE category_id=? AND status='active'", [p.category_id ?? current.category_id]);
  if (!category || category.transaction_type !== kind || !FREQUENCIES.has(frequency)) throw appError("INVALID_RECURRING_RULE", "Aturan rutin tidak valid.", 400);
  const next = {
    ...current,
    name: sanitizeText(p.name ?? current.name, 100),
    kind,
    category_id: category.category_id,
    expected_amount: p.expected_amount === undefined ? current.expected_amount : positiveInteger(p.expected_amount, "Nominal rutin"),
    frequency,
    due_day: p.due_day === undefined ? current.due_day : dueDayValue(p.due_day),
    default_account_id: account.account_id,
    payment_method: sanitizeText(p.payment_method ?? current.payment_method, 40),
    auto_debit: p.auto_debit === undefined ? current.auto_debit : strictBoolean(p.auto_debit) ? 1 : 0,
    start_date: p.start_date === undefined ? current.start_date : dateValue(p.start_date),
    end_date: p.end_date === undefined ? current.end_date : p.end_date ? dateValue(p.end_date) : null,
    priority: p.priority === undefined ? current.priority : String(p.priority || "normal"),
    status,
    scope: owned.scope,
    owner_user_id: owned.owner_user_id,
    row_version: Number(current.row_version) + 1,
    updated_by: context.actor.user_id,
    updated_at: nowIso()
  };
  if (!next.name || !["low", "normal", "high"].includes(next.priority) || next.end_date && next.end_date < next.start_date) throw appError("INVALID_RECURRING_RULE", "Aturan rutin tidak valid.", 400);
  const linked = await db.one("SELECT COUNT(*) AS count FROM transactions WHERE recurring_occurrence_id IN (SELECT occurrence_id FROM recurring_occurrences WHERE recurring_rule_id=?)", [current.recurring_rule_id]);
  if (Number(linked?.count || 0) && ["kind", "category_id", "default_account_id", "scope", "owner_user_id"].some(field => String(next[field] || "") !== String(current[field] || ""))) throw appError("RECURRING_FINANCIAL_IDENTITY_LOCKED", "Rekening, kategori, jenis, dan kepemilikan tidak dapat diubah setelah memiliki transaksi terkait.", 409);
  const result = await db.execute(`UPDATE recurring_rules SET name=?,kind=?,category_id=?,expected_amount=?,frequency=?,due_day=?,default_account_id=?,payment_method=?,auto_debit=?,start_date=?,end_date=?,priority=?,status=?,scope=?,owner_user_id=?,row_version=?,updated_by=?,updated_at=? WHERE recurring_rule_id=? AND row_version=?`, [next.name, next.kind, next.category_id, next.expected_amount, next.frequency, next.due_day, next.default_account_id, next.payment_method, next.auto_debit, next.start_date, next.end_date, next.priority, next.status, next.scope, next.owner_user_id, next.row_version, next.updated_by, next.updated_at, current.recurring_rule_id, current.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Aturan rutin berubah di perangkat lain.", 409);
  if (recurringScheduleChanged(current, next)) await removeUnpaidFutureOccurrences(db, current.recurring_rule_id);
  if (next.status === "active") await ensureRuleOccurrences(db, next);
  await appendAudit(db, context, {
    entityType: "recurring_rule",
    entityId: current.recurring_rule_id,
    previous: publicRow(current),
    next: publicRow(next, ["auto_debit"])
  });
  await context.enqueueCalendar?.(db, "recurring", current.recurring_rule_id);
  await context.enqueueMirror?.(db, "recurring", current.recurring_rule_id);
  return publicRow(next, ["auto_debit"]);
};
export const listRecurring = async (db, context) => {
  const period = periodKey(context.payload?.period);
  const access = visibleScopeSql(context.actor, "r");
  const rows = await db.all(`SELECT o.*,r.name,r.kind,r.category_id,r.frequency,r.default_account_id,r.payment_method,r.auto_debit,r.start_date,r.end_date,r.priority,r.status AS rule_status,r.row_version AS rule_row_version,r.scope,r.owner_user_id
    FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id
    WHERE o.period_key=? AND ${access.sql} ORDER BY o.due_date,r.name`, [period, ...access.args]);
  const today = todayJakarta();
  return {
    items: rows.map(row => {
      const transactionIds = JSON.parse(row.transaction_ids_json || "[]");
      const status = Number(row.actual_amount) >= Number(row.expected_amount) ? row.kind === "income" ? "received" : "paid" : Number(row.actual_amount) > 0 ? "partial" : row.due_date < today ? "overdue" : "expected";
      return {
        ...publicRow(row, ["auto_debit"]),
        status,
        transaction_ids: transactionIds.join(","),
        can_pay: row.rule_status === "active" && Number(row.actual_amount) < Number(row.expected_amount),
        can_reverse: transactionIds.length > 0,
        can_edit_rule: context.actor.role === "owner",
        can_archive_rule: context.actor.role === "owner" && row.rule_status === "active",
        transaction_type: row.kind
      };
    })
  };
};
export const payOccurrence = async (db, context) => {
  const p = context.payload || {};
  const occurrence = await db.one("SELECT * FROM recurring_occurrences WHERE occurrence_id=?", [p.occurrence_id]);
  if (!occurrence) throw appError("NOT_FOUND", "Occurrence rutin tidak ditemukan.", 404);
  const rule = await db.one("SELECT * FROM recurring_rules WHERE recurring_rule_id=?", [occurrence.recurring_rule_id]);
  if (!rule) throw appError("INTEGRITY_ERROR", "Aturan rutin untuk occurrence tidak ditemukan.", 409);
  assertOwnedAccess(context.actor, rule);
  assertVersion(occurrence, context.rowVersion ?? p.row_version);
  if (rule.status !== "active") throw appError("RECURRING_RULE_ARCHIVED", "Aturan rutin sudah diarsipkan.", 409);
  const account = await accountWithAccess(db, context.actor, p.account_id || rule.default_account_id);
  const owned = ruleScopeFromAccount(account);
  if (owned.scope !== rule.scope || String(owned.owner_user_id || "") !== String(rule.owner_user_id || "")) {
    throw appError("ACCOUNT_SCOPE_MISMATCH", "Rekening aktual harus memiliki kepemilikan sama dengan aturan.", 409);
  }
  const amount = positiveInteger(p.amount, "Nominal aktual");
  const remaining = Math.max(0, Number(occurrence.expected_amount) - Number(occurrence.actual_amount));
  if (!remaining) throw appError("OCCURRENCE_ALREADY_COMPLETE", "Occurrence sudah selesai dibayar.", 409);
  const transaction = await createTransactionInternal(db, {
    ...context,
    action: "recurring.payOccurrence"
  }, {
    transaction_type: rule.kind,
    transaction_date: p.transaction_date || todayJakarta(),
    source_account_id: rule.kind === "expense" ? account.account_id : null,
    destination_account_id: rule.kind === "income" ? account.account_id : null,
    category_id: rule.category_id,
    amount,
    description: rule.name,
    payment_method: rule.payment_method,
    recurring_occurrence_id: occurrence.occurrence_id
  }, {
    allowInternalLinks: true,
    audit: false
  });
  const ids = JSON.parse(occurrence.transaction_ids_json || "[]");
  ids.push(transaction.transaction_id);
  const actual = Number(occurrence.actual_amount) + amount;
  const status = actual >= Number(occurrence.expected_amount) ? "paid" : "partial";
  const next = {
    ...occurrence,
    actual_amount: actual,
    status,
    transaction_ids_json: JSON.stringify(ids),
    row_version: Number(occurrence.row_version) + 1,
    updated_at: nowIso()
  };
  const result = await db.execute("UPDATE recurring_occurrences SET actual_amount=?,status=?,transaction_ids_json=?,row_version=?,updated_at=? WHERE occurrence_id=? AND row_version=?", [next.actual_amount, next.status, next.transaction_ids_json, next.row_version, next.updated_at, occurrence.occurrence_id, occurrence.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Occurrence berubah di perangkat lain.", 409);
  const response = {
    occurrence: {
      ...publicRow(next),
      status: rule.kind === "income" && status === "paid" ? "received" : status
    },
    transaction
  };
  await appendAudit(db, context, {
    entityType: "recurring_occurrence",
    entityId: occurrence.occurrence_id,
    previous: publicRow(occurrence),
    next: response
  });
  await context.enqueueCalendar?.(db, "recurring_occurrence", occurrence.occurrence_id);
  await context.enqueueMirror?.(db, "recurring", occurrence.recurring_rule_id);
  return response;
};
export const reverseOccurrencePayment = async (db, context) => {
  const p = context.payload || {};
  const occurrence = await db.one(`SELECT o.*,r.scope,r.owner_user_id,r.recurring_rule_id FROM recurring_occurrences o JOIN recurring_rules r ON r.recurring_rule_id=o.recurring_rule_id WHERE o.occurrence_id=?`, [p.occurrence_id]);
  if (!occurrence) throw appError("NOT_FOUND", "Occurrence rutin tidak ditemukan.", 404);
  assertOwnedAccess(context.actor, occurrence);
  assertVersion(occurrence, context.rowVersion ?? p.row_version);
  const transaction = await db.one("SELECT * FROM transactions WHERE transaction_id=? AND recurring_occurrence_id=? AND status='active'", [p.transaction_id, occurrence.occurrence_id]);
  if (!transaction) throw appError("NOT_FOUND", "Transaksi rutin aktif tidak ditemukan.", 404);
  if (context.actor.role !== "owner" && transaction.created_by !== context.actor.user_id) throw appError("FORBIDDEN", "Member hanya dapat membatalkan pembayaran rutin yang dibuat sendiri.", 403);
  const cancelledTransaction = await cancelTransactionInternal(db, context, transaction, p.reason, {
    allowLinked: true,
    audit: false
  });
  const ids = JSON.parse(occurrence.transaction_ids_json || "[]").filter(id => id !== transaction.transaction_id);
  const active = ids.length ? await db.all(`SELECT amount FROM transactions WHERE status='active' AND transaction_id IN (${ids.map(() => "?").join(",")})`, ids) : [];
  const actual = active.reduce((sum, row) => sum + Number(row.amount), 0);
  const status = actual >= Number(occurrence.expected_amount) ? "paid" : actual > 0 ? "partial" : occurrence.due_date < todayJakarta() ? "overdue" : "expected";
  const next = {
    ...occurrence,
    actual_amount: actual,
    status,
    transaction_ids_json: JSON.stringify(ids),
    row_version: Number(occurrence.row_version) + 1,
    updated_at: nowIso()
  };
  const update = await db.execute("UPDATE recurring_occurrences SET actual_amount=?,status=?,transaction_ids_json=?,row_version=?,updated_at=? WHERE occurrence_id=? AND row_version=?", [actual, status, next.transaction_ids_json, next.row_version, next.updated_at, occurrence.occurrence_id, occurrence.row_version]);
  if (update.rowsAffected !== 1) throw appError("CONFLICT", "Occurrence berubah di perangkat lain.", 409);
  const response = {
    occurrence: publicRow(next),
    transaction: cancelledTransaction
  };
  await appendAudit(db, context, {
    entityType: "recurring_occurrence",
    entityId: occurrence.occurrence_id,
    previous: publicRow(occurrence),
    next: response
  });
  await context.enqueueCalendar?.(db, "recurring", occurrence.recurring_rule_id);
  await context.enqueueMirror?.(db, "recurring", occurrence.occurrence_id);
  return response;
};
