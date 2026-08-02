var SB_BRIDGE_MAX_SKEW_MS = 120000;
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
  if (Math.abs(Date.now() - Number(message.timestamp || 0)) > SB_BRIDGE_MAX_SKEW_MS) throw sbError_("MESSAGE_EXPIRED", "Pesan bridge kedaluwarsa.", 401);
  var nonce = String(message.nonce || "");
  if (!nonce) throw sbError_("NONCE_REQUIRED", "Nonce bridge wajib diisi.", 401);
  var cache = CacheService.getScriptCache();
  if (cache.get("nonce:" + nonce)) throw sbError_("REPLAY_DENIED", "Pesan bridge sudah pernah dipakai.", 409);
  cache.put("nonce:" + nonce, "1", 180);
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
