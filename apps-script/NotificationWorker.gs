function hexHmac_(message, secret) {
  return Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8).map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ("0" + value.toString(16)).slice(-2);
  }).join("");
}

function enqueueNotification_(userId, type, title, body, targetPath, scheduledAt, dedupeKey) {
  const existing = rows_("Notification_Queue").find(function(row) { return row.dedupe_key === dedupeKey && row.status !== "cancelled"; });
  if (existing && ["pending", "sent"].indexOf(existing.status) !== -1) return false;
  const record = { notification_id: existing ? existing.notification_id : uuid_(), user_id: userId, notification_type: type, title: sanitizeText_(title, 80), body: sanitizeText_(body, 180), target_path: String(targetPath || "/").startsWith("/") ? String(targetPath || "/") : "/", scheduled_at: scheduledAt || nowIso_(), status: "pending", attempt_count: 0, last_attempt_at: "", dedupe_key: dedupeKey, created_at: existing ? existing.created_at : nowIso_() };
  if (existing) updateRow_("Notification_Queue", existing.__row, record);
  else appendRow_("Notification_Queue", record);
  return true;
}

function assertScheduledOperationsAllowed_() {
  if (isRecoveryRequired_() || getConfig_("maintenance_mode") === "true") {
    throw sbError_("RECOVERY_REQUIRED", "Scheduled job dihentikan selama maintenance atau recovery.", 503, recoveryDetails_());
  }
}

function scheduleDailyFinanceNotifications() {
  resetRequestCache_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("Penjadwalan notifikasi gagal memperoleh lock.");
  try {
    assertScheduledOperationsAllowed_();
    const users = rows_("Users").filter(function(row) { return row.status === "active"; });
    const period = monthKey_();
    const generated = generateRecurringOccurrencesUnlocked_(period);
    const currentDate = today_();
    let queued = 0;
    const occurrences = rows_("Recurring_Occurrences").filter(function(row) { return row.period_key === period && !["paid", "received", "cancelled"].includes(row.status) && row.due_date <= currentDate; });
    users.forEach(function(user) {
      const userContext = { actor: publicRow_(user), payload: { period: period } };
      occurrences.forEach(function(occurrence) {
        const rule = findBy_("Recurring_Rules", "recurring_rule_id", occurrence.recurring_rule_id);
        if (!rule || !canAccessRecurringRule_(userContext, rule)) return;
        if (enqueueNotification_(user.user_id, "recurring_due", "Ada jadwal keuangan yang perlu diperiksa", "Buka Saldo Bersama untuk memeriksa status tagihan atau pemasukan.", "/tagihan", nowIso_(), "due:" + occurrence.occurrence_id + ":" + user.user_id)) queued += 1;
      });
      const unallocated = visibleTransactions_(userContext).filter(function(row) {
        return row.status === "active" && row.transaction_type === "expense" && !row.envelope_period_id && String(row.transaction_date).slice(0, 7) === period && String(row.transaction_date) <= currentDate;
      }).length;
      if (unallocated && enqueueNotification_(user.user_id, "unallocated", "Ada transaksi belum dialokasikan", "Periksa kantong dana agar laporan tetap rapi.", "/transaksi", nowIso_(), "unallocated:" + period + ":" + user.user_id)) queued += 1;
    });
    const delivery = processNotificationQueueUnlocked_();
    const actor = scheduledSystemActor_();
    appendAudit_({ actor: actor, requestId: "scheduled-notifications:" + uuid_() }, "notifications.schedule", "notification_queue", period, null, { generatedOccurrences: generated, queued: queued, delivery: delivery });
    SpreadsheetApp.flush();
    return { generatedOccurrences: generated, queued: queued, delivery: delivery };
  } finally { lock.releaseLock(); }
}

function parsePushResponse_(response) {
  let payload = null;
  try { payload = JSON.parse(response.getContentText() || "{}"); } catch (ignored) { payload = null; }
  const data = payload && payload.data ? payload.data : payload;
  return { code: response.getResponseCode(), sent: Number(data && data.sent || 0), failed: Number(data && data.failed || 0), deliveries: Array.isArray(data && data.deliveries) ? data.deliveries : [] };
}

