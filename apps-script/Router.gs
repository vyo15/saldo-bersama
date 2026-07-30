function routeAction_(context) {
  switch (context.action) {
    case "system.initialize": return { initialized: true, schemaVersion: SB_SCHEMA_VERSION };
    case "system.health": {
      const properties = PropertiesService.getScriptProperties();
      return {
        status: "ok",
        schemaVersion: SB_SCHEMA_VERSION,
        setupStatus: properties.getProperty("SETUP_STATUS") || "unknown",
        migrationStatus: properties.getProperty("MIGRATION_STATUS") || "not_required",
        maintenanceMode: getConfig_("maintenance_mode") === "true",
        recoveryRequired: isRecoveryRequired_(),
        timestamp: nowIso_()
      };
    }
    case "bootstrap.get": return { user: context.actor, accounts: visibleAccountRows_(context).map(publicRow_), categories: rows_("Categories").map(publicRow_), config: { schemaVersion: Number(getConfig_("schema_version")), timezone: getConfig_("timezone"), currency: getConfig_("currency"), maintenanceMode: getConfig_("maintenance_mode") === "true" } };
    case "users.list": return { items: listUsers_(context) };
    case "users.upsert": return upsertUser_(context);
    case "users.deactivate": return deactivateUser_(context);
    case "audit.list": return { items: listAudit_(context) };
    case "dashboard.overview": return dashboardOverview_(context);
    case "accounts.list": return { items: listAccounts_(context) };
    case "accounts.create": return createAccount_(context);
    case "accounts.update": return updateAccount_(context);
    case "accounts.archive": return archiveAccount_(context);
    case "categories.list": return { items: listCategories_() };
    case "categories.create": return createCategory_(context);
    case "categories.update": return updateCategory_(context);
    case "categories.archive": return archiveCategory_(context);
    case "transactions.list": {
      const payload = context.payload || {};
      const period = periodKey_(payload.period);
      const limit = boundedInteger_(payload.limit, 100, 20, 200, "Limit transaksi");
      const offset = boundedInteger_(payload.offset, 0, 0, 10000, "Offset transaksi");
      const query = String(payload.query || "").trim().toLowerCase().slice(0, 100);
      const type = String(payload.transaction_type || "all");
      const allocation = String(payload.allocation || "all");
      if (["all", "income", "expense", "transfer", "refund", "adjustment"].indexOf(type) === -1) throw sbError_("INVALID_TRANSACTION_TYPE", "Filter jenis transaksi tidak valid.", 400);
      if (["all", "allocated", "unallocated"].indexOf(allocation) === -1) throw sbError_("INVALID_ALLOCATION_FILTER", "Filter alokasi tidak valid.", 400);
      const categories = Object.fromEntries(rows_("Categories").map(function(row) { return [row.category_id, row.name]; }));
      const filtered = visibleTransactions_(context).filter(function(row) {
        if (String(row.transaction_date).slice(0, 7) !== period) return false;
        if (type !== "all" && row.transaction_type !== type) return false;
        if (allocation === "unallocated" && !(row.transaction_type === "expense" && !row.envelope_period_id)) return false;
        if (allocation === "allocated" && row.transaction_type === "expense" && !row.envelope_period_id) return false;
        if (!query) return true;
        const haystack = [row.description, row.merchant, categories[row.category_id]].join(" ").toLowerCase();
        return haystack.indexOf(query) !== -1;
      }).sort(function(a, b) {
        const dateOrder = String(b.transaction_date).localeCompare(String(a.transaction_date));
        return dateOrder || String(b.created_at).localeCompare(String(a.created_at));
      });
      const items = filtered.slice(offset, offset + limit).map(function(row) {
        return Object.assign(publicRow_(row), transactionCapabilities_(context, row));
      });
      return { items: items, total: filtered.length, offset: offset, limit: limit, hasMore: offset + items.length < filtered.length, nextOffset: offset + items.length };
    }
    case "transactions.create": return createTransaction_(context);
    case "transactions.update": return updateTransaction_(context);
    case "transactions.cancel": return cancelTransaction_(context);
    case "envelopes.list": return { items: listEnvelopes_(context) };
    case "envelopes.create": return createEnvelope_(context);
    case "envelopes.createRule": return createEnvelopeRule_(context);
    case "envelopes.createPeriod": return createEnvelopePeriod_(context);
    case "envelopes.move": return moveEnvelope_(context);
    case "envelopes.close": return closeEnvelope_(context);
    case "recurring.list": return { items: listRecurring_(context) };
    case "recurring.createRule": return createRecurringRule_(context);
    case "recurring.updateRule": return updateRecurringRule_(context);
    case "recurring.payOccurrence": return payOccurrence_(context);
    case "recurring.reversePayment": return reverseOccurrencePayment_(context);
    case "budgets.list": return { items: listBudgets_(context) };
    case "budgets.upsert": return upsertBudget_(context);
    case "goals.list": return { items: listGoals_(context) };
    case "goals.create": return createGoal_(context);
    case "goals.move": return moveGoal_(context);
    case "goals.reverseMovement": return reverseGoalMovement_(context);
    case "reports.monthly": return monthlyReport_(context);
    case "reconciliations.create": return createReconciliation_(context);
    case "periods.list": return { items: listPeriodClosures_(context) };
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
