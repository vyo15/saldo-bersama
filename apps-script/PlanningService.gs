function allocationAvailability_(sourceAccountId) {
  const protectedTypes = ["emergency_fund", "savings", "sinking_fund"];
  const accounts = listAccounts_().filter(function(account) {
    return account.status === "active" && protectedTypes.indexOf(String(account.account_type)) === -1 && (!sourceAccountId || account.account_id === sourceAccountId);
  });
  const availableBalance = accounts.reduce(function(sum, account) { return sum + Math.max(0, Number(account.balance || 0)); }, 0);
  const rules = Object.fromEntries(rows_("Envelope_Rules").map(function(rule) { return [rule.envelope_rule_id, rule]; }));
  const allocatedRemaining = rows_("Envelope_Periods").filter(function(period) {
    if (period.status !== "active") return false;
    const rule = rules[period.envelope_rule_id] || {};
    return !sourceAccountId || String(rule.source_account_id || "") === String(sourceAccountId);
  }).reduce(function(sum, period) { return sum + Math.max(0, Number(envelopeUsage_(period).remaining_amount || 0)); }, 0);
  return { availableBalance: availableBalance, allocatedRemaining: allocatedRemaining, unallocatedAmount: Math.max(0, availableBalance - allocatedRemaining) };
}

function monthBounds_(periodKey) {
  const parts = String(periodKey).split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const endDay = new Date(year, month, 0).getDate();
  return { start: periodKey + "-01", end: periodKey + "-" + String(endDay).padStart(2, "0") };
}

function listEnvelopes_(context) {
  const period = context.payload.period || monthKey_();
  const bounds = monthBounds_(period);
  const transactions = rows_("Transactions");
  return rows_("Envelope_Periods").filter(function(row) { return row.period_start <= bounds.end && row.period_end >= bounds.start; }).map(function(row) { return envelopeUsage_(row, transactions); });
}

function createEnvelopeRule_(context) {
  const payload = context.payload;
  const record = {
    envelope_rule_id: uuid_(), name: sanitizeText_(payload.name, 100), period_type: sanitizeText_(payload.period_type || "monthly", 30),
    scope: payload.scope === "personal" ? "personal" : "shared", owner_user_id: payload.owner_user_id || context.actor.user_id,
    default_amount: intAmount_(payload.default_amount), source_account_id: payload.source_account_id || "",
    rollover_policy: sanitizeText_(payload.rollover_policy || "unallocated", 40), overspend_policy: sanitizeText_(payload.overspend_policy || "confirm", 40),
    status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_(), updated_by: context.actor.user_id, updated_at: nowIso_()
  };
  if (!record.name) throw sbError_("NAME_REQUIRED", "Nama kantong wajib diisi.", 400);
  appendRow_("Envelope_Rules", record);
  appendAudit_(context, "envelopes.createRule", "envelope_rule", record.envelope_rule_id, null, publicRow_(record));
  return publicRow_(record);
}

function createEnvelopePeriod_(context) {
  const payload = context.payload;
  const rule = findBy_("Envelope_Rules", "envelope_rule_id", payload.envelope_rule_id);
  if (!rule || rule.status !== "active") throw sbError_("INVALID_ENVELOPE_RULE", "Aturan kantong tidak aktif.", 400);
  const start = validateDate_(payload.period_start);
  const end = validateDate_(payload.period_end);
  if (start > end) throw sbError_("INVALID_PERIOD", "Tanggal mulai periode tidak boleh setelah tanggal akhir.", 400);
  const overlap = rows_("Envelope_Periods").find(function(row) { return row.envelope_rule_id === rule.envelope_rule_id && row.status === "active" && row.period_start <= end && row.period_end >= start; });
  if (overlap) throw sbError_("DUPLICATE_PERIOD", "Periode kantong bertumpuk dengan periode aktif yang sudah ada.", 409);
  const allocatedAmount = intAmount_(payload.allocated_amount || rule.default_amount);
  const reservedAmount = Number(payload.reserved_amount || 0);
  if (!Number.isSafeInteger(reservedAmount) || reservedAmount < 0 || reservedAmount > allocatedAmount) throw sbError_("INVALID_RESERVED_AMOUNT", "Dana dipesan harus integer antara nol dan alokasi.", 400);
  const availability = allocationAvailability_(rule.source_account_id || "");
  if (allocatedAmount > availability.unallocatedAmount) throw sbError_("INSUFFICIENT_UNALLOCATED_FUNDS", "Alokasi melebihi dana yang belum dialokasikan.", 409, availability);
  const record = {
    envelope_period_id: uuid_(), envelope_rule_id: rule.envelope_rule_id, name: rule.name, period_start: start, period_end: end,
    allocated_amount: allocatedAmount, reserved_amount: reservedAmount,
    status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_(), updated_by: context.actor.user_id,
    updated_at: nowIso_(), closed_by: "", closed_at: ""
  };
  appendRow_("Envelope_Periods", record);
  appendAudit_(context, "envelopes.createPeriod", "envelope_period", record.envelope_period_id, null, publicRow_(record));
  return envelopeUsage_(record);
}

