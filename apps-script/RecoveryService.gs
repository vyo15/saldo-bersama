const SB_IMPORT_MAX_RECORDS = 200;
const SB_IMPORT_PREVIEW_MAX_BYTES = 80000;

function exportFields_() {
  return Object.freeze({
    Users: ["user_id", "email", "name", "role", "status", "created_at", "updated_at"],
    Accounts: SB_SCHEMA.Accounts,
    Categories: SB_SCHEMA.Categories,
    Transactions: SB_SCHEMA.Transactions.filter(function(field) { return field !== "idempotency_key"; }),
    Recurring_Rules: SB_SCHEMA.Recurring_Rules,
    Recurring_Occurrences: SB_SCHEMA.Recurring_Occurrences.filter(function(field) { return field !== "calendar_event_id"; }),
    Budgets: SB_SCHEMA.Budgets,
    Envelope_Rules: SB_SCHEMA.Envelope_Rules,
    Envelope_Periods: SB_SCHEMA.Envelope_Periods,
    Envelope_Movements: SB_SCHEMA.Envelope_Movements,
    Savings_Goals: SB_SCHEMA.Savings_Goals,
    Goal_Movements: SB_SCHEMA.Goal_Movements,
    Reconciliations: SB_SCHEMA.Reconciliations,
    Period_Closures: ["closure_id", "period_key", "scope", "status", "reason", "row_version", "closed_by", "closed_at", "reopened_by", "reopened_at"],
    Audit_Log: ["audit_id", "request_id", "timestamp", "actor_email", "action", "entity_type", "entity_id", "result"]
  });
}

function canonicalSnapshotCell_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, SB_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
  if (value === null || value === undefined) return "";
  return value;
}

function spreadsheetSnapshotPayload_(spreadsheet) {
  const volatileConfigKeys = new Set(["maintenance_mode", "recovery_required", "recovery_status", "recovery_details"]);
  return Object.keys(SB_SCHEMA).map(function(name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) throw sbError_("SCHEMA_MISSING", "Sheet tidak ditemukan saat membuat checksum: " + name, 503);
    const width = SB_SCHEMA[name].length;
    const rowCount = Math.max(1, sheet.getLastRow());
    const range = sheet.getRange(1, 1, rowCount, width);
    let values = range.getValues().map(function(row) { return row.map(canonicalSnapshotCell_); });
    let formulas = range.getFormulas();
    if (name === "System_Config") {
      const keepIndexes = values.map(function(row, index) { return index === 0 || !volatileConfigKeys.has(String(row[0] || "")); })
        .map(function(keep, index) { return keep ? index : -1; })
        .filter(function(index) { return index >= 0; });
      values = keepIndexes.map(function(index) { return values[index]; });
      formulas = keepIndexes.map(function(index) { return formulas[index]; });
    }
    return { name: name, values: values, formulas: formulas };
  });
}

function spreadsheetSnapshotChecksum_(spreadsheet) {
  return sha256Hex_(canonicalJson_(spreadsheetSnapshotPayload_(spreadsheet)));
}

function rawSpreadsheetSnapshotPayload_(spreadsheet) {
  return spreadsheet.getSheets().map(function(sheet) {
    const rows = Math.max(1, sheet.getLastRow());
    const columns = Math.max(1, sheet.getLastColumn());
    const range = sheet.getRange(1, 1, rows, columns);
    return {
      name: sheet.getName(),
      values: range.getValues().map(function(row) { return row.map(canonicalSnapshotCell_); }),
      formulas: range.getFormulas()
    };
  }).sort(function(a, b) { return String(a.name).localeCompare(String(b.name)); });
}

function rawSpreadsheetSnapshotChecksum_(spreadsheet) {
  return sha256Hex_(canonicalJson_(rawSpreadsheetSnapshotPayload_(spreadsheet)));
}

