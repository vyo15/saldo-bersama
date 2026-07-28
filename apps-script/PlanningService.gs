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
  if (payload.scope !== undefined && ["personal", "shared"].indexOf(payload.scope) === -1) throw sbError_("INVALID_SCOPE", "Scope kantong harus personal atau shared.", 400);
  const scope = payload.scope === "personal" ? "personal" : "shared";
  const ownerUserId = context.actor.role === "owner" && payload.owner_user_id ? payload.owner_user_id : context.actor.user_id;
  if (scope === "personal") activeUser_(ownerUserId);
  if (payload.source_account_id) {
    const source = activeAccount_(payload.source_account_id);
    assertAccountAccess_(context, source);
  }
  const periodType = sanitizeText_(payload.period_type || "monthly", 30);
  const rolloverPolicy = sanitizeText_(payload.rollover_policy || "unallocated", 40);
  const overspendPolicy = sanitizeText_(payload.overspend_policy || "confirm", 40);
  if (["daily", "weekly", "biweekly", "monthly", "paycycle", "custom"].indexOf(periodType) === -1) throw sbError_("INVALID_PERIOD_TYPE", "Jenis periode kantong tidak valid.", 400);
  if (["none", "carry", "buffer", "savings", "emergency", "unallocated"].indexOf(rolloverPolicy) === -1) throw sbError_("INVALID_ROLLOVER_POLICY", "Kebijakan rollover tidak valid.", 400);
  if (["warn", "confirm", "owner_approval", "deny"].indexOf(overspendPolicy) === -1) throw sbError_("INVALID_OVERSPEND_POLICY", "Kebijakan overspend tidak valid.", 400);
  const record = {
    envelope_rule_id: uuid_(), name: sanitizeText_(payload.name, 100), period_type: periodType,
    scope: scope, owner_user_id: scope === "personal" ? ownerUserId : "",
    default_amount: intAmount_(payload.default_amount), source_account_id: payload.source_account_id || "",
    rollover_policy: rolloverPolicy, overspend_policy: overspendPolicy,
    status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_(), updated_by: context.actor.user_id, updated_at: nowIso_()
  };
  if (!record.name) throw sbError_("NAME_REQUIRED", "Nama kantong wajib diisi.", 400);
  appendAuditedRow_("Envelope_Rules", "envelope_rule_id", record, context, "envelopes.createRule", "envelope_rule", null, publicRow_(record));
  return publicRow_(record);
}

function createEnvelopePeriod_(context) {
  const payload = context.payload;
  const rule = findBy_("Envelope_Rules", "envelope_rule_id", payload.envelope_rule_id);
  if (!rule || rule.status !== "active") throw sbError_("INVALID_ENVELOPE_RULE", "Aturan kantong tidak aktif.", 400);
  if (context.actor.role !== "owner" && rule.scope === "personal" && String(rule.owner_user_id) !== String(context.actor.user_id)) throw sbError_("FORBIDDEN_ENVELOPE", "Aturan kantong pribadi ini bukan milik pengguna aktif.", 403);
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
  appendAuditedRow_("Envelope_Periods", "envelope_period_id", record, context, "envelopes.createPeriod", "envelope_period", null, publicRow_(record));
  return envelopeUsage_(record);
}

