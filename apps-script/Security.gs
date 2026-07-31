const SB_REQUEST_TOLERANCE_MS = 120000;
const SB_LOG_FIELDS = Object.freeze(["requestId", "action", "role", "status", "code", "durationMs", "skewMs", "toleranceMs", "mutating", "stage"]);

function appsScriptLog_(level, event, fields) {
  const record = {
    timestamp: new Date().toISOString(),
    level: ["debug", "info", "warn", "error"].indexOf(level) === -1 ? "info" : level,
    service: "saldo-bersama-apps-script",
    event: String(event || "unknown")
  };
  const source = fields || {};
  SB_LOG_FIELDS.forEach(function(key) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") record[key] = source[key];
  });
  const output = JSON.stringify(record);
  if (record.level === "error") console.error(output);
  else if (record.level === "warn") console.warn(output);
  else console.log(output);
}

const SB_ROLE_ACTIONS = Object.freeze({
  owner: ["system.initialize", "system.health", "bootstrap.get", "users.list", "users.upsert", "users.deactivate", "audit.list", "dashboard.overview", "accounts.list", "accounts.create", "accounts.update", "accounts.archive", "categories.list", "categories.create", "categories.update", "categories.archive", "transactions.list", "transactions.create", "transactions.update", "transactions.cancel", "envelopes.list", "envelopes.create", "envelopes.createRule", "envelopes.createPeriod", "envelopes.move", "envelopes.close", "recurring.list", "recurring.createRule", "recurring.updateRule", "recurring.payOccurrence", "recurring.reversePayment", "budgets.list", "budgets.upsert", "goals.list", "goals.create", "goals.move", "goals.reverseMovement", "reports.monthly", "reconciliations.create", "periods.list", "periods.close", "periods.reopen", "calendar.sync", "notifications.register", "notifications.unregister", "backup.create", "export.create", "import.preview", "import.apply", "restore.preview", "restore.apply", "integrity.run"],
  member: ["system.health", "bootstrap.get", "dashboard.overview", "accounts.list", "categories.list", "transactions.list", "transactions.create", "transactions.update", "transactions.cancel", "envelopes.list", "envelopes.move", "recurring.list", "recurring.payOccurrence", "recurring.reversePayment", "budgets.list", "goals.list", "goals.move", "goals.reverseMovement", "reports.monthly", "reconciliations.create", "notifications.register", "notifications.unregister"]
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
  const requestEpochMs = Number(message.timestamp || 0);
  const serverEpochMs = Date.now();
  const skewMs = serverEpochMs - requestEpochMs;
  if (!Number.isFinite(requestEpochMs) || Math.abs(skewMs) > SB_REQUEST_TOLERANCE_MS) {
    appsScriptLog_("warn", "request.rejected.clock_skew", {
      requestId: String(message.requestId || "").slice(0, 120),
      action: String(message.action || "unknown").slice(0, 120),
      role: String(message.actor && message.actor.role || "unknown").slice(0, 32),
      code: "REQUEST_EXPIRED",
      skewMs: skewMs,
      toleranceMs: SB_REQUEST_TOLERANCE_MS,
      stage: "verify_envelope"
    });
    throw sbError_("REQUEST_EXPIRED", "Request sudah kedaluwarsa.", 401, {
      serverEpochMs: serverEpochMs,
      requestEpochMs: requestEpochMs,
      skewMs: skewMs,
      toleranceMs: SB_REQUEST_TOLERANCE_MS
    });
  }
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

function assertRoleAction_(user, action) {
  const actions = SB_ROLE_ACTIONS[user.role] || [];
  if (actions.indexOf(action) === -1) throw sbError_("FORBIDDEN", "Role tidak diizinkan menjalankan action ini.", 403);
}

function assertInitializationActor_(signedActor) {
  const email = String(signedActor && signedActor.email || "").trim().toLowerCase();
  const uid = String(signedActor && signedActor.uid || "").trim();
  if (!email || !uid || signedActor.role !== "owner") throw sbError_("FORBIDDEN", "Inisialisasi schema hanya dapat dijalankan owner yang terverifikasi oleh backend.", 403);
  assertRoleAction_(signedActor, "system.initialize");
}

function canAccessOwnedScope_(context, scope, ownerUserId) {
  const actor = context && context.actor;
  if (!actor || actor.role === "owner" || scope !== "personal") return true;
  return String(ownerUserId || "") === String(actor.user_id || "");
}

function canAccessAccount_(context, account) {
  return Boolean(account) && canAccessOwnedScope_(context, account.owner_scope, account.owner_user_id);
}

function assertOwnedScopeAccess_(context, scope, ownerUserId, code, message) {
  if (!canAccessOwnedScope_(context, scope, ownerUserId)) {
    throw sbError_(code || "FORBIDDEN_PERSONAL_DATA", message || "Data pribadi ini bukan milik pengguna aktif.", 403);
  }
}

function ownedScopeFromAccount_(account) {
  if (account && account.owner_scope === "personal") {
    return { scope: "personal", owner_user_id: String(account.owner_user_id || "") };
  }
  return { scope: "shared", owner_user_id: "" };
}

function normalizeOwnedScope_(context, payload, fallback) {
  const source = payload || {};
  const defaults = fallback || { scope: "shared", owner_user_id: "" };
  if (source.scope !== undefined && ["personal", "shared"].indexOf(source.scope) === -1) {
    throw sbError_("INVALID_SCOPE", "Scope harus personal atau shared.", 400);
  }
  const scope = source.scope === undefined ? (defaults.scope === "personal" ? "personal" : "shared") : source.scope;
  if (scope === "shared") return { scope: "shared", owner_user_id: "" };
  const requestedOwner = context.actor.role === "owner" && source.owner_user_id
    ? String(source.owner_user_id)
    : String(defaults.owner_user_id || context.actor.user_id);
  activeUser_(requestedOwner);
  return { scope: "personal", owner_user_id: requestedOwner };
}

function enforceAppsScriptRateLimit_(signedActor, action) {
  const key = "rate:" + String(signedActor && signedActor.uid || signedActor && signedActor.email || "unknown") + ":" + Utilities.formatDate(new Date(), SB_TIMEZONE, "yyyyMMddHHmm");
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 90);
  const limit = action === "transactions.list" || action === "dashboard.overview" ? 180 : 100;
  if (count > limit) throw sbError_("RATE_LIMITED", "Terlalu banyak request. Coba lagi sebentar.", 429);
}

function isSystemBootstrapEligible_() {
  if (rows_("Users").length || getConfig_("initialized_at")) return false;
  return Object.keys(SB_SCHEMA).filter(function(sheetName) {
    return ["System_Config", "Users"].indexOf(sheetName) === -1;
  }).every(function(sheetName) { return rows_(sheetName).length === 0; });
}

function resolveActor_(signedActor, action) {
  const email = String(signedActor && signedActor.email || "").toLowerCase();
  let user = findBy_("Users", "email", email);
  if (!user && action === "system.initialize") {
    if (!isSystemBootstrapEligible_()) throw sbError_("ACCOUNT_NOT_ALLOWED", "Bootstrap owner hanya tersedia pada database baru yang belum berisi pengguna atau data bisnis.", 403);
    const record = { user_id: uuid_(), firebase_uid: signedActor.uid, email: email, name: sanitizeText_(signedActor.name || email, 120), role: "owner", status: "active", row_version: 1, created_at: nowIso_(), updated_at: nowIso_() };
    const bootstrapContext = { actor: { user_id: record.user_id, email: record.email }, requestId: "bootstrap:" + uuid_() };
    appendAuditedRow_("Users", "user_id", record, bootstrapContext, "users.bootstrap", "user", null, { email: record.email, name: record.name, role: record.role, status: record.status });
    user = findBy_("Users", "user_id", record.user_id) || record;
  }
  if (!user || user.status !== "active") throw sbError_("ACCOUNT_NOT_ALLOWED", "Akun tidak aktif atau tidak terdaftar.", 403);
  if (String(user.role) !== String(signedActor.role)) throw sbError_("ROLE_MISMATCH", "Role akun berbeda antara allowlist Vercel dan database. Sinkronkan konfigurasi sebelum melanjutkan.", 403);
  assertRoleAction_(user, action);
  if (user.firebase_uid && String(user.firebase_uid) !== String(signedActor.uid)) throw sbError_("IDENTITY_MISMATCH", "UID tidak sesuai allowlist backend.", 403);
  if (!user.firebase_uid) {
    if (action !== "bootstrap.get") {
      throw sbError_("IDENTITY_BIND_REQUIRED", "Identitas akun belum diikat. Muat bootstrap aplikasi terlebih dahulu.", 409);
    }
    const previous = publicRow_(user);
    const updated = Object.assign({}, user, { firebase_uid: signedActor.uid, updated_at: nowIso_(), row_version: rowVersion_(user) + 1 });
    const bindContext = { actor: publicRow_(user), requestId: "identity-bind:" + uuid_() };
    updateAuditedRow_("Users", user, updated, bindContext, "users.identity.bind", "user", user.user_id, { email: previous.email, role: previous.role, status: previous.status }, { email: updated.email, role: updated.role, status: updated.status, identity_bound: true });
    user = updated;
  }
  return publicRow_(user);
}

function resolveRecoveryActor_(signedActor, action) {
  const email = String(signedActor && signedActor.email || "").trim().toLowerCase();
  const uid = String(signedActor && signedActor.uid || "").trim();
  if (!email || !uid || signedActor.role !== "owner") throw sbError_("FORBIDDEN", "Jalur recovery hanya dapat digunakan owner yang terverifikasi oleh backend.", 403);
  if ((SB_ROLE_ACTIONS.owner || []).indexOf(action) === -1) throw sbError_("FORBIDDEN", "Action tidak diizinkan pada jalur recovery.", 403);
  return {
    user_id: "recovery:" + uid, firebase_uid: uid, email: email,
    name: sanitizeText_(signedActor.name || email, 120), role: "owner", status: "active", row_version: 0
  };
}
