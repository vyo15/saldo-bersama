function dashboardOverview_(context, snapshots) {
  const period = periodKey_(context.payload.period);
  const cutoffDate = periodCutoffDate_(period);
  const model = snapshots && snapshots.model
    ? snapshots.model
    : buildTransactionReadModel_(context, snapshots && snapshots.transactions || null);
  const transactions = model.transactions;
  const currentPeriod = monthKey_();
  const isCurrentPeriod = period === currentPeriod;
  const isHistoricalPeriod = period < currentPeriod;
  const accountCandidates = snapshots && snapshots.accounts || listAccounts_(context, model, cutoffDate);
  const accounts = accountCandidates.filter(function(row) {
    if (isHistoricalPeriod) return accountInitialDate_(row) <= cutoffDate;
    return row.status === "active";
  });
  const periodTransactions = (model.activeTransactionsByPeriod[period] || []).filter(function(row) {
    return String(row.transaction_date || "") <= cutoffDate;
  });
  let income = 0;
  let expense = 0;
  let refund = 0;
  let unallocatedCount = 0;
  const categoryTotals = {};
  periodTransactions.forEach(function(row) {
    const amount = Number(row.amount || 0);
    if (row.transaction_type === "income") income += amount;
    else if (row.transaction_type === "expense") {
      expense += amount;
      if (!row.envelope_period_id) unallocatedCount += 1;
      const key = String(row.category_id || "");
      categoryTotals[key] = Number(categoryTotals[key] || 0) + amount;
    } else if (row.transaction_type === "refund") refund += amount;
  });
  const scopedContext = Object.assign({}, context, { payload: { period: period } });
  const recurring = listRecurring_(scopedContext);
  const reservedBills = recurring.filter(function(row) { return row.kind === "expense" && !["paid", "cancelled"].includes(row.status); }).reduce(function(sum, row) {
    return sum + Math.max(0, Number(row.expected_amount || 0) - Number(row.actual_amount || 0));
  }, 0);
  const totalBalance = accounts.reduce(function(sum, row) { return sum + Number(row.balance || 0); }, 0);
  const openingBalances = accountBalancesAsOfFromModel_(model, dateBefore_(periodStartDate_(period)));
  const openingBalance = accounts.reduce(function(sum, row) { return sum + Number(openingBalances[String(row.account_id)] || 0); }, 0);
  const protectedTypes = ["emergency_fund", "savings", "sinking_fund"];
  const emergencyBalance = accounts.filter(function(row) { return row.account_type === "emergency_fund"; }).reduce(function(sum, row) { return sum + Number(row.balance || 0); }, 0);
  const protectedBalance = accounts.filter(function(row) { return protectedTypes.indexOf(String(row.account_type)) !== -1; }).reduce(function(sum, row) { return sum + Number(row.balance || 0); }, 0);
  const liquidBalance = accounts.filter(function(row) { return protectedTypes.indexOf(String(row.account_type)) === -1; }).reduce(function(sum, row) { return sum + Number(row.balance || 0); }, 0);
  const safeToSpend = Math.max(0, liquidBalance - reservedBills);
  const lastDay = Number(periodEndDate_(period).slice(-2));
  const currentDay = isCurrentPeriod ? Number(today_().slice(-2)) : 1;
  const daysRemaining = isHistoricalPeriod ? 0 : Math.max(1, lastDay - currentDay + 1);
  const dailySafeToSpend = daysRemaining > 0 ? Math.floor(safeToSpend / daysRemaining) : 0;
  const allocation = allocationAvailability_("", context, {
    model: model,
    accounts: accounts,
    period: period,
    cutoffDate: cutoffDate,
    includeArchivedAccounts: isHistoricalPeriod
  });
  const categoryRows = snapshots && snapshots.categories || rows_("Categories");
  const categoryNames = Object.fromEntries(categoryRows.map(function(row) { return [row.category_id, row.name]; }));
  const categoryExpenses = Object.keys(categoryTotals).map(function(categoryId) {
    return { category_id: categoryId, name: categoryNames[categoryId] || "Belum dikategorikan", amount: categoryTotals[categoryId] };
  }).sort(function(a, b) { return b.amount - a.amount; });
  return {
    periodKey: period,
    cutoffDate: cutoffDate,
    isHistoricalPeriod: isHistoricalPeriod,
    accountBalances: accounts,
    totalBalance: totalBalance,
    openingBalance: openingBalance,
    balanceChange: totalBalance - openingBalance,
    liquidBalance: liquidBalance,
    safeToSpend: safeToSpend,
    dailySafeToSpend: dailySafeToSpend,
    daysRemaining: daysRemaining,
    emergencyBalance: emergencyBalance,
    protectedBalance: protectedBalance,
    cashFlow: { income: income, expense: expense, refund: refund, net: income + refund - expense },
    envelopes: listEnvelopes_(scopedContext, model),
    recurring: recurring,
    goals: listGoals_(context, cutoffDate),
    recentTransactions: periodTransactions.slice().sort(function(a, b) {
      return String(b.transaction_date).localeCompare(String(a.transaction_date)) || String(b.created_at).localeCompare(String(a.created_at));
    }).slice(0, 12).map(function(row) { return Object.assign(publicRow_(row), transactionCapabilities_(context, row)); }),
    categoryExpenses: categoryExpenses,
    unallocatedCount: unallocatedCount,
    unallocatedFunds: allocation.unallocatedAmount,
    allocatedRemaining: allocation.allocatedRemaining,
    reservedBills: reservedBills,
    lastSyncedAt: nowIso_()
  };
}

function monthlyReport_(context) {
  const period = periodKey_(context.payload.period);
  const scopedContext = Object.assign({}, context, { payload: { period: period } });
  const overview = dashboardOverview_(scopedContext);
  return { overview: overview, budgets: listBudgets_(scopedContext), categoryExpenses: overview.categoryExpenses || [] };
}

function listReconciliations_(context) {
  const accountById = Object.fromEntries(rows_("Accounts").filter(function(account) {
    return canAccessAccount_(context, account);
  }).map(function(account) {
    return [String(account.account_id || ""), account];
  }));
  const limit = Math.max(1, Math.min(100, Number(context.payload && context.payload.limit || 30)));
  return rows_("Reconciliations").filter(function(row) {
    return Boolean(accountById[String(row.account_id || "")]);
  }).sort(function(a, b) {
    return String(b.reconciled_at || "").localeCompare(String(a.reconciled_at || ""));
  }).slice(0, limit).map(function(row) {
    const account = accountById[String(row.account_id || "")];
    return Object.assign(publicRow_(row), { account_name: account ? account.name : "" });
  });
}

