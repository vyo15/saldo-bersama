function getMirrorSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty("MIRROR_SPREADSHEET_ID");
  if (!id) throw sbError_("MIRROR_NOT_CONFIGURED", "MIRROR_SPREADSHEET_ID belum diatur.", 503);
  return SpreadsheetApp.openById(id);
}

function valuesForRows_(rows) {
  if (!rows || !rows.length) return { headers: ["Keterangan"], values: [["Tidak ada data"]] };
  var headers = Object.keys(rows[0]);
  var values = rows.map(function(row) { return headers.map(function(header) { return safeCell_(row[header]); }); });
  return { headers: headers, values: values };
}

function writeMirrorSheet_(spreadsheet, name, rows) {
  if (SB_MIRROR_SHEETS.indexOf(name) === -1) throw sbError_("MIRROR_SHEET_DENIED", "Tab mirror tidak diizinkan.", 400);
  var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  var data = valuesForRows_(rows);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, data.headers.length).setValues([data.headers]).setFontWeight("bold");
  if (data.values.length) sheet.getRange(2, 1, data.values.length, data.headers.length).setValues(data.values);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, Math.min(data.headers.length, 30));
  if (sheet.getFilter()) sheet.getFilter().remove();
  if (data.values.length) sheet.getRange(1, 1, data.values.length + 1, data.headers.length).createFilter();
}

function rebuildMirror_(payload) {
  var spreadsheet = getMirrorSpreadsheet_();
  if (payload.spreadsheetId && payload.spreadsheetId !== spreadsheet.getId()) throw sbError_("MIRROR_ID_MISMATCH", "Spreadsheet mirror tidak sesuai konfigurasi.", 409);
  var sheets = payload.sheets || {};
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw sbError_("MIRROR_BUSY", "Mirror sedang diperbarui oleh job lain.", 409);
  try {
    SB_MIRROR_SHEETS.forEach(function(name) { writeMirrorSheet_(spreadsheet, name, Array.isArray(sheets[name]) ? sheets[name] : []); });
    var metadata = spreadsheet.getSheetByName("_Mirror_Metadata") || spreadsheet.insertSheet("_Mirror_Metadata");
    metadata.clearContents();
    metadata.getRange(1, 1, 5, 2).setValues([
      ["source_of_truth", "Turso"],
      ["mode", "read-only mirror"],
      ["generated_at", cleanText_(payload.generatedAt || new Date().toISOString(), 50)],
      ["schema_version", 3],
      ["warning", "Perubahan manual akan ditimpa saat sinkronisasi berikutnya."]
    ]);
    metadata.hideSheet();
    SpreadsheetApp.flush();
    return { spreadsheetId: spreadsheet.getId(), sheets: SB_MIRROR_SHEETS.length, syncedAt: new Date().toISOString() };
  } finally { lock.releaseLock(); }
}
