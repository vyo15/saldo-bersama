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

function resourceHealthReady_(name, getter, validator) {
  try {
    var resource = getter();
    if (!resource) return false;
    if (validator && validator(resource) !== true) return false;
    return true;
  } catch (error) {
    console.warn(JSON.stringify({ event: "integration.health.resource_unavailable", resource: name, code: cleanText_(error && error.code || "RESOURCE_UNAVAILABLE", 80) }));
    return false;
  }
}

function jobsConfigurationReady_() {
  var properties = PropertiesService.getScriptProperties();
  var endpoint = cleanText_(properties.getProperty("JOBS_ENDPOINT_URL") || "", 500);
  var secret = String(properties.getProperty("JOBS_SHARED_SECRET") || "");
  return secret.length >= 32 && /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?(?:\/[^\s]*)?$/.test(endpoint);
}

function integrationHealth_() {
  return {
    mirrorConfigured: resourceHealthReady_("mirror", getMirrorSpreadsheet_, function(spreadsheet) {
      mirrorTargetState_(spreadsheet);
      return true;
    }),
    calendarConfigured: resourceHealthReady_("calendar", getManagedCalendar_, function(calendar) {
      return typeof calendar.getId !== "function" || Boolean(calendar.getId());
    }),
    backupConfigured: resourceHealthReady_("backup", backupFolder_, function(folder) {
      return typeof folder.getId !== "function" || Boolean(folder.getId());
    }),
    jobsConfigured: jobsConfigurationReady_(),
    triggerReady: scheduledTriggerHealth_().ready,
    timestamp: new Date().toISOString()
  };
}