function createReconciliation_(context) {
  const payload = context.payload;
  const account = activeAccount_(payload.account_id);
  assertAccountAccess_(context, account);
  const actual = Number(payload.actual_balance);
  if (!Number.isSafeInteger(actual)) throw sbError_("INVALID_AMOUNT", "Saldo aktual harus integer rupiah.", 400);
  const system = accountBalance_(account.account_id);
  const record = { reconciliation_id: uuid_(), account_id: account.account_id, reconciled_at: nowIso_(), system_balance: system, actual_balance: actual, difference: actual - system, notes: sanitizeText_(payload.notes, 250), status: actual === system ? "matched" : "difference", created_by: context.actor.user_id, created_at: nowIso_() };
  appendAuditedRow_("Reconciliations", "reconciliation_id", record, context, "reconciliations.create", "reconciliation", null, publicRow_(record));
  return publicRow_(record);
}

function periodSnapshotFinancialState_(snapshot) {
  const source = snapshot || {};
  return {
    schemaVersion: source.schemaVersion,
    periodKey: source.periodKey,
    totals: source.totals || {},
    accountBalances: (source.accountBalances || []).map(function(account) {
      return { account_id: account.account_id, balance: Number(account.balance || 0) };
    }).sort(function(left, right) { return String(left.account_id).localeCompare(String(right.account_id)); }),
    categoryExpenses: (source.categoryExpenses || []).map(function(item) {
      return { category_id: item.category_id, amount: Number(item.amount || 0) };
    }).sort(function(left, right) { return String(left.category_id).localeCompare(String(right.category_id)); }),
    budgets: (source.budgets || []).map(function(item) {
      return {
        budget_id: item.budget_id,
        category_id: item.category_id,
        amount: Number(item.amount || 0),
        used_amount: Number(item.used_amount || 0),
        status: item.status
      };
    }).sort(function(left, right) { return String(left.budget_id).localeCompare(String(right.budget_id)); }),
    envelopes: (source.envelopes || []).map(function(item) {
      return {
        envelope_period_id: item.envelope_period_id,
        envelope_rule_id: item.envelope_rule_id,
        allocated_amount: Number(item.allocated_amount || 0),
        reserved_amount: Number(item.reserved_amount || 0),
        used_amount: Number(item.used_amount || 0),
        status: item.status
      };
    }).sort(function(left, right) { return String(left.envelope_period_id).localeCompare(String(right.envelope_period_id)); }),
    recurring: (source.recurring || []).map(function(item) {
      return {
        occurrence_id: item.occurrence_id,
        recurring_rule_id: item.recurring_rule_id,
        due_date: item.due_date,
        expected_amount: Number(item.expected_amount || 0),
        actual_amount: Number(item.actual_amount || 0),
        status: item.status
      };
    }).sort(function(left, right) { return String(left.occurrence_id).localeCompare(String(right.occurrence_id)); }),
    goals: (source.goals || []).map(function(item) {
      return {
        goal_id: item.goal_id,
        current_amount: Number(item.current_amount || 0)
      };
    }).sort(function(left, right) { return String(left.goal_id).localeCompare(String(right.goal_id)); })
  };
}

function periodSnapshotFingerprint_(snapshot) {
  return sha256Hex_(canonicalJson_(periodSnapshotFinancialState_(snapshot)));
}

function periodSnapshotComparableFingerprint_(snapshot, template) {
  const state = periodSnapshotFinancialState_(snapshot);
  const reference = template || snapshot || {};
  if (!Object.prototype.hasOwnProperty.call(reference, "envelopes")) delete state.envelopes;
  if (!Object.prototype.hasOwnProperty.call(reference, "recurring")) delete state.recurring;
  if (!Object.prototype.hasOwnProperty.call(reference, "goals")) delete state.goals;
  return sha256Hex_(canonicalJson_(state));
}

function compactPeriodSnapshot_(periodKey, context) {
  const report = monthlyReport_(Object.assign({}, context, { payload: { period: periodKey } }));
  const overview = report.overview;
  const snapshot = {
    schemaVersion: SB_SCHEMA_VERSION,
    periodKey: periodKey,
    generatedAt: nowIso_(),
    totals: {
      totalBalance: overview.totalBalance,
      liquidBalance: overview.liquidBalance,
      safeToSpend: overview.safeToSpend,
      protectedBalance: overview.protectedBalance,
      emergencyBalance: overview.emergencyBalance,
      reservedBills: overview.reservedBills,
      unallocatedFunds: overview.unallocatedFunds,
      allocatedRemaining: overview.allocatedRemaining,
      income: overview.cashFlow.income,
      expense: overview.cashFlow.expense,
      refund: overview.cashFlow.refund,
      net: overview.cashFlow.net
    },
    accountBalances: overview.accountBalances.map(function(account) {
      return { account_id: account.account_id, name: account.name, balance: account.balance, status: account.status };
    }),
    categoryExpenses: report.categoryExpenses,
    budgets: report.budgets.map(function(item) {
      return { budget_id: item.budget_id, category_id: item.category_id, name: item.name, amount: item.amount, used_amount: item.used_amount, status: item.status };
    }),
    envelopes: (overview.envelopes || []).map(function(item) {
      return {
        envelope_period_id: item.envelope_period_id,
        envelope_rule_id: item.envelope_rule_id,
        name: item.name,
        allocated_amount: item.allocated_amount,
        reserved_amount: item.reserved_amount,
        used_amount: item.used_amount,
        status: item.status
      };
    }),
    recurring: (overview.recurring || []).map(function(item) {
      return {
        occurrence_id: item.occurrence_id,
        recurring_rule_id: item.recurring_rule_id,
        name: item.name,
        due_date: item.due_date,
        expected_amount: item.expected_amount,
        actual_amount: item.actual_amount,
        status: item.status
      };
    }),
    goals: (overview.goals || []).map(function(item) {
      return {
        goal_id: item.goal_id,
        current_amount: item.current_amount
      };
    })
  };
  snapshot.financialFingerprint = periodSnapshotFingerprint_(snapshot);
  return snapshot;
}

