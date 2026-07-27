function hexHmac_(message, secret) {
  return Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8).map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ("0" + value.toString(16)).slice(-2);
  }).join("");
}

function enqueueNotification_(userId, type, title, body, targetPath, scheduledAt, dedupeKey) {
  if (rows_("Notification_Queue").some(function(row) { return row.dedupe_key === dedupeKey && row.status !== "cancelled"; })) return;
  appendRow_("Notification_Queue", { notification_id: uuid_(), user_id: userId, notification_type: type, title: sanitizeText_(title, 80), body: sanitizeText_(body, 180), target_path: String(targetPath || "/"), scheduled_at: scheduledAt || nowIso_(), status: "pending", attempt_count: 0, last_attempt_at: "", dedupe_key: dedupeKey, created_at: nowIso_() });
}

function scheduleDailyFinanceNotifications() {
  const users = rows_("Users").filter(function(row) { return row.status === "active"; });
  const period = monthKey_();
  ensureRecurringOccurrences_(period);
  const today = today_();
  rows_("Recurring_Occurrences").filter(function(row) { return row.period_key === period && !["paid", "received", "cancelled"].includes(row.status) && row.due_date <= today; }).forEach(function(occurrence) {
    users.forEach(function(user) { enqueueNotification_(user.user_id, "recurring_due", "Ada jadwal keuangan yang perlu diperiksa", "Buka Saldo Bersama untuk memeriksa status tagihan atau pemasukan.", "/tagihan", nowIso_(), "due:" + occurrence.occurrence_id + ":" + user.user_id); });
  });
  const unallocated = rows_("Transactions").filter(function(row) { return row.status === "active" && row.transaction_type === "expense" && !row.envelope_period_id && String(row.transaction_date).slice(0, 7) === period; }).length;
  if (unallocated) users.forEach(function(user) { enqueueNotification_(user.user_id, "unallocated", "Ada transaksi belum dialokasikan", "Periksa kantong dana agar laporan tetap rapi.", "/transaksi", nowIso_(), "unallocated:" + period + ":" + user.user_id); });
  processNotificationQueue();
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
    try {
      const response = UrlFetchApp.fetch(endpoint, { method: "post", contentType: "application/json", payload: JSON.stringify({ message: message, signature: hexHmac_(message, secret) }), muteHttpExceptions: true });
      const code = response.getResponseCode();
      item.attempt_count = Number(item.attempt_count || 0) + 1; item.last_attempt_at = nowIso_();
      item.status = code >= 200 && code < 300 ? "sent" : (item.attempt_count >= 3 ? "failed" : "pending");
    } catch (error) {
      item.attempt_count = Number(item.attempt_count || 0) + 1; item.last_attempt_at = nowIso_(); item.status = item.attempt_count >= 3 ? "failed" : "pending";
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
    try { DriveApp.getFileById(row.file_id).setTrashed(true); } catch (error) { /* File mungkin sudah dipindahkan/dihapus manual. */ }
    row.status = "expired";
    updateRow_("Backup_Log", row.__row, row);
  });
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
    SpreadsheetApp.flush();
    return result;
  } finally { lock.releaseLock(); }
}

function setupScheduledTriggers() {
  const handlers = ScriptApp.getProjectTriggers().map(function(trigger) { return trigger.getHandlerFunction(); });
  if (handlers.indexOf("scheduleDailyFinanceNotifications") === -1) ScriptApp.newTrigger("scheduleDailyFinanceNotifications").timeBased().everyDays(1).atHour(8).create();
  if (handlers.indexOf("runScheduledBackup") === -1) ScriptApp.newTrigger("runScheduledBackup").timeBased().everyDays(1).atHour(2).create();
  return { notificationTrigger: true, backupTrigger: true };
}
