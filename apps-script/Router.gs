function routeAction_(context) {
  switch (context.action) {
    case "system.initialize": initializeSchema_(); return { initialized: true, schemaVersion: SB_SCHEMA_VERSION };
    case "system.health": return { status: "ok", schemaVersion: SB_SCHEMA_VERSION, timestamp: nowIso_() };
    case "bootstrap.get": return { user: context.actor, accounts: rows_("Accounts").map(publicRow_), categories: rows_("Categories").map(publicRow_), config: { schemaVersion: Number(getConfig_("schema_version")), timezone: getConfig_("timezone"), currency: getConfig_("currency"), maintenanceMode: getConfig_("maintenance_mode") === "true" } };
    case "users.list": return { items: listUsers_(context) };
    case "users.upsert": return upsertUser_(context);
    case "users.deactivate": return deactivateUser_(context);
    case "audit.list": return { items: listAudit_(context) };
    case "dashboard.overview": return dashboardOverview_(context);
    case "accounts.list": return { items: listAccounts_() };
    case "accounts.create": return createAccount_(context);
    case "accounts.update": return updateAccount_(context);
    case "accounts.archive": return archiveAccount_(context);
    case "categories.list": return { items: listCategories_() };
    case "categories.create": return createCategory_(context);
    case "categories.update": return updateCategory_(context);
    case "categories.archive": return archiveCategory_(context);
    case "transactions.list": {
      const period = context.payload.period === "current" || !context.payload.period ? monthKey_() : context.payload.period;
      const items = rows_("Transactions").filter(function(row) { return !period || String(row.transaction_date).slice(0, 7) === period; }).sort(function(a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }).slice(0, Math.min(500, Number(context.payload.limit || 100))).map(publicRow_);
      return { items: items, total: items.length };
    }
    case "transactions.create": return createTransaction_(context);
    case "transactions.update": return updateTransaction_(context);
    case "transactions.cancel": return cancelTransaction_(context);
    case "envelopes.list": return { items: listEnvelopes_(context) };
    case "envelopes.createRule": return createEnvelopeRule_(context);
    case "envelopes.createPeriod": return createEnvelopePeriod_(context);
    case "envelopes.move": return moveEnvelope_(context);
    case "envelopes.close": return closeEnvelope_(context);
    case "recurring.list": return { items: listRecurring_(context) };
    case "recurring.createRule": return createRecurringRule_(context);
    case "recurring.updateRule": return updateRecurringRule_(context);
    case "recurring.payOccurrence": return payOccurrence_(context);
    case "budgets.list": return { items: listBudgets_(context) };
    case "budgets.upsert": return upsertBudget_(context);
    case "goals.list": return { items: listGoals_() };
    case "goals.create": return createGoal_(context);
    case "goals.move": return moveGoal_(context);
    case "reports.monthly": return monthlyReport_(context);
    case "reconciliations.create": return createReconciliation_(context);
    case "periods.close": return closePeriod_(context);
    case "periods.reopen": return reopenPeriod_(context);
    case "calendar.sync": return syncCalendar_(context);
    case "notifications.register": return registerPush_(context);
    case "notifications.unregister": return unregisterPush_(context);
    case "backup.create": return createBackup_(context);
    case "export.create": return createExport_(context);
    case "import.preview": return importPreview_(context);
    case "import.apply": return importApply_(context);
    case "restore.preview": return backupPreview_(context);
    case "restore.apply": return restoreApply_(context);
    case "integrity.run": return runIntegrity_(context);
    default: throw sbError_("UNKNOWN_ACTION", "Action tidak dikenali: " + context.action, 404);
  }
}