function moveEnvelope_(context) {
  const payload = context.payload;
  const from = findBy_("Envelope_Periods", "envelope_period_id", payload.fromEnvelopePeriodId);
  const to = findBy_("Envelope_Periods", "envelope_period_id", payload.toEnvelopePeriodId);
  if (!from || !to || from.status !== "active" || to.status !== "active") throw sbError_("INVALID_ENVELOPE", "Kantong sumber atau tujuan tidak aktif.", 400);
  if (from.envelope_period_id === to.envelope_period_id) throw sbError_("SAME_ENVELOPE", "Kantong sumber dan tujuan harus berbeda.", 400);
  [from, to].forEach(function(period) {
    const rule = findBy_("Envelope_Rules", "envelope_rule_id", period.envelope_rule_id);
    if (context.actor.role !== "owner" && rule && rule.scope === "personal" && String(rule.owner_user_id) !== String(context.actor.user_id)) throw sbError_("FORBIDDEN_ENVELOPE", "Kantong pribadi ini bukan milik pengguna aktif.", 403);
  });
  const amount = intAmount_(payload.amount);
  const available = envelopeUsage_(from).remaining_amount;
  if (amount > available) throw sbError_("INSUFFICIENT_ALLOCATION", "Alokasi melebihi sisa kantong sumber.", 409, { available: available });
  const previousFrom = Object.assign({}, from);
  const previousTo = Object.assign({}, to);
  const updatedFrom = Object.assign({}, from, { allocated_amount: Number(from.allocated_amount) - amount, row_version: rowVersion_(from) + 1, updated_by: context.actor.user_id, updated_at: nowIso_() });
  const updatedTo = Object.assign({}, to, { allocated_amount: Number(to.allocated_amount) + amount, row_version: rowVersion_(to) + 1, updated_by: context.actor.user_id, updated_at: nowIso_() });
  const movement = { movement_id: uuid_(), from_envelope_period_id: from.envelope_period_id, to_envelope_period_id: to.envelope_period_id, amount: amount, movement_type: "reallocation", reason: sanitizeText_(payload.reason, 160), status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_() };
  try {
    updateRow_("Envelope_Periods", from.__row, updatedFrom);
    updateRow_("Envelope_Periods", to.__row, updatedTo);
    appendRow_("Envelope_Movements", movement);
    appendAudit_(context, "envelopes.move", "envelope_movement", movement.movement_id, { from: publicRow_(previousFrom), to: publicRow_(previousTo) }, publicRow_(movement));
  } catch (error) {
    compensateOrFailClosed_("envelope_compensation_required", { action: "envelopes.move", movementId: movement.movement_id, cause: error.code || error.message }, function() {
      updateRow_("Envelope_Periods", previousFrom.__row, previousFrom);
      updateRow_("Envelope_Periods", previousTo.__row, previousTo);
      const inserted = findBy_("Envelope_Movements", "movement_id", movement.movement_id);
      if (inserted) deleteRow_("Envelope_Movements", inserted.__row);
    });
    throw sbError_("ENVELOPE_MOVE_ROLLED_BACK", "Pemindahan alokasi gagal dan seluruh perubahan telah dibatalkan.", 503, { cause: error.code || error.message });
  }
  return { movement: publicRow_(movement), from: envelopeUsage_(updatedFrom), to: envelopeUsage_(updatedTo) };
}