function processNotificationQueueUnlocked_() {
  const endpoint = PropertiesService.getScriptProperties().getProperty("PUSH_ENDPOINT_URL");
  const secret = PropertiesService.getScriptProperties().getProperty("INTERNAL_SHARED_SECRET");
  if (!endpoint || !secret) throw new Error("PUSH_ENDPOINT_URL atau INTERNAL_SHARED_SECRET belum diatur.");
  const due = rows_("Notification_Queue").filter(function(row) { return row.status === "pending" && String(row.scheduled_at) <= nowIso_(); }).slice(0, 20);
  let sent = 0;
  let failed = 0;
  let revoked = 0;
  due.forEach(function(item) {
    const subscriptionRows = rows_("Push_Subscriptions").filter(function(row) { return row.user_id === item.user_id && row.status === "active"; });
    const subscriptions = subscriptionRows.map(function(row) { return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }; });
    if (!subscriptions.length) { item.status = "no_subscription"; updateRow_("Notification_Queue", item.__row, item); failed += 1; return; }
    const message = JSON.stringify({ timestamp: Date.now(), nonce: uuid_(), subscriptions: subscriptions, notification: { notificationId: item.notification_id, title: item.title, body: item.body, targetPath: item.target_path } });
    item.attempt_count = Number(item.attempt_count || 0) + 1;
    item.last_attempt_at = nowIso_();
    try {
      const response = UrlFetchApp.fetch(endpoint, { method: "post", contentType: "application/json", payload: JSON.stringify({ message: message, signature: hexHmac_(message, secret) }), muteHttpExceptions: true });
      const result = parsePushResponse_(response);
      const delivered = result.code >= 200 && result.code < 300 && result.sent > 0;
      item.status = delivered ? "sent" : (item.attempt_count >= 3 ? "failed" : "pending");
      result.deliveries.filter(function(delivery) { return [404, 410].indexOf(Number(delivery.statusCode)) !== -1; }).forEach(function(delivery) {
        const subscription = subscriptionRows[Number(delivery.index)];
        if (!subscription) return;
        subscription.status = "revoked";
        subscription.updated_at = nowIso_();
        updateRow_("Push_Subscriptions", subscription.__row, subscription);
        revoked += 1;
      });
      if (delivered) sent += 1; else failed += 1;
    } catch (error) {
      item.status = item.attempt_count >= 3 ? "failed" : "pending";
      failed += 1;
    }
    updateRow_("Notification_Queue", item.__row, item);
  });
  return { processed: due.length, sent: sent, failed: failed, revokedSubscriptions: revoked };
}

function processNotificationQueue() {
  resetRequestCache_();
  const lock = LockService.getScriptLock();
  const alreadyHeld = lock.hasLock();
  if (!alreadyHeld && !lock.tryLock(15000)) throw new Error("Pemrosesan notifikasi gagal memperoleh lock.");
  try {
    assertScheduledOperationsAllowed_();
    const result = processNotificationQueueUnlocked_();
    const actor = scheduledSystemActor_();
    appendAudit_({ actor: actor, requestId: "scheduled-push:" + uuid_() }, "notifications.process", "notification_queue", monthKey_(), null, result);
    SpreadsheetApp.flush();
    return result;
  } finally { if (!alreadyHeld) lock.releaseLock(); }
}

function scheduledSystemActor_() {
  const owner = rows_("Users").find(function(row) { return row.status === "active" && row.role === "owner"; });
  if (!owner) throw new Error("Owner aktif tidak ditemukan untuk scheduled job.");
  return publicRow_(owner);
}

