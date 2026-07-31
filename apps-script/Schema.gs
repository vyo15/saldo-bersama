const SB_SCHEMA_VERSION = "2";
const SB_PREVIOUS_SCHEMA_VERSION = "1";
const SB_TIMEZONE = "Asia/Jakarta";
const SB_CURRENCY = "IDR";

const SB_SCHEMA_V1 = Object.freeze({
  System_Config: ["key", "value", "updated_at"],
  Users: ["user_id", "firebase_uid", "email", "name", "role", "status", "row_version", "created_at", "updated_at"],
  Accounts: ["account_id", "name", "account_type", "owner_scope", "owner_user_id", "initial_balance", "initial_balance_date", "allow_negative", "status", "row_version", "created_by", "created_at", "updated_by", "updated_at"],
  Categories: ["category_id", "name", "transaction_type", "nature", "icon", "status", "row_version", "created_by", "created_at", "updated_by", "updated_at"],
  Transactions: ["transaction_id", "transaction_date", "transaction_type", "source_account_id", "destination_account_id", "category_id", "envelope_period_id", "recurring_occurrence_id", "goal_id", "amount", "description", "overspend_reason", "merchant", "payment_method", "scope", "owner_user_id", "status", "row_version", "idempotency_key", "created_by", "created_at", "updated_by", "updated_at", "cancelled_by", "cancelled_at", "cancellation_reason"],
  Recurring_Rules: ["recurring_rule_id", "name", "kind", "category_id", "expected_amount", "frequency", "due_day", "default_account_id", "payment_method", "auto_debit", "start_date", "end_date", "priority", "status", "row_version", "created_by", "created_at", "updated_by", "updated_at"],
  Recurring_Occurrences: ["occurrence_id", "recurring_rule_id", "period_key", "due_date", "expected_amount", "actual_amount", "status", "transaction_ids", "calendar_event_id", "row_version", "created_at", "updated_at"],
  Budgets: ["budget_id", "period_key", "category_id", "envelope_rule_id", "name", "amount", "warning_threshold", "status", "row_version", "created_by", "created_at", "updated_by", "updated_at"],
  Envelope_Rules: ["envelope_rule_id", "name", "period_type", "scope", "owner_user_id", "default_amount", "source_account_id", "rollover_policy", "overspend_policy", "status", "row_version", "created_by", "created_at", "updated_by", "updated_at"],
  Envelope_Periods: ["envelope_period_id", "envelope_rule_id", "name", "period_start", "period_end", "allocated_amount", "reserved_amount", "status", "row_version", "created_by", "created_at", "updated_by", "updated_at", "closed_by", "closed_at"],
  Envelope_Movements: ["movement_id", "from_envelope_period_id", "to_envelope_period_id", "amount", "movement_type", "reason", "status", "row_version", "created_by", "created_at"],
  Savings_Goals: ["goal_id", "name", "goal_type", "target_amount", "target_date", "account_id", "priority", "status", "row_version", "created_by", "created_at", "updated_by", "updated_at"],
  Goal_Movements: ["goal_movement_id", "goal_id", "transaction_id", "movement_type", "amount", "reason", "status", "created_by", "created_at"],
  Reconciliations: ["reconciliation_id", "account_id", "reconciled_at", "system_balance", "actual_balance", "difference", "notes", "status", "created_by", "created_at"],
  Period_Closures: ["closure_id", "period_key", "scope", "status", "snapshot_json", "reason", "row_version", "closed_by", "closed_at", "reopened_by", "reopened_at"],
  Calendar_Sync: ["sync_id", "entity_type", "entity_id", "event_id", "sync_status", "last_synced_at", "last_error", "row_version"],
  Notification_Queue: ["notification_id", "user_id", "notification_type", "title", "body", "target_path", "scheduled_at", "status", "attempt_count", "last_attempt_at", "dedupe_key", "created_at"],
  Push_Subscriptions: ["subscription_id", "user_id", "endpoint", "p256dh", "auth", "user_agent", "status", "created_at", "updated_at"],
  Audit_Log: ["audit_id", "request_id", "timestamp", "actor_id", "actor_email", "action", "entity_type", "entity_id", "previous_value", "new_value", "result"],
  Idempotency: ["idempotency_key", "action", "actor_id", "entity_id", "response_json", "created_at", "expires_at"],
  Backup_Log: ["backup_id", "backup_type", "file_id", "file_name", "schema_version", "status", "checksum", "created_by", "created_at", "verified_at"]
});