function closePeriod_(context) {
  const periodKey = periodKey_(context.payload.period_key);
  const currentPeriod = monthKey_();
  if (periodKey > currentPeriod) throw sbError_("FUTURE_PERIOD", "Periode masa depan belum dapat ditutup.", 400, { periodKey: periodKey });
  if (periodKey === currentPeriod && today_() < periodEndDate_(periodKey)) {
    throw sbError_("PERIOD_NOT_ENDED", "Periode berjalan baru dapat ditutup pada hari terakhir bulan.", 409, {
      periodKey: periodKey,
      earliestCloseDate: periodEndDate_(periodKey)
    });
  }
  const records = rows_("Period_Closures").filter(function(row) { return String(row.period_key) === periodKey; });
  const closed = records.find(function(row) { return row.status === "closed"; });
  if (closed) throw sbError_("PERIOD_ALREADY_CLOSED", "Periode sudah ditutup.", 409, { closureId: closed.closure_id });
  const reopened = records.find(function(row) { return row.status === "reopened"; }) || null;
  const issues = integrityIssues_(context).filter(function(issue) { return issue.periodKey === periodKey || !issue.periodKey; });
  const unallocated = rows_("Transactions").filter(function(row) { return row.status === "active" && row.transaction_type === "expense" && !row.envelope_period_id && String(row.transaction_date).slice(0, 7) === periodKey; });
  if (unallocated.length) issues.push({ code: "UNALLOCATED_EXPENSE", count: unallocated.length, periodKey: periodKey });
  if (issues.length) throw sbError_("PERIOD_INTEGRITY_FAILED", "Periode belum dapat ditutup karena integrity check gagal.", 409, issues);
  const snapshot = compactPeriodSnapshot_(periodKey, context);
  const snapshotJson = canonicalJson_(snapshot);
  if (snapshotJson.length > 45000) throw sbError_("SNAPSHOT_TOO_LARGE", "Snapshot tutup buku terlalu besar. Ringkas data sebelum menutup periode.", 409, { length: snapshotJson.length });
  if (reopened) {
    const updated = Object.assign({}, reopened, {
      scope: "shared", status: "closed", snapshot_json: snapshotJson,
      reason: sanitizeText_(context.payload.reason, 200), row_version: rowVersion_(reopened) + 1,
      closed_by: context.actor.user_id, closed_at: nowIso_(), reopened_by: reopened.reopened_by || "", reopened_at: reopened.reopened_at || ""
    });
    updateAuditedRow_("Period_Closures", reopened, updated, context, "periods.close", "period_closure", updated.closure_id,
      { status: reopened.status, row_version: reopened.row_version },
      { status: updated.status, row_version: updated.row_version, snapshot_checksum: sha256Hex_(snapshotJson), snapshot_length: snapshotJson.length });
    return publicRow_(updated);
  }
  const record = { closure_id: uuid_(), period_key: periodKey, scope: "shared", status: "closed", snapshot_json: snapshotJson, reason: sanitizeText_(context.payload.reason, 200), row_version: 1, closed_by: context.actor.user_id, closed_at: nowIso_(), reopened_by: "", reopened_at: "" };
  appendAuditedRow_("Period_Closures", "closure_id", record, context, "periods.close", "period_closure", null,
    { closure_id: record.closure_id, period_key: record.period_key, status: record.status, row_version: record.row_version, snapshot_checksum: sha256Hex_(snapshotJson), snapshot_length: snapshotJson.length });
  return publicRow_(record);
}

function listPeriodClosures_() {
  return rows_("Period_Closures").sort(function(a, b) {
    return String(b.period_key).localeCompare(String(a.period_key)) || String(b.closed_at).localeCompare(String(a.closed_at));
  }).map(function(row) {
    const item = publicRow_(row);
    const snapshotJson = String(item.snapshot_json || "");
    delete item.snapshot_json;
    item.snapshot_length = snapshotJson.length;
    item.snapshot_checksum = snapshotJson ? sha256Hex_(snapshotJson) : "";
    return item;
  });
}

function reopenPeriod_(context) {
  const current = findBy_("Period_Closures", "closure_id", context.payload.closure_id);
  if (!current || current.status !== "closed") throw sbError_("NOT_FOUND", "Periode tertutup tidak ditemukan.", 404);
  assertVersion_(current, context.rowVersion || context.payload.row_version);
  const laterClosed = rows_("Period_Closures").filter(function(row) {
    return row.status === "closed" && String(row.period_key || "") > String(current.period_key || "");
  }).sort(function(left, right) {
    return String(right.period_key || "").localeCompare(String(left.period_key || ""));
  });
  if (laterClosed.length) {
    throw sbError_("LATER_PERIOD_CLOSED", "Periode harus dibuka kembali dari bulan tertutup paling akhir agar saldo historis tetap konsisten.", 409, {
      periodKey: current.period_key,
      latestClosedPeriod: laterClosed[0].period_key,
      latestClosureId: laterClosed[0].closure_id
    });
  }
  const reason = sanitizeText_(context.payload.reason, 200);
  if (!reason) throw sbError_("REASON_REQUIRED", "Alasan membuka periode wajib diisi.", 400);
  const updated = Object.assign({}, current, { status: "reopened", reason: reason, reopened_by: context.actor.user_id, reopened_at: nowIso_(), row_version: rowVersion_(current) + 1 });
  updateAuditedRow_("Period_Closures", current, updated, context, "periods.reopen", "period_closure", updated.closure_id,
    { status: current.status, row_version: current.row_version }, { status: updated.status, row_version: updated.row_version, reason: reason });
  return publicRow_(updated);
}

function findManagedCalendarEvent_(calendar, item, date) {
  const start = new Date(date.getTime() - 86400000);
  const end = new Date(date.getTime() + 2 * 86400000);
  return calendar.getEvents(start, end).find(function(event) {
    try { return event.getTag("saldo_bersama_entity_id") === item.occurrence_id; }
    catch (ignored) { return false; }
  }) || null;
}

function syncCalendar_(context) {
  const calendarId = PropertiesService.getScriptProperties().getProperty("CALENDAR_ID");
  if (!calendarId) throw sbError_("CONFIG_MISSING", "CALENDAR_ID belum diatur di Script Properties.", 503);
  const calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) throw sbError_("CALENDAR_NOT_FOUND", "Kalender Saldo Bersama tidak ditemukan.", 404);
  const period = periodKey_(context.payload.period);
  const allItems = listRecurring_({ actor: context.actor, payload: { period: period } });
  const items = allItems.filter(function(item) { return String(item.scope || "shared") === "shared"; });
  const skippedPersonal = allItems.length - items.length;
  let synced = 0;
  items.forEach(function(item) {
    const sync = rows_("Calendar_Sync").find(function(row) { return row.entity_type === "recurring_occurrence" && row.entity_id === item.occurrence_id; });
    const title = (item.status === "paid" || item.status === "received" ? "✓ " : "") + (item.kind === "income" ? "Periksa pemasukan: " : "Periksa tagihan: ") + item.name;
    const date = new Date(item.due_date + "T09:00:00+07:00");
    let event = null;
    let created = false;
    if (sync && sync.event_id) { try { event = calendar.getEventById(sync.event_id); } catch (ignored) { event = null; } }
    if (!event) event = findManagedCalendarEvent_(calendar, item, date);
    try {
      if (event) { event.setTitle(title); event.setTime(date, new Date(date.getTime() + 30 * 60000)); }
      else {
        event = calendar.createEvent(title, date, new Date(date.getTime() + 30 * 60000), { description: "Buka aplikasi Saldo Bersama untuk detail. Kalender bukan sumber status pembayaran." });
        created = true;
      }
      event.setTag("saldo_bersama_managed", "true");
      event.setTag("saldo_bersama_entity_id", item.occurrence_id);
      const record = { sync_id: sync ? sync.sync_id : uuid_(), entity_type: "recurring_occurrence", entity_id: item.occurrence_id, event_id: event.getId(), sync_status: "synced", last_synced_at: nowIso_(), last_error: "", row_version: sync ? rowVersion_(sync) + 1 : 1 };
      if (sync) updateRow_("Calendar_Sync", sync.__row, record); else appendRow_("Calendar_Sync", record);
      synced += 1;
    } catch (error) {
      if (created && event) {
        try { event.deleteEvent(); }
        catch (cleanupError) {
          const cleanup = recordExternalCleanupRequired_("calendar_event", { eventId: event.getId(), occurrenceId: item.occurrence_id, cause: error.code || error.message, cleanupError: cleanupError.message });
          throw sbError_("CALENDAR_CLEANUP_REQUIRED", "Sinkron Calendar gagal dan event baru tidak dapat dibersihkan.", 503, cleanup);
        }
      }
      throw error;
    }
  });
  appendAudit_(context, "calendar.sync", "calendar", calendarId, null, { synced: synced, skippedPersonal: skippedPersonal });
  return { synced: synced, skippedPersonal: skippedPersonal, calendarId: calendarId };
}

