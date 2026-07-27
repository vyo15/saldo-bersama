const SB_ROLE_ACTIONS = Object.freeze({
  owner: ["system.initialize", "system.health", "bootstrap.get", "users.list", "users.upsert", "users.deactivate", "audit.list", "dashboard.overview", "accounts.list", "accounts.create", "accounts.update", "accounts.archive", "categories.list", "categories.create", "categories.update", "categories.archive", "transactions.list", "transactions.create", "transactions.update", "transactions.cancel", "envelopes.list", "envelopes.createRule", "envelopes.createPeriod", "envelopes.move", "envelopes.close", "recurring.list", "recurring.createRule", "recurring.updateRule", "recurring.payOccurrence", "budgets.list", "budgets.upsert", "goals.list", "goals.create", "goals.move", "reports.monthly", "reconciliations.create", "periods.close", "periods.reopen", "calendar.sync", "notifications.register", "notifications.unregister", "backup.create", "export.create", "import.preview", "import.apply", "restore.preview", "restore.apply", "integrity.run"],
  member: ["system.health", "bootstrap.get", "dashboard.overview", "accounts.list", "categories.list", "transactions.list", "transactions.create", "transactions.update", "transactions.cancel", "envelopes.list", "envelopes.move", "recurring.list", "recurring.payOccurrence", "budgets.list", "goals.list", "goals.move", "reports.monthly", "reconciliations.create", "notifications.register", "notifications.unregister"]
});

function sbError_(code, message, status, details) {
  const error = new Error(message);
  error.code = code; error.status = status || 400; error.details = details || null;
  return error;
}

function verifyEnvelope_(body) {
  if (!body || !body.message || !body.signature) throw sbError_("INVALID_SIGNATURE", "Request internal tidak lengkap.", 401);
  const secret = PropertiesService.getScriptProperties().getProperty("INTERNAL_SHARED_SECRET");
  if (!secret || secret.length < 32) throw sbError_("CONFIG_MISSING", "INTERNAL_SHARED_SECRET belum diatur.", 503);
  const bytes = Utilities.computeHmacSha256Signature(body.message, secret, Utilities.Charset.UTF_8);
  const expected = bytes.map(function(byte) { const value = byte < 0 ? byte + 256 : byte; return ("0" + value.toString(16)).slice(-2); }).join("");
  if (!constantTimeEqual_(expected, String(body.signature))) throw sbError_("INVALID_SIGNATURE", "Signature internal tidak valid.", 401);
  let message;
  try { message = JSON.parse(body.message); } catch (error) { throw sbError_("INVALID_JSON", "Message internal tidak valid.", 400); }
  if (Math.abs(Date.now() - Number(message.timestamp || 0)) > 120000) throw sbError_("REQUEST_EXPIRED", "Request sudah kedaluwarsa.", 401);
  const cache = CacheService.getScriptCache();
  if (cache.get("nonce:" + message.nonce)) throw sbError_("REPLAY_DETECTED", "Request pernah diproses.", 409);
  cache.put("nonce:" + message.nonce, "1", 180);
  return message;
}

function constantTimeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function resolveActor_(signedActor, action) {
  const email = String(signedActor && signedActor.email || "").toLowerCase();
  let user = findBy_("Users", "email", email);
  if (!user && action === "system.initialize") {
    user = appendRow_("Users", { user_id: uuid_(), firebase_uid: signedActor.uid, email: email, name: sanitizeText_(signedActor.name || email, 120), role: "owner", status: "active", row_version: 1, created_at: nowIso_(), updated_at: nowIso_() });
  }
  if (!user || user.status !== "active") throw sbError_("ACCOUNT_NOT_ALLOWED", "Akun tidak aktif atau tidak terdaftar.", 403);
  if (String(user.role) !== String(signedActor.role)) throw sbError_("ROLE_MISMATCH", "Role akun berbeda antara allowlist Vercel dan database. Sinkronkan konfigurasi sebelum melanjutkan.", 403);
  if (user.firebase_uid && String(user.firebase_uid) !== String(signedActor.uid)) throw sbError_("IDENTITY_MISMATCH", "UID tidak sesuai allowlist backend.", 403);
  if (!user.firebase_uid) { user.firebase_uid = signedActor.uid; user.updated_at = nowIso_(); user.row_version = rowVersion_(user) + 1; updateRow_("Users", user.__row, user); }
  if (SB_ROLE_ACTIONS[user.role].indexOf(action) === -1) throw sbError_("FORBIDDEN", "Role tidak diizinkan menjalankan action ini.", 403);
  return publicRow_(user);
}
