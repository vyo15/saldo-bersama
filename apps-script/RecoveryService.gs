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
  });
  const config = source.getSheetByName("System_Config");
  let version = "";
  if (config && config.getLastRow() >= 2) {
    const values = config.getRange(2, 1, config.getLastRow() - 1, 2).getValues();
    const match = values.find(function(row) { return row[0] === "schema_version"; });
    version = match ? String(match[1]) : "";
  }
  if (version !== SB_SCHEMA_VERSION) issues.push("Schema version backup tidak didukung: " + version);
  return { source: source, issues: issues, schemaVersion: version };
}

function backupPreview_(context) {
  const fileId = String(context.payload.backupFileId || "");
  const validation = validateBackupSpreadsheet_(fileId);
  if (validation.issues.length) throw sbError_("INVALID_BACKUP", "Backup gagal divalidasi.", 400, validation.issues);
  const summary = {};
  Object.keys(SB_SCHEMA).forEach(function(name) {
    const sourceSheet = validation.source.getSheetByName(name);
    const currentSheet = getSheet_(name);
    summary[name] = { backupRows: Math.max(0, sourceSheet.getLastRow() - 1), currentRows: Math.max(0, currentSheet.getLastRow() - 1) };
  });
  const token = uuid_();
  CacheService.getScriptCache().put("restore-preview:" + token, JSON.stringify({ fileId: fileId, actorId: context.actor.user_id }), 600);
  return { backupFileId: fileId, schemaVersion: validation.schemaVersion, summary: summary, previewToken: token, expiresInSeconds: 600 };
}

function replaceSheetData_(targetSpreadsheet, sourceSpreadsheet, name) {
  const target = targetSpreadsheet.getSheetByName(name);
  const source = sourceSpreadsheet.getSheetByName(name);
  const width = SB_SCHEMA[name].length;
  const rowCount = source.getLastRow();
  if (target.getMaxRows() < Math.max(2, rowCount)) target.insertRowsAfter(target.getMaxRows(), Math.max(2, rowCount) - target.getMaxRows());
  if (target.getLastRow() > 1) target.getRange(2, 1, target.getLastRow() - 1, width).clearContent();
  if (rowCount > 1) target.getRange(2, 1, rowCount - 1, width).setValues(source.getRange(2, 1, rowCount - 1, width).getValues());
}

function applySpreadsheetSnapshot_(sourceId) {
  const source = SpreadsheetApp.openById(sourceId);
  const target = getSpreadsheet_();
  Object.keys(SB_SCHEMA).forEach(function(name) { replaceSheetData_(target, source, name); });
  SpreadsheetApp.flush();
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
  const safety = createBackup_({ actor: context.actor, action: "backup.create", payload: { type: "pre-restore" }, requestId: context.requestId });
  upsertConfig_("maintenance_mode", "true");
  try {
    applySpreadsheetSnapshot_(payload.backupFileId);
    upsertConfig_("maintenance_mode", "true");
    const issues = validateSchema_().map(function(message) { return { code: "SCHEMA", message: message }; }).concat(integrityIssues_());
    if (issues.length) {
      applySpreadsheetSnapshot_(safety.fileId);
      upsertConfig_("maintenance_mode", "false");
      throw sbError_("RESTORE_INTEGRITY_FAILED", "Restore dibatalkan dan safety backup dipulihkan.", 409, issues);
    }
    upsertConfig_("maintenance_mode", "false");
    appendAudit_(context, "restore.apply", "restore", payload.backupFileId, null, { safetyBackupFileId: safety.fileId, integrity: "passed" });
    CacheService.getScriptCache().remove("restore-preview:" + payload.previewToken);
    return { restored: true, sourceFileId: payload.backupFileId, safetyBackup: safety, verifiedAt: nowIso_() };
  } catch (error) {
    upsertConfig_("maintenance_mode", "false");
    throw error;
  }
}