function createEmergencySafetySnapshot_(context, type) {
  const spreadsheet = getSpreadsheet_();
  const timestamp = Utilities.formatDate(new Date(), SB_TIMEZONE, "yyyyMMdd-HHmmss");
  const safeType = sanitizeText_(type || "raw-safety", 30);
  const baseName = "saldo-bersama-" + timestamp + "-" + safeType;
  const folderId = PropertiesService.getScriptProperties().getProperty("BACKUP_FOLDER_ID");
  const folder = folderId ? DriveApp.getFolderById(folderId) : null;
  const sourceChecksum = rawSpreadsheetSnapshotChecksum_(spreadsheet);
  const copy = folder ? DriveApp.getFileById(spreadsheet.getId()).makeCopy(baseName, folder) : DriveApp.getFileById(spreadsheet.getId()).makeCopy(baseName);
  try {
    const copySpreadsheet = SpreadsheetApp.openById(copy.getId());
    const copyChecksum = rawSpreadsheetSnapshotChecksum_(copySpreadsheet);
    if (copyChecksum !== sourceChecksum) throw sbError_("RAW_SAFETY_CHECKSUM_MISMATCH", "Checksum safety snapshot mentah berbeda dari sumber.", 503, { sourceChecksum: sourceChecksum, copyChecksum: copyChecksum });
    return {
      fileId: copy.getId(),
      fileName: copy.getName(),
      checksum: copyChecksum,
      raw: true,
      createdAt: nowIso_(),
      createdBy: context.actor.user_id
    };
  } catch (error) {
    try { copy.setTrashed(true); }
    catch (cleanupError) {
      recordExternalCleanupRequired_("drive_raw_safety_copy", { fileId: copy.getId(), cause: error.code || error.message, cleanupError: cleanupError.message });
    }
    throw error;
  }
}

function validateBackupSpreadsheet_(fileId) {
  let source;
  try { source = SpreadsheetApp.openById(fileId); } catch (error) { throw sbError_("BACKUP_NOT_ACCESSIBLE", "File backup tidak dapat dibuka.", 404); }
  const issues = [];
  Object.keys(SB_SCHEMA).forEach(function(name) {
    const sheet = source.getSheetByName(name);
    if (!sheet) { issues.push("Sheet hilang: " + name); return; }
    const expected = SB_SCHEMA[name];
    if (sheet.getLastColumn() !== expected.length) { issues.push("Jumlah kolom tidak sesuai: " + name); return; }
    const actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) issues.push("Header tidak sesuai: " + name);
    const rowCount = Math.max(1, sheet.getLastRow());
    const formulas = sheet.getRange(1, 1, rowCount, expected.length).getFormulas();
    if (formulas.some(function(row) { return row.some(Boolean); })) issues.push("Formula tidak diizinkan pada backup database: " + name);
  });
  const config = source.getSheetByName("System_Config");
  let version = "";
  if (config && config.getLastRow() >= 2) {
    const values = config.getRange(2, 1, config.getLastRow() - 1, 2).getValues();
    const match = values.find(function(row) { return row[0] === "schema_version"; });
    version = match ? String(match[1]) : "";
  }
  if (version !== SB_SCHEMA_VERSION) issues.push("Schema version backup tidak didukung: " + version);
  return { source: source, issues: issues, schemaVersion: version, checksum: issues.length ? "" : spreadsheetSnapshotChecksum_(source) };
}


function backupOwnerByEmail_(spreadsheet, email) {
  const sheet = spreadsheet.getSheetByName("Users");
  if (!sheet) return null;
  const headers = SB_SCHEMA.Users;
  const rowCount = Math.max(0, sheet.getLastRow() - 1);
  const values = rowCount ? sheet.getRange(2, 1, rowCount, headers.length).getValues() : [];
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const emailIndex = headers.indexOf("email");
  const roleIndex = headers.indexOf("role");
  const statusIndex = headers.indexOf("status");
  const row = values.find(function(item) {
    return String(item[emailIndex] || "").trim().toLowerCase() === normalizedEmail && item[roleIndex] === "owner" && item[statusIndex] === "active";
  });
  if (!row) return null;
  return headers.reduce(function(result, field, index) { result[field] = row[index]; return result; }, {});
}

function assertBackupOwner_(spreadsheet, actorEmail) {
  const owner = backupOwnerByEmail_(spreadsheet, actorEmail);
  if (!owner) throw sbError_("BACKUP_OWNER_MISMATCH", "Backup tidak mencatat akun aktif ini sebagai owner.", 403);
  return owner;
}