function moveEnvelope_(context) {
  const payload = context.payload;
  const from = findBy_("Envelope_Periods", "envelope_period_id", payload.fromEnvelopePeriodId);
  const to = findBy_("Envelope_Periods", "envelope_period_id", payload.toEnvelopePeriodId);
  if (!from || !to || from.status !== "active" || to.status !== "active") throw sbError_("INVALID_ENVELOPE", "Kantong sumber atau tujuan tidak aktif.", 400);
  if (from.envelope_period_id === to.envelope_period_id) throw sbError_("SAME_ENVELOPE", "Kantong sumber dan tujuan harus berbeda.", 400);
  const amount = intAmount_(payload.amount);
  const available = envelopeUsage_(from).remaining_amount;
  if (amount > available) throw sbError_("INSUFFICIENT_ALLOCATION", "Alokasi melebihi sisa kantong sumber.", 409, { available: available });
  const previous = { from: publicRow_(from), to: publicRow_(to) };
  from.allocated_amount = Number(from.allocated_amount) - amount; from.row_version = rowVersion_(from) + 1; from.updated_by = context.actor.user_id; from.updated_at = nowIso_();
  to.allocated_amount = Number(to.allocated_amount) + amount; to.row_version = rowVersion_(to) + 1; to.updated_by = context.actor.user_id; to.updated_at = nowIso_();
  updateRow_("Envelope_Periods", from.__row, from); updateRow_("Envelope_Periods", to.__row, to);
  const movement = { movement_id: uuid_(), from_envelope_period_id: from.envelope_period_id, to_envelope_period_id: to.envelope_period_id, amount: amount, movement_type: "reallocation", reason: sanitizeText_(payload.reason, 160), status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_() };
  appendRow_("Envelope_Movements", movement);
  appendAudit_(context, "envelopes.move", "envelope_movement", movement.movement_id, previous, publicRow_(movement));
  return { movement: publicRow_(movement), from: envelopeUsage_(from), to: envelopeUsage_(to) };
}

function closeEnvelope_(context) {
  const current = findBy_("Envelope_Periods", "envelope_period_id", context.payload.envelope_period_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Periode kantong aktif tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  const unallocated = rows_("Transactions").filter(function(row) { return row.status === "active" && row.transaction_type === "expense" && !row.envelope_period_id && row.transaction_date >= current.period_start && row.transaction_date <= current.period_end; });
  if (unallocated.length) throw sbError_("UNALLOCATED_EXPENSES", "Periode belum dapat ditutup karena ada pengeluaran belum dialokasikan.", 409, { count: unallocated.length });
  const previous = publicRow_(current);
  current.status = "closed"; current.closed_by = context.actor.user_id; current.closed_at = nowIso_(); current.row_version = rowVersion_(current) + 1; current.updated_at = nowIso_(); current.updated_by = context.actor.user_id;
  updateRow_("Envelope_Periods", current.__row, current);
  appendAudit_(context, "envelopes.close", "envelope_period", current.envelope_period_id, previous, publicRow_(current));
  return envelopeUsage_(current);
}

function recurringDueDates_(rule, periodKey) {
  const parts = String(periodKey).split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month - 1, daysInMonth);
  const start = new Date(String(rule.start_date) + "T00:00:00+07:00");
  const end = rule.end_date ? new Date(String(rule.end_date) + "T23:59:59+07:00") : null;
  if (monthEnd < start || (end && monthStart > end)) return [];
  const frequency = String(rule.frequency || "monthly");
  const dates = [];
  const pushDate = function(date) {
    if (date < start || (end && date > end)) return;
    dates.push(Utilities.formatDate(date, SB_TIMEZONE, "yyyy-MM-dd"));
  };
  if (frequency === "daily") {
    for (let day = 1; day <= daysInMonth; day += 1) pushDate(new Date(year, month - 1, day));
    return dates;
  }
  if (frequency === "weekly" || frequency === "biweekly") {
    const intervalDays = frequency === "weekly" ? 7 : 14;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const candidate = new Date(year, month - 1, day);
      const differenceDays = Math.round((candidate.getTime() - start.getTime()) / 86400000);
      if (differenceDays >= 0 && differenceDays % intervalDays === 0) pushDate(candidate);
    }
    return dates;
  }
  const monthIntervals = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 };
  const interval = monthIntervals[frequency] || 1;
  const startMonthIndex = start.getFullYear() * 12 + start.getMonth();
  const currentMonthIndex = year * 12 + (month - 1);
  if (currentMonthIndex < startMonthIndex || (currentMonthIndex - startMonthIndex) % interval !== 0) return dates;
  const dueDay = Math.max(1, Math.min(daysInMonth, Number(rule.due_day || 1)));
  pushDate(new Date(year, month - 1, dueDay));
  return dates;
}

