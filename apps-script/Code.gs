function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: { service: "saldo-bersama-apps-script", status: "ok", schemaVersion: SB_SCHEMA_VERSION } })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e && e.postData && e.postData.contents || "{}");
    const signed = verifyEnvelope_(body);
    if (signed.action === "system.initialize") initializeSchema_();
    const schemaIssues = signed.action === "system.initialize" ? [] : validateSchema_();
    if (schemaIssues.length) {
      const missing = isSchemaUninitialized_();
      throw sbError_(missing ? "SCHEMA_MISSING" : "SCHEMA_INVALID", missing ? "Schema database belum dibuat." : "Schema database rusak. Aplikasi masuk mode baca saja.", 503, schemaIssues);
    }
    const actor = resolveActor_(signed.actor, signed.action);
    const maintenanceMode = getConfig_("maintenance_mode") === "true";
    if (maintenanceMode && isMutatingAction_(signed.action) && ["restore.apply", "integrity.run"].indexOf(signed.action) === -1) throw sbError_("MAINTENANCE_MODE", "Aplikasi sedang dalam maintenance. Perubahan sementara ditolak.", 503);
    const context = {
      actor: actor,
      action: signed.action,
      payload: signed.payload || {},
      requestId: signed.requestId || "",
      idempotencyKey: signed.idempotencyKey || "",
      rowVersion: signed.rowVersion
    };
    const mutating = isMutatingAction_(context.action);
    let data;
    if (mutating) {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(15000)) throw sbError_("LOCK_TIMEOUT", "Data sedang diperbarui pengguna lain. Coba kembali.", 409);
      try {
        const previous = getIdempotentResult_(context);
        if (previous) data = previous;
        else {
          data = routeAction_(context);
          saveIdempotentResult_(context, data && (data.transaction_id || data.account_id || data.entityId), data);
          SpreadsheetApp.flush();
        }
      } finally { lock.releaseLock(); }
    } else {
      data = routeAction_(context);
    }
    return jsonOutput_({ ok: true, data: data });
  } catch (error) {
    return jsonOutput_({ ok: false, error: { code: error.code || "INTERNAL_ERROR", message: error.code ? error.message : "Apps Script gagal memproses request.", status: error.status || 500, details: error.details || null } });
  }
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function isMutatingAction_(action) {
  return !["system.health", "bootstrap.get", "users.list", "audit.list", "dashboard.overview", "accounts.list", "categories.list", "transactions.list", "envelopes.list", "recurring.list", "budgets.list", "goals.list", "reports.monthly"].includes(action);
}
