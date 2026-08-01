let SB_REQUEST_CACHE = null;

function resetRequestCache_() {
  SB_REQUEST_CACHE = {
    spreadsheet: null,
    sheets: {},
    rows: {},
    readModels: {},
    metrics: { cacheHits: 0, rowsScanned: 0, sheets: {} }
  };
}

function requestCache_() {
  if (!SB_REQUEST_CACHE) resetRequestCache_();
  return SB_REQUEST_CACHE;
}

function invalidateSheetCache_(name) {
  const cache = requestCache_();
  delete cache.rows[name];
  delete cache.sheets[name];
  cache.readModels = {};
}

function cloneRows_(items) {
  return items.map(function(row) { return Object.assign({}, row); });
}

function getSpreadsheet_() {
  const cache = requestCache_();
  if (cache.spreadsheet) return cache.spreadsheet;
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw sbError_("CONFIG_MISSING", "SPREADSHEET_ID belum diatur. Jalankan setupSaldoBersama().", 503);
  cache.spreadsheet = SpreadsheetApp.openById(id);
  return cache.spreadsheet;
}

function getSheet_(name) {
  const cache = requestCache_();
  if (cache.sheets[name]) return cache.sheets[name];
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw sbError_("SCHEMA_MISSING", "Sheet tidak ditemukan: " + name, 503);
  cache.sheets[name] = sheet;
  return sheet;
}

function headers_(name) { return SB_SCHEMA[name]; }