function generateRecurringOccurrencesUnlocked_(periodKey) {
  const rules = rows_("Recurring_Rules").filter(function(row) { return row.status === "active"; });
  const existing = rows_("Recurring_Occurrences");
  rules.forEach(function(rule) {
    recurringDueDates_(rule, periodKey).forEach(function(dueDate) {
      const found = existing.find(function(row) { return row.recurring_rule_id === rule.recurring_rule_id && row.due_date === dueDate; });
      if (found) return;
      appendRow_("Recurring_Occurrences", {
        occurrence_id: uuid_(), recurring_rule_id: rule.recurring_rule_id, period_key: periodKey,
        due_date: dueDate, expected_amount: Number(rule.expected_amount || 0),
        actual_amount: 0, status: rule.kind === "income" ? "expected" : "scheduled", transaction_ids: "", calendar_event_id: "",
        row_version: 1, created_at: nowIso_(), updated_at: nowIso_()
      });
    });
  });
}

function ensureRecurringOccurrences_(periodKey) {
  const lock = LockService.getScriptLock();
  const alreadyHeld = lock.hasLock();
  if (!alreadyHeld && !lock.tryLock(15000)) throw sbError_("LOCK_TIMEOUT", "Jadwal sedang dibuat oleh proses lain. Coba kembali.", 409);
  try { generateRecurringOccurrencesUnlocked_(periodKey); }
  finally { if (!alreadyHeld) lock.releaseLock(); }
}

function listRecurring_(context) {
  const period = context.payload.period || monthKey_();
  ensureRecurringOccurrences_(period);
  const rules = Object.fromEntries(rows_("Recurring_Rules").map(function(row) { return [row.recurring_rule_id, row]; }));
  return rows_("Recurring_Occurrences").filter(function(row) { return row.period_key === period; }).map(function(row) {
    const rule = rules[row.recurring_rule_id] || {};
    const derivedStatus = !["paid", "received", "partial", "cancelled"].includes(row.status) && row.due_date < today_() ? (rule.kind === "income" ? "late" : "overdue") : row.status;
    return Object.assign(publicRow_(row), { status: derivedStatus, name: rule.name || "Jadwal", kind: rule.kind || "expense", category_id: rule.category_id || "", default_account_id: rule.default_account_id || "", frequency: rule.frequency || "monthly" });
  });
}

function createRecurringRule_(context) {
  const payload = context.payload;
  const amount = intAmount_(payload.expected_amount);
  const kind = payload.kind === "income" ? "income" : "expense";
  const name = sanitizeText_(payload.name, 100);
  if (!name) throw sbError_("NAME_REQUIRED", "Nama jadwal wajib diisi.", 400);
  const frequency = String(payload.frequency || "monthly");
  if (!["daily", "weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual"].includes(frequency)) throw sbError_("INVALID_FREQUENCY", "Frekuensi jadwal tidak valid.", 400);
  activeCategory_(payload.category_id, kind);
  activeAccount_(payload.default_account_id);
  const record = {
    recurring_rule_id: uuid_(), name: name, kind: kind,
    category_id: payload.category_id || "", expected_amount: amount, frequency: frequency,
    due_day: Math.max(1, Math.min(31, Number(payload.due_day || 1))), default_account_id: payload.default_account_id || "",
    payment_method: sanitizeText_(payload.payment_method || "transfer", 40), auto_debit: Boolean(payload.auto_debit),
    start_date: validateDate_(payload.start_date || today_()), end_date: payload.end_date ? validateDate_(payload.end_date) : "",
    priority: sanitizeText_(payload.priority || "normal", 20), status: "active", row_version: 1,
    created_by: context.actor.user_id, created_at: nowIso_(), updated_by: context.actor.user_id, updated_at: nowIso_()
  };
  appendRow_("Recurring_Rules", record);
  appendAudit_(context, "recurring.createRule", "recurring_rule", record.recurring_rule_id, null, publicRow_(record));
  return publicRow_(record);
}

