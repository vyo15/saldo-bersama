function hexHmac_(message, secret) {
  return Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8).map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ("0" + value.toString(16)).slice(-2);
  }).join("");
}

function enqueueNotification_(userId, type, title, body, targetPath, scheduledAt, dedupeKey) {
  const existing = rows_("Notification_Queue").find(function(row) { return row.dedupe_key === dedupeKey && row.status !== "cancelled"; });
  if (existing && ["pending", "sent"].indexOf(existing.status) !== -1) return;
  const record = { notification_id: existing ? existing.notification_id : uuid_(), user_id: userId, notification_type: type, title: sanitizeText_(title, 80), body: sanitizeText_(body, 180), target_path: String(targetPath || "/").startsWith("/") ? String(targetPath || "/") : "/", scheduled_at: scheduledAt || nowIso_(), status: "pending", attempt_count: 0, last_attempt_at: "", dedupe_key: dedupeKey, created_at: existing ? existing.created_at : nowIso_() };
  if (existing) updateRow_("Notification_Queue", existing.__row, record);
  else appendRow_("Notification_Queue", record);
}

function scheduleDailyFinanceNotifications() {
  const users = rows_("Users").filter(function(row) { return row.status === "active"; });
  const period = monthKey_();
  ensureRecurringOccurrences_(period);
  const currentDate = today_();
  rows_("Recurring_Occurrences").filter(function(row) { return row.period_key === period && !["paid", "received", "cancelled"].includes(row.status) && row.due_date <= currentDate; }).forEach(function(occurrence) {
    users.forEach(function(user) { enqueueNotification_(user.user_id, "recurring_due", "Ada jadwal keuangan yang perlu diperiksa", "Buka Saldo Bersama untuk memeriksa status tagihan atau pemasukan.", "/tagihan", nowIso_(), "due:" + occurrence.occurrence_id + ":" + user.user_id); });
  });
  const unallocated = rows_("Transactions").filter(function(row) { return row.status === "active" && row.transaction_type === "expense" && !row.envelope_period_id && String(row.transaction_date).slice(0, 7) === period; }).length;
  if (unallocated) users.forEach(function(user) { enqueueNotification_(user.user_id, "unallocated", "Ada transaksi belum dialokasikan", "Periksa kantong dana agar laporan tetap rapi.", "/transaksi", nowIso_(), "unallocated:" + period + ":" + user.user_id); });
  processNotificationQueue();
}

function parsePushResponse_(response) {
  let payload = null;
  try { payload = JSON.parse(response.getContentText() || "{}"); } catch (ignored) { payload = null; }
  const data = payload && payload.data ? payload.data : payload;
  return { code: response.getResponseCode(), sent: Number(data && data.sent || 0), failed: Number(data && data.failed || 0) };
}

function processNotificationQueue() {
  const endpoint = PropertiesService.getScriptProperties().getProperty("PUSH_ENDPOINT_URL");
  const secret = PropertiesService.getScriptProperties().getProperty("INTERNAL_SHARED_SECRET");
  if (!endpoint || !secret) throw new Error("PUSH_ENDPOINT_URL atau INTERNAL_SHARED_SECRET belum diatur.");
  const due = rows_("Notification_Queue").filter(function(row) { return row.status === "pending" && String(row.scheduled_at) <= nowIso_(); }).slice(0, 20);
  due.forEach(function(item) {
    const subscriptions = rows_("Push_Subscriptions").filter(function(row) { return row.user_id === item.user_id && row.status === "active"; }).map(function(row) { return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }; });
    if (!subscriptions.length) { item.status = "no_subscription"; updateRow_("Notification_Queue", item.__row, item); return; }
    const message = JSON.stringify({ timestamp: Date.now(), nonce: uuid_(), subscriptions: subscriptions, notification: { notificationId: item.notification_id, title: item.title, body: item.body, targetPath: item.target_path } });
    item.attempt_count = Number(item.attempt_count || 0) + 1;
    item.last_attempt_at = nowIso_();
    try {
      const response = UrlFetchApp.fetch(endpoint, { method: "post", contentType: "application/json", payload: JSON.stringify({ message: message, signature: hexHmac_(message, secret) }), muteHttpExceptions: true });
      const result = parsePushResponse_(response);
      const delivered = result.code >= 200 && result.code < 300 && result.sent > 0;
      item.status = delivered ? "sent" : (item.attempt_count >= 3 ? "failed" : "pending");
    } catch (error) {
      item.status = item.attempt_count >= 3 ? "failed" : "pending";
    }
    updateRow_("Notification_Queue", item.__row, item);
  });
}

function scheduledSystemActor_() {
  const owner = rows_("Users").find(function(row) { return row.status === "active" && row.role === "owner"; });
  if (!owner) throw new Error("Owner aktif tidak ditemukan untuk scheduled job.");
  return publicRow_(owner);
}

function cleanupBackupRetention_() {
  const now = Date.now();
  rows_("Backup_Log").forEach(function(row) {
    if (row.status !== "verified" || ["manual", "pre-restore", "pre-import", "pre-migration"].indexOf(String(row.backup_type)) !== -1) return;
    const ageDays = (now - new Date(String(row.created_at)).getTime()) / 86400000;
    const retentionDays = row.backup_type === "monthly" ? 400 : 30;
    if (ageDays <= retentionDays) return;
    try {
      DriveApp.getFileById(row.file_id).setTrashed(true);
      row.status = "expired";
      updateRow_("Backup_Log", row.__row, row);
    } catch (error) {
      // Tetap verified agar scheduled job berikutnya dapat mencoba kembali.
    }
  });
}

function runScheduledMaintenance() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("Scheduled maintenance gagal memperoleh lock.");
  try {
    const cleanedIdempotency = cleanupExpiredIdempotency_();
    cleanupBackupRetention_();
    SpreadsheetApp.flush();
    return { cleanedIdempotency: cleanedIdempotency, completedAt: nowIso_() };
  } finally { lock.releaseLock(); }
}

function runScheduledBackup() {
  const actor = scheduledSystemActor_();
  const dayOfMonth = Number(Utilities.formatDate(new Date(), SB_TIMEZONE, "d"));
  const type = dayOfMonth === 1 ? "monthly" : "daily";
  const context = { actor: actor, action: "backup.create", payload: { type: type }, requestId: "scheduled:" + uuid_(), idempotencyKey: "" };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error("Scheduled backup gagal memperoleh lock.");
  try {
    const result = createBackup_(context);
    cleanupBackupRetention_();
    cleanupExpiredIdempotency_();
    SpreadsheetApp.flush();
    return result;
  } finally { lock.releaseLock(); }
}

function setupScheduledTriggers() {
  const handlers = ScriptApp.getProjectTriggers().map(function(trigger) { return trigger.getHandlerFunction(); });
  if (handlers.indexOf("scheduleDailyFinanceNotifications") === -1) ScriptApp.newTrigger("scheduleDailyFinanceNotifications").timeBased().everyDays(1).atHour(8).create();
  if (handlers.indexOf("runScheduledBackup") === -1) ScriptApp.newTrigger("runScheduledBackup").timeBased().everyDays(1).atHour(2).create();
  if (handlers.indexOf("runScheduledMaintenance") === -1) ScriptApp.newTrigger("runScheduledMaintenance").timeBased().everyDays(1).atHour(3).create();
  return { notificationTrigger: true, backupTrigger: true, maintenanceTrigger: true };
}
