function doGet() {
  let schemaIssues = [];
  try { schemaIssues = validateSchema_(); } catch (error) { schemaIssues = [error.code || error.message]; }
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    data: {
      service: "saldo-bersama-apps-script",
      status: schemaIssues.length ? "degraded" : (isRecoveryRequired_() ? "recovery_required" : "ok"),
      schemaVersion: SB_SCHEMA_VERSION,
      schemaIssues: schemaIssues,
      recovery: recoveryDetails_()
    }
  })).setMimeType(ContentService.MimeType.JSON);
}

function isSchemaRecoveryAction_(action) {
  return ["system.health", "restore.preview", "restore.apply", "integrity.run"].indexOf(action) !== -1;
}

function isRecoveryAllowedAction_(action) {
  return ["system.health", "restore.preview", "restore.apply", "integrity.run"].indexOf(action) !== -1;
}



function usesRecoveryIdempotency_(action, schemaIssues) {
  return action === "restore.apply" && ((schemaIssues && schemaIssues.length) || isRecoveryRequired_());
}

function recoveryIdempotencyKey_(context) {
  return "RECOVERY_IDEMPOTENCY_" + sha256Hex_(String(context.idempotencyKey || ""));
}

function getRecoveryIdempotentResult_(context) {
  if (!context.idempotencyKey) return null;
  const properties = PropertiesService.getScriptProperties();
  const raw = properties.getProperty(recoveryIdempotencyKey_(context));
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch (error) { throw sbError_("RECOVERY_IDEMPOTENCY_CORRUPT", "State idempotency recovery rusak. Jalankan pemulihan manual.", 503); }
  const expiresAt = Date.parse(String(parsed.expiresAt || ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) { properties.deleteProperty(recoveryIdempotencyKey_(context)); return null; }
  if (parsed.fingerprint !== idempotencyFingerprint_(context)) throw sbError_("IDEMPOTENCY_MISMATCH", "Idempotency key recovery telah digunakan dengan payload berbeda.", 409);
  return parsed.result;
}

function saveRecoveryIdempotentResult_(context, result) {
  if (!context.idempotencyKey) return;
  const key = recoveryIdempotencyKey_(context);
  const properties = PropertiesService.getScriptProperties();
  try {
    const current = properties.getProperty(key);
    if (current) {
      const parsed = JSON.parse(current);
      if (parsed.fingerprint !== idempotencyFingerprint_(context)) throw sbError_("IDEMPOTENCY_MISMATCH", "Idempotency key recovery telah digunakan dengan payload berbeda.", 409);
      return;
    }
    properties.setProperty(key, JSON.stringify({
      fingerprint: idempotencyFingerprint_(context),
      result: canonicalValue_(result),
      expiresAt: Utilities.formatDate(new Date(Date.now() + 86400000), SB_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX")
    }));
  } catch (error) {
    setRecoveryRequired_("recovery_idempotency_commit_required", { action: context.action, idempotencyKeyHash: sha256Hex_(String(context.idempotencyKey)), cause: error.code || error.message });
    throw sbError_("RECOVERY_IDEMPOTENCY_COMMIT_REQUIRED", "Restore selesai tetapi hasil idempotency recovery belum dapat disimpan. Aplikasi tetap dikunci.", 503, recoveryDetails_());
  }
}

function isIdempotencyRequired_(action) {
  return [
    "system.initialize", "users.upsert", "users.deactivate",
    "accounts.create", "accounts.update", "accounts.archive",
    "categories.create", "categories.update", "categories.archive",
    "transactions.create", "transactions.update", "transactions.cancel",
    "envelopes.createRule", "envelopes.createPeriod", "envelopes.move", "envelopes.close",
    "recurring.createRule", "recurring.updateRule", "recurring.payOccurrence", "recurring.reversePayment",
    "budgets.upsert", "goals.create", "goals.move", "goals.reverseMovement", "reconciliations.create",
    "periods.close", "periods.reopen", "calendar.sync", "notifications.register", "notifications.unregister",
    "backup.create", "export.create", "import.apply", "restore.apply"
  ].indexOf(action) !== -1;
}

function entityIdFromResult_(data) {
  if (!data || typeof data !== "object") return "";
  const fields = [
    "transaction_id", "account_id", "category_id", "user_id", "envelope_rule_id", "envelope_period_id",
    "movement_id", "recurring_rule_id", "occurrence_id", "budget_id", "goal_id", "goal_movement_id",
    "reconciliation_id", "closure_id", "notification_id", "subscriptionId", "backup_id", "fileId", "entityId"
  ];
  for (let index = 0; index < fields.length; index += 1) if (data[fields[index]]) return data[fields[index]];
  if (data.movement && data.movement.movement_id) return data.movement.movement_id;
  if (data.occurrence && data.occurrence.occurrence_id) return data.occurrence.occurrence_id;
  return "";
}

function doPost(e) {
  try {
    const body = JSON.parse(e && e.postData && e.postData.contents || "{}");
    const signed = verifyEnvelope_(body);
    enforceAppsScriptRateLimit_(signed.actor, signed.action);
    if (signed.action === "system.initialize") initializeSchema_();

    let schemaIssues = [];
    if (signed.action !== "system.initialize") {
      try { schemaIssues = validateSchema_(); }
      catch (schemaError) { schemaIssues = [schemaError.code || schemaError.message]; }
    }
    if (schemaIssues.length && !isSchemaRecoveryAction_(signed.action)) {
      const missing = isSchemaUninitialized_();
      throw sbError_(missing ? "SCHEMA_MISSING" : "SCHEMA_INVALID", missing ? "Schema database belum dibuat." : "Schema database rusak. Hanya jalur recovery owner yang tetap dibuka.", 503, schemaIssues);
    }

    const actor = schemaIssues.length ? resolveRecoveryActor_(signed.actor, signed.action) : resolveActor_(signed.actor, signed.action);
    if (isRecoveryRequired_() && !isRecoveryAllowedAction_(signed.action)) throw sbError_("RECOVERY_REQUIRED", "Aplikasi dikunci karena pemulihan data belum selesai.", 503, recoveryDetails_());

    const maintenanceMode = getConfig_("maintenance_mode") === "true";
    if (maintenanceMode && isMutatingAction_(signed.action) && ["restore.apply", "integrity.run"].indexOf(signed.action) === -1) throw sbError_("MAINTENANCE_MODE", "Aplikasi sedang dalam maintenance. Perubahan sementara ditolak.", 503, recoveryDetails_());

    const context = {
      actor: actor,
      action: signed.action,
      payload: signed.payload || {},
      requestId: signed.requestId || "",
      idempotencyKey: signed.idempotencyKey || "",
      rowVersion: signed.rowVersion
    };
    const mutating = isMutatingAction_(context.action);
    if (isIdempotencyRequired_(context.action) && !context.idempotencyKey) throw sbError_("IDEMPOTENCY_REQUIRED", "Idempotency key wajib untuk operasi perubahan data.", 400);
    let data;
    if (mutating) {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(15000)) throw sbError_("LOCK_TIMEOUT", "Data sedang diperbarui pengguna lain. Coba kembali.", 409);
      try {
        const recoveryIdempotency = usesRecoveryIdempotency_(context.action, schemaIssues);
        const previous = recoveryIdempotency ? getRecoveryIdempotentResult_(context) : getIdempotentResult_(context);
        if (previous) data = previous;
        else {
          data = routeAction_(context);
          SpreadsheetApp.flush();
          if (recoveryIdempotency) saveRecoveryIdempotentResult_(context, data);
          else saveIdempotentResult_(context, entityIdFromResult_(data), data);
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
  return !["system.health", "bootstrap.get", "users.list", "audit.list", "dashboard.overview", "accounts.list", "categories.list", "transactions.list", "envelopes.list", "recurring.list", "budgets.list", "goals.list", "reports.monthly", "restore.preview", "import.preview"].includes(action);
}
