function dashboardOverview_(context) {
  const period = context.payload.period || monthKey_();
  ensureRecurringOccurrences_(period);
  const accounts = listAccounts_().filter(function(row) { return row.status === "active"; });
  const transactions = rows_("Transactions");
  const periodTransactions = transactions.filter(function(row) { return row.status === "active" && String(row.transaction_date).slice(0, 7) === period; });
  const income = periodTransactions.filter(function(row) { return row.transaction_type === "income"; }).reduce(function(sum, row) { return sum + Number(row.amount || 0); }, 0);
  const expense = periodTransactions.filter(function(row) { return row.transaction_type === "expense"; }).reduce(function(sum, row) { return sum + Number(row.amount || 0); }, 0);
  const refund = periodTransactions.filter(function(row) { return row.transaction_type === "refund"; }).reduce(function(sum, row) { return sum + Number(row.amount || 0); }, 0);
  const recurring = listRecurring_({ payload: { period: period } });
  const reservedBills = recurring.filter(function(row) { return row.kind === "expense" && !["paid", "cancelled"].includes(row.status); }).reduce(function(sum, row) { return sum + Number(row.expected_amount || 0) - Number(row.actual_amount || 0); }, 0);
  const totalBalance = accounts.reduce(function(sum, row) { return sum + Number(row.balance || 0); }, 0);
  const protectedTypes = ["emergency_fund", "savings", "sinking_fund"];
  const emergencyBalance = accounts.filter(function(row) { return row.account_type === "emergency_fund"; }).reduce(function(sum, row) { return sum + Number(row.balance || 0); }, 0);
  const protectedBalance = accounts.filter(function(row) { return protectedTypes.indexOf(String(row.account_type)) !== -1; }).reduce(function(sum, row) { return sum + Number(row.balance || 0); }, 0);
  const liquidBalance = accounts.filter(function(row) { return protectedTypes.indexOf(String(row.account_type)) === -1; }).reduce(function(sum, row) { return sum + Number(row.balance || 0); }, 0);
  const safeToSpend = Math.max(0, liquidBalance - reservedBills);
  const periodParts = String(period).split("-").map(Number);
  const today = new Date();
  const isCurrentPeriod = periodParts[0] === Number(Utilities.formatDate(today, SB_TIMEZONE, "yyyy")) && periodParts[1] === Number(Utilities.formatDate(today, SB_TIMEZONE, "MM"));
  const lastDay = new Date(periodParts[0], periodParts[1], 0).getDate();
  const currentDay = isCurrentPeriod ? Number(Utilities.formatDate(today, SB_TIMEZONE, "dd")) : 1;
  const daysRemaining = Math.max(1, lastDay - currentDay + 1);
  const dailySafeToSpend = Math.floor(safeToSpend / daysRemaining);
  const allocation = allocationAvailability_("");
  return {
    periodKey: period, accountBalances: accounts, totalBalance: totalBalance, liquidBalance: liquidBalance,
    safeToSpend: safeToSpend, dailySafeToSpend: dailySafeToSpend, daysRemaining: daysRemaining, emergencyBalance: emergencyBalance, protectedBalance: protectedBalance,
    cashFlow: { income: income, expense: expense, refund: refund, net: income + refund - expense },
    envelopes: listEnvelopes_({ payload: { period: period } }), recurring: recurring, goals: listGoals_(),
    recentTransactions: periodTransactions.sort(function(a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }).slice(0, 12).map(publicRow_),
    unallocatedCount: periodTransactions.filter(function(row) { return row.transaction_type === "expense" && !row.envelope_period_id; }).length,
    unallocatedFunds: allocation.unallocatedAmount, allocatedRemaining: allocation.allocatedRemaining,
    reservedBills: reservedBills, lastSyncedAt: nowIso_()
  };
}

function monthlyReport_(context) {
  const period = context.payload.period || monthKey_();
  const overview = dashboardOverview_({ payload: { period: period } });
  const categories = Object.fromEntries(rows_("Categories").map(function(row) { return [row.category_id, row.name]; }));
  const categoryMap = {};
  rows_("Transactions").filter(function(row) { return row.status === "active" && row.transaction_type === "expense" && String(row.transaction_date).slice(0, 7) === period; }).forEach(function(row) {
    const name = categories[row.category_id] || "Belum dikategorikan";
    categoryMap[name] = Number(categoryMap[name] || 0) + Number(row.amount || 0);
  });
  return { overview: overview, budgets: listBudgets_({ payload: { period: period } }), categoryExpenses: Object.keys(categoryMap).map(function(name) { return { name: name, amount: categoryMap[name] }; }) };
}