function cleanupBackupRetention_(context) {
  const now = Date.now();
  let expired = 0;
  let failed = 0;
  rows_("Backup_Log").forEach(function(row) {
    if (row.status !== "verified" || ["manual", "pre-restore", "pre-import", "pre-migration"].indexOf(String(row.backup_type)) !== -1) return;
    const ageDays = (now - new Date(String(row.created_at)).getTime()) / 86400000;
    const retentionDays = row.backup_type === "monthly" ? 400 : 30;
    if (ageDays <= retentionDays) return;
    try {
      DriveApp.getFileById(row.file_id).setTrashed(true);
      row.status = "expired";
      updateRow_("Backup_Log", row.__row, row);
      expired += 1;
    } catch (error) {
      failed += 1;
      recordExternalCleanupRequired_("backup_retention", { backupId: row.backup_id, fileId: row.file_id, cause: error.code || error.message });
    }
  });
  if (context) appendAudit_(context, "backup.retention", "backup", "retention", null, { expired: expired, failed: failed });
  return { expired: expired, failed: failed };
}

function runScheduledMaintenance() {
  resetRequestCache_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("Scheduled maintenance gagal memperoleh lock.");
  try {
    assertScheduledOperationsAllowed_();
    const actor = scheduledSystemActor_();
    const context = { actor: actor, requestId: "scheduled-maintenance:" + uuid_() };
    const cleanedIdempotency = cleanupExpiredIdempotency_();
    const retention = cleanupBackupRetention_(context);
    appendAudit_(context, "system.maintenance", "system", "maintenance", null, { cleanedIdempotency: cleanedIdempotency, retention: retention });
    SpreadsheetApp.flush();
    return { cleanedIdempotency: cleanedIdempotency, retention: retention, completedAt: nowIso_() };
  } finally { lock.releaseLock(); }
}

function runScheduledBackup() {
  resetRequestCache_();
  const actor = scheduledSystemActor_();
  const dayOfMonth = Number(Utilities.formatDate(new Date(), SB_TIMEZONE, "d"));
  const type = dayOfMonth === 1 ? "monthly" : "daily";
  const context = { actor: actor, action: "backup.create", payload: { type: type }, requestId: "scheduled:" + uuid_(), idempotencyKey: "" };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("Scheduled backup gagal memperoleh lock.");
  try {
    assertScheduledOperationsAllowed_();
    const result = createBackup_(context);
    cleanupBackupRetention_(context);
    cleanupExpiredIdempotency_();
    SpreadsheetApp.flush();
    return result;
  } finally { lock.releaseLock(); }
}

function scheduledTriggerHealth_() {
  const required = ["scheduleDailyFinanceNotifications", "runScheduledBackup", "runScheduledMaintenance"];
  let handlers = [];
  try { handlers = ScriptApp.getProjectTriggers().map(function(trigger) { return trigger.getHandlerFunction(); }); }
  catch (error) { return { ready: false, handlers: {}, error: "TRIGGER_READ_FAILED" }; }
  const result = {};
  required.forEach(function(handler) { result[handler] = handlers.indexOf(handler) !== -1; });
  return { ready: required.every(function(handler) { return result[handler]; }), handlers: result };
}

function setupScheduledTriggers() {
  resetRequestCache_();
  const handlers = ScriptApp.getProjectTriggers().map(function(trigger) { return trigger.getHandlerFunction(); });
  if (handlers.indexOf("scheduleDailyFinanceNotifications") === -1) ScriptApp.newTrigger("scheduleDailyFinanceNotifications").timeBased().everyDays(1).atHour(8).create();
  if (handlers.indexOf("runScheduledBackup") === -1) ScriptApp.newTrigger("runScheduledBackup").timeBased().everyDays(1).atHour(2).create();
  if (handlers.indexOf("runScheduledMaintenance") === -1) ScriptApp.newTrigger("runScheduledMaintenance").timeBased().everyDays(1).atHour(3).create();
  const health = scheduledTriggerHealth_();
  if (!health.ready) throw sbError_("TRIGGER_SETUP_FAILED", "Trigger terjadwal belum lengkap setelah setup.", 503, health);
  return health;
}
