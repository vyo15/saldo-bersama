function doGet() {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    data: {
      service: "saldo-bersama-apps-script",
      status: "ok"
    }
  })).setMimeType(ContentService.MimeType.JSON);
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
    "envelopes.create", "envelopes.createRule", "envelopes.createPeriod", "envelopes.move", "envelopes.close",
    "recurring.createRule", "recurring.updateRule", "recurring.payOccurrence", "recurring.reversePayment",
    "budgets.upsert", "budgets.archive", "goals.create", "goals.update", "goals.move", "goals.reverseMovement", "reconciliations.create",
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

function requestSchemaIssues_(action) {
  if (action === "system.initialize") return [];
  try { return canUseCachedSchemaValidation_(action) ? validateSchemaCached_() : validateSchema_(); }
  catch (schemaError) { return [schemaError.code || schemaError.message]; }
}

function assertRequestSchema_(action, schemaIssues) {
  if (!schemaIssues.length || isRecoveryAllowedAction_(action)) return;
  const missing = isSchemaUninitialized_();
  throw sbError_(
    missing ? "SCHEMA_MISSING" : "SCHEMA_INVALID",
    missing ? "Schema database belum dibuat." : "Schema database rusak. Hanya jalur recovery owner yang tetap dibuka.",
    503,
    schemaIssues
  );
}

function resolveRequestActor_(signed, schemaIssues) {
  return schemaIssues.length
    ? resolveRecoveryActor_(signed.actor, signed.action)
    : resolveActor_(signed.actor, signed.action);
}

function assertRuntimeAvailability_(action, schemaIssues) {
  if (isRecoveryRequired_() && !isRecoveryAllowedAction_(action)) {
    throw sbError_("RECOVERY_REQUIRED", "Aplikasi dikunci karena pemulihan data belum selesai.", 503, recoveryDetails_());
  }
  let maintenanceMode = false;
  try { maintenanceMode = getConfig_("maintenance_mode") === "true"; }
  catch (error) {
    if (!(schemaIssues && schemaIssues.length && isRecoveryAllowedAction_(action))) throw error;
  }
  if (maintenanceMode && isMutatingAction_(action) && ["restore.apply", "integrity.run"].indexOf(action) === -1) {
    throw sbError_("MAINTENANCE_MODE", "Aplikasi sedang dalam maintenance. Perubahan sementara ditolak.", 503, recoveryDetails_());
  }
}

function contextFromSigned_(signed, actor) {
  return {
    actor: actor,
    action: signed.action,
    payload: signed.payload || {},
    requestId: signed.requestId || "",
    idempotencyKey: signed.idempotencyKey || "",
    rowVersion: signed.rowVersion
  };
}

function recordStageTiming_(timings, name, startedAt) {
  timings[name] = Date.now() - startedAt;
  return Date.now();
}

