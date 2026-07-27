function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw sbError_("CONFIG_MISSING", "SPREADSHEET_ID belum diatur. Jalankan setupSaldoBersama().", 503);
  return SpreadsheetApp.openById(id);
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw sbError_("SCHEMA_MISSING", "Sheet tidak ditemukan: " + name, 503);
  return sheet;
}

function headers_(name) { return SB_SCHEMA[name]; }

function rows_(name) {
  const sheet = getSheet_(name);
  if (sheet.getLastRow() < 2) return [];
  const headers = headers_(name);
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function(values, index) {
    const row = { __row: index + 2 };
    headers.forEach(function(header, column) { row[header] = values[column]; });
    return row;
  });
}

function appendRow_(name, record) {
  const headers = headers_(name);
  getSheet_(name).appendRow(headers.map(function(header) { return record[header] === undefined ? "" : record[header]; }));
  return record;
}

function updateRow_(name, rowNumber, record) {
  const headers = headers_(name);
  getSheet_(name).getRange(rowNumber, 1, 1, headers.length).setValues([headers.map(function(header) { return record[header] === undefined ? "" : record[header]; })]);
  return record;
}

function findBy_(name, field, value) { return rows_(name).find(function(row) { return String(row[field]) === String(value); }) || null; }
function filterBy_(name, predicate) { return rows_(name).filter(predicate); }

function nowIso_() { return Utilities.formatDate(new Date(), SB_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function today_() { return Utilities.formatDate(new Date(), SB_TIMEZONE, "yyyy-MM-dd"); }
function monthKey_(date) { return Utilities.formatDate(date || new Date(), SB_TIMEZONE, "yyyy-MM"); }
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

function appendAudit_(context, action, entityType, entityId, previousValue, newValue, result) {
  appendRow_("Audit_Log", {
    audit_id: uuid_(), request_id: context.requestId || "", timestamp: nowIso_(), actor_id: context.actor.user_id,
    actor_email: context.actor.email, action: action, entity_type: entityType, entity_id: entityId || "",
    previous_value: previousValue ? JSON.stringify(previousValue) : "", new_value: newValue ? JSON.stringify(newValue) : "", result: result || "success"
  });
}

function getIdempotentResult_(context) {
  if (!context.idempotencyKey) return null;
  const row = findBy_("Idempotency", "idempotency_key", context.idempotencyKey);
  if (!row) return null;
  if (String(row.action) !== context.action || String(row.actor_id) !== String(context.actor.user_id)) throw sbError_("IDEMPOTENCY_MISMATCH", "Idempotency key telah digunakan untuk operasi berbeda.", 409);
  return JSON.parse(String(row.response_json || "null"));
}

function saveIdempotentResult_(context, entityId, result) {
  if (!context.idempotencyKey) return;
  appendRow_("Idempotency", {
    idempotency_key: context.idempotencyKey, action: context.action, actor_id: context.actor.user_id,
    entity_id: entityId || "", response_json: JSON.stringify(result), created_at: nowIso_(),
    expires_at: Utilities.formatDate(new Date(Date.now() + 30 * 86400000), SB_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX")
  });
}
