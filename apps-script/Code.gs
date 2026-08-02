function doGet() {
  return jsonOutput_({ ok: true, service: "saldo-bersama-google-bridge", version: 3, timestamp: new Date().toISOString() }, 200);
}

function doPost(event) {
  try {
    var message = verifySignedBody_(event);
    var action = String(message.action || "");
    var payload = message.payload || {};
    var data;
    if (action === "mirror.rebuild") data = rebuildMirror_(payload);
    else if (action === "calendar.rebuild") data = rebuildCalendar_(payload);
    else if (action === "backup.store") data = storeBackup_(payload);
    else if (action === "backup.read") data = readBackup_(payload);
    else if (action === "integration.health") data = integrationHealth_();
    else throw sbError_("UNKNOWN_ACTION", "Action bridge tidak dikenali.", 404);
    return jsonOutput_({ ok: true, data: data }, 200);
  } catch (error) {
    console.error(JSON.stringify({ code: error.code || "BRIDGE_ERROR", status: error.status || 500, message: error.status && error.status < 500 ? cleanText_(error.message, 200) : "Internal bridge error" }));
    return jsonOutput_({ ok: false, error: { code: error.code || "BRIDGE_ERROR", message: error.status && error.status < 500 ? error.message : "Integrasi Google gagal.", status: error.status || 500 } }, error.status || 500);
  }
}

function integrationHealth_() {
  var properties = PropertiesService.getScriptProperties();
  return {
    mirrorConfigured: Boolean(properties.getProperty("MIRROR_SPREADSHEET_ID")),
    calendarConfigured: Boolean(properties.getProperty("GOOGLE_CALENDAR_ID")),
    backupConfigured: Boolean(properties.getProperty("BACKUP_FOLDER_ID")),
    jobsConfigured: Boolean(properties.getProperty("JOBS_ENDPOINT_URL") && properties.getProperty("JOBS_SHARED_SECRET")),
    triggerReady: scheduledTriggerHealth_().ready,
    timestamp: new Date().toISOString()
  };
}