function doPost(e) {
  resetRequestCache_();
  const startedAt = Date.now();
  const stageTimings = {};
  let stageStartedAt = startedAt;
  let signed = null;
  try {
    const body = JSON.parse(e && e.postData && e.postData.contents || "{}");
    signed = verifyEnvelope_(body);
    stageStartedAt = recordStageTiming_(stageTimings, "verifyEnvelope", stageStartedAt);
    appsScriptLog_("info", "request.started", {
      requestId: String(signed.requestId || "").slice(0, 120),
      action: String(signed.action || "unknown").slice(0, 120),
      role: String(signed.actor && signed.actor.role || "unknown").slice(0, 32),
      mutating: isMutatingAction_(signed.action)
    });
    enforceAppsScriptRateLimit_(signed.actor, signed.action);
    if (signed.action === "system.initialize") assertInitializationActor_(signed.actor);
    if (isIdempotencyRequired_(signed.action) && !signed.idempotencyKey) {
      throw sbError_("IDEMPOTENCY_REQUIRED", "Idempotency key wajib untuk operasi perubahan data.", 400);
    }
    stageStartedAt = recordStageTiming_(stageTimings, "preflight", stageStartedAt);

    const mutating = isMutatingAction_(signed.action);
    let data;

    if (mutating) {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(15000)) throw sbError_("LOCK_TIMEOUT", "Data sedang diperbarui pengguna lain. Coba kembali.", 409);
      try {
        resetRequestCache_();
        let schemaIssues = requestSchemaIssues_(signed.action);
        stageStartedAt = recordStageTiming_(stageTimings, "schemaValidation", stageStartedAt);
        if (signed.action === "system.initialize") {
          initializeSchema_();
          SpreadsheetApp.flush();
          resetRequestCache_();
          schemaIssues = validateSchema_();
          if (schemaIssues.length) throw sbError_("SCHEMA_INVALID", "Inisialisasi schema belum lolos validasi.", 503, schemaIssues);
        } else {
          assertRequestSchema_(signed.action, schemaIssues);
        }

        assertRuntimeAvailability_(signed.action, schemaIssues);
        const actor = resolveRequestActor_(signed, schemaIssues);
        stageStartedAt = recordStageTiming_(stageTimings, "resolveActor", stageStartedAt);
        const context = contextFromSigned_(signed, actor);
        const recoveryIdempotency = usesRecoveryIdempotency_(context.action, schemaIssues);
        const previous = recoveryIdempotency ? getRecoveryIdempotentResult_(context) : getIdempotentResult_(context);
        if (previous) {
          data = previous;
        } else {
          const routeStartedAt = Date.now();
          data = routeAction_(context);
          stageTimings.routeAction = Date.now() - routeStartedAt;
          SpreadsheetApp.flush();
          if (recoveryIdempotency) saveRecoveryIdempotentResult_(context, data);
          else saveIdempotentResult_(context, entityIdFromResult_(data), data);
          SpreadsheetApp.flush();
        }
      } finally {
        lock.releaseLock();
      }
    } else {
      const schemaIssues = requestSchemaIssues_(signed.action);
      stageStartedAt = recordStageTiming_(stageTimings, "schemaValidation", stageStartedAt);
      assertRequestSchema_(signed.action, schemaIssues);
      assertRuntimeAvailability_(signed.action, schemaIssues);
      const actor = resolveRequestActor_(signed, schemaIssues);
      stageStartedAt = recordStageTiming_(stageTimings, "resolveActor", stageStartedAt);
      const routeStartedAt = Date.now();
      data = routeAction_(contextFromSigned_(signed, actor));
      stageTimings.routeAction = Date.now() - routeStartedAt;
    }

    const readMetrics = requestReadMetrics_();
    appsScriptLog_("info", "request.completed", {
      requestId: String(signed && signed.requestId || "").slice(0, 120),
      action: String(signed && signed.action || "unknown").slice(0, 120),
      role: String(signed && signed.actor && signed.actor.role || "unknown").slice(0, 32),
      status: 200,
      durationMs: Date.now() - startedAt,
      mutating: signed ? isMutatingAction_(signed.action) : null,
      stageTimings: stageTimings,
      sheetMetrics: readMetrics.sheets,
      rowsScanned: readMetrics.rowsScanned,
      cacheHits: readMetrics.cacheHits
    });
    return jsonOutput_({ ok: true, data: data });
  } catch (error) {
    const readMetrics = requestReadMetrics_();
    appsScriptLog_("error", "request.failed", {
      requestId: String(signed && signed.requestId || "").slice(0, 120),
      action: String(signed && signed.action || "unknown").slice(0, 120),
      role: String(signed && signed.actor && signed.actor.role || "unknown").slice(0, 32),
      status: error.status || 500,
      code: error.code || "INTERNAL_ERROR",
      durationMs: Date.now() - startedAt,
      mutating: signed ? isMutatingAction_(signed.action) : null,
      stageTimings: stageTimings,
      sheetMetrics: readMetrics.sheets,
      rowsScanned: readMetrics.rowsScanned,
      cacheHits: readMetrics.cacheHits
    });
    return jsonOutput_({ ok: false, error: { code: error.code || "INTERNAL_ERROR", message: error.code ? error.message : "Apps Script gagal memproses request.", status: error.status || 500, details: error.details || null } });
  }
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function isMutatingAction_(action) {
  return !["system.health", "app.initialState", "users.list", "audit.list", "dashboard.overview", "accounts.list", "categories.list", "transactions.list", "envelopes.list", "recurring.list", "budgets.list", "goals.list", "reports.monthly", "reconciliations.list", "periods.list", "restore.preview", "import.preview"].includes(action);
}