function registerPush_(context) {
  const payload = context.payload;
  if (!/^https:\/\//.test(String(payload.endpoint || "")) || !payload.keys || !payload.keys.p256dh || !payload.keys.auth) throw sbError_("INVALID_SUBSCRIPTION", "Push subscription tidak valid.", 400);
  const existing = findBy_("Push_Subscriptions", "endpoint", payload.endpoint);
  if (existing && String(existing.user_id || "") !== String(context.actor.user_id || "")) {
    throw sbError_("PUSH_ENDPOINT_OWNERSHIP_CONFLICT", "Perangkat ini masih terhubung ke akun lain. Nonaktifkan notifikasi dari akun sebelumnya sebelum mendaftarkan akun baru.", 409);
  }
  const record = { subscription_id: existing ? existing.subscription_id : uuid_(), user_id: context.actor.user_id, endpoint: payload.endpoint, p256dh: payload.keys.p256dh, auth: payload.keys.auth, user_agent: sanitizeText_(payload.userAgent, 250), status: "active", created_at: existing ? existing.created_at : nowIso_(), updated_at: nowIso_() };
  if (existing) updateAuditedRow_("Push_Subscriptions", existing, record, context, "notifications.register", "push_subscription", record.subscription_id, { user_id: existing.user_id, status: existing.status }, { user_id: record.user_id, status: record.status });
  else appendAuditedRow_("Push_Subscriptions", "subscription_id", record, context, "notifications.register", "push_subscription", null, { user_id: record.user_id, status: record.status });
  return { registered: true, subscriptionId: record.subscription_id };
}

function unregisterPush_(context) {
  const current = findBy_("Push_Subscriptions", "endpoint", context.payload.endpoint);
  if (!current || current.user_id !== context.actor.user_id) throw sbError_("NOT_FOUND", "Subscription tidak ditemukan.", 404);
  const updated = Object.assign({}, current, { status: "revoked", updated_at: nowIso_() });
  updateAuditedRow_("Push_Subscriptions", current, updated, context, "notifications.unregister", "push_subscription", updated.subscription_id, { status: current.status }, { status: updated.status });
  return { unregistered: true };
}

function createBackup_(context) {
  const spreadsheet = getSpreadsheet_();
  const type = sanitizeText_(context.payload.type || "manual", 30);
  const timestamp = Utilities.formatDate(new Date(), SB_TIMEZONE, "yyyyMMdd-HHmmss");
  const baseName = "saldo-bersama-" + timestamp + "-" + type;
  const folderId = PropertiesService.getScriptProperties().getProperty("BACKUP_FOLDER_ID");
  const folder = folderId ? DriveApp.getFolderById(folderId) : null;
  const sourceChecksum = spreadsheetSnapshotChecksum_(spreadsheet);
  const copy = folder ? DriveApp.getFileById(spreadsheet.getId()).makeCopy(baseName, folder) : DriveApp.getFileById(spreadsheet.getId()).makeCopy(baseName);
  const validation = validateBackupSpreadsheet_(copy.getId());
  const copyChecksum = validation.issues.length ? "" : spreadsheetSnapshotChecksum_(SpreadsheetApp.openById(copy.getId()));
  if (copyChecksum && sourceChecksum !== copyChecksum) validation.issues.push("Checksum isi backup berbeda dari sumber.");
  const verified = validation.issues.length === 0;
  const record = { backup_id: uuid_(), backup_type: type, file_id: copy.getId(), file_name: copy.getName(), schema_version: validation.schemaVersion || SB_SCHEMA_VERSION, status: verified ? "verified" : "failed", checksum: copyChecksum || "", created_by: context.actor.user_id, created_at: nowIso_(), verified_at: verified ? nowIso_() : "" };
  try {
    appendAuditedRow_("Backup_Log", "backup_id", record, context, "backup.create", "backup", null, { file_name: record.file_name, status: record.status, checksum: record.checksum, issues: validation.issues });
  } catch (error) {
    try { copy.setTrashed(true); }
    catch (cleanupError) {
      const cleanup = recordExternalCleanupRequired_("drive_backup_copy", { fileId: copy.getId(), cause: error.code || error.message, cleanupError: cleanupError.message });
      throw sbError_("DRIVE_CLEANUP_REQUIRED", "Backup gagal dicatat dan file salinan tidak dapat dibersihkan.", 503, cleanup);
    }
    throw error;
  }
  if (!verified) {
    try { copy.setTrashed(true); }
    catch (cleanupError) {
      const cleanup = recordExternalCleanupRequired_("drive_failed_backup", { fileId: copy.getId(), backupId: record.backup_id, issues: validation.issues, cleanupError: cleanupError.message });
      throw sbError_("DRIVE_CLEANUP_REQUIRED", "Backup gagal diverifikasi dan file gagal dibersihkan.", 503, cleanup);
    }
    throw sbError_("BACKUP_VERIFICATION_FAILED", "Salinan backup dibuat tetapi gagal diverifikasi dan sudah dipindahkan ke Trash.", 500, validation.issues);
  }
  return { fileId: record.file_id, fileName: record.file_name, createdAt: record.created_at, verified: true, checksum: record.checksum, backup_id: record.backup_id };
}

function integrityIssues_(context) {
  const integrityContext = context && context.actor
    ? context
    : { actor: { user_id: "system", role: "owner" }, payload: {} };
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
    Users: "user_id", Accounts: "account_id", Categories: "category_id", Transactions: "transaction_id", Envelope_Rules: "envelope_rule_id",
    Envelope_Periods: "envelope_period_id", Envelope_Movements: "movement_id", Recurring_Rules: "recurring_rule_id", Recurring_Occurrences: "occurrence_id",
    Budgets: "budget_id", Savings_Goals: "goal_id", Goal_Movements: "goal_movement_id", Reconciliations: "reconciliation_id",
    Period_Closures: "closure_id", Calendar_Sync: "sync_id", Notification_Queue: "notification_id", Push_Subscriptions: "subscription_id", Backup_Log: "backup_id"
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
  Object.keys(SB_SCHEMA).forEach(function(sheetName) {
    if (SB_SCHEMA[sheetName].indexOf("row_version") === -1) return;
    rows_(sheetName).forEach(function(row) {
      const version = Number(row.row_version);
      if (!Number.isSafeInteger(version) || version < 1) issues.push({ code: "INVALID_ROW_VERSION", sheet: sheetName, entityId: String(row[idFields[sheetName]] || ""), rowVersion: row.row_version });
    });
  });
  const allUsers = rows_("Users");
  const userIds = new Set(allUsers.map(function(row) { return row.user_id; }));
  const accountRows = rows_("Accounts");
  const accountById = Object.fromEntries(accountRows.map(function(row) { return [row.account_id, row]; }));
  const categoryRows = rows_("Categories");
  const categoryById = Object.fromEntries(categoryRows.map(function(row) { return [row.category_id, row]; }));
  const envelopeRuleRows = rows_("Envelope_Rules");
  const envelopeRuleIds = new Set(envelopeRuleRows.map(function(row) { return row.envelope_rule_id; }));
  const envelopeRows = rows_("Envelope_Periods");
  const envelopeIds = new Set(envelopeRows.map(function(row) { return row.envelope_period_id; }));
  const recurringRuleRows = rows_("Recurring_Rules");
  const recurringRuleIds = new Set(recurringRuleRows.map(function(row) { return row.recurring_rule_id; }));
  const occurrenceRows = rows_("Recurring_Occurrences");
  const occurrenceIds = new Set(occurrenceRows.map(function(row) { return row.occurrence_id; }));
  const goalRows = rows_("Savings_Goals");
  const goalIds = new Set(goalRows.map(function(row) { return row.goal_id; }));
  const allTransactions = rows_("Transactions");
  const transactionById = Object.fromEntries(allTransactions.map(function(row) { return [String(row.transaction_id || ""), row]; }));
  const activeTransactionsByOccurrence = groupRowsByField_(allTransactions.filter(function(row) {
    return row.status === "active" && row.recurring_occurrence_id;
  }), "recurring_occurrence_id");
  const activeGoalMovements = rows_("Goal_Movements").filter(function(movement) {
    return movement.status === "active" && movement.transaction_id;
  });
  const activeGoalMovementsByTransaction = groupRowsByField_(activeGoalMovements, "transaction_id");
  const envelopePeriodById = Object.fromEntries(envelopeRows.map(function(row) { return [String(row.envelope_period_id || ""), row]; }));
  const envelopeRuleById = Object.fromEntries(envelopeRuleRows.map(function(row) { return [String(row.envelope_rule_id || ""), row]; }));
  const goalById = Object.fromEntries(goalRows.map(function(row) { return [String(row.goal_id || ""), row]; }));
  allTransactions.forEach(function(row) {
    const type = String(row.transaction_type || "");
    if (["income", "expense", "transfer", "refund", "adjustment"].indexOf(type) === -1) issues.push({ code: "INVALID_TRANSACTION_TYPE", entityId: row.transaction_id });
    if (["expense", "transfer", "adjustment"].indexOf(type) !== -1 && !row.source_account_id) issues.push({ code: "MISSING_REQUIRED_SOURCE_ACCOUNT", entityId: row.transaction_id });
    if (["income", "refund", "transfer"].indexOf(type) !== -1 && !row.destination_account_id) issues.push({ code: "MISSING_REQUIRED_DESTINATION_ACCOUNT", entityId: row.transaction_id });
    if (["income", "expense", "refund"].indexOf(type) !== -1 && !row.category_id) issues.push({ code: "MISSING_REQUIRED_CATEGORY", entityId: row.transaction_id });
    if (row.category_id && categoryById[row.category_id]) {
      const expectedCategoryType = type === "income" ? "income" : "expense";
      if (["income", "expense", "refund"].indexOf(type) !== -1 && categoryById[row.category_id].transaction_type !== expectedCategoryType) issues.push({ code: "CATEGORY_TYPE_MISMATCH", entityId: row.transaction_id, categoryId: row.category_id });
    }
    if (row.envelope_period_id && !envelopeIds.has(row.envelope_period_id)) issues.push({ code: "MISSING_ENVELOPE_PERIOD", entityId: row.transaction_id });
    if (row.envelope_period_id && type !== "expense") issues.push({ code: "INVALID_ENVELOPE_TRANSACTION_TYPE", entityId: row.transaction_id });
    if (row.recurring_occurrence_id && !occurrenceIds.has(row.recurring_occurrence_id)) issues.push({ code: "MISSING_RECURRING_OCCURRENCE", entityId: row.transaction_id });
    if (row.goal_id && !goalIds.has(row.goal_id)) issues.push({ code: "MISSING_GOAL", entityId: row.transaction_id });
    if (row.status === "active" && row.goal_id) {
      const linkedGoalMovements = activeGoalMovementsByTransaction[String(row.transaction_id || "")] || [];
      if (linkedGoalMovements.length === 0) issues.push({ code: "GOAL_TRANSACTION_MOVEMENT_MISSING", entityId: row.transaction_id, goalId: row.goal_id });
      if (linkedGoalMovements.length > 1) issues.push({ code: "GOAL_TRANSACTION_MULTIPLE_MOVEMENTS", entityId: row.transaction_id, goalId: row.goal_id });
    }
    if (row.scope === "personal" && !userIds.has(row.owner_user_id)) issues.push({ code: "MISSING_PERSONAL_OWNER", entityId: row.transaction_id, userId: row.owner_user_id });
    const involvedAccounts = [row.source_account_id, row.destination_account_id].filter(Boolean).map(function(accountId) { return accountById[accountId]; }).filter(Boolean);
    const ownershipKeys = Array.from(new Set(involvedAccounts.map(accountOwnershipKey_)));
    if (ownershipKeys.length > 1) issues.push({ code: "TRANSACTION_ACCOUNT_SCOPE_MISMATCH", entityId: row.transaction_id });
    else if (ownershipKeys.length === 1) {
      const expectedKey = ownershipKeys[0];
      const expectedScope = expectedKey.indexOf("personal:") === 0 ? "personal" : "shared";
      const expectedOwner = expectedScope === "personal" ? expectedKey.slice("personal:".length) : "";
      if (String(row.scope || "shared") !== expectedScope || String(row.owner_user_id || "") !== expectedOwner) issues.push({ code: "TRANSACTION_OWNERSHIP_MISMATCH", entityId: row.transaction_id, expectedScope: expectedScope, expectedOwner: expectedOwner });
    }
    if (row.envelope_period_id) {
      const envelopePeriod = envelopePeriodById[String(row.envelope_period_id || "")];
      const envelopeRule = envelopePeriod && envelopeRuleById[String(envelopePeriod.envelope_rule_id || "")];
      if (envelopeRule && (String(row.scope || "shared") !== String(envelopeRule.scope || "shared") || String(row.owner_user_id || "") !== String(envelopeRule.owner_user_id || ""))) issues.push({ code: "TRANSACTION_ENVELOPE_SCOPE_MISMATCH", entityId: row.transaction_id, envelopePeriodId: row.envelope_period_id });
    }
  });
  const recurringRuleById = Object.fromEntries(recurringRuleRows.map(function(rule) { return [rule.recurring_rule_id, rule]; }));
  const occurrenceKeys = new Set();
  occurrenceRows.forEach(function(occurrence) {
    const occurrenceKey = String(occurrence.recurring_rule_id || "") + ":" + String(occurrence.due_date || "");
    if (occurrenceKeys.has(occurrenceKey)) issues.push({ code: "DUPLICATE_RECURRING_OCCURRENCE", entityId: occurrence.occurrence_id, ruleId: occurrence.recurring_rule_id, dueDate: occurrence.due_date });
    occurrenceKeys.add(occurrenceKey);
    const linked = activeTransactionsByOccurrence[String(occurrence.occurrence_id || "")] || [];
    const linkedRule = recurringRuleById[occurrence.recurring_rule_id];
    if (linkedRule) linked.forEach(function(transaction) {
      if (String(transaction.scope || "shared") !== String(linkedRule.scope || "shared") || String(transaction.owner_user_id || "") !== String(linkedRule.owner_user_id || "")) issues.push({ code: "RECURRING_TRANSACTION_SCOPE_MISMATCH", entityId: occurrence.occurrence_id, transactionId: transaction.transaction_id });
    });
    const actual = linked.reduce(function(sum, transaction) { return sum + Number(transaction.amount || 0); }, 0);
    if (actual !== Number(occurrence.actual_amount || 0)) issues.push({ code: "RECURRING_ACTUAL_MISMATCH", entityId: occurrence.occurrence_id, expected: actual, actual: Number(occurrence.actual_amount || 0) });
    const expectedIds = linked.map(function(transaction) { return transaction.transaction_id; }).sort().join(",");
    const storedIds = String(occurrence.transaction_ids || "").split(",").map(function(value) { return value.trim(); }).filter(Boolean).sort().join(",");
    if (expectedIds !== storedIds) issues.push({ code: "RECURRING_TRANSACTION_IDS_MISMATCH", entityId: occurrence.occurrence_id });
  });
  activeGoalMovements.forEach(function(movement) {
    const transaction = transactionById[String(movement.transaction_id || "")];
    if (!transaction || transaction.status !== "active") issues.push({ code: "GOAL_TRANSACTION_MISSING", entityId: movement.goal_movement_id, transactionId: movement.transaction_id });
    else {
      if (transaction.goal_id !== movement.goal_id) issues.push({ code: "GOAL_TRANSACTION_LINK_MISMATCH", entityId: movement.goal_movement_id, transactionId: movement.transaction_id });
      if (transaction.transaction_type !== "transfer" || Number(transaction.amount || 0) !== Number(movement.amount || 0)) issues.push({ code: "GOAL_TRANSACTION_AMOUNT_MISMATCH", entityId: movement.goal_movement_id, transactionId: movement.transaction_id });
      const goal = goalById[String(movement.goal_id || "")];
      if (goal && (String(transaction.scope || "shared") !== String(goal.scope || "shared") || String(transaction.owner_user_id || "") !== String(goal.owner_user_id || ""))) issues.push({ code: "GOAL_TRANSACTION_SCOPE_MISMATCH", entityId: movement.goal_movement_id, transactionId: movement.transaction_id });
    }
  });
  accountRows.forEach(function(account) {
    if (account.owner_scope === "personal" && !userIds.has(account.owner_user_id)) issues.push({ code: "ACCOUNT_OWNER_MISSING", entityId: account.account_id, userId: account.owner_user_id });
  });
  envelopeRuleRows.forEach(function(rule) {
    if (rule.source_account_id && !accountIds.has(rule.source_account_id)) issues.push({ code: "ENVELOPE_SOURCE_ACCOUNT_MISSING", entityId: rule.envelope_rule_id, accountId: rule.source_account_id });
    if (rule.scope === "personal" && !userIds.has(rule.owner_user_id)) issues.push({ code: "ENVELOPE_OWNER_MISSING", entityId: rule.envelope_rule_id, userId: rule.owner_user_id });
    const sourceAccount = accountById[String(rule.source_account_id || "")];
    if (rule.status === "active" && sourceAccount && sourceAccount.status !== "active") issues.push({ code: "ACTIVE_ENVELOPE_ARCHIVED_ACCOUNT", entityId: rule.envelope_rule_id, accountId: sourceAccount.account_id });
  });
  envelopeRows.forEach(function(period) {
    if (!envelopeRuleIds.has(period.envelope_rule_id)) issues.push({ code: "ENVELOPE_RULE_MISSING", entityId: period.envelope_period_id, ruleId: period.envelope_rule_id });
    if (!Number.isSafeInteger(Number(period.allocated_amount)) || Number(period.allocated_amount) < 0) issues.push({ code: "INVALID_ENVELOPE_ALLOCATION", entityId: period.envelope_period_id });
    if (!Number.isSafeInteger(Number(period.reserved_amount)) || Number(period.reserved_amount) < 0) issues.push({ code: "INVALID_ENVELOPE_RESERVED", entityId: period.envelope_period_id });
  });
  const activeEnvelopePeriodsByRule = groupRowsByField_(envelopeRows.filter(function(period) { return period.status === "active"; }), "envelope_rule_id");
  Object.keys(activeEnvelopePeriodsByRule).forEach(function(ruleId) {
    const periods = activeEnvelopePeriodsByRule[ruleId].slice().sort(function(a, b) { return String(a.period_start).localeCompare(String(b.period_start)); });
    for (let index = 1; index < periods.length; index += 1) {
      if (String(periods[index].period_start) <= String(periods[index - 1].period_end)) issues.push({ code: "OVERLAPPING_ENVELOPE_PERIOD", entityId: periods[index].envelope_period_id, ruleId: ruleId });
    }
  });
  rows_("Envelope_Movements").forEach(function(movement) {
    if (!envelopeIds.has(movement.from_envelope_period_id) || !envelopeIds.has(movement.to_envelope_period_id)) issues.push({ code: "ENVELOPE_MOVEMENT_REFERENCE_MISSING", entityId: movement.movement_id });
    if (!Number.isSafeInteger(Number(movement.amount)) || Number(movement.amount) <= 0) issues.push({ code: "INVALID_ENVELOPE_MOVEMENT_AMOUNT", entityId: movement.movement_id });
  });
  const validateOwnedEntity = function(entity, entityType, entityId) {
    if (["shared", "personal"].indexOf(entity.scope) === -1) issues.push({ code: "INVALID_OWNED_SCOPE", entityType: entityType, entityId: entityId, scope: entity.scope });
    if (entity.scope === "personal" && !userIds.has(entity.owner_user_id)) issues.push({ code: "OWNED_ENTITY_OWNER_MISSING", entityType: entityType, entityId: entityId, userId: entity.owner_user_id });
    if (entity.scope === "shared" && entity.owner_user_id) issues.push({ code: "SHARED_ENTITY_HAS_OWNER", entityType: entityType, entityId: entityId, userId: entity.owner_user_id });
  };
  recurringRuleRows.forEach(function(rule) {
    if (!categoryIds.has(rule.category_id)) issues.push({ code: "RECURRING_CATEGORY_MISSING", entityId: rule.recurring_rule_id, categoryId: rule.category_id });
    if (!accountIds.has(rule.default_account_id)) issues.push({ code: "RECURRING_ACCOUNT_MISSING", entityId: rule.recurring_rule_id, accountId: rule.default_account_id });
    validateOwnedEntity(rule, "recurring_rule", rule.recurring_rule_id);
    const account = accountById[rule.default_account_id];
    const category = categoryById[rule.category_id];
    if (account && account.owner_scope === "personal" && (rule.scope !== "personal" || String(rule.owner_user_id) !== String(account.owner_user_id))) issues.push({ code: "RECURRING_SCOPE_ACCOUNT_MISMATCH", entityId: rule.recurring_rule_id, accountId: account.account_id });
    if (rule.status === "active" && account && account.status !== "active") issues.push({ code: "ACTIVE_RECURRING_ARCHIVED_ACCOUNT", entityId: rule.recurring_rule_id, accountId: account.account_id });
    if (rule.status === "active" && category && category.status !== "active") issues.push({ code: "ACTIVE_RECURRING_ARCHIVED_CATEGORY", entityId: rule.recurring_rule_id, categoryId: category.category_id });
  });
  occurrenceRows.forEach(function(occurrence) {
    if (!recurringRuleIds.has(occurrence.recurring_rule_id)) issues.push({ code: "RECURRING_RULE_MISSING", entityId: occurrence.occurrence_id, ruleId: occurrence.recurring_rule_id });
  });
  const activeBudgetKeys = {};
  rows_("Budgets").forEach(function(budget) {
    if (!categoryIds.has(budget.category_id)) issues.push({ code: "BUDGET_CATEGORY_MISSING", entityId: budget.budget_id, categoryId: budget.category_id });
    if (budget.envelope_rule_id && !envelopeRuleIds.has(budget.envelope_rule_id)) issues.push({ code: "BUDGET_ENVELOPE_RULE_MISSING", entityId: budget.budget_id, ruleId: budget.envelope_rule_id });
    validateOwnedEntity(budget, "budget", budget.budget_id);
    const envelopeRule = envelopeRuleById[String(budget.envelope_rule_id || "")];
    const category = categoryById[budget.category_id];
    if (envelopeRule && (String(envelopeRule.scope || "shared") !== String(budget.scope || "shared") || String(envelopeRule.owner_user_id || "") !== String(budget.owner_user_id || ""))) issues.push({ code: "BUDGET_SCOPE_ENVELOPE_MISMATCH", entityId: budget.budget_id, ruleId: budget.envelope_rule_id });
    if (budget.status === "active" && category && category.status !== "active") issues.push({ code: "ACTIVE_BUDGET_ARCHIVED_CATEGORY", entityId: budget.budget_id, categoryId: category.category_id });
    if (budget.status === "active" && envelopeRule && envelopeRule.status !== "active") issues.push({ code: "ACTIVE_BUDGET_ARCHIVED_ENVELOPE", entityId: budget.budget_id, ruleId: envelopeRule.envelope_rule_id });
    if (budget.status === "active") {
      const budgetKey = [String(budget.period_key || ""), String(budget.category_id || ""), String(budget.scope || "shared"), String(budget.owner_user_id || "")].join(":");
      if (activeBudgetKeys[budgetKey]) issues.push({ code: "DUPLICATE_ACTIVE_BUDGET", entityId: budget.budget_id, conflictingEntityId: activeBudgetKeys[budgetKey], periodKey: budget.period_key });
      else activeBudgetKeys[budgetKey] = budget.budget_id;
    }
  });
  goalRows.forEach(function(goal) {
    if (!accountIds.has(goal.account_id)) issues.push({ code: "GOAL_ACCOUNT_MISSING", entityId: goal.goal_id, accountId: goal.account_id });
    validateOwnedEntity(goal, "goal", goal.goal_id);
    const account = accountById[goal.account_id];
    if (account && account.owner_scope === "personal" && (goal.scope !== "personal" || String(goal.owner_user_id) !== String(account.owner_user_id))) issues.push({ code: "GOAL_SCOPE_ACCOUNT_MISMATCH", entityId: goal.goal_id, accountId: account.account_id });
    if (goal.status === "active" && account && account.status !== "active") issues.push({ code: "ACTIVE_GOAL_ARCHIVED_ACCOUNT", entityId: goal.goal_id, accountId: account.account_id });
  });
  rows_("Goal_Movements").forEach(function(movement) {
    if (!goalIds.has(movement.goal_id)) issues.push({ code: "GOAL_REFERENCE_MISSING", entityId: movement.goal_movement_id, goalId: movement.goal_id });
    if (!Number.isSafeInteger(Number(movement.amount)) || Number(movement.amount) <= 0) issues.push({ code: "INVALID_GOAL_MOVEMENT_AMOUNT", entityId: movement.goal_movement_id });
  });
  rows_("Reconciliations").forEach(function(reconciliation) {
    if (!accountIds.has(reconciliation.account_id)) issues.push({ code: "RECONCILIATION_ACCOUNT_MISSING", entityId: reconciliation.reconciliation_id, accountId: reconciliation.account_id });
  });
  const pushEndpoints = {};
  rows_("Push_Subscriptions").forEach(function(subscription) {
    if (!userIds.has(subscription.user_id)) issues.push({ code: "PUSH_USER_MISSING", entityId: subscription.subscription_id, userId: subscription.user_id });
    if (subscription.status === "active") {
      const endpoint = String(subscription.endpoint || "");
      if (!endpoint) issues.push({ code: "PUSH_ENDPOINT_MISSING", entityId: subscription.subscription_id });
      else if (pushEndpoints[endpoint] && String(pushEndpoints[endpoint].user_id) !== String(subscription.user_id)) issues.push({ code: "PUSH_ENDPOINT_OWNER_CONFLICT", entityId: subscription.subscription_id });
      else if (pushEndpoints[endpoint]) issues.push({ code: "DUPLICATE_PUSH_ENDPOINT", entityId: subscription.subscription_id });
      pushEndpoints[endpoint] = subscription;
    }
  });
  const closedPeriods = new Set();
  rows_("Period_Closures").filter(function(closure) { return closure.status === "closed"; }).forEach(function(closure) {
    const key = String(closure.period_key || "");
    if (closedPeriods.has(key)) issues.push({ code: "DUPLICATE_CLOSED_PERIOD", entityId: closure.closure_id, periodKey: closure.period_key });
    closedPeriods.add(key);
    if (String(closure.scope || "shared") !== "shared") issues.push({ code: "INVALID_PERIOD_CLOSURE_SCOPE", entityId: closure.closure_id, periodKey: closure.period_key });
    try {
      const snapshot = JSON.parse(String(closure.snapshot_json || ""));
      if (!snapshot || snapshot.periodKey !== closure.period_key || String(snapshot.schemaVersion || "") !== String(SB_SCHEMA_VERSION)) {
        issues.push({ code: "INVALID_PERIOD_SNAPSHOT", entityId: closure.closure_id, periodKey: closure.period_key });
        return;
      }
      const storedFingerprint = periodSnapshotFingerprint_(snapshot);
      if (snapshot.financialFingerprint && String(snapshot.financialFingerprint) !== storedFingerprint) {
        issues.push({ code: "PERIOD_SNAPSHOT_CHECKSUM_MISMATCH", entityId: closure.closure_id, periodKey: closure.period_key });
      }
      const currentSnapshot = compactPeriodSnapshot_(String(closure.period_key), integrityContext);
      const storedComparable = periodSnapshotComparableFingerprint_(snapshot, snapshot);
      const currentComparable = periodSnapshotComparableFingerprint_(currentSnapshot, snapshot);
      if (storedComparable !== currentComparable) {
        issues.push({ code: "CLOSED_PERIOD_LEDGER_CHANGED", entityId: closure.closure_id, periodKey: closure.period_key });
      }
    } catch (error) {
      issues.push({
        code: error instanceof SyntaxError ? "INVALID_PERIOD_SNAPSHOT_JSON" : "PERIOD_SNAPSHOT_VERIFY_FAILED",
        entityId: closure.closure_id,
        periodKey: closure.period_key
      });
    }
  });
  const activeUsers = allUsers.filter(function(row) { return row.status === "active"; });
  if (!activeUsers.some(function(row) { return row.role === "owner"; })) issues.push({ code: "MISSING_ACTIVE_OWNER" });
  const emails = new Set();
  activeUsers.forEach(function(row) {
    const email = String(row.email || "").toLowerCase();
    if (!email) issues.push({ code: "MISSING_USER_EMAIL", entityId: row.user_id });
    else if (emails.has(email)) issues.push({ code: "DUPLICATE_USER_EMAIL", email: email });
    emails.add(email);
  });
  const idempotencyKeys = new Set();
  rows_("Idempotency").forEach(function(row) {
    if (idempotencyKeys.has(row.idempotency_key)) issues.push({ code: "DUPLICATE_IDEMPOTENCY_KEY", key: row.idempotency_key });
    idempotencyKeys.add(row.idempotency_key);
  });
  const allocationPeriods = new Set([monthKey_()]);
  envelopeRows.filter(function(envelopePeriod) { return envelopePeriod.status === "active"; }).forEach(function(envelopePeriod) {
    let cursor = String(envelopePeriod.period_start || "").slice(0, 7);
    const endPeriod = String(envelopePeriod.period_end || "").slice(0, 7);
    let checked = 0;
    while (/^\d{4}-\d{2}$/.test(cursor) && cursor <= endPeriod && checked < 120) {
      allocationPeriods.add(cursor);
      const parts = cursor.split("-").map(Number);
      const next = new Date(parts[0], parts[1], 1);
      cursor = String(next.getFullYear()) + "-" + String(next.getMonth() + 1).padStart(2, "0");
      checked += 1;
    }
  });
  allocationPeriods.forEach(function(period) {
    const summary = allocationAvailabilitySummary_(integrityContext, { period: period });
    if (summary.allocatedRemaining > summary.availableBalance) {
      issues.push({
        code: "OVERALLOCATED_FUNDS",
        periodKey: period,
        availableBalance: summary.availableBalance,
        allocatedRemaining: summary.allocatedRemaining
      });
    }
    accountRows.filter(function(account) { return account.status === "active"; }).forEach(function(account) {
      const accountId = String(account.account_id);
      const availableBalance = Number(summary.availableByAccount[accountId] || 0);
      const allocatedRemaining = Number(summary.allocatedByAccount[accountId] || 0);
      if (allocatedRemaining > availableBalance) {
        issues.push({
          code: "OVERALLOCATED_ACCOUNT_FUNDS",
          periodKey: period,
          accountId: account.account_id,
          availableBalance: availableBalance,
          allocatedRemaining: allocatedRemaining
        });
      }
    });
  });
  return issues;
}

function runIntegrity_(context) {
  let schemaIssues = [];
  try { schemaIssues = validateSchema_().map(function(message) { return { code: "SCHEMA", message: message }; }); }
  catch (error) { schemaIssues = [{ code: error.code || "SCHEMA", message: error.message }]; }
  let dataIssues = [];
  if (!schemaIssues.length) dataIssues = integrityIssues_(context).concat(formulaIntegrityIssues_());
  const issues = schemaIssues.concat(dataIssues);
  try { appendAudit_(context, "integrity.run", "system", "integrity", null, { issueCount: issues.length }); }
  catch (auditError) {
    if (!issues.length) throw auditError;
    issues.push({ code: "AUDIT_WRITE_FAILED", message: "Hasil integrity check tidak dapat ditulis ke audit log." });
  }
  return { ok: issues.length === 0, checkedAt: nowIso_(), issues: issues, recovery: recoveryDetails_() };
}

function formulaIntegrityIssues_() {
  const issues = [];
  Object.keys(SB_SCHEMA).forEach(function(sheetName) {
    try {
      const sheet = getSheet_(sheetName);
      const rowCount = Math.max(0, Number(sheet.getLastRow() || 0) - 1);
      if (!rowCount) return;
      const formulas = sheet.getRange(2, 1, rowCount, SB_SCHEMA[sheetName].length).getFormulas();
      let count = 0;
      let firstCell = "";
      formulas.forEach(function(row, rowIndex) {
        row.forEach(function(formula, columnIndex) {
          if (!formula) return;
          count += 1;
          if (!firstCell) firstCell = "R" + String(rowIndex + 2) + "C" + String(columnIndex + 1);
        });
      });
      if (count) issues.push({ code: "FORMULA_CELL_DETECTED", sheet: sheetName, count: count, firstCell: firstCell });
    } catch (error) {
      issues.push({ code: "FORMULA_SCAN_FAILED", sheet: sheetName, message: "Pemeriksaan formula pada sheet tidak dapat diselesaikan." });
    }
  });
  return issues;
}

function listAudit_(context) {
  const limit = Math.max(1, Math.min(200, Number(context.payload.limit || 50)));
  return rows_("Audit_Log").sort(function(a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); }).slice(0, limit).map(function(row) {
    return { audit_id: row.audit_id, timestamp: row.timestamp, actor_email: row.actor_email, action: row.action, entity_type: row.entity_type, entity_id: row.entity_id, result: row.result };
  });
}