function backupPreview_(context) {
  const fileId = String(context.payload.backupFileId || "");
  const validation = validateBackupSpreadsheet_(fileId);
  if (validation.issues.length) throw sbError_("INVALID_BACKUP", "Backup gagal divalidasi.", 400, validation.issues);
  assertBackupOwner_(validation.source, context.actor.email);
  const summary = {};
  Object.keys(SB_SCHEMA).forEach(function(name) {
    const sourceSheet = validation.source.getSheetByName(name);
    const currentSheet = getSpreadsheet_().getSheetByName(name);
    const backupRows = Math.max(0, sourceSheet.getLastRow() - 1);
    const currentRows = currentSheet ? Math.max(0, currentSheet.getLastRow() - 1) : 0;
    summary[name] = {
      backupRows: backupRows,
      currentRows: currentRows,
      deltaRows: backupRows - currentRows,
      replacedOrRemovedRows: Math.max(0, currentRows - backupRows),
      currentSheetMissing: !currentSheet
    };
  });
  const token = uuid_();
  CacheService.getScriptCache().put("restore-preview:" + token, JSON.stringify({ fileId: fileId, actorId: context.actor.user_id, checksum: validation.checksum }), 600);
  return { backupFileId: fileId, schemaVersion: validation.schemaVersion, checksum: validation.checksum, summary: summary, acceptable: true, previewToken: token, expiresInSeconds: 600 };
}

function replaceSheetData_(targetSpreadsheet, sourceSpreadsheet, name) {
  let target = targetSpreadsheet.getSheetByName(name);
  const source = sourceSpreadsheet.getSheetByName(name);
  if (!source) throw sbError_("SCHEMA_MISSING", "Sheet snapshot tidak lengkap: " + name, 503);
  if (!target) target = targetSpreadsheet.insertSheet(name);
  const rowCount = Math.max(1, source.getLastRow());
  const columnCount = Math.max(1, source.getLastColumn());
  if (target.getMaxRows() < rowCount) target.insertRowsAfter(target.getMaxRows(), rowCount - target.getMaxRows());
  if (target.getMaxColumns() < columnCount) target.insertColumnsAfter(target.getMaxColumns(), columnCount - target.getMaxColumns());
  const clearRows = Math.max(1, target.getLastRow());
  const clearColumns = Math.max(1, target.getLastColumn());
  target.getRange(1, 1, clearRows, clearColumns).clearContent();
  const sourceRange = source.getRange(1, 1, rowCount, columnCount);
  const values = sourceRange.getValues();
  const formulas = sourceRange.getFormulas();
  const cells = values.map(function(row, rowIndex) {
    return row.map(function(value, columnIndex) { return formulas[rowIndex][columnIndex] || value; });
  });
  target.getRange(1, 1, rowCount, columnCount).setValues(cells);
  target.setFrozenRows(source.getFrozenRows());
}

function applySpreadsheetSnapshot_(sourceId) {
  const source = SpreadsheetApp.openById(sourceId);
  const target = getSpreadsheet_();
  Object.keys(SB_SCHEMA).forEach(function(name) { replaceSheetData_(target, source, name); });
  protectSystemSheets_();
  SpreadsheetApp.flush();
}

function applyRawSpreadsheetSnapshot_(sourceId) {
  const source = SpreadsheetApp.openById(sourceId);
  const target = getSpreadsheet_();
  const sourceNames = new Set(source.getSheets().map(function(sheet) { return sheet.getName(); }));
  source.getSheets().forEach(function(sheet) { replaceSheetData_(target, source, sheet.getName()); });
  target.getSheets().filter(function(sheet) { return !sourceNames.has(sheet.getName()); }).forEach(function(sheet) { target.deleteSheet(sheet); });
  SpreadsheetApp.flush();
}

function snapshotVerificationIssues_(expectedChecksum) {
  const schema = validateSchema_().map(function(message) { return { code: "SCHEMA", message: message }; });
  const integrity = schema.length ? [] : integrityIssues_();
  const checksum = schema.length ? "" : spreadsheetSnapshotChecksum_(getSpreadsheet_());
  const checksumIssues = expectedChecksum && checksum !== expectedChecksum ? [{ code: "CHECKSUM_MISMATCH", expected: expectedChecksum, actual: checksum }] : [];
  return { issues: schema.concat(integrity).concat(checksumIssues), checksum: checksum };
}

function setRecoveryOperationState_(status, safety, details) {
  const payload = Object.assign({}, details || {}, {
    safetyBackupFileId: safety && safety.fileId || "",
    safetyBackupChecksum: safety && safety.checksum || "",
    safetyBackupRaw: Boolean(safety && safety.raw)
  });
  setRecoveryRequired_(status, payload);
}