function normalizeSheetValue_(header, value) {
  if (!(value instanceof Date)) return value;
  const field = String(header || "");
  if (field === "period_key") return Utilities.formatDate(value, SB_TIMEZONE, "yyyy-MM");
  if (/_date$/.test(field) || ["period_start", "period_end", "due_date", "target_date", "start_date", "end_date"].indexOf(field) !== -1) {
    return Utilities.formatDate(value, SB_TIMEZONE, "yyyy-MM-dd");
  }
  return Utilities.formatDate(value, SB_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function rows_(name) {
  const cache = requestCache_();
  if (cache.rows[name]) {
    cache.metrics.cacheHits += 1;
    return cloneRows_(cache.rows[name]);
  }
  const startedAt = Date.now();
  const sheet = getSheet_(name);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    cache.rows[name] = [];
    cache.metrics.sheets[name] = { durationMs: Date.now() - startedAt, rowCount: 0, reads: 1 };
    return [];
  }
  const headers = headers_(name);
  const rowCount = lastRow - 1;
  cache.rows[name] = sheet.getRange(2, 1, rowCount, headers.length).getValues().map(function(values, index) {
    const row = { __row: index + 2 };
    headers.forEach(function(header, column) { row[header] = normalizeSheetValue_(header, values[column]); });
    return row;
  });
  cache.metrics.rowsScanned += rowCount;
  cache.metrics.sheets[name] = { durationMs: Date.now() - startedAt, rowCount: rowCount, reads: 1 };
  return cloneRows_(cache.rows[name]);
}

function requestReadMetrics_() {
  const metrics = requestCache_().metrics || { cacheHits: 0, rowsScanned: 0, sheets: {} };
  return {
    cacheHits: Number(metrics.cacheHits || 0),
    rowsScanned: Number(metrics.rowsScanned || 0),
    sheets: Object.assign({}, metrics.sheets || {})
  };
}

function appendRows_(name, records) {
  const items = records || [];
  if (!items.length) return [];
  const headers = headers_(name);
  const sheet = getSheet_(name);
  const values = items.map(function(record) {
    return headers.map(function(header) { return record[header] === undefined ? "" : record[header]; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
  invalidateSheetCache_(name);
  return items;
}

function appendRow_(name, record) {
  appendRows_(name, [record]);
  return record;
}

function updateRow_(name, rowNumber, record) {
  const headers = headers_(name);
  getSheet_(name).getRange(rowNumber, 1, 1, headers.length).setValues([headers.map(function(header) { return record[header] === undefined ? "" : record[header]; })]);
  invalidateSheetCache_(name);
  return record;
}

function deleteRow_(name, rowNumber) {
  if (!rowNumber || rowNumber < 2) throw sbError_("INVALID_ROW", "Baris data tidak valid untuk dihapus.", 500);
  getSheet_(name).deleteRow(rowNumber);
  invalidateSheetCache_(name);
}

function deleteRowsDescending_(name, rowNumbers) {
  Array.from(new Set(rowNumbers || [])).sort(function(a, b) { return b - a; }).forEach(function(rowNumber) { deleteRow_(name, rowNumber); });
}

function findBy_(name, field, value) { return rows_(name).find(function(row) { return String(row[field]) === String(value); }) || null; }
function filterBy_(name, predicate) { return rows_(name).filter(predicate); }

function nowIso_() { return Utilities.formatDate(new Date(), SB_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function today_() { return Utilities.formatDate(new Date(), SB_TIMEZONE, "yyyy-MM-dd"); }
function monthKey_(date) { return Utilities.formatDate(date || new Date(), SB_TIMEZONE, "yyyy-MM"); }
function periodKey_(value) {
  const period = !value || value === "current" ? monthKey_() : String(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw sbError_("INVALID_PERIOD", "Periode harus menggunakan format YYYY-MM.", 400);
  return period;
}
function boundedInteger_(value, fallback, minimum, maximum, field) {
  const parsed = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw sbError_("INVALID_PAGINATION", (field || "Nilai") + " harus berupa integer " + minimum + "-" + maximum + ".", 400);
  }
  return parsed;
}
function uuid_() { return Utilities.getUuid(); }

function sanitizeText_(value, maxLength) {
  const text = String(value === undefined || value === null ? "" : value).trim().slice(0, maxLength || 250);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function intAmount_(value, field) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000000) throw sbError_("INVALID_AMOUNT", (field || "Nominal") + " harus berupa integer rupiah positif.", 400);
  return amount;
}

function strictBoolean_(value, field, fallback) {
  if (value === undefined || value === null || value === "") return Boolean(fallback);
  if (typeof value !== "boolean") throw sbError_("INVALID_BOOLEAN", (field || "Nilai boolean") + " harus berupa true atau false literal.", 400);
  return value;
}

function upsertConfig_(key, value) {
  const current = findBy_("System_Config", "key", key);
  const record = { key: key, value: String(value), updated_at: nowIso_() };
  return current ? updateRow_("System_Config", current.__row, record) : appendRow_("System_Config", record);
}
function getConfig_(key) { const row = findBy_("System_Config", "key", key); return row ? String(row.value) : ""; }

function publicRow_(row) {
  const result = {};
  Object.keys(row || {}).forEach(function(key) { if (key !== "__row") result[key] = row[key]; });
  return result;
}

function rowVersion_(row) { return Number(row.row_version || 0); }
function assertVersion_(row, expected) {
  if (expected === null || expected === undefined || Number(expected) !== rowVersion_(row)) throw sbError_("CONFLICT", "Data telah berubah di perangkat lain. Muat ulang sebelum menyimpan.", 409);
}

function canonicalValue_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, SB_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
  if (Array.isArray(value)) return value.map(canonicalValue_);
  if (value && typeof value === "object") {
    const result = {};
    Object.keys(value).sort().forEach(function(key) { result[key] = canonicalValue_(value[key]); });
    return result;
  }
  if (value === undefined) return null;
  return value;
}

function canonicalJson_(value) { return JSON.stringify(canonicalValue_(value)); }

function sha256Hex_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8).map(function(byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ("0" + normalized.toString(16)).slice(-2);
  }).join("");
}

function auditRecord_(context, action, entityType, entityId, previousValue, newValue, result) {
  return {
    audit_id: uuid_(), request_id: context.requestId || "", timestamp: nowIso_(), actor_id: context.actor.user_id,
    actor_email: context.actor.email, action: action, entity_type: entityType, entity_id: entityId || "",
    previous_value: previousValue ? canonicalJson_(previousValue) : "", new_value: newValue ? canonicalJson_(newValue) : "", result: result || "success"
  };
}

function appendAudit_(context, action, entityType, entityId, previousValue, newValue, result) {
  appendRow_("Audit_Log", auditRecord_(context, action, entityType, entityId, previousValue, newValue, result));
}

function appendAuditedRow_(sheetName, idField, record, context, action, entityType, auditPrevious, auditNew) {
  appendRow_(sheetName, record);
  try {
    appendAudit_(context, action, entityType, record[idField] || "", auditPrevious || null, auditNew === undefined ? publicRow_(record) : auditNew);
    return record;
  } catch (auditError) {
    try {
      const inserted = findBy_(sheetName, idField, record[idField]);
      if (inserted) deleteRow_(sheetName, inserted.__row);
    } catch (rollbackError) {
      setRecoveryRequired_("audit_compensation_required", {
        action: action,
        sheet: sheetName,
        entityId: record[idField] || "",
        auditError: auditError.code || auditError.message,
        rollbackError: rollbackError.code || rollbackError.message
      });
      throw sbError_("RECOVERY_REQUIRED", "Pencatatan audit dan kompensasi gagal. Aplikasi tetap dikunci sampai pemulihan manual selesai.", 503, recoveryDetails_());
    }
    throw sbError_("AUDIT_WRITE_FAILED", "Perubahan dibatalkan karena audit log gagal disimpan.", 503, { cause: auditError.code || auditError.message });
  }
}

function updateAuditedRow_(sheetName, current, updated, context, action, entityType, entityId, auditPrevious, auditNew) {
  updateRow_(sheetName, current.__row, updated);
  try {
    appendAudit_(context, action, entityType, entityId || "", auditPrevious === undefined ? publicRow_(current) : auditPrevious, auditNew === undefined ? publicRow_(updated) : auditNew);
    return updated;
  } catch (auditError) {
    try { updateRow_(sheetName, current.__row, current); }
    catch (rollbackError) {
      setRecoveryRequired_("audit_compensation_required", {
        action: action,
        sheet: sheetName,
        entityId: entityId || "",
        auditError: auditError.code || auditError.message,
        rollbackError: rollbackError.code || rollbackError.message
      });
      throw sbError_("RECOVERY_REQUIRED", "Pencatatan audit dan kompensasi gagal. Aplikasi tetap dikunci sampai pemulihan manual selesai.", 503, recoveryDetails_());
    }
    throw sbError_("AUDIT_WRITE_FAILED", "Perubahan dibatalkan karena audit log gagal disimpan.", 503, { cause: auditError.code || auditError.message });
  }
}

function recoveryProperties_() { return PropertiesService.getScriptProperties(); }

function recordExternalCleanupRequired_(kind, details) {
  const properties = recoveryProperties_();
  const current = properties.getProperty("EXTERNAL_CLEANUP_REQUIRED_JSON");
  let entries = [];
  try { entries = current ? JSON.parse(current) : []; } catch (ignored) { entries = []; }
  entries.push({
    cleanupId: uuid_(),
    kind: String(kind || "external_cleanup"),
    details: canonicalValue_(details || {}),
    createdAt: nowIso_()
  });
  if (entries.length > 25) entries = entries.slice(entries.length - 25);
  properties.setProperty("EXTERNAL_CLEANUP_REQUIRED_JSON", JSON.stringify(entries));
  return entries[entries.length - 1];
}

function externalCleanupRequired_() {
  try { return JSON.parse(recoveryProperties_().getProperty("EXTERNAL_CLEANUP_REQUIRED_JSON") || "[]"); }
  catch (ignored) { return []; }
}

function setRecoveryRequired_(status, details) {
  const properties = recoveryProperties_();
  let normalizedDetails = canonicalValue_(details || {});
  let detailsJson = JSON.stringify(normalizedDetails);
  if (detailsJson.length > 7000) {
    normalizedDetails = { truncated: true, checksum: sha256Hex_(detailsJson), length: detailsJson.length, summary: String(details && details.action || details && details.operation || status || "recovery_required") };
    detailsJson = JSON.stringify(normalizedDetails);
  }
  const payload = {
    status: String(status || "recovery_required"),
    details: normalizedDetails,
    updatedAt: nowIso_()
  };
  properties.setProperties({
    RECOVERY_REQUIRED: "true",
    RECOVERY_STATUS: payload.status,
    RECOVERY_DETAILS_JSON: detailsJson,
    RECOVERY_UPDATED_AT: payload.updatedAt
  });
  try {
    upsertConfig_("maintenance_mode", "true");
    upsertConfig_("recovery_required", "true");
    upsertConfig_("recovery_status", payload.status);
    upsertConfig_("recovery_details", JSON.stringify(payload.details));
  } catch (ignored) { /* Script Properties tetap menjadi fallback fail-closed. */ }
  return payload;
}

function clearRecoveryState_() {
  const properties = recoveryProperties_();
  properties.deleteProperty("RECOVERY_REQUIRED");
  properties.deleteProperty("RECOVERY_STATUS");
  properties.deleteProperty("RECOVERY_DETAILS_JSON");
  properties.deleteProperty("RECOVERY_UPDATED_AT");
  try {
    upsertConfig_("recovery_required", "false");
    upsertConfig_("recovery_status", "");
    upsertConfig_("recovery_details", "");
  } catch (ignored) { /* Dapat dibersihkan setelah schema pulih. */ }
}

function isRecoveryRequired_() {
  const properties = recoveryProperties_();
  if (properties.getProperty("RECOVERY_REQUIRED") === "true") return true;
  try { return getConfig_("recovery_required") === "true"; } catch (ignored) { return false; }
}

function recoveryDetails_() {
  const properties = recoveryProperties_();
  let details = {};
  try { details = JSON.parse(properties.getProperty("RECOVERY_DETAILS_JSON") || "{}"); } catch (ignored) { details = {}; }
  return {
    recoveryRequired: isRecoveryRequired_(),
    status: properties.getProperty("RECOVERY_STATUS") || "",
    details: details,
    updatedAt: properties.getProperty("RECOVERY_UPDATED_AT") || ""
  };
}

function compensateOrFailClosed_(status, details, compensate) {
  try {
    compensate();
    return true;
  } catch (rollbackError) {
    const recovery = Object.assign({}, details || {}, { rollbackError: rollbackError.code || rollbackError.message });
    setRecoveryRequired_(status || "recovery_required", recovery);
    throw sbError_("RECOVERY_REQUIRED", "Kompensasi otomatis gagal. Aplikasi tetap dikunci sampai pemulihan manual selesai.", 503, recoveryDetails_());
  }
}

function idempotencyFingerprint_(context) {
  return sha256Hex_(canonicalJson_({
    action: context.action,
    actorId: context.actor && context.actor.user_id,
    payload: context.payload || {},
    rowVersion: context.rowVersion === undefined ? null : context.rowVersion
  }));
}

function parseIdempotencyResponse_(row) {
  let parsed;
  try { parsed = JSON.parse(String(row.response_json || "null")); }
  catch (error) { throw sbError_("IDEMPOTENCY_CORRUPT", "Data idempotency rusak.", 503, { key: row.idempotency_key }); }
  if (!parsed || parsed.__sb_idempotency !== 1) throw sbError_("IDEMPOTENCY_LEGACY_INVALID", "Record idempotency lama tidak memiliki fingerprint. Gunakan request baru.", 409);
  return parsed;
}

function cleanupExpiredIdempotency_() {
  const now = Date.now();
  const expiredRows = rows_("Idempotency").filter(function(row) {
    const expires = Date.parse(String(row.expires_at || ""));
    return !Number.isFinite(expires) || expires <= now;
  }).map(function(row) { return row.__row; });
  if (expiredRows.length) deleteRowsDescending_("Idempotency", expiredRows);
  return expiredRows.length;
}

function getIdempotentResult_(context) {
  if (!context.idempotencyKey) return null;
  const matches = rows_("Idempotency").filter(function(row) { return String(row.idempotency_key) === String(context.idempotencyKey); });
  const now = Date.now();
  const expired = matches.filter(function(row) {
    const expires = Date.parse(String(row.expires_at || ""));
    return !Number.isFinite(expires) || expires <= now;
  });
  if (expired.length) deleteRowsDescending_("Idempotency", expired.map(function(row) { return row.__row; }));
  const active = matches.filter(function(row) { return expired.indexOf(row) === -1; });
  if (!active.length) return null;
  if (active.length > 1) {
    setRecoveryRequired_("idempotency_duplicate_required", { idempotencyKey: context.idempotencyKey, count: active.length });
    throw sbError_("RECOVERY_REQUIRED", "Ditemukan idempotency key aktif ganda. Aplikasi dikunci untuk mencegah transaksi duplikat.", 503, recoveryDetails_());
  }
  const row = active[0];
  if (String(row.action) !== context.action || String(row.actor_id) !== String(context.actor.user_id)) throw sbError_("IDEMPOTENCY_MISMATCH", "Idempotency key telah digunakan untuk operasi berbeda.", 409);
  const parsed = parseIdempotencyResponse_(row);
  if (parsed.fingerprint !== idempotencyFingerprint_(context)) throw sbError_("IDEMPOTENCY_MISMATCH", "Idempotency key telah digunakan dengan payload atau versi data berbeda.", 409);
  return parsed.result;
}

function isIdempotencyConflict_(error) {
  return error && ["IDEMPOTENCY_MISMATCH", "IDEMPOTENCY_DUPLICATE"].indexOf(error.code) !== -1;
}

function saveIdempotentResult_(context, entityId, result) {
  if (!context.idempotencyKey) return;
  const fingerprint = idempotencyFingerprint_(context);
  const wrapper = { __sb_idempotency: 1, fingerprint: fingerprint, result: result };
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const current = rows_("Idempotency").filter(function(row) { return String(row.idempotency_key) === String(context.idempotencyKey); });
      if (current.length > 1) throw sbError_("IDEMPOTENCY_DUPLICATE", "Idempotency key tersimpan lebih dari satu kali.", 409);
      if (current.length === 1) {
        const existing = parseIdempotencyResponse_(current[0]);
        if (existing.fingerprint !== fingerprint) throw sbError_("IDEMPOTENCY_MISMATCH", "Idempotency key telah digunakan dengan payload berbeda.", 409);
        return;
      }
      appendRow_("Idempotency", {
        idempotency_key: context.idempotencyKey, action: context.action, actor_id: context.actor.user_id,
        entity_id: entityId || "", response_json: JSON.stringify(wrapper), created_at: nowIso_(),
        expires_at: Utilities.formatDate(new Date(Date.now() + 30 * 86400000), SB_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX")
      });
      SpreadsheetApp.flush();
      const verified = rows_("Idempotency").filter(function(row) { return String(row.idempotency_key) === String(context.idempotencyKey); });
      if (verified.length !== 1) throw sbError_("IDEMPOTENCY_VERIFY_FAILED", "Hasil idempotency tidak dapat diverifikasi.", 503);
      const saved = parseIdempotencyResponse_(verified[0]);
      if (saved.fingerprint !== fingerprint) throw sbError_("IDEMPOTENCY_VERIFY_FAILED", "Fingerprint idempotency tidak sesuai.", 503);
      return;
    } catch (error) {
      if (isIdempotencyConflict_(error)) {
        lastError = error;
        break;
      }
      lastError = error;
      if (attempt < 2) Utilities.sleep(Math.pow(2, attempt) * 100);
    }
  }
  setRecoveryRequired_("idempotency_commit_required", {
    idempotencyKey: context.idempotencyKey,
    action: context.action,
    actorId: context.actor.user_id,
    entityId: entityId || "",
    fingerprint: fingerprint,
    resultChecksum: sha256Hex_(canonicalJson_(result)),
    resultSummary: canonicalJson_(result).length <= 3000 ? canonicalValue_(result) : { omitted: true, length: canonicalJson_(result).length },
    cause: lastError && (lastError.code || lastError.message)
  });
  throw sbError_("IDEMPOTENCY_COMMIT_REQUIRED", "Perubahan sudah terjadi tetapi hasil idempotency belum dapat disimpan. Aplikasi dikunci agar retry tidak membuat data ganda.", 503, recoveryDetails_());
}