function closeEnvelope_(context) {
  const current = findBy_("Envelope_Periods", "envelope_period_id", context.payload.envelope_period_id);
  if (!current || current.status !== "active") throw sbError_("NOT_FOUND", "Periode kantong aktif tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  const rule = findBy_("Envelope_Rules", "envelope_rule_id", current.envelope_rule_id);
  if (context.actor.role !== "owner" && rule && rule.scope === "personal" && String(rule.owner_user_id) !== String(context.actor.user_id)) throw sbError_("FORBIDDEN_ENVELOPE", "Kantong pribadi ini bukan milik pengguna aktif.", 403);
  const unallocated = rows_("Transactions").filter(function(row) { return row.status === "active" && row.transaction_type === "expense" && !row.envelope_period_id && row.transaction_date >= current.period_start && row.transaction_date <= current.period_end; });
  if (unallocated.length) throw sbError_("UNALLOCATED_EXPENSES", "Periode belum dapat ditutup karena ada pengeluaran belum dialokasikan.", 409, { count: unallocated.length });
  const updated = Object.assign({}, current, { status: "closed", closed_by: context.actor.user_id, closed_at: nowIso_(), row_version: rowVersion_(current) + 1, updated_at: nowIso_(), updated_by: context.actor.user_id });
  updateAuditedRow_("Envelope_Periods", current, updated, context, "envelopes.close", "envelope_period", updated.envelope_period_id);
  return envelopeUsage_(updated);
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
  // Read actions must not create derived rows while maintenance/recovery is active.
  if (getConfig_("maintenance_mode") === "true") return;
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
  if (["income", "expense"].indexOf(payload.kind) === -1) throw sbError_("INVALID_RECURRING_KIND", "Jenis jadwal harus income atau expense.", 400);
  const kind = payload.kind;
  const name = sanitizeText_(payload.name, 100);
  if (!name) throw sbError_("NAME_REQUIRED", "Nama jadwal wajib diisi.", 400);
  const frequency = String(payload.frequency || "monthly");
  if (!["daily", "weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual"].includes(frequency)) throw sbError_("INVALID_FREQUENCY", "Frekuensi jadwal tidak valid.", 400);
  activeCategory_(payload.category_id, kind);
  const dueDay = Number(payload.due_day === undefined ? 1 : payload.due_day);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw sbError_("INVALID_DUE_DAY", "Tanggal jatuh tempo harus 1-31.", 400);
  const startDate = validateDate_(payload.start_date || today_());
  const endDate = payload.end_date ? validateDate_(payload.end_date) : "";
  if (endDate && endDate < startDate) throw sbError_("INVALID_DATE_RANGE", "Tanggal akhir jadwal tidak boleh sebelum tanggal mulai.", 400);
  const account = activeAccount_(payload.default_account_id);
  assertAccountAccess_(context, account);
  const record = {
    recurring_rule_id: uuid_(), name: name, kind: kind,
    category_id: payload.category_id || "", expected_amount: amount, frequency: frequency,
    due_day: dueDay, default_account_id: payload.default_account_id || "",
    payment_method: sanitizeText_(payload.payment_method || "transfer", 40), auto_debit: strictBoolean_(payload.auto_debit, "auto_debit", false),
    start_date: startDate, end_date: endDate,
    priority: sanitizeText_(payload.priority || "normal", 20), status: "active", row_version: 1,
    created_by: context.actor.user_id, created_at: nowIso_(), updated_by: context.actor.user_id, updated_at: nowIso_()
  };
  appendAuditedRow_("Recurring_Rules", "recurring_rule_id", record, context, "recurring.createRule", "recurring_rule", null, publicRow_(record));
  return publicRow_(record);
}

function updateRecurringRule_(context) {
  const current = findBy_("Recurring_Rules", "recurring_rule_id", context.payload.recurring_rule_id);
  if (!current) throw sbError_("NOT_FOUND", "Aturan rutin tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  const updated = Object.assign({}, current);
  ["name", "category_id", "frequency", "default_account_id", "payment_method", "priority", "status"].forEach(function(key) { if (context.payload[key] !== undefined) updated[key] = sanitizeText_(context.payload[key], 100); });
  if (!updated.name) throw sbError_("NAME_REQUIRED", "Nama jadwal wajib diisi.", 400);
  if (!["daily", "weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannual", "annual"].includes(updated.frequency)) throw sbError_("INVALID_FREQUENCY", "Frekuensi jadwal tidak valid.", 400);
  if (!["active", "archived"].includes(updated.status)) throw sbError_("INVALID_STATUS", "Status jadwal tidak valid.", 400);
  if (context.payload.expected_amount !== undefined) updated.expected_amount = intAmount_(context.payload.expected_amount);
  if (context.payload.due_day !== undefined) {
    const dueDay = Number(context.payload.due_day);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw sbError_("INVALID_DUE_DAY", "Tanggal jatuh tempo harus 1-31.", 400);
    updated.due_day = dueDay;
  }
  if (context.payload.auto_debit !== undefined) updated.auto_debit = strictBoolean_(context.payload.auto_debit, "auto_debit", current.auto_debit);
  activeCategory_(updated.category_id, updated.kind);
  const account = activeAccount_(updated.default_account_id);
  assertAccountAccess_(context, account);
  updated.row_version = rowVersion_(current) + 1; updated.updated_by = context.actor.user_id; updated.updated_at = nowIso_();
  updateAuditedRow_("Recurring_Rules", current, updated, context, "recurring.updateRule", "recurring_rule", updated.recurring_rule_id);
  return publicRow_(updated);
}

function payOccurrence_(context) {
  const occurrence = findBy_("Recurring_Occurrences", "occurrence_id", context.payload.occurrence_id);
  if (!occurrence || ["paid", "received", "cancelled"].includes(occurrence.status)) throw sbError_("INVALID_OCCURRENCE", "Jadwal tidak ditemukan atau sudah selesai.", 409);
  assertVersion_(occurrence, context.rowVersion || context.payload.row_version);
  const rule = findBy_("Recurring_Rules", "recurring_rule_id", occurrence.recurring_rule_id);
  if (!rule) throw sbError_("INVALID_RECURRING_RULE", "Aturan rutin tidak ditemukan.", 400);
  let transaction = null;
  const previousOccurrence = Object.assign({}, occurrence);
  try {
    transaction = createTransaction_(context, {
      transaction_date: context.payload.transaction_date || today_(), transaction_type: rule.kind === "income" ? "income" : "expense",
      source_account_id: rule.kind === "income" ? "" : (context.payload.account_id || rule.default_account_id),
      destination_account_id: rule.kind === "income" ? (context.payload.account_id || rule.default_account_id) : "",
      category_id: rule.category_id, recurring_occurrence_id: occurrence.occurrence_id,
      amount: context.payload.amount || occurrence.expected_amount, description: rule.name,
      payment_method: rule.payment_method, scope: "shared", confirm_duplicate: true
    }, { skipAudit: true });
    const updatedOccurrence = Object.assign({}, occurrence, {
      actual_amount: Number(occurrence.actual_amount || 0) + Number(transaction.amount),
      transaction_ids: [String(occurrence.transaction_ids || ""), transaction.transaction_id].filter(Boolean).join(","),
      row_version: rowVersion_(occurrence) + 1,
      updated_at: nowIso_()
    });
    updatedOccurrence.status = updatedOccurrence.actual_amount >= Number(occurrence.expected_amount || 0) ? (rule.kind === "income" ? "received" : "paid") : "partial";
    updateRow_("Recurring_Occurrences", occurrence.__row, updatedOccurrence);
    appendAudit_(context, "recurring.payOccurrence", "recurring_occurrence", occurrence.occurrence_id, { occurrence: publicRow_(previousOccurrence), transaction: null }, { occurrence: publicRow_(updatedOccurrence), transaction: transaction });
    return { occurrence: publicRow_(updatedOccurrence), transaction: transaction };
  } catch (error) {
    compensateOrFailClosed_("recurring_payment_compensation_required", { action: "recurring.payOccurrence", occurrenceId: occurrence.occurrence_id, transactionId: transaction && transaction.transaction_id, cause: error.code || error.message }, function() {
      updateRow_("Recurring_Occurrences", previousOccurrence.__row, previousOccurrence);
      if (transaction && transaction.transaction_id) {
        const transactionRow = findBy_("Transactions", "transaction_id", transaction.transaction_id);
        if (transactionRow) deleteRow_("Transactions", transactionRow.__row);
      }
    });
    throw sbError_("RECURRING_PAYMENT_ROLLED_BACK", "Pembayaran jadwal gagal dan transaksi terkait telah dibatalkan.", 503, { cause: error.code || error.message });
  }
}

function reverseOccurrencePayment_(context) {
  const payload = context.payload;
  const occurrence = findBy_("Recurring_Occurrences", "occurrence_id", payload.occurrence_id);
  if (!occurrence) throw sbError_("NOT_FOUND", "Jadwal tidak ditemukan.", 404);
  assertVersion_(occurrence, context.rowVersion || payload.row_version);
  const rule = findBy_("Recurring_Rules", "recurring_rule_id", occurrence.recurring_rule_id);
  if (!rule) throw sbError_("INVALID_RECURRING_RULE", "Aturan rutin tidak ditemukan.", 400);
  const transaction = findBy_("Transactions", "transaction_id", payload.transaction_id);
  if (!transaction || transaction.status !== "active" || transaction.recurring_occurrence_id !== occurrence.occurrence_id) throw sbError_("INVALID_LINKED_TRANSACTION", "Transaksi pembayaran aktif tidak ditemukan pada jadwal ini.", 409);
  assertCanModifyTransaction_(context, transaction);
  assertPeriodOpen_(transaction.transaction_date);
  const reason = sanitizeText_(payload.reason, 200);
  if (!reason) throw sbError_("REASON_REQUIRED", "Alasan pembatalan pembayaran wajib diisi.", 400);
  const previousOccurrence = Object.assign({}, occurrence);
  const previousTransaction = Object.assign({}, transaction);
  const updatedTransaction = Object.assign({}, transaction, { status: "cancelled", cancelled_by: context.actor.user_id, cancelled_at: nowIso_(), cancellation_reason: reason, row_version: rowVersion_(transaction) + 1, updated_by: context.actor.user_id, updated_at: nowIso_() });
  const remainingTransactions = rows_("Transactions").filter(function(row) { return row.status === "active" && row.recurring_occurrence_id === occurrence.occurrence_id && row.transaction_id !== transaction.transaction_id; });
  const actualAmount = remainingTransactions.reduce(function(sum, row) { return sum + Number(row.amount || 0); }, 0);
  const updatedOccurrence = Object.assign({}, occurrence, {
    actual_amount: actualAmount,
    transaction_ids: remainingTransactions.map(function(row) { return row.transaction_id; }).join(","),
    status: actualAmount <= 0 ? "scheduled" : actualAmount >= Number(occurrence.expected_amount || 0) ? (rule.kind === "income" ? "received" : "paid") : "partial",
    row_version: rowVersion_(occurrence) + 1,
    updated_at: nowIso_()
  });
  try {
    updateRow_("Transactions", transaction.__row, updatedTransaction);
    updateRow_("Recurring_Occurrences", occurrence.__row, updatedOccurrence);
    appendAudit_(context, "recurring.reversePayment", "recurring_occurrence", occurrence.occurrence_id, { occurrence: publicRow_(previousOccurrence), transaction: publicRow_(previousTransaction) }, { occurrence: publicRow_(updatedOccurrence), transaction: publicRow_(updatedTransaction), reason: reason });
  } catch (error) {
    compensateOrFailClosed_("recurring_reverse_compensation_required", { action: "recurring.reversePayment", occurrenceId: occurrence.occurrence_id, transactionId: transaction.transaction_id, cause: error.code || error.message }, function() {
      updateRow_("Transactions", previousTransaction.__row, previousTransaction);
      updateRow_("Recurring_Occurrences", previousOccurrence.__row, previousOccurrence);
    });
    throw sbError_("RECURRING_REVERSE_ROLLED_BACK", "Pembatalan pembayaran gagal dan seluruh perubahan telah dibatalkan.", 503, { cause: error.code || error.message });
  }
  return { occurrence: publicRow_(updatedOccurrence), transaction: publicRow_(updatedTransaction) };
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
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw sbError_("INVALID_PERIOD", "Periode budget harus menggunakan format YYYY-MM.", 400);
  const warningThreshold = Number(payload.warning_threshold === undefined ? 80 : payload.warning_threshold);
  if (!Number.isInteger(warningThreshold) || warningThreshold < 1 || warningThreshold > 100) throw sbError_("INVALID_WARNING_THRESHOLD", "Ambang peringatan budget harus integer 1-100.", 400);
  const current = rows_("Budgets").find(function(row) { return row.period_key === period && row.category_id === payload.category_id; });
  if (current) {
    assertVersion_(current, context.rowVersion || payload.row_version);
    const updated = Object.assign({}, current, {
      amount: intAmount_(payload.amount), warning_threshold: warningThreshold,
      row_version: rowVersion_(current) + 1, updated_by: context.actor.user_id, updated_at: nowIso_()
    });
    updateAuditedRow_("Budgets", current, updated, context, "budgets.upsert", "budget", updated.budget_id);
    return publicRow_(updated);
  }
  const category = activeCategory_(payload.category_id, "expense");
  const record = { budget_id: uuid_(), period_key: period, category_id: category.category_id, envelope_rule_id: payload.envelope_rule_id || "", name: category.name, amount: intAmount_(payload.amount), warning_threshold: warningThreshold, status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_(), updated_by: context.actor.user_id, updated_at: nowIso_() };
  appendAuditedRow_("Budgets", "budget_id", record, context, "budgets.upsert", "budget", null, publicRow_(record));
  return publicRow_(record);
}

function goalCurrentAmount_(goalId) {
  return rows_("Goal_Movements").filter(function(row) { return row.goal_id === goalId && row.status === "active"; }).reduce(function(sum, row) { return sum + (row.movement_type === "withdraw" ? -Number(row.amount || 0) : Number(row.amount || 0)); }, 0);
}

function listGoals_() {
  const movements = rows_("Goal_Movements").filter(function(item) { return item.status === "active"; });
  return rows_("Savings_Goals").map(function(row) {
    const latest = movements.filter(function(item) { return item.goal_id === row.goal_id; }).sort(function(a, b) { return String(b.created_at).localeCompare(String(a.created_at)); })[0] || null;
    return Object.assign(publicRow_(row), {
      current_amount: goalCurrentAmount_(row.goal_id),
      last_movement_id: latest ? latest.goal_movement_id : "",
      last_transaction_id: latest ? latest.transaction_id : "",
      last_movement_type: latest ? latest.movement_type : ""
    });
  });
}

function createGoal_(context) {
  const payload = context.payload;
  const goalType = sanitizeText_(payload.goal_type || "savings", 40);
  if (["savings", "emergency_fund", "sinking_fund"].indexOf(goalType) === -1) throw sbError_("INVALID_GOAL_TYPE", "Jenis target tidak valid.", 400);
  if (!payload.account_id) throw sbError_("ACCOUNT_REQUIRED", "Target wajib terhubung ke rekening tujuan.", 400);
  const account = activeAccount_(payload.account_id);
  assertAccountAccess_(context, account);
  const record = { goal_id: uuid_(), name: sanitizeText_(payload.name, 100), goal_type: goalType, target_amount: intAmount_(payload.target_amount), target_date: validateDate_(payload.target_date), account_id: account.account_id, priority: sanitizeText_(payload.priority || "normal", 20), status: "active", row_version: 1, created_by: context.actor.user_id, created_at: nowIso_(), updated_by: context.actor.user_id, updated_at: nowIso_() };
  if (!record.name) throw sbError_("NAME_REQUIRED", "Nama target wajib diisi.", 400);
  appendAuditedRow_("Savings_Goals", "goal_id", record, context, "goals.create", "goal", null, publicRow_(record));
  return Object.assign(publicRow_(record), { current_amount: 0 });
}

function moveGoal_(context) {
  const payload = context.payload;
  const goal = findBy_("Savings_Goals", "goal_id", payload.goal_id);
  if (!goal || goal.status !== "active") throw sbError_("INVALID_GOAL", "Target tidak aktif.", 400);
  const amount = intAmount_(payload.amount);
  if (["contribution", "withdraw"].indexOf(payload.movement_type) === -1) throw sbError_("INVALID_MOVEMENT_TYPE", "Jenis mutasi target harus contribution atau withdraw.", 400);
  const movementType = payload.movement_type;
  if (movementType === "withdraw" && amount > goalCurrentAmount_(goal.goal_id)) throw sbError_("INSUFFICIENT_GOAL_BALANCE", "Nominal penarikan melebihi saldo target.", 409);
  if (!payload.source_account_id || !payload.destination_account_id) throw sbError_("ACCOUNT_REQUIRED", "Mutasi target wajib memiliki rekening sumber dan tujuan.", 400);
  if (String(payload.source_account_id) === String(payload.destination_account_id)) throw sbError_("SAME_TRANSFER_ACCOUNT", "Rekening sumber dan tujuan harus berbeda.", 400);
  if (movementType === "contribution" && String(payload.destination_account_id) !== String(goal.account_id)) throw sbError_("GOAL_ACCOUNT_MISMATCH", "Kontribusi harus masuk ke rekening target.", 400);
  if (movementType === "withdraw" && String(payload.source_account_id) !== String(goal.account_id)) throw sbError_("GOAL_ACCOUNT_MISMATCH", "Penarikan harus berasal dari rekening target.", 400);
  const sourceAccount = activeAccount_(payload.source_account_id);
  const destinationAccount = activeAccount_(payload.destination_account_id);
  assertAccountAccess_(context, sourceAccount);
  assertAccountAccess_(context, destinationAccount);
  let transaction = null;
  const movement = { goal_movement_id: uuid_(), goal_id: goal.goal_id, transaction_id: "", movement_type: movementType, amount: amount, reason: sanitizeText_(payload.reason, 180), status: "active", created_by: context.actor.user_id, created_at: nowIso_() };
  try {
    transaction = createTransaction_(context, { transaction_date: payload.transaction_date || today_(), transaction_type: "transfer", source_account_id: sourceAccount.account_id, destination_account_id: destinationAccount.account_id, amount: amount, goal_id: goal.goal_id, description: goal.name, scope: "shared", confirm_duplicate: true }, { skipAudit: true });
    movement.transaction_id = transaction.transaction_id;
    appendRow_("Goal_Movements", movement);
    appendAudit_(context, "goals.move", "goal_movement", movement.goal_movement_id, null, { movement: publicRow_(movement), transaction: transaction });
  } catch (error) {
    compensateOrFailClosed_("goal_movement_compensation_required", { action: "goals.move", goalMovementId: movement.goal_movement_id, transactionId: transaction && transaction.transaction_id, cause: error.code || error.message }, function() {
      const movementRow = findBy_("Goal_Movements", "goal_movement_id", movement.goal_movement_id);
      if (movementRow) deleteRow_("Goal_Movements", movementRow.__row);
      if (transaction && transaction.transaction_id) {
        const transactionRow = findBy_("Transactions", "transaction_id", transaction.transaction_id);
        if (transactionRow) deleteRow_("Transactions", transactionRow.__row);
      }
    });
    throw sbError_("GOAL_MOVE_ROLLED_BACK", "Perubahan target gagal dan transaksi terkait telah dibatalkan.", 503, { cause: error.code || error.message });
  }
  return { movement: publicRow_(movement), goal: Object.assign(publicRow_(goal), { current_amount: goalCurrentAmount_(goal.goal_id) }) };
}

function reverseGoalMovement_(context) {
  const payload = context.payload;
  const movement = findBy_("Goal_Movements", "goal_movement_id", payload.goal_movement_id);
  if (!movement || movement.status !== "active") throw sbError_("NOT_FOUND", "Mutasi target aktif tidak ditemukan.", 404);
  if (context.actor.role !== "owner" && String(movement.created_by) !== String(context.actor.user_id)) throw sbError_("FORBIDDEN", "Member hanya dapat membatalkan mutasi target yang dibuat sendiri.", 403);
  const transaction = movement.transaction_id ? findBy_("Transactions", "transaction_id", movement.transaction_id) : null;
  if (movement.transaction_id && (!transaction || transaction.status !== "active" || transaction.goal_id !== movement.goal_id)) throw sbError_("INVALID_LINKED_TRANSACTION", "Transaksi target aktif tidak ditemukan atau tidak konsisten.", 409);
  if (transaction) assertPeriodOpen_(transaction.transaction_date);
  const reason = sanitizeText_(payload.reason, 200);
  if (!reason) throw sbError_("REASON_REQUIRED", "Alasan pembatalan mutasi target wajib diisi.", 400);
  const previousMovement = Object.assign({}, movement);
  const previousTransaction = transaction ? Object.assign({}, transaction) : null;
  const updatedMovement = Object.assign({}, movement, { status: "cancelled" });
  const updatedTransaction = transaction ? Object.assign({}, transaction, { status: "cancelled", cancelled_by: context.actor.user_id, cancelled_at: nowIso_(), cancellation_reason: reason, row_version: rowVersion_(transaction) + 1, updated_by: context.actor.user_id, updated_at: nowIso_() }) : null;
  try {
    if (updatedTransaction) updateRow_("Transactions", transaction.__row, updatedTransaction);
    updateRow_("Goal_Movements", movement.__row, updatedMovement);
    appendAudit_(context, "goals.reverseMovement", "goal_movement", movement.goal_movement_id, { movement: publicRow_(previousMovement), transaction: previousTransaction ? publicRow_(previousTransaction) : null }, { movement: publicRow_(updatedMovement), transaction: updatedTransaction ? publicRow_(updatedTransaction) : null, reason: reason });
  } catch (error) {
    compensateOrFailClosed_("goal_reverse_compensation_required", { action: "goals.reverseMovement", goalMovementId: movement.goal_movement_id, transactionId: movement.transaction_id, cause: error.code || error.message }, function() {
      if (previousTransaction) updateRow_("Transactions", previousTransaction.__row, previousTransaction);
      updateRow_("Goal_Movements", previousMovement.__row, previousMovement);
    });
    throw sbError_("GOAL_REVERSE_ROLLED_BACK", "Pembatalan mutasi target gagal dan seluruh perubahan telah dibatalkan.", 503, { cause: error.code || error.message });
  }
  const goal = findBy_("Savings_Goals", "goal_id", movement.goal_id);
  return { movement: publicRow_(updatedMovement), transaction: updatedTransaction ? publicRow_(updatedTransaction) : null, goal: goal ? Object.assign(publicRow_(goal), { current_amount: goalCurrentAmount_(goal.goal_id) }) : null };
}