function rollbackToSafetyOrFailClosed_(operation, safety, originalError, context) {
  try {
    if (safety.raw) applyRawSpreadsheetSnapshot_(safety.fileId);
    else applySpreadsheetSnapshot_(safety.fileId);
    let verification;
    if (safety.raw) {
      const rawChecksum = rawSpreadsheetSnapshotChecksum_(getSpreadsheet_());
      const rawIssues = rawChecksum === safety.checksum ? [] : [{ code: "RAW_CHECKSUM_MISMATCH", expected: safety.checksum, actual: rawChecksum }];
      let schemaIssues = [];
      try { schemaIssues = validateSchema_().map(function(message) { return { code: "SCHEMA", message: message }; }); }
      catch (schemaError) { schemaIssues = [{ code: schemaError.code || "SCHEMA", message: schemaError.message }]; }
      const integrity = schemaIssues.length ? [] : integrityIssues_();
      verification = { issues: rawIssues.concat(schemaIssues).concat(integrity), checksum: rawChecksum };
    } else {
      verification = snapshotVerificationIssues_(safety.checksum);
    }
    if (verification.issues.length) throw sbError_("ROLLBACK_VERIFICATION_FAILED", "Safety backup tidak lolos verifikasi setelah rollback.", 503, verification.issues);
    upsertConfig_("maintenance_mode", "true");
    appendAudit_(context, operation + ".rollback", operation, safety.fileId, null, {
      safetyBackupFileId: safety.fileId,
      rollbackChecksum: verification.checksum,
      cause: originalError.code || originalError.message
    });
    clearRecoveryState_();
    upsertConfig_("maintenance_mode", "false");
    return { rolledBack: true, checksum: verification.checksum };
  } catch (rollbackError) {
    setRecoveryOperationState_(operation + "_recovery_required", safety, {
      operation: operation,
      originalError: originalError.code || originalError.message,
      rollbackError: rollbackError.code || rollbackError.message,
      rollbackDetails: rollbackError.details || null
    });
    throw sbError_("RECOVERY_REQUIRED", "Pemulihan otomatis gagal. Aplikasi tetap terkunci. Gunakan safety backup untuk pemulihan manual.", 503, recoveryDetails_());
  }
}

function restoreApply_(context) {
  const payload = context.payload;
  const cached = CacheService.getScriptCache().get("restore-preview:" + payload.previewToken);
  if (!cached) throw sbError_("PREVIEW_EXPIRED", "Preview restore sudah kedaluwarsa. Jalankan preview kembali.", 409);
  const preview = JSON.parse(cached);
  if (preview.actorId !== context.actor.user_id || preview.fileId !== payload.backupFileId) throw sbError_("PREVIEW_MISMATCH", "Preview restore tidak sesuai actor atau file.", 403);
  if (payload.confirmation !== "RESTORE SALDO BERSAMA") throw sbError_("CONFIRMATION_REQUIRED", "Ketik RESTORE SALDO BERSAMA untuk melanjutkan.", 400);
  const validation = validateBackupSpreadsheet_(payload.backupFileId);
  if (validation.issues.length) throw sbError_("INVALID_BACKUP", "Backup tidak valid.", 400, validation.issues);
  assertBackupOwner_(validation.source, context.actor.email);
  if (validation.checksum !== preview.checksum) throw sbError_("BACKUP_CHANGED_AFTER_PREVIEW", "Isi backup berubah setelah preview. Jalankan preview kembali.", 409, { previewChecksum: preview.checksum, currentChecksum: validation.checksum });
  const safety = createEmergencySafetySnapshot_(context, "raw-pre-restore");
  setRecoveryOperationState_("restore_applying", safety, { operation: "restore", sourceFileId: payload.backupFileId, sourceChecksum: validation.checksum, actorEmail: context.actor.email });
  try {
    applySpreadsheetSnapshot_(payload.backupFileId);
    upsertConfig_("maintenance_mode", "true");
    const verification = snapshotVerificationIssues_(validation.checksum);
    if (verification.issues.length) throw sbError_("RESTORE_INTEGRITY_FAILED", "Restore tidak lolos verifikasi.", 409, verification.issues);
    appendAudit_(context, "restore.apply", "restore", payload.backupFileId, null, { safetyBackupFileId: safety.fileId, safetyBackupRaw: true, sourceChecksum: validation.checksum, integrity: "passed" });
    CacheService.getScriptCache().remove("restore-preview:" + payload.previewToken);
    clearRecoveryState_();
    upsertConfig_("maintenance_mode", "false");
    return { restored: true, sourceFileId: payload.backupFileId, sourceChecksum: validation.checksum, safetyBackup: safety, verifiedAt: nowIso_() };
  } catch (error) {
    const rollback = rollbackToSafetyOrFailClosed_("restore", safety, error, context);
    throw sbError_("RESTORE_ROLLED_BACK", "Restore gagal dan data berhasil dipulihkan dari safety backup.", 409, { cause: error.code || "RESTORE_FAILED", details: error.details || null, safetyBackupFileId: safety.fileId, rollbackChecksum: rollback.checksum });
  }
}

