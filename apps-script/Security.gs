// Integration requests are authenticated here; formula-safe cell encoding prevents spreadsheet formula injection.
var SB_BRIDGE_MAX_SKEW_MS = 120000;
var SB_BRIDGE_NONCE_TTL_MS = SB_BRIDGE_MAX_SKEW_MS * 2 + 60000;
var SB_BRIDGE_NONCE_STATE_PROPERTY = "SB_BRIDGE_NONCES_V1";
var SB_BRIDGE_NONCE_MAX_ENTRIES = 80;
var SB_MIRROR_SHEETS = ["Ringkasan", "Transaksi", "Rekening", "Kategori", "Anggaran", "Kantong", "Tagihan", "Target", "Rekonsiliasi"];

function sbError_(code, message, status, details) {
  var error = new Error(message);
  error.code = code; error.status = status || 400; error.details = details || null;
  return error;
}

function constantTimeEqual_(left, right) {
  left = String(left || ""); right = String(right || "");
  if (left.length !== right.length) return false;
  var result = 0;
  for (var index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

function hexHmac_(message, secret) {
  return Utilities.computeHmacSha256Signature(String(message), String(secret), Utilities.Charset.UTF_8).map(function(byte) {
    var value = byte < 0 ? byte + 256 : byte;
    return ("0" + value.toString(16)).slice(-2);
  }).join("");
}

function bridgeNonceState_(properties, nowMs) {
  var raw = String(properties.getProperty(SB_BRIDGE_NONCE_STATE_PROPERTY) || "");
  if (!raw) return {};
  var parsed;
  try { parsed = JSON.parse(raw); } catch (ignored) { throw sbError_("REPLAY_STATE_INVALID", "State anti-replay bridge tidak valid.", 503); }
  if (!parsed || Object.prototype.toString.call(parsed) !== "[object Object]") throw sbError_("REPLAY_STATE_INVALID", "State anti-replay bridge tidak valid.", 503);
  var active = {};
  Object.keys(parsed).forEach(function(key) {
    var expiresAt = Number(parsed[key] || 0);
    if (Number.isFinite(expiresAt) && expiresAt > nowMs) active[key] = expiresAt;
  });
  return active;
}

function consumeBridgeNonce_(nonce, nowMs, secret) {
  var nonceKey = hexHmac_("bridge-nonce:" + String(nonce), secret);
  var cache = CacheService.getScriptCache();
  var cacheKey = "nonce:" + nonceKey.slice(0, 32);
  var cachedNonce = null;
  try { cachedNonce = cache.get(cacheKey); } catch (ignoredCacheGet) { cachedNonce = null; }
  if (cachedNonce) throw sbError_("REPLAY_DENIED", "Pesan bridge sudah pernah dipakai.", 409);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw sbError_("REPLAY_STATE_BUSY", "State anti-replay bridge sedang dipakai. Coba lagi dengan request baru.", 503);
  try {
    var properties = PropertiesService.getScriptProperties();
    var active = bridgeNonceState_(properties, nowMs);
    if (Number(active[nonceKey] || 0) > nowMs) throw sbError_("REPLAY_DENIED", "Pesan bridge sudah pernah dipakai.", 409);
    if (Object.keys(active).length >= SB_BRIDGE_NONCE_MAX_ENTRIES) throw sbError_("REPLAY_STATE_FULL", "State anti-replay bridge penuh. Coba lagi setelah request lama kedaluwarsa.", 503);
    active[nonceKey] = nowMs + SB_BRIDGE_NONCE_TTL_MS;
    properties.setProperty(SB_BRIDGE_NONCE_STATE_PROPERTY, JSON.stringify(active));
    try { cache.put(cacheKey, "1", Math.ceil(SB_BRIDGE_NONCE_TTL_MS / 1000)); } catch (ignoredCachePut) { /* Durable state tetap authoritative. */ }
  } finally {
    lock.releaseLock();
  }
}

function verifySignedBody_(event) {
  var raw = event && event.postData && event.postData.contents;
  if (!raw) throw sbError_("EMPTY_REQUEST", "Request bridge kosong.", 400);
  var body;
  try { body = JSON.parse(raw); } catch (ignored) { throw sbError_("INVALID_JSON", "Request bridge bukan JSON valid.", 400); }
  if (!body.message || !body.signature) throw sbError_("INVALID_SIGNATURE", "Signature bridge tidak lengkap.", 401);
  var secret = PropertiesService.getScriptProperties().getProperty("GOOGLE_BRIDGE_SHARED_SECRET") || "";
  if (secret.length < 32) throw sbError_("BRIDGE_NOT_CONFIGURED", "GOOGLE_BRIDGE_SHARED_SECRET belum diatur.", 503);
  var expected = hexHmac_(body.message, secret);
  if (!constantTimeEqual_(expected, body.signature)) throw sbError_("INVALID_SIGNATURE", "Signature bridge tidak valid.", 401);
  var message;
  try { message = JSON.parse(body.message); } catch (ignored2) { throw sbError_("INVALID_MESSAGE", "Pesan bridge tidak valid.", 400); }
  var nowMs = Date.now();
  if (Math.abs(nowMs - Number(message.timestamp || 0)) > SB_BRIDGE_MAX_SKEW_MS) throw sbError_("MESSAGE_EXPIRED", "Pesan bridge kedaluwarsa.", 401);
  var nonce = String(message.nonce || "");
  if (!nonce) throw sbError_("NONCE_REQUIRED", "Nonce bridge wajib diisi.", 401);
  consumeBridgeNonce_(nonce, nowMs, secret);
  return message;
}

function jsonOutput_(payload, status) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function cleanText_(value, maxLength) {
  return String(value === undefined || value === null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength || 250);
}

function safeCell_(value) {
  if (typeof value !== "string") return value === undefined || value === null ? "" : value;
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}
