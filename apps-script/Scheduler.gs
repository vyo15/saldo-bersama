// Scheduled calls use a fresh nonce/timestamp plus HMAC because they do not have an interactive user session.
function signedJobPayload_() {
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty("JOBS_SHARED_SECRET") || "";
  if (secret.length < 32) throw sbError_("JOBS_NOT_CONFIGURED", "JOBS_SHARED_SECRET belum diatur.", 503);
  var message = JSON.stringify({ timestamp: Date.now(), nonce: Utilities.getUuid(), includeBackup: true });
  return { message: message, signature: hexHmac_(message, secret) };
}

function runScheduledJobs() {
  var endpoint = PropertiesService.getScriptProperties().getProperty("JOBS_ENDPOINT_URL");
  if (!endpoint) throw sbError_("JOBS_NOT_CONFIGURED", "JOBS_ENDPOINT_URL belum diatur.", 503);
  var response = UrlFetchApp.fetch(endpoint, { method: "post", contentType: "application/json", payload: JSON.stringify(signedJobPayload_()), muteHttpExceptions: true });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw sbError_("JOBS_FAILED", "Scheduled job Vercel gagal.", 503, { status: response.getResponseCode() });
  return JSON.parse(response.getContentText() || "{}");
}

function installScheduledTrigger() {
  ScriptApp.getProjectTriggers().filter(function(trigger) { return trigger.getHandlerFunction() === "runScheduledJobs"; }).forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger("runScheduledJobs").timeBased().everyMinutes(10).create();
  return scheduledTriggerHealth_();
}

function scheduledTriggerHealth_() {
  var triggers = ScriptApp.getProjectTriggers().filter(function(trigger) { return trigger.getHandlerFunction() === "runScheduledJobs"; });
  return { ready: triggers.length === 1, count: triggers.length };
}