function exportRows_(sheetName) {
  const fields = exportFields_()[sheetName];
  return rows_(sheetName).map(function(row) {
    const result = {};
    fields.forEach(function(field) { result[field] = row[field] === undefined ? "" : row[field]; });
    return result;
  });
}

function safeExportCell_(value) {
  if (typeof value !== "string") return value === undefined || value === null ? "" : value;
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function csvEscape_(value) { return '"' + String(safeExportCell_(value)).replace(/"/g, '""') + '"'; }

function createSanitizedExportSpreadsheet_(name) {
  const temp = SpreadsheetApp.create(name);
  const defaultSheet = temp.getSheets()[0];
  let first = true;
  Object.keys(exportFields_()).forEach(function(sheetName) {
    const sheet = first ? defaultSheet.setName(sheetName) : temp.insertSheet(sheetName);
    first = false;
    const fields = exportFields_()[sheetName];
    const data = exportRows_(sheetName);
    sheet.getRange(1, 1, 1, fields.length).setValues([fields]);
    if (data.length) sheet.getRange(2, 1, data.length, fields.length).setValues(data.map(function(row) { return fields.map(function(field) { return safeExportCell_(row[field]); }); }));
    sheet.setFrozenRows(1);
  });
  SpreadsheetApp.flush();
  return temp;
}

function createExport_(context) {
  const requested = String(context.payload.format || "json");
  const format = ["csv", "json", "xlsx"].includes(requested) ? requested : "json";
  const timestamp = Utilities.formatDate(new Date(), SB_TIMEZONE, "yyyyMMdd-HHmmss");
  let blob;
  let fileName;
  let outputFile = null;
  let temporarySpreadsheet = null;
  let operationError = null;
  try {
    if (format === "xlsx") {
      fileName = "saldo-bersama-data-" + timestamp + ".xlsx";
      temporarySpreadsheet = createSanitizedExportSpreadsheet_("saldo-bersama-export-temp-" + timestamp);
      const exportUrl = "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(temporarySpreadsheet.getId()) + "/export?mimeType=" + encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      const response = UrlFetchApp.fetch(exportUrl, { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw sbError_("EXPORT_FAILED", "Export Excel gagal.", 502);
      blob = response.getBlob().setName(fileName);
    } else if (format === "csv") {
      const fields = exportFields_().Transactions;
      const lines = [fields.map(csvEscape_).join(",")].concat(exportRows_("Transactions").map(function(row) { return fields.map(function(field) { return csvEscape_(row[field]); }).join(","); }));
      fileName = "saldo-bersama-transaksi-" + timestamp + ".csv";
      blob = Utilities.newBlob(lines.join("\n"), "text/csv", fileName);
    } else {
      const data = {};
      Object.keys(exportFields_()).forEach(function(name) { data[name] = exportRows_(name); });
      fileName = "saldo-bersama-export-" + timestamp + ".json";
      blob = Utilities.newBlob(JSON.stringify({ schemaVersion: SB_SCHEMA_VERSION, exportedAt: nowIso_(), data: data }, null, 2), "application/json", fileName);
    }
    outputFile = DriveApp.createFile(blob);
    appendAudit_(context, "export.create", "export", outputFile.getId(), null, { format: format, fileName: fileName, sanitized: true });
    return { fileId: outputFile.getId(), fileName: fileName, format: format, createdAt: nowIso_() };
  } catch (error) {
    operationError = error;
    if (outputFile) {
      try { outputFile.setTrashed(true); }
      catch (cleanupError) {
        recordExternalCleanupRequired_("drive_export_file", { fileId: outputFile.getId(), cause: error.code || error.message, cleanupError: cleanupError.message });
      }
    }
    throw error;
  } finally {
    if (temporarySpreadsheet) {
      try { DriveApp.getFileById(temporarySpreadsheet.getId()).setTrashed(true); }
      catch (cleanupError) {
        const cleanup = recordExternalCleanupRequired_("drive_export_temp", { temporarySpreadsheetId: temporarySpreadsheet.getId(), cleanupError: cleanupError.message, operationError: operationError && (operationError.code || operationError.message) });
        if (!operationError) throw sbError_("DRIVE_CLEANUP_REQUIRED", "Export selesai tetapi spreadsheet sementara tidak dapat dibersihkan.", 503, cleanup);
      }
    }
  }
}

function normalizeImportTransaction_(context, record, projectedTransactions) {
  const candidate = Object.assign({}, record);
  assertNoReservedTransactionFields_(candidate);
  const type = String(candidate.transaction_type || "");
  if (["income", "expense", "transfer", "refund", "adjustment"].indexOf(type) === -1) throw sbError_("INVALID_TRANSACTION_TYPE", "Jenis transaksi tidak valid.", 400);
  candidate.transaction_type = type;
  candidate.transaction_date = validateDate_(candidate.transaction_date);
  assertTransactionDateUnlocked_(candidate.transaction_date);
  candidate.amount = intAmount_(candidate.amount);
  candidate.description = sanitizeText_(candidate.description, 250);
  candidate.merchant = sanitizeText_(candidate.merchant, 120);
  candidate.overspend_reason = sanitizeText_(candidate.overspend_reason, 180);
  candidate.payment_method = sanitizeText_(candidate.payment_method || "", 40);
  assertAdjustmentAuthorized_(context, type, candidate.description);
  let source = null;
  let destination = null;
  if (type !== "income" && type !== "refund") {
    source = activeAccount_(candidate.source_account_id);
    assertAccountAccess_(context, source);
    assertAccountDate_(source, candidate.transaction_date);
  }
  if (["income", "refund", "transfer"].indexOf(type) !== -1) {
    destination = activeAccount_(candidate.destination_account_id);
    assertAccountAccess_(context, destination);
    assertAccountDate_(destination, candidate.transaction_date);
  }
  if (type === "transfer" && String(source.account_id) === String(destination.account_id)) throw sbError_("SAME_TRANSFER_ACCOUNT", "Rekening sumber dan tujuan harus berbeda.", 400);
  candidate.source_account_id = source ? source.account_id : "";
  candidate.destination_account_id = destination ? destination.account_id : "";
  candidate.envelope_period_id = type === "expense" ? String(candidate.envelope_period_id || "") : "";
  candidate.category_id = ["transfer", "adjustment"].indexOf(type) !== -1 ? "" : String(candidate.category_id || "");
  if (["income", "expense", "refund"].indexOf(type) !== -1 && !candidate.category_id) throw sbError_("CATEGORY_REQUIRED", "Kategori transaksi wajib dipilih.", 400);
  activeCategory_(candidate.category_id, type === "income" ? "income" : type === "expense" ? "expense" : type);
  if (type === "expense") validateEnvelopeForExpense_(candidate, candidate.amount, projectedTransactions, context);
  const ownership = transactionOwnedScope_(source, destination);
  const projected = Object.assign({}, candidate, { status: "active", scope: ownership.scope, owner_user_id: ownership.owner_user_id });
  assertSufficientBalanceForCandidate_(source, projected, projectedTransactions);
  return projected;
}

function importPreview_(context) {
  const records = context.payload.records;
  if (!Array.isArray(records) || !records.length || records.length > SB_IMPORT_MAX_RECORDS) throw sbError_("INVALID_IMPORT", "Import harus berisi 1-" + SB_IMPORT_MAX_RECORDS + " record transaksi.", 400);
  const valid = [];
  const invalid = [];
  const duplicates = [];
  const batchFingerprints = new Set();
  const projectedTransactions = rows_("Transactions").map(function(row) { return Object.assign({}, row); });
  records.forEach(function(record, index) {
    try {
      const candidate = normalizeImportTransaction_(context, record, projectedTransactions);
      const type = candidate.transaction_type;
      const fingerprint = sha256Hex_(canonicalJson_([candidate.transaction_date, type, candidate.source_account_id || "", candidate.destination_account_id || "", candidate.amount, String(candidate.description || "").toLowerCase()]));
      if (batchFingerprints.has(fingerprint) || duplicateTransaction_(candidate, null, projectedTransactions)) duplicates.push({ index: index, record: candidate });
      else {
        batchFingerprints.add(fingerprint);
        const applyRecord = Object.assign({}, candidate);
        ["status", "scope", "owner_user_id"].forEach(function(field) { delete applyRecord[field]; });
        valid.push({ index: index, record: applyRecord });
        projectedTransactions.push(Object.assign({ transaction_id: "preview:" + index, created_at: nowIso_() }, candidate));
      }
    } catch (error) { invalid.push({ index: index, code: error.code || "INVALID_RECORD", message: error.message, details: error.details || null }); }
  });
  const token = uuid_();
  const acceptable = valid.length > 0 && invalid.length === 0 && duplicates.length === 0;
  const previewPayload = { actorId: context.actor.user_id, records: valid.map(function(item) { return item.record; }), acceptable: acceptable };
  previewPayload.fingerprint = sha256Hex_(canonicalJson_(previewPayload.records));
  const serializedPreview = JSON.stringify(previewPayload);
  const serializedBytes = Utilities.newBlob(serializedPreview, "application/json").getBytes().length;
  if (serializedBytes > SB_IMPORT_PREVIEW_MAX_BYTES) throw sbError_("IMPORT_PREVIEW_TOO_LARGE", "Preview import terlalu besar untuk diproses aman. Pecah file menjadi batch yang lebih kecil.", 413, { maxBytes: SB_IMPORT_PREVIEW_MAX_BYTES, actualBytes: serializedBytes });
  CacheService.getScriptCache().put("import-preview:" + token, serializedPreview, 600);
  return { previewToken: token, validCount: valid.length, invalid: invalid, duplicates: duplicates, acceptable: acceptable, fingerprint: previewPayload.fingerprint, expiresInSeconds: 600, maxRecords: SB_IMPORT_MAX_RECORDS };
}

function importApply_(context) {
  const cached = CacheService.getScriptCache().get("import-preview:" + context.payload.previewToken);
  if (!cached) throw sbError_("PREVIEW_EXPIRED", "Preview import sudah kedaluwarsa.", 409);
  const preview = JSON.parse(cached);
  if (preview.actorId !== context.actor.user_id) throw sbError_("PREVIEW_MISMATCH", "Preview import bukan milik actor ini.", 403);
  if (sha256Hex_(canonicalJson_(preview.records)) !== preview.fingerprint) throw sbError_("PREVIEW_CORRUPT", "Data preview import tidak konsisten.", 409);
  if (!preview.acceptable) throw sbError_("IMPORT_PREVIEW_HAS_ISSUES", "Import belum dapat diterapkan karena preview masih memiliki record invalid atau duplikat.", 409);
  if (!Array.isArray(preview.records) || !preview.records.length || preview.records.length > SB_IMPORT_MAX_RECORDS) throw sbError_("INVALID_IMPORT", "Jumlah record import di luar batas aman.", 400);
  if (context.payload.confirmation !== "IMPORT TRANSAKSI") throw sbError_("CONFIRMATION_REQUIRED", "Ketik IMPORT TRANSAKSI untuk melanjutkan.", 400);
  const safety = createBackup_({ actor: context.actor, action: "backup.create", payload: { type: "pre-import" }, requestId: context.requestId });
  setRecoveryOperationState_("import_applying", safety, { operation: "import", previewToken: context.payload.previewToken, recordCount: preview.records.length });
  try {
    const projectedTransactions = rows_("Transactions").map(function(row) { return Object.assign({}, row); });
    const created = preview.records.map(function(record, index) {
      const childContext = Object.assign({}, context, {
        payload: Object.assign({}, record, { confirm_duplicate: false }),
        idempotencyKey: String(context.idempotencyKey || context.requestId || "import") + ":" + index,
        action: "transactions.create"
      });
      const prepared = createTransaction_(childContext, childContext.payload, { deferWrite: true, transactionSnapshot: projectedTransactions });
      projectedTransactions.push(Object.assign({}, prepared));
      return prepared;
    });
    appendRows_("Transactions", created);
    appendRows_("Audit_Log", created.map(function(record) {
      return auditRecord_(context, "transactions.create", "transaction", record.transaction_id, null, record);
    }));
    const issues = integrityIssues_(context);
    if (issues.length) throw sbError_("IMPORT_INTEGRITY_FAILED", "Import menghasilkan masalah integritas.", 409, issues);
    appendAudit_(context, "import.apply", "import", context.requestId, null, { createdCount: created.length, transactionIds: created.map(function(record) { return record.transaction_id; }), safetyBackupFileId: safety.fileId, integrity: "passed" });
    CacheService.getScriptCache().remove("import-preview:" + context.payload.previewToken);
    clearRecoveryState_();
    upsertConfig_("maintenance_mode", "false");
    return { imported: created.length, safetyBackup: safety, verifiedAt: nowIso_() };
  } catch (error) {
    const rollback = rollbackToSafetyOrFailClosed_("import", safety, error, context);
    throw sbError_("IMPORT_ROLLED_BACK", "Import gagal dan data berhasil dipulihkan dari safety backup.", 409, { cause: error.code || "IMPORT_FAILED", details: error.details || null, safetyBackupFileId: safety.fileId, rollbackChecksum: rollback.checksum });
  }
}

function manualRecoveryActorFromBackup_(spreadsheet) {
  const email = String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase();
  const owner = backupOwnerByEmail_(spreadsheet, email);
  if (!owner) throw sbError_("FORBIDDEN", "Pemulihan manual hanya boleh dijalankan owner aktif yang tercatat pada safety backup.", 403);
  return owner;
}

function recoverFromSafetyBackup(safetyFileId, confirmation) {
  resetRequestCache_();
  if (confirmation !== "RECOVER SALDO BERSAMA") throw sbError_("CONFIRMATION_REQUIRED", "Ketik RECOVER SALDO BERSAMA untuk pemulihan manual.", 400);
  const recovery = recoveryDetails_();
  const expectedFileId = recovery.details && recovery.details.safetyBackupFileId;
  if (!recovery.recoveryRequired || !expectedFileId || String(expectedFileId) !== String(safetyFileId)) throw sbError_("RECOVERY_FILE_MISMATCH", "Safety backup tidak sesuai state recovery aktif.", 409, recovery);
  const rawSafety = Boolean(recovery.details && recovery.details.safetyBackupRaw);
  let validation;
  let actor;
  if (rawSafety) {
    const source = SpreadsheetApp.openById(safetyFileId);
    const effectiveEmail = String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase();
    const expectedEmail = String(recovery.details && recovery.details.actorEmail || "").trim().toLowerCase();
    if (!effectiveEmail || !expectedEmail || effectiveEmail !== expectedEmail) throw sbError_("FORBIDDEN", "Editor Apps Script tidak sesuai owner yang memulai operasi recovery.", 403);
    actor = backupOwnerByEmail_(source, effectiveEmail) || { user_id: "recovery:" + effectiveEmail, email: effectiveEmail, role: "owner", status: "active" };
    validation = { source: source, issues: [], checksum: rawSpreadsheetSnapshotChecksum_(source), raw: true };
  } else {
    validation = validateBackupSpreadsheet_(safetyFileId);
    if (validation.issues.length) throw sbError_("INVALID_BACKUP", "Safety backup tidak valid.", 400, validation.issues);
    actor = manualRecoveryActorFromBackup_(validation.source);
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw sbError_("LOCK_TIMEOUT", "Pemulihan manual gagal memperoleh lock.", 409);
  try {
    if (rawSafety) applyRawSpreadsheetSnapshot_(safetyFileId);
    else applySpreadsheetSnapshot_(safetyFileId);
    upsertConfig_("maintenance_mode", "true");
    const verification = rawSafety
      ? (function() {
        const checksum = rawSpreadsheetSnapshotChecksum_(getSpreadsheet_());
        const schema = validateSchema_().map(function(message) { return { code: "SCHEMA", message: message }; });
        const integrity = schema.length ? [] : integrityIssues_();
        const checksumIssues = checksum === validation.checksum ? [] : [{ code: "RAW_CHECKSUM_MISMATCH", expected: validation.checksum, actual: checksum }];
        return { issues: checksumIssues.concat(schema).concat(integrity), checksum: checksum };
      })()
      : snapshotVerificationIssues_(validation.checksum);
    if (verification.issues.length) throw sbError_("RECOVERY_VERIFICATION_FAILED", "Pemulihan manual belum lolos verifikasi.", 503, verification.issues);
    appendAudit_({ actor: actor, requestId: "manual-recovery:" + uuid_() }, "recovery.manual", "restore", safetyFileId, null, { checksum: verification.checksum, previousRecoveryStatus: recovery.status });
    clearRecoveryState_();
    upsertConfig_("maintenance_mode", "false");
    SpreadsheetApp.flush();
    return { recovered: true, safetyFileId: safetyFileId, checksum: verification.checksum, verifiedAt: nowIso_() };
  } catch (error) {
    setRecoveryOperationState_("manual_recovery_required", { fileId: safetyFileId, checksum: validation.checksum, raw: rawSafety }, { cause: error.code || error.message, details: error.details || null, actorEmail: recovery.details && recovery.details.actorEmail });
    throw error;
  } finally { lock.releaseLock(); }
}