function createReconciliation_(context) {
  const payload = context.payload;
  const account = activeAccount_(payload.account_id);
  const actual = Number(payload.actual_balance);
  if (!Number.isSafeInteger(actual)) throw sbError_("INVALID_AMOUNT", "Saldo aktual harus integer rupiah.", 400);
  const system = accountBalance_(account.account_id);
  const record = { reconciliation_id: uuid_(), account_id: account.account_id, reconciled_at: nowIso_(), system_balance: system, actual_balance: actual, difference: actual - system, notes: sanitizeText_(payload.notes, 250), status: actual === system ? "matched" : "difference", created_by: context.actor.user_id, created_at: nowIso_() };
  appendRow_("Reconciliations", record); appendAudit_(context, "reconciliations.create", "reconciliation", record.reconciliation_id, null, publicRow_(record));
  return publicRow_(record);
}

function closePeriod_(context) {
  const periodKey = String(context.payload.period_key || monthKey_());
  if (findBy_("Period_Closures", "period_key", periodKey)) throw sbError_("PERIOD_ALREADY_EXISTS", "Record tutup buku periode sudah ada.", 409);
  const issues = integrityIssues_().filter(function(issue) { return issue.periodKey === periodKey || !issue.periodKey; });
  const unallocated = rows_("Transactions").filter(function(row) { return row.status === "active" && row.transaction_type === "expense" && !row.envelope_period_id && String(row.transaction_date).slice(0, 7) === periodKey; });
  if (unallocated.length) issues.push({ code: "UNALLOCATED_EXPENSE", count: unallocated.length, periodKey: periodKey });
  if (issues.length) throw sbError_("PERIOD_INTEGRITY_FAILED", "Periode belum dapat ditutup karena integrity check gagal.", 409, issues);
  const snapshot = monthlyReport_({ payload: { period: periodKey } });
  const record = { closure_id: uuid_(), period_key: periodKey, scope: context.payload.scope || "shared", status: "closed", snapshot_json: JSON.stringify(snapshot), reason: sanitizeText_(context.payload.reason, 200), row_version: 1, closed_by: context.actor.user_id, closed_at: nowIso_(), reopened_by: "", reopened_at: "" };
  appendRow_("Period_Closures", record); appendAudit_(context, "periods.close", "period_closure", record.closure_id, null, publicRow_(record));
  return publicRow_(record);
}

function reopenPeriod_(context) {
  const current = findBy_("Period_Closures", "closure_id", context.payload.closure_id);
  if (!current || current.status !== "closed") throw sbError_("NOT_FOUND", "Periode tertutup tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  const reason = sanitizeText_(context.payload.reason, 200);
  if (!reason) throw sbError_("REASON_REQUIRED", "Alasan membuka periode wajib diisi.", 400);
  const previous = publicRow_(current);
  current.status = "reopened"; current.reason = reason; current.reopened_by = context.actor.user_id; current.reopened_at = nowIso_(); current.row_version = rowVersion_(current) + 1;
  updateRow_("Period_Closures", current.__row, current); appendAudit_(context, "periods.reopen", "period_closure", current.closure_id, previous, publicRow_(current));
  return publicRow_(current);
}

function syncCalendar_(context) {
  const calendarId = PropertiesService.getScriptProperties().getProperty("CALENDAR_ID");
  if (!calendarId) throw sbError_("CONFIG_MISSING", "CALENDAR_ID belum diatur di Script Properties.", 503);
  const calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) throw sbError_("CALENDAR_NOT_FOUND", "Kalender Saldo Bersama tidak ditemukan.", 404);
  const period = context.payload.period || monthKey_();
  const items = listRecurring_({ payload: { period: period } });
  let synced = 0;
  items.forEach(function(item) {
    let sync = rows_("Calendar_Sync").find(function(row) { return row.entity_type === "recurring_occurrence" && row.entity_id === item.occurrence_id; });
    const title = (item.status === "paid" || item.status === "received" ? "✓ " : "") + (item.kind === "income" ? "Periksa pemasukan: " : "Periksa tagihan: ") + item.name;
    const date = new Date(item.due_date + "T09:00:00+07:00");
    let event = null;
    if (sync && sync.event_id) { try { event = calendar.getEventById(sync.event_id); } catch (error) { event = null; } }
    if (event) { event.setTitle(title); event.setTime(date, new Date(date.getTime() + 30 * 60000)); }
    else { event = calendar.createEvent(title, date, new Date(date.getTime() + 30 * 60000), { description: "Buka aplikasi Saldo Bersama untuk detail. Kalender bukan sumber status pembayaran." }); }
    const record = { sync_id: sync ? sync.sync_id : uuid_(), entity_type: "recurring_occurrence", entity_id: item.occurrence_id, event_id: event.getId(), sync_status: "synced", last_synced_at: nowIso_(), last_error: "", row_version: sync ? rowVersion_(sync) + 1 : 1 };
    if (sync) updateRow_("Calendar_Sync", sync.__row, record); else appendRow_("Calendar_Sync", record);
    synced += 1;
  });
  appendAudit_(context, "calendar.sync", "calendar", calendarId, null, { synced: synced });
  return { synced: synced, calendarId: calendarId };
}

