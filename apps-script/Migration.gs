const SB_MIGRATION_V2_CONFIRMATION = "MIGRATE_V2";

function validateSchemaDefinition_(spreadsheet, schema, expectedVersion) {
  const issues = [];
  Object.keys(schema).forEach(function(name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) { issues.push("Sheet hilang: " + name); return; }
    const headers = schema[name];
    if (sheet.getLastColumn() !== headers.length) { issues.push("Jumlah kolom tidak sesuai: " + name); return; }
    const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (JSON.stringify(actual) !== JSON.stringify(headers)) issues.push("Header tidak sesuai: " + name);
  });
  const config = spreadsheet.getSheetByName("System_Config");
  let version = "";
  if (config && config.getLastRow() >= 2) {
    const values = config.getRange(2, 1, config.getLastRow() - 1, 2).getValues();
    const row = values.find(function(item) { return String(item[0]) === "schema_version"; });
    version = row ? String(row[1]) : "";
  }
  if (version !== String(expectedVersion)) issues.push("Schema version tidak sesuai: " + version);
  return issues;
}

function migrationActor_() {
  const email = String(Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  const user = rows_("Users").find(function(row) {
    return String(row.email || "").trim().toLowerCase() === email && row.role === "owner" && row.status === "active";
  });
  if (!user) throw sbError_("MIGRATION_OWNER_REQUIRED", "Migration hanya dapat dijalankan akun owner aktif dari editor Apps Script.", 403);
  return publicRow_(user);
}

function migrationScopeFromAccount_(account) {
  if (!account) throw sbError_("MIGRATION_REFERENCE_MISSING", "Rekening referensi migration tidak ditemukan.", 409);
  if (account && account.owner_scope === "personal") {
    const ownerUserId = String(account.owner_user_id || "");
    if (!ownerUserId) throw sbError_("MIGRATION_OWNER_MISSING", "Rekening personal migration tidak memiliki owner.", 409);
    return { scope: "personal", owner_user_id: ownerUserId };
  }
  return { scope: "shared", owner_user_id: "" };
}

function migrationScopePreviewFromAccount_(account) {
  if (!account) return { scope: "unknown", owner_user_id: "", ambiguous: true };
  if (account.owner_scope === "personal") {
    const ownerUserId = String(account.owner_user_id || "");
    return { scope: "personal", owner_user_id: ownerUserId, ambiguous: !ownerUserId };
  }
  return { scope: "shared", owner_user_id: "", ambiguous: false };
}

function migrationPreviewData_() {
  const accounts = Object.fromEntries(rows_("Accounts").map(function(row) { return [row.account_id, row]; }));
  const envelopeRules = Object.fromEntries(rows_("Envelope_Rules").map(function(row) { return [row.envelope_rule_id, row]; }));
  const recurring = rows_("Recurring_Rules").map(function(rule) {
    return migrationScopePreviewFromAccount_(accounts[rule.default_account_id]);
  });
  const budgets = rows_("Budgets").map(function(budget) {
    const rule = envelopeRules[budget.envelope_rule_id];
    if (!rule) return { scope: "unknown", owner_user_id: "", ambiguous: true };
    const ownerUserId = rule.scope === "personal" ? String(rule.owner_user_id || "") : "";
    return { scope: rule.scope === "personal" ? "personal" : "shared", owner_user_id: ownerUserId, ambiguous: rule.scope === "personal" && !ownerUserId };
  });
  const goals = rows_("Savings_Goals").map(function(goal) {
    return migrationScopePreviewFromAccount_(accounts[goal.account_id]);
  });
  return {
    recurringRules: {
      total: recurring.length,
      personal: recurring.filter(function(item) { return item.scope === "personal"; }).length,
      ambiguous: recurring.filter(function(item) { return item.ambiguous; }).length
    },
    budgets: {
      total: budgets.length,
      personal: budgets.filter(function(item) { return item.scope === "personal"; }).length,
      ambiguous: budgets.filter(function(item) { return item.ambiguous; }).length
    },
    goals: {
      total: goals.length,
      personal: goals.filter(function(item) { return item.scope === "personal"; }).length,
      ambiguous: goals.filter(function(item) { return item.ambiguous; }).length
    }
  };
}

function assertMigrationPreviewSafe_(preview) {
  const ambiguous = Number(preview.recurringRules.ambiguous || 0) + Number(preview.budgets.ambiguous || 0) + Number(preview.goals.ambiguous || 0);
  if (ambiguous > 0) {
    throw sbError_("MIGRATION_OWNERSHIP_AMBIGUOUS", "Migration dihentikan karena ada data yang kepemilikannya tidak dapat ditentukan dengan aman.", 409, preview);
  }
}

function previewSchemaMigrationV2() {
  resetRequestCache_();
  const spreadsheet = getSpreadsheet_();
  const issues = validateSchemaDefinition_(spreadsheet, SB_SCHEMA_V1, SB_PREVIOUS_SCHEMA_VERSION);
  if (issues.length) throw sbError_("MIGRATION_SOURCE_INVALID", "Schema sumber bukan versi 1 yang valid.", 409, issues);
  const actor = migrationActor_();
  return {
    fromVersion: SB_PREVIOUS_SCHEMA_VERSION,
    toVersion: SB_SCHEMA_VERSION,
    actorEmail: actor.email,
    changes: migrationPreviewData_(),
    confirmation: SB_MIGRATION_V2_CONFIRMATION,
    warning: "Apply akan membuat safety backup, mengaktifkan maintenance, melakukan migration, lalu menjalankan integrity check."
  };
}

function migrationBackupFolder_() {
  const folderId = String(PropertiesService.getScriptProperties().getProperty("BACKUP_FOLDER_ID") || "").trim();
  if (!folderId) return null;
  try { return DriveApp.getFolderById(folderId); }
  catch (error) { throw sbError_("BACKUP_FOLDER_INVALID", "BACKUP_FOLDER_ID tidak dapat diakses.", 503); }
}

function migrationSafetyIssues_(source, copy) {
  const issues = validateSchemaDefinition_(copy, SB_SCHEMA_V1, SB_PREVIOUS_SCHEMA_VERSION);
  Object.keys(SB_SCHEMA_V1).forEach(function(name) {
    const sourceSheet = source.getSheetByName(name);
    const copySheet = copy.getSheetByName(name);
    if (!sourceSheet || !copySheet) return;
    if (sourceSheet.getLastRow() !== copySheet.getLastRow()) issues.push("Jumlah baris backup berbeda: " + name);
    if (sourceSheet.getLastColumn() !== copySheet.getLastColumn()) issues.push("Jumlah kolom backup berbeda: " + name);
    const rows = Math.max(1, copySheet.getLastRow());
    const columns = Math.max(1, copySheet.getLastColumn());
    const formulas = copySheet.getRange(1, 1, rows, columns).getFormulas();
    if (formulas.some(function(row) { return row.some(function(value) { return Boolean(value); }); })) {
      issues.push("Formula tidak diizinkan pada safety backup: " + name);
    }
  });
  return issues;
}

function createMigrationSafetyBackup_(spreadsheet) {
  const timestamp = Utilities.formatDate(new Date(), SB_TIMEZONE, "yyyyMMdd-HHmmssSSS");
  const name = "saldo-bersama-migration-v1-to-v2-" + timestamp;
  const sourceFile = DriveApp.getFileById(spreadsheet.getId());
  const folder = migrationBackupFolder_();
  const copy = folder ? sourceFile.makeCopy(name, folder) : sourceFile.makeCopy(name);
  const copySpreadsheet = SpreadsheetApp.openById(copy.getId());
  const issues = migrationSafetyIssues_(spreadsheet, copySpreadsheet);
  if (issues.length) {
    try { copy.setTrashed(true); }
    catch (cleanupError) {
      throw sbError_("DRIVE_CLEANUP_REQUIRED", "Safety backup migration tidak valid dan tidak dapat dibersihkan.", 503, {
        fileId: copy.getId(), issues: issues, cleanupError: cleanupError.message
      });
    }
    throw sbError_("MIGRATION_BACKUP_INVALID", "Safety backup migration gagal diverifikasi dan sudah dipindahkan ke Trash.", 503, issues);
  }
  return { fileId: copy.getId(), fileName: copy.getName(), createdAt: nowIso_() };
}

function ensureSheetWidth_(sheet, width) {
  const current = sheet.getMaxColumns();
  if (current < width) sheet.insertColumnsAfter(current, width - current);
  if (current > width) sheet.deleteColumns(width + 1, current - width);
}

function ensureSheetHeight_(sheet, height) {
  const current = sheet.getMaxRows();
  if (current < height) sheet.insertRowsAfter(current, height - current);
  if (current > height) sheet.deleteRows(height + 1, current - height);
}

function restoreRawSpreadsheet_(target, source) {
  source.getSheets().forEach(function(sourceSheet) {
    const name = sourceSheet.getName();
    let targetSheet = target.getSheetByName(name);
    if (!targetSheet) targetSheet = target.insertSheet(name);
    const rows = Math.max(1, sourceSheet.getLastRow());
    const columns = Math.max(1, sourceSheet.getLastColumn());
    ensureSheetWidth_(targetSheet, columns);
    ensureSheetHeight_(targetSheet, rows);
    targetSheet.clear({ contentsOnly: true });
    const sourceRange = sourceSheet.getRange(1, 1, rows, columns);
    targetSheet.getRange(1, 1, rows, columns).setValues(sourceRange.getValues());
  });
  target.getSheets().forEach(function(sheet) {
    if (!source.getSheetByName(sheet.getName())) target.deleteSheet(sheet);
  });
  SpreadsheetApp.flush();
}

function migrateSheetScopes_(sheetName, scopeResolver) {
  const oldHeaders = SB_SCHEMA_V1[sheetName];
  const newHeaders = SB_SCHEMA[sheetName];
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw sbError_("SCHEMA_MISSING", "Sheet migration tidak ditemukan: " + sheetName, 503);
  if (sheet.getLastColumn() !== oldHeaders.length) throw sbError_("MIGRATION_SOURCE_INVALID", "Lebar sheet migration tidak sesuai: " + sheetName, 409);
  sheet.insertColumnsAfter(oldHeaders.length, newHeaders.length - oldHeaders.length);
  sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
  const rowCount = Math.max(0, sheet.getLastRow() - 1);
  if (!rowCount) return;
  const oldRows = sheet.getRange(2, 1, rowCount, oldHeaders.length).getValues();
  const scopes = oldRows.map(function(values) {
    const row = oldHeaders.reduce(function(result, field, index) { result[field] = values[index]; return result; }, {});
    const resolved = scopeResolver(row);
    if (resolved.scope === "personal" && !resolved.owner_user_id) throw sbError_("MIGRATION_OWNER_MISSING", "Data personal tidak memiliki owner pada " + sheetName + ".", 409);
    return [resolved.scope, resolved.owner_user_id];
  });
  sheet.getRange(2, oldHeaders.length + 1, rowCount, 2).setValues(scopes);
}

function applySchemaMigrationV2(confirmation) {
  if (String(confirmation || "") !== SB_MIGRATION_V2_CONFIRMATION) {
    throw sbError_("MIGRATION_CONFIRMATION_REQUIRED", "Ketik MIGRATE_V2 untuk menjalankan migration.", 400);
  }
  resetRequestCache_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw sbError_("LOCK_TIMEOUT", "Migration gagal memperoleh lock.", 409);
  let safety = null;
  const properties = PropertiesService.getScriptProperties();
  try {
    const spreadsheet = getSpreadsheet_();
    const sourceIssues = validateSchemaDefinition_(spreadsheet, SB_SCHEMA_V1, SB_PREVIOUS_SCHEMA_VERSION);
    if (sourceIssues.length) {
      const currentIssues = validateSchemaDefinition_(spreadsheet, SB_SCHEMA, SB_SCHEMA_VERSION);
      if (!currentIssues.length) return { migrated: false, alreadyCurrent: true, schemaVersion: SB_SCHEMA_VERSION };
      throw sbError_("MIGRATION_SOURCE_INVALID", "Schema sumber migration tidak valid.", 409, sourceIssues);
    }

    const actor = migrationActor_();
    const preview = migrationPreviewData_();
    assertMigrationPreviewSafe_(preview);
    safety = createMigrationSafetyBackup_(spreadsheet);
    properties.setProperties({
      MIGRATION_STATUS: "running",
      MIGRATION_FROM_VERSION: SB_PREVIOUS_SCHEMA_VERSION,
      MIGRATION_TO_VERSION: SB_SCHEMA_VERSION,
      MIGRATION_SAFETY_FILE_ID: safety.fileId,
      MIGRATION_UPDATED_AT: nowIso_()
    });
    upsertConfig_("maintenance_mode", "true");
    SpreadsheetApp.flush();
    resetRequestCache_();

    const accounts = Object.fromEntries(rows_("Accounts").map(function(row) { return [row.account_id, row]; }));
    const envelopeRules = Object.fromEntries(rows_("Envelope_Rules").map(function(row) { return [row.envelope_rule_id, row]; }));

    migrateSheetScopes_("Recurring_Rules", function(rule) {
      return migrationScopeFromAccount_(accounts[rule.default_account_id]);
    });
    migrateSheetScopes_("Budgets", function(budget) {
      const rule = envelopeRules[budget.envelope_rule_id];
      if (!rule) throw sbError_("MIGRATION_REFERENCE_MISSING", "Budget migration tidak memiliki envelope rule yang valid.", 409);
      return { scope: rule.scope === "personal" ? "personal" : "shared", owner_user_id: rule.scope === "personal" ? String(rule.owner_user_id || "") : "" };
    });
    migrateSheetScopes_("Savings_Goals", function(goal) {
      return migrationScopeFromAccount_(accounts[goal.account_id]);
    });

    resetRequestCache_();
    upsertConfig_("schema_version", SB_SCHEMA_VERSION);
    SpreadsheetApp.flush();
    resetRequestCache_();

    protectSystemSheets_();
    const schemaIssues = validateSchema_();
    if (schemaIssues.length) throw sbError_("MIGRATION_SCHEMA_INVALID", "Schema hasil migration tidak valid.", 503, schemaIssues);
    const dataIssues = integrityIssues_();
    if (dataIssues.length) throw sbError_("MIGRATION_INTEGRITY_FAILED", "Data hasil migration belum lolos integrity check.", 503, dataIssues);

    appendRow_("Backup_Log", {
      backup_id: uuid_(), backup_type: "pre-migration", file_id: safety.fileId, file_name: safety.fileName,
      schema_version: SB_PREVIOUS_SCHEMA_VERSION, status: "verified", checksum: "", created_by: actor.user_id,
      created_at: safety.createdAt, verified_at: nowIso_()
    });
    appendAudit_({ actor: actor, requestId: "migration:" + uuid_() }, "schema.migrate.v2", "system", "schema", { schemaVersion: SB_PREVIOUS_SCHEMA_VERSION }, { schemaVersion: SB_SCHEMA_VERSION, preview: preview, safetyBackupFileId: safety.fileId });
    upsertConfig_("maintenance_mode", "false");
    properties.setProperties({
      MIGRATION_STATUS: "ready",
      MIGRATION_UPDATED_AT: nowIso_()
    });
    return { migrated: true, schemaVersion: SB_SCHEMA_VERSION, safetyBackupFileId: safety.fileId, preview: preview };
  } catch (error) {
    if (!safety) {
      properties.setProperties({ MIGRATION_STATUS: "failed_before_backup", MIGRATION_UPDATED_AT: nowIso_() });
      throw error;
    }
    let rollbackError = null;
    try {
      const source = SpreadsheetApp.openById(safety.fileId);
      restoreRawSpreadsheet_(getSpreadsheet_(), source);
      resetRequestCache_();
      const rollbackIssues = validateSchemaDefinition_(getSpreadsheet_(), SB_SCHEMA_V1, SB_PREVIOUS_SCHEMA_VERSION);
      if (rollbackIssues.length) throw sbError_("MIGRATION_ROLLBACK_INVALID", "Rollback migration tidak lolos validasi.", 503, rollbackIssues);
      protectSystemSheets_(SB_SCHEMA_V1);
      upsertConfig_("maintenance_mode", "false");
      properties.setProperties({
        MIGRATION_STATUS: "rolled_back",
        MIGRATION_ERROR_CODE: error.code || "MIGRATION_FAILED",
        MIGRATION_UPDATED_AT: nowIso_()
      });
    } catch (caughtRollbackError) {
      rollbackError = caughtRollbackError;
    }
    if (!rollbackError) {
      throw sbError_("MIGRATION_ROLLED_BACK", "Migration gagal dan spreadsheet telah dikembalikan ke safety backup.", 503, { cause: error.code || error.message, safetyBackupFileId: safety.fileId });
    }
    properties.setProperties({
      MIGRATION_STATUS: "recovery_required",
      MIGRATION_ERROR_CODE: error.code || "MIGRATION_FAILED",
      MIGRATION_ROLLBACK_ERROR_CODE: rollbackError.code || "MIGRATION_ROLLBACK_FAILED",
      MIGRATION_UPDATED_AT: nowIso_()
    });
    setRecoveryRequired_("migration_recovery_required", {
      cause: error.code || error.message,
      rollbackError: rollbackError.code || rollbackError.message,
      safetyBackupFileId: safety.fileId
    });
    throw sbError_("RECOVERY_REQUIRED", "Migration dan rollback gagal. Aplikasi tetap dikunci sampai recovery manual selesai.", 503, recoveryDetails_());
  } finally {
    lock.releaseLock();
  }
}

function runSchemaMigrationV2() {
  const properties = PropertiesService.getScriptProperties();
  const confirmation = String(properties.getProperty("MIGRATION_CONFIRMATION") || "");
  properties.deleteProperty("MIGRATION_CONFIRMATION");
  return applySchemaMigrationV2(confirmation);
}