function createExport_(context) {
  const requested = String(context.payload.format || "json");
  const format = ["csv", "json", "xlsx"].includes(requested) ? requested : "json";
  const timestamp = Utilities.formatDate(new Date(), SB_TIMEZONE, "yyyyMMdd-HHmmss");
  let blob;
  let fileName;
  if (format === "xlsx") {
    fileName = "saldo-bersama-full-" + timestamp + ".xlsx";
    const exportUrl = "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(getSpreadsheet_().getId()) + "/export?mimeType=" + encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const response = UrlFetchApp.fetch(exportUrl, { headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw sbError_("EXPORT_FAILED", "Export Excel gagal.", 502);
    blob = response.getBlob().setName(fileName);
  } else if (format === "csv") {
    const headers = SB_SCHEMA.Transactions;
    const lines = [headers.join(",")].concat(rows_("Transactions").map(function(row) {
      return headers.map(function(header) { return '"' + String(row[header] === undefined ? "" : row[header]).replace(/"/g, '""') + '"'; }).join(",");
    }));
    fileName = "saldo-bersama-transaksi-" + timestamp + ".csv";
    blob = Utilities.newBlob(lines.join("\n"), "text/csv", fileName);
  } else {
    const data = {};
    Object.keys(SB_SCHEMA).filter(function(name) { return name !== "Push_Subscriptions"; }).forEach(function(name) { data[name] = rows_(name).map(publicRow_); });
    fileName = "saldo-bersama-export-" + timestamp + ".json";
    blob = Utilities.newBlob(JSON.stringify({ schemaVersion: SB_SCHEMA_VERSION, exportedAt: nowIso_(), data: data }, null, 2), "application/json", fileName);
  }
  const file = DriveApp.createFile(blob);
  appendAudit_(context, "export.create", "export", file.getId(), null, { format: format, fileName: fileName });
  return { fileId: file.getId(), fileName: fileName, format: format, createdAt: nowIso_() };
}

function importPreview_(context) {
  const records = context.payload.records;
  if (!Array.isArray(records) || !records.length || records.length > 500) throw sbError_("INVALID_IMPORT", "Import harus berisi 1-500 record transaksi.", 400);
  const valid = [];
  const invalid = [];
  const duplicates = [];
  const batchFingerprints = new Set();
  records.forEach(function(record, index) {
    try {
      const candidate = Object.assign({}, record);
      const type = String(candidate.transaction_type || "");
      if (["income", "expense", "transfer", "refund", "adjustment"].indexOf(type) === -1) throw sbError_("INVALID_TRANSACTION_TYPE", "Jenis transaksi tidak valid.", 400);
      candidate.transaction_date = validateDate_(candidate.transaction_date);
      candidate.amount = intAmount_(candidate.amount);
      candidate.description = sanitizeText_(candidate.description, 250);
      candidate.merchant = sanitizeText_(candidate.merchant, 120);
      candidate.overspend_reason = sanitizeText_(candidate.overspend_reason, 180);
      if (type !== "income" && type !== "refund") activeAccount_(candidate.source_account_id);
      if (["income", "refund", "transfer"].indexOf(type) !== -1) activeAccount_(candidate.destination_account_id);
      if (type === "transfer" && String(candidate.source_account_id) === String(candidate.destination_account_id)) throw sbError_("SAME_TRANSFER_ACCOUNT", "Rekening sumber dan tujuan harus berbeda.", 400);
      if (["income", "expense", "refund"].indexOf(type) !== -1 && !candidate.category_id) throw sbError_("CATEGORY_REQUIRED", "Kategori transaksi wajib dipilih.", 400);
      activeCategory_(candidate.category_id, type === "income" ? "income" : type === "expense" ? "expense" : type);
      if (type === "expense") validateEnvelopeForExpense_(candidate, candidate.amount);
      const fingerprint = [candidate.transaction_date, type, candidate.source_account_id || "", candidate.destination_account_id || "", candidate.amount, String(candidate.description || "").toLowerCase()].join("|");
      if (batchFingerprints.has(fingerprint) || duplicateTransaction_(candidate)) duplicates.push({ index: index, record: candidate });
      else { batchFingerprints.add(fingerprint); valid.push({ index: index, record: candidate }); }
    } catch (error) { invalid.push({ index: index, code: error.code || "INVALID_RECORD", message: error.message }); }
  });
  const token = uuid_();
  CacheService.getScriptCache().put("import-preview:" + token, JSON.stringify({ actorId: context.actor.user_id, records: valid.map(function(item) { return item.record; }) }), 600);
  return { previewToken: token, validCount: valid.length, invalid: invalid, duplicates: duplicates, expiresInSeconds: 600 };
}

function importApply_(context) {
  const cached = CacheService.getScriptCache().get("import-preview:" + context.payload.previewToken);
  if (!cached) throw sbError_("PREVIEW_EXPIRED", "Preview import sudah kedaluwarsa.", 409);
  const preview = JSON.parse(cached);
  if (preview.actorId !== context.actor.user_id) throw sbError_("PREVIEW_MISMATCH", "Preview import bukan milik actor ini.", 403);
  if (context.payload.confirmation !== "IMPORT TRANSAKSI") throw sbError_("CONFIRMATION_REQUIRED", "Ketik IMPORT TRANSAKSI untuk melanjutkan.", 400);
  const safety = createBackup_({ actor: context.actor, action: "backup.create", payload: { type: "pre-import" }, requestId: context.requestId });
  upsertConfig_("maintenance_mode", "true");
  try {
    const created = preview.records.map(function(record) {
      const childContext = Object.assign({}, context, { payload: Object.assign({}, record, { confirm_duplicate: false }), idempotencyKey: uuid_(), action: "transactions.create" });
      return createTransaction_(childContext);
    });
    const issues = integrityIssues_();
    if (issues.length) throw sbError_("IMPORT_INTEGRITY_FAILED", "Import menghasilkan masalah integritas.", 409, issues);
    CacheService.getScriptCache().remove("import-preview:" + context.payload.previewToken);
    upsertConfig_("maintenance_mode", "false");
    appendAudit_(context, "import.apply", "import", context.requestId, null, { createdCount: created.length, safetyBackupFileId: safety.fileId, integrity: "passed" });
    return { imported: created.length, safetyBackup: safety, verifiedAt: nowIso_() };
  } catch (error) {
    applySpreadsheetSnapshot_(safety.fileId);
    upsertConfig_("maintenance_mode", "false");
    throw sbError_("IMPORT_ROLLED_BACK", "Import gagal dan data telah dipulihkan dari safety backup.", 409, { cause: error.code || "IMPORT_FAILED", details: error.details || null });
  }
}