const SB_SCHEMA = Object.freeze(Object.assign({}, SB_SCHEMA_V1, {
  Recurring_Rules: SB_SCHEMA_V1.Recurring_Rules.concat(["scope", "owner_user_id"]),
  Budgets: SB_SCHEMA_V1.Budgets.concat(["scope", "owner_user_id"]),
  Savings_Goals: SB_SCHEMA_V1.Savings_Goals.concat(["scope", "owner_user_id"])
}));


function setupSaldoBersama() {
  resetRequestCache_();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("Buka Apps Script dari spreadsheet Saldo Bersama.");
  const spreadsheetId = spreadsheet.getId();
  const properties = PropertiesService.getScriptProperties();
  const configuredSpreadsheetId = properties.getProperty("SPREADSHEET_ID");
  if (configuredSpreadsheetId && configuredSpreadsheetId !== spreadsheetId) {
    throw sbError_("SPREADSHEET_MISMATCH", "Project Apps Script sudah terikat ke spreadsheet lain.", 409);
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw sbError_("LOCK_TIMEOUT", "Setup gagal memperoleh lock. Coba lagi setelah proses lain selesai.", 409);
  try {
    properties.setProperties({ SPREADSHEET_ID: spreadsheetId, SETUP_STATUS: "running" });
    properties.deleteProperty("SETUP_DETAILS");
    initializeSchema_();
    SpreadsheetApp.flush();
    resetRequestCache_();
    const issues = validateSchema_();
    if (issues.length) throw sbError_("SCHEMA_MISMATCH", "Setup selesai sebagian dan belum lolos validasi schema.", 503, issues);
    removeUnusedDefaultSheet_(spreadsheet);
    properties.setProperties({ SETUP_STATUS: "ready", SETUP_VERIFIED_AT: new Date().toISOString() });
    properties.deleteProperty("SETUP_DETAILS");
    return { spreadsheetId: spreadsheetId, schemaVersion: SB_SCHEMA_VERSION, verified: true };
  } catch (error) {
    try {
      properties.setProperties({
        SETUP_STATUS: "failed",
        SETUP_DETAILS: JSON.stringify({ code: error.code || "SETUP_FAILED", message: String(error.message || "Setup gagal.").slice(0, 500) })
      });
    } catch (_propertyError) {}
    throw error;
  } finally {
    lock.releaseLock();
  }
}


function removeUnusedDefaultSheet_(spreadsheet) {
  if (!spreadsheet || typeof spreadsheet.getSheets !== "function" || typeof spreadsheet.deleteSheet !== "function") return false;
  const defaultNames = ["Sheet1", "Sheet 1"];
  const candidate = spreadsheet.getSheets().find(function(sheet) {
    return defaultNames.indexOf(sheet.getName()) !== -1 && !SB_SCHEMA[sheet.getName()] && sheet.getLastRow() === 0;
  });
  if (!candidate || spreadsheet.getSheets().length <= 1) return false;
  spreadsheet.deleteSheet(candidate);
  return true;
}

function initializeSchema_() {
  invalidateSchemaValidationCache_();
  const spreadsheet = getSpreadsheet_();
  Object.keys(SB_SCHEMA).forEach(function(name) {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    const headers = SB_SCHEMA[name];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    } else {
      if (sheet.getLastColumn() !== headers.length) {
        const migrationHint = getConfig_("schema_version") === SB_PREVIOUS_SCHEMA_VERSION ? " Jalankan previewSchemaMigrationV2() lalu applySchemaMigrationV2()." : "";
        throw sbError_("SCHEMA_MISMATCH", "Jumlah kolom sheet " + name + " tidak sesuai schema." + migrationHint, 503);
      }
      const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
      if (JSON.stringify(actual) !== JSON.stringify(headers)) throw sbError_("SCHEMA_MISMATCH", "Header sheet " + name + " tidak sesuai schema.", 503);
    }
  });
  upsertConfig_("schema_version", SB_SCHEMA_VERSION);
  upsertConfig_("timezone", SB_TIMEZONE);
  upsertConfig_("currency", SB_CURRENCY);
  if (!getConfig_("maintenance_mode")) upsertConfig_("maintenance_mode", "false");
  if (!getConfig_("recovery_required")) upsertConfig_("recovery_required", "false");
  if (!getConfig_("recovery_status")) upsertConfig_("recovery_status", "");
  if (!getConfig_("recovery_details")) upsertConfig_("recovery_details", "");
  protectSystemSheets_();
}