function registerPush_(context) {
  const payload = context.payload;
  if (!/^https:\/\//.test(String(payload.endpoint || "")) || !payload.keys || !payload.keys.p256dh || !payload.keys.auth) throw sbError_("INVALID_SUBSCRIPTION", "Push subscription tidak valid.", 400);
  const existing = findBy_("Push_Subscriptions", "endpoint", payload.endpoint);
  const record = { subscription_id: existing ? existing.subscription_id : uuid_(), user_id: context.actor.user_id, endpoint: payload.endpoint, p256dh: payload.keys.p256dh, auth: payload.keys.auth, user_agent: sanitizeText_(payload.userAgent, 250), status: "active", created_at: existing ? existing.created_at : nowIso_(), updated_at: nowIso_() };
  if (existing) updateRow_("Push_Subscriptions", existing.__row, record); else appendRow_("Push_Subscriptions", record);
  appendAudit_(context, "notifications.register", "push_subscription", record.subscription_id, null, { user_id: record.user_id, status: record.status });
  return { registered: true, subscriptionId: record.subscription_id };
}

function unregisterPush_(context) {
  const current = findBy_("Push_Subscriptions", "endpoint", context.payload.endpoint);
  if (!current || current.user_id !== context.actor.user_id) throw sbError_("NOT_FOUND", "Subscription tidak ditemukan.", 404);
  current.status = "revoked"; current.updated_at = nowIso_(); updateRow_("Push_Subscriptions", current.__row, current);
  appendAudit_(context, "notifications.unregister", "push_subscription", current.subscription_id, null, { status: "revoked" });
  return { unregistered: true };
}

function createBackup_(context) {
  const spreadsheet = getSpreadsheet_();
  const type = sanitizeText_(context.payload.type || "manual", 30);
  const timestamp = Utilities.formatDate(new Date(), SB_TIMEZONE, "yyyyMMdd-HHmmss");
  const baseName = "saldo-bersama-" + timestamp + "-" + type;
  const folderId = PropertiesService.getScriptProperties().getProperty("BACKUP_FOLDER_ID");
  const folder = folderId ? DriveApp.getFolderById(folderId) : null;
  const copy = folder ? DriveApp.getFileById(spreadsheet.getId()).makeCopy(baseName, folder) : DriveApp.getFileById(spreadsheet.getId()).makeCopy(baseName);
  const validation = validateBackupSpreadsheet_(copy.getId());
  const verified = validation.issues.length === 0;
  const record = { backup_id: uuid_(), backup_type: type, file_id: copy.getId(), file_name: copy.getName(), schema_version: validation.schemaVersion || SB_SCHEMA_VERSION, status: verified ? "verified" : "failed", checksum: "drive-copy:" + copy.getSize(), created_by: context.actor.user_id, created_at: nowIso_(), verified_at: verified ? nowIso_() : "" };
  appendRow_("Backup_Log", record); appendAudit_(context, "backup.create", "backup", record.backup_id, null, { file_name: record.file_name, status: record.status, issues: validation.issues });
  if (!verified) throw sbError_("BACKUP_VERIFICATION_FAILED", "Salinan backup dibuat tetapi gagal diverifikasi.", 500, validation.issues);
  return { fileId: record.file_id, fileName: record.file_name, createdAt: record.created_at, verified: true };
}

function integrityIssues_() {
  const issues = [];
  const accountIds = new Set(rows_("Accounts").map(function(row) { return row.account_id; }));
  const categoryIds = new Set(rows_("Categories").map(function(row) { return row.category_id; }));
  const seen = new Set();
  rows_("Transactions").forEach(function(row) {
    if (seen.has(row.transaction_id)) issues.push({ code: "DUPLICATE_TRANSACTION_ID", entityId: row.transaction_id, periodKey: String(row.transaction_date).slice(0, 7) });
    seen.add(row.transaction_id);
    if (!Number.isSafeInteger(Number(row.amount)) || Number(row.amount) <= 0) issues.push({ code: "INVALID_AMOUNT", entityId: row.transaction_id, periodKey: String(row.transaction_date).slice(0, 7) });
    if (row.source_account_id && !accountIds.has(row.source_account_id)) issues.push({ code: "MISSING_SOURCE_ACCOUNT", entityId: row.transaction_id, periodKey: String(row.transaction_date).slice(0, 7) });
    if (row.destination_account_id && !accountIds.has(row.destination_account_id)) issues.push({ code: "MISSING_DESTINATION_ACCOUNT", entityId: row.transaction_id, periodKey: String(row.transaction_date).slice(0, 7) });
    if (row.category_id && !categoryIds.has(row.category_id)) issues.push({ code: "MISSING_CATEGORY", entityId: row.transaction_id, periodKey: String(row.transaction_date).slice(0, 7) });
    if (row.transaction_type === "transfer" && row.source_account_id === row.destination_account_id) issues.push({ code: "INVALID_TRANSFER", entityId: row.transaction_id, periodKey: String(row.transaction_date).slice(0, 7) });
  });
  const idFields = {
    Users: "user_id", Accounts: "account_id", Categories: "category_id", Envelope_Rules: "envelope_rule_id",
    Envelope_Periods: "envelope_period_id", Recurring_Rules: "recurring_rule_id", Recurring_Occurrences: "occurrence_id",
    Budgets: "budget_id", Savings_Goals: "goal_id", Goal_Movements: "goal_movement_id"
  };
  Object.keys(idFields).forEach(function(sheetName) {
    const field = idFields[sheetName];
    const ids = new Set();
    rows_(sheetName).forEach(function(row) {
      const id = String(row[field] || "");
      if (!id) issues.push({ code: "MISSING_UNIQUE_ID", sheet: sheetName, field: field });
      else if (ids.has(id)) issues.push({ code: "DUPLICATE_UNIQUE_ID", sheet: sheetName, field: field, entityId: id });
      ids.add(id);
    });
  });
  const envelopeIds = new Set(rows_("Envelope_Periods").map(function(row) { return row.envelope_period_id; }));
  const occurrenceIds = new Set(rows_("Recurring_Occurrences").map(function(row) { return row.occurrence_id; }));
  const goalIds = new Set(rows_("Savings_Goals").map(function(row) { return row.goal_id; }));
  rows_("Transactions").forEach(function(row) {
    if (row.envelope_period_id && !envelopeIds.has(row.envelope_period_id)) issues.push({ code: "MISSING_ENVELOPE_PERIOD", entityId: row.transaction_id });
    if (row.recurring_occurrence_id && !occurrenceIds.has(row.recurring_occurrence_id)) issues.push({ code: "MISSING_RECURRING_OCCURRENCE", entityId: row.transaction_id });
    if (row.goal_id && !goalIds.has(row.goal_id)) issues.push({ code: "MISSING_GOAL", entityId: row.transaction_id });
  });
  const activeUsers = rows_("Users").filter(function(row) { return row.status === "active"; });
  if (!activeUsers.some(function(row) { return row.role === "owner"; })) issues.push({ code: "MISSING_ACTIVE_OWNER" });
  const emails = new Set();
  activeUsers.forEach(function(row) {
    const email = String(row.email || "").toLowerCase();
    if (!email) issues.push({ code: "MISSING_USER_EMAIL", entityId: row.user_id });
    else if (emails.has(email)) issues.push({ code: "DUPLICATE_USER_EMAIL", email: email });
    emails.add(email);
  });
  const allocation = allocationAvailability_("");
  if (allocation.allocatedRemaining > allocation.availableBalance) issues.push({ code: "OVERALLOCATED_FUNDS", availableBalance: allocation.availableBalance, allocatedRemaining: allocation.allocatedRemaining });
  return issues;
}

function runIntegrity_(context) {
  const schemaIssues = validateSchema_().map(function(message) { return { code: "SCHEMA", message: message }; });
  const issues = schemaIssues.concat(integrityIssues_());
  appendAudit_(context, "integrity.run", "system", "integrity", null, { issueCount: issues.length });
  return { ok: issues.length === 0, checkedAt: nowIso_(), issues: issues };
}

function listAudit_(context) {
  const limit = Math.max(1, Math.min(200, Number(context.payload.limit || 50)));
  return rows_("Audit_Log").sort(function(a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); }).slice(0, limit).map(function(row) {
    return { audit_id: row.audit_id, timestamp: row.timestamp, actor_email: row.actor_email, action: row.action, entity_type: row.entity_type, entity_id: row.entity_id, result: row.result };
  });
}