function updateRecurringRule_(context) {
  const current = findBy_("Recurring_Rules", "recurring_rule_id", context.payload.recurring_rule_id);
  if (!current) throw sbError_("NOT_FOUND", "Aturan rutin tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  const previous = publicRow_(current);
  ["name", "category_id", "frequency", "default_account_id", "payment_method", "priority", "status"].forEach(function(key) { if (context.payload[key] !== undefined) current[key] = sanitizeText_(context.payload[key], 100); });
  if (context.payload.expected_amount !== undefined) current.expected_amount = intAmount_(context.payload.expected_amount);
  if (context.payload.due_day !== undefined) current.due_day = Math.max(1, Math.min(31, Number(context.payload.due_day)));
  current.row_version = rowVersion_(current) + 1; current.updated_by = context.actor.user_id; current.updated_at = nowIso_();
  updateRow_("Recurring_Rules", current.__row, current);
  appendAudit_(context, "recurring.updateRule", "recurring_rule", current.recurring_rule_id, previous, publicRow_(current));
  return publicRow_(current);
}

function payOccurrence_(context) {
  const occurrence = findBy_("Recurring_Occurrences", "occurrence_id", context.payload.occurrence_id);
  if (!occurrence || ["paid", "received", "cancelled"].includes(occurrence.status)) throw sbError_("INVALID_OCCURRENCE", "Jadwal tidak ditemukan atau sudah selesai.", 409);
  assertVersion_(occurrence, context.rowVersion || context.payload.row_version);
  const rule = findBy_("Recurring_Rules", "recurring_rule_id", occurrence.recurring_rule_id);
  if (!rule) throw sbError_("INVALID_RECURRING_RULE", "Aturan rutin tidak ditemukan.", 400);
  const transaction = createTransaction_(context, {
    transaction_date: context.payload.transaction_date || today_(), transaction_type: rule.kind === "income" ? "income" : "expense",
    source_account_id: rule.kind === "income" ? "" : (context.payload.account_id || rule.default_account_id),
    destination_account_id: rule.kind === "income" ? (context.payload.account_id || rule.default_account_id) : "",
    category_id: rule.category_id, recurring_occurrence_id: occurrence.occurrence_id,
    amount: context.payload.amount || occurrence.expected_amount, description: rule.name,
    payment_method: rule.payment_method, scope: "shared", confirm_duplicate: true
  });
  occurrence.actual_amount = Number(occurrence.actual_amount || 0) + Number(transaction.amount);
  occurrence.transaction_ids = [String(occurrence.transaction_ids || ""), transaction.transaction_id].filter(Boolean).join(",");
  occurrence.status = occurrence.actual_amount >= Number(occurrence.expected_amount || 0) ? (rule.kind === "income" ? "received" : "paid") : "partial";
  occurrence.row_version = rowVersion_(occurrence) + 1; occurrence.updated_at = nowIso_();
  updateRow_("Recurring_Occurrences", occurrence.__row, occurrence);
  appendAudit_(context, "recurring.payOccurrence", "recurring_occurrence", occurrence.occurrence_id, null, publicRow_(occurrence));
  return { occurrence: publicRow_(occurrence), transaction: transaction };
}

function listBudgets_(context) {
  const period = context.payload.period || monthKey_();
  const transactions = rows_("Transactions").filter(function(row) { return row.status === "active" && row.transaction_type === "expense" && String(row.transaction_date).slice(0, 7) === period; });
  return rows_("Budgets").filter(function(row) { return row.period_key === period && row.status === "active"; }).map(function(row) {
    const used = transactions.filter(function(transaction) { return transaction.category_id === row.category_id; }).reduce(function(sum, item) { return sum + Number(item.amount || 0); }, 0);
    return Object.assign(publicRow_(row), { used_amount: used });
  });
}

function upsertBudget_(context) {
  const payload = context.payload;
  const period = String(payload.period_key || monthKey_());
  const current = rows_("Budgets").find(function(row) { return row.period_key === period && row.category_id === payload.category_id; });
  if (current) {
    assertVersion_(current, context.rowVersion || payload.row_version);
    const previous = publicRow_(current);
    current.amount = intAmount_(payload.amount); current.warning_threshold = Number(payload.warning_threshold || 80);
    current.row_version = rowVersion_(current) + 1; current.updated_by = context.actor.user_id; current.updated_at = nowIso_();
    updateRow_("Budgets", current.__row, current);
    appendAudit_(context, "budgets.upsert", "budget", current.budget_id, previous, publicRow_(current));
    return publicRow_(current);
  }
  const category = activeCategory_(payload.category_id, "expense");
  const record = { budget_id: uuid_(), period_key: period, category_id: category.category_id, envelope_rule_id: payload.envelope_rule_id || "", name: category.name, amount: intAmount_(payload.amount), warning_threshold: Number(payload.warning_threshold || 80), status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_(), updated_by: context.actor.user_id, updated_at: nowIso_() };
  appendRow_("Budgets", record); appendAudit_(context, "budgets.upsert", "budget", record.budget_id, null, publicRow_(record));
  return publicRow_(record);
}

function goalCurrentAmount_(goalId) {
  return rows_("Goal_Movements").filter(function(row) { return row.goal_id === goalId && row.status === "active"; }).reduce(function(sum, row) { return sum + (row.movement_type === "withdraw" ? -Number(row.amount || 0) : Number(row.amount || 0)); }, 0);
}

function listGoals_() {
  return rows_("Savings_Goals").map(function(row) { return Object.assign(publicRow_(row), { current_amount: goalCurrentAmount_(row.goal_id) }); });
}

function createGoal_(context) {
  const payload = context.payload;
  const record = { goal_id: uuid_(), name: sanitizeText_(payload.name, 100), goal_type: sanitizeText_(payload.goal_type || "savings", 40), target_amount: intAmount_(payload.target_amount), target_date: validateDate_(payload.target_date), account_id: payload.account_id || "", priority: sanitizeText_(payload.priority || "normal", 20), status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_(), updated_by: context.actor.user_id, updated_at: nowIso_() };
  appendRow_("Savings_Goals", record); appendAudit_(context, "goals.create", "goal", record.goal_id, null, publicRow_(record));
  return Object.assign(publicRow_(record), { current_amount: 0 });
}

function moveGoal_(context) {
  const payload = context.payload;
  const goal = findBy_("Savings_Goals", "goal_id", payload.goal_id);
  if (!goal || goal.status !== "active") throw sbError_("INVALID_GOAL", "Target tidak aktif.", 400);
  const amount = intAmount_(payload.amount);
  const movementType = payload.movement_type === "withdraw" ? "withdraw" : "contribution";
  if (movementType === "withdraw" && amount > goalCurrentAmount_(goal.goal_id)) throw sbError_("INSUFFICIENT_GOAL_BALANCE", "Nominal penarikan melebihi saldo target.", 409);
  let transactionId = "";
  if (payload.source_account_id && payload.destination_account_id) {
    const transaction = createTransaction_(context, { transaction_date: payload.transaction_date || today_(), transaction_type: "transfer", source_account_id: payload.source_account_id, destination_account_id: payload.destination_account_id, amount: amount, goal_id: goal.goal_id, description: goal.name, scope: "shared", confirm_duplicate: true });
    transactionId = transaction.transaction_id;
  }
  const movement = { goal_movement_id: uuid_(), goal_id: goal.goal_id, transaction_id: transactionId, movement_type: movementType, amount: amount, reason: sanitizeText_(payload.reason, 180), status: "active", created_by: context.actor.user_id, created_at: nowIso_() };
  appendRow_("Goal_Movements", movement); appendAudit_(context, "goals.move", "goal_movement", movement.goal_movement_id, null, publicRow_(movement));
  return { movement: publicRow_(movement), goal: Object.assign(publicRow_(goal), { current_amount: goalCurrentAmount_(goal.goal_id) }) };
}