function validateSchema_() {
  const spreadsheet = getSpreadsheet_();
  const issues = [];
  Object.keys(SB_SCHEMA).forEach(function(name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) { issues.push("Sheet hilang: " + name); return; }
    const expected = SB_SCHEMA[name];
    if (sheet.getLastColumn() !== expected.length) { issues.push("Jumlah kolom tidak sesuai: " + name); return; }
    const actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) issues.push("Header tidak sesuai: " + name);
  });
  const version = getConfig_("schema_version");
  if (version !== SB_SCHEMA_VERSION) issues.push("Schema version tidak didukung: " + version);
  return issues;
}

function isSchemaUninitialized_() {
  const spreadsheet = getSpreadsheet_();
  return Object.keys(SB_SCHEMA).every(function(name) { return !spreadsheet.getSheetByName(name); });
}

function lockProtectionToOwner_(protection) {
  try {
    protection.setWarningOnly(false);
    const owner = Session.getEffectiveUser();
    const ownerEmail = owner && owner.getEmail();
    protection.getEditors().forEach(function(editor) {
      if (!ownerEmail || editor.getEmail() !== ownerEmail) protection.removeEditor(editor);
    });
    if (ownerEmail) protection.addEditor(ownerEmail);
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  } catch (error) {
    protection.setWarningOnly(true);
  }
}

function protectSystemSheets_(schema) {
  const definition = schema || SB_SCHEMA;
  const spreadsheet = getSpreadsheet_();
  Object.keys(definition).forEach(function(name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) return;
    const headerDescription = "Saldo Bersama protected header: " + name;
    const expectedHeaderRange = sheet.getRange(1, 1, 1, definition[name].length);
    const headerProtection = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).find(function(item) { return item.getDescription() === headerDescription; });
    if (headerProtection) {
      try { headerProtection.setRange(expectedHeaderRange); } catch (ignored) {}
      lockProtectionToOwner_(headerProtection);
    } else {
      lockProtectionToOwner_(expectedHeaderRange.protect().setDescription(headerDescription));
    }
  });
  ["System_Config", "Audit_Log", "Idempotency", "Backup_Log"].forEach(function(name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) return;
    const description = "Saldo Bersama protected system sheet: " + name;
    const existing = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).find(function(item) { return item.getDescription() === description; });
    if (!existing) lockProtectionToOwner_(sheet.protect().setDescription(description));
  });
}

const SB_SCHEMA_VALIDATION_CACHE_SECONDS = 30;

function schemaValidationCacheKey_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || "unconfigured";
  return "schema-valid:" + spreadsheetId + ":v" + SB_SCHEMA_VERSION;
}

function invalidateSchemaValidationCache_() {
  try { CacheService.getScriptCache().remove(schemaValidationCacheKey_()); } catch (ignored) {}
}

function canUseCachedSchemaValidation_(action) {
  return [
    "app.initialState", "bootstrap.get", "users.list", "audit.list", "dashboard.overview",
    "accounts.list", "categories.list", "transactions.list", "envelopes.list", "recurring.list",
    "budgets.list", "goals.list", "reports.monthly", "periods.list"
  ].indexOf(action) !== -1;
}

function validateSchemaCached_() {
  const key = schemaValidationCacheKey_();
  let cache = null;
  try {
    cache = CacheService.getScriptCache();
    if (cache.get(key) === "ok") return [];
  } catch (ignored) { cache = null; }
  const issues = validateSchema_();
  if (!issues.length && cache) {
    try { cache.put(key, "ok", SB_SCHEMA_VALIDATION_CACHE_SECONDS); } catch (ignored) {}
  }
  return issues;
}
