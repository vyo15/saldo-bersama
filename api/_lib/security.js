import crypto from "node:crypto";
import { requiresIdempotencyKey } from "./actions/policy.js";
import { RESERVED_TRANSACTION_FIELDS } from "./transactionContract.js";

const SESSION_COOKIE = "sb_session";
const GOOGLE_OAUTH_COOKIE = "sb_google_oauth";
const GOOGLE_OAUTH_MAX_AGE_SECONDS = 5 * 60;
const encoder = (value) => Buffer.from(value).toString("base64url");
const decoder = (value) => Buffer.from(value, "base64url").toString("utf8");

const ROLE_ALIASES = Object.freeze({ administrator: "owner", owner: "owner", member: "member" });
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (value) => EMAIL_PATTERN.test(String(value || "").trim().toLowerCase());
const GOOGLE_PROFILE_PHOTO_PREFIX = "https://lh3.googleusercontent.com/";

const trustedProfilePhotoUrl = (value) => {
  const photoUrl = String(value || "").trim();
  if (!photoUrl || photoUrl.length > 1_024) return "";
  return photoUrl.startsWith(GOOGLE_PROFILE_PHOTO_PREFIX) ? photoUrl : "";
};

export const parseAllowedUsers = (raw = process.env.ALLOWED_USERS_JSON || "[]") => {
  let users;
  try { users = JSON.parse(raw); } catch { throw new Error("ALLOWED_USERS_JSON tidak valid."); }
  if (!Array.isArray(users)) throw new Error("ALLOWED_USERS_JSON harus berupa array.");

  const uniqueUsers = new Map();
  users.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`ALLOWED_USERS_JSON item ke-${index + 1} harus berupa object.`);
    const email = String(item.email || "").trim().toLowerCase();
    const configuredRole = String(item.role || "").trim().toLowerCase();
    const role = ROLE_ALIASES[configuredRole] || "";
    if (!isValidEmail(email)) throw new Error(`ALLOWED_USERS_JSON item ke-${index + 1} memiliki email tidak valid.`);
    if (!role) throw new Error(`ALLOWED_USERS_JSON item ke-${index + 1} memiliki role tidak valid. Gunakan administrator atau member.`);

    const existing = uniqueUsers.get(email);
    if (existing && existing.role !== role) throw new Error(`ALLOWED_USERS_JSON memiliki role konflik untuk ${email}.`);
    if (!existing) uniqueUsers.set(email, { email, role });
  });
  return [...uniqueUsers.values()];
};

export const findAllowedUser = (email) => parseAllowedUsers().find((item) => item.email === String(email || "").toLowerCase()) || null;

const sign = (value, secret) => crypto.createHmac("sha256", secret).update(value).digest("base64url");

const secureCookieSuffix = () => process.env.VERCEL_ENV === "development" ? "" : "; Secure";

const signedCookieToken = (payload, secret) => {
  const encoded = encoder(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
};

const readSignedCookieToken = (token, secret) => {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try { return JSON.parse(decoder(payload)); } catch { return null; }
};

export const normalizeInternalReturnPath = (value) => {
  const candidate = String(value || "/").trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || candidate.length > 1_024) return "/";
  try {
    const parsed = new URL(candidate, "https://saldo-bersama.invalid");
    if (parsed.origin !== "https://saldo-bersama.invalid") return "/";
    if (parsed.pathname === "/api" || parsed.pathname.startsWith("/api/") || parsed.pathname === "/__" || parsed.pathname.startsWith("/__/")) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
};

export const trustedRequestOrigin = (request) => {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(request.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (process.env.VERCEL_ENV === "development" ? "http" : "https");
  const host = forwardedHost || String(request.headers.host || "").trim();
  if (!host || !["http", "https"].includes(protocol)) {
    throw Object.assign(new Error("Origin aplikasi tidak dapat ditentukan."), { status: 403, code: "ORIGIN_UNTRUSTED" });
  }
  const origin = `${protocol}://${host}`;
  const allowed = String(process.env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!allowed.includes(origin)) throw Object.assign(new Error("Origin aplikasi tidak diizinkan."), { status: 403, code: "ORIGIN_DENIED" });
  return origin;
};

export const createGoogleOAuthTransaction = ({ returnTo = "/" } = {}) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET minimal 32 karakter.");
  const state = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(32).toString("base64url");
  const payload = {
    state,
    nonce,
    returnTo: normalizeInternalReturnPath(returnTo),
    exp: Math.floor(Date.now() / 1000) + GOOGLE_OAUTH_MAX_AGE_SECONDS,
  };
  const token = signedCookieToken(payload, secret);
  return {
    ...payload,
    cookie: `${GOOGLE_OAUTH_COOKIE}=${token}; Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=${GOOGLE_OAUTH_MAX_AGE_SECONDS}${secureCookieSuffix()}`,
  };
};

export const readGoogleOAuthTransaction = (request) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const token = parseCookies(request.headers.cookie)[GOOGLE_OAUTH_COOKIE];
  const payload = readSignedCookieToken(token, secret);
  if (!payload?.state || !payload?.nonce || !payload?.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return { ...payload, returnTo: normalizeInternalReturnPath(payload.returnTo) };
};

export const clearGoogleOAuthTransactionCookie = () => `${GOOGLE_OAUTH_COOKIE}=; Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieSuffix()}`;

export const safeEqualText = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const createSessionCookie = (user, { maxAgeSeconds = 43_200 } = {}) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET minimal 32 karakter.");
  const payload = encoder(JSON.stringify({
    uid: user.uid,
    email: user.email,
    name: user.name || user.email,
    photoURL: trustedProfilePhotoUrl(user.photoURL || user.photoUrl || user.picture),
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  }));
  const token = `${payload}.${sign(payload, secret)}`;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secureCookieSuffix()}`;
};

export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookieSuffix()}`;

const parseCookies = (header = "") => Object.fromEntries(header.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
  const separator = part.indexOf("=");
  return [part.slice(0, separator), part.slice(separator + 1)];
}));

export const readSession = (request) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const session = JSON.parse(decoder(payload));
    if (!session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
    const allowed = findAllowedUser(session.email);
    if (!allowed || allowed.role !== session.role) return null;
    return session;
  } catch { return null; }
};

export const assertAllowedOrigin = (request) => {
  const origin = request.headers.origin;
  if (!origin) throw Object.assign(new Error("Origin request wajib diisi."), { status: 403, code: "ORIGIN_REQUIRED" });
  const allowed = String(process.env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!allowed.includes(origin)) throw Object.assign(new Error("Origin tidak diizinkan."), { status: 403, code: "ORIGIN_DENIED" });
};

export const ACTION_PERMISSIONS = Object.freeze({
  owner: new Set([
    "system.health", "app.initialState", "bootstrap.get", "users.list", "users.upsert", "users.deactivate", "users.reactivate", "audit.list", "archive.list", "dashboard.overview",
    "accounts.list", "accounts.create", "accounts.update", "accounts.previewLifecycle", "accounts.archive", "accounts.restore", "accounts.deleteUnused",
    "categories.list", "categories.create", "categories.update", "categories.previewArchive", "categories.archive", "categories.restore", "categories.deleteUnused",
    "transactions.list", "transactions.create", "transactions.update", "transactions.cancel", "transactions.restore",
    "envelopes.list", "envelopes.create", "envelopes.move", "envelopes.close", "envelopes.previewRuleLifecycle", "envelopes.archiveRule", "envelopes.deleteUnusedRule", "envelopes.restoreRule", "envelopes.reverseMovement",
    "recurring.list", "recurring.createRule", "recurring.updateRule", "recurring.previewRuleLifecycle", "recurring.archiveRule", "recurring.deleteUnusedRule", "recurring.cancelOccurrence", "recurring.restoreOccurrence", "recurring.payOccurrence", "recurring.reversePayment", "recurring.restoreRule",
    "budgets.list", "budgets.upsert", "budgets.previewLifecycle", "budgets.archive", "budgets.deleteUnused", "budgets.restore", "goals.list", "goals.create", "goals.update", "goals.previewLifecycle", "goals.archive", "goals.deleteUnused", "goals.move", "goals.reverseMovement", "goals.restore", "reports.monthly",
    "reconciliations.list", "reconciliations.create", "periods.list", "periods.previewClose", "periods.close", "periods.reopen",
    "calendar.sync", "mirror.sync", "mirror.rebuild", "integrations.status",
    "notifications.status", "notifications.preferences", "notifications.updatePreference", "notifications.register", "notifications.unregister", "notifications.test", "backup.create", "import.preview", "import.apply", "restore.preview", "restore.apply", "reset.preview", "reset.status", "reset.apply", "fullReset.preview", "fullReset.status", "fullReset.apply", "integrity.run",
  ]),
  member: new Set([
    "system.health", "app.initialState", "bootstrap.get", "dashboard.overview", "accounts.list", "categories.list",
    "transactions.list", "transactions.create", "transactions.update", "transactions.cancel",
    "envelopes.list", "envelopes.move", "envelopes.reverseMovement", "recurring.list", "recurring.payOccurrence", "recurring.reversePayment",
    "budgets.list", "goals.list", "goals.move", "goals.reverseMovement", "reports.monthly", "reconciliations.list", "reconciliations.create",
    "notifications.status", "notifications.preferences", "notifications.updatePreference", "notifications.register", "notifications.unregister", "notifications.test", "integrations.status",
  ]),
});
export const authorizeAction = (session, action) => Boolean(session && ACTION_PERMISSIONS[session.role]?.has(action));

const assertNoReservedTransactionFields = (payload) => {
  const field = Object.keys(payload || {}).find((key) => RESERVED_TRANSACTION_FIELDS.includes(key));
  if (field) {
    throw Object.assign(new Error(`Field internal transaksi tidak boleh dikirim: ${field}.`), {
      status: 400,
      code: "RESERVED_TRANSACTION_FIELD",
      details: { field },
    });
  }
};

export const assertPayloadAuthorization = (session, action, payload = {}) => {
  if (action === "transactions.create" || action === "transactions.update") {
    assertNoReservedTransactionFields(payload);
    if (session?.role !== "owner" && payload.transaction_type === "adjustment") {
      throw Object.assign(new Error("Penyesuaian saldo hanya dapat dibuat Administrator."), {
        status: 403,
        code: "ADJUSTMENT_OWNER_ONLY",
      });
    }
  }
  if (action === "import.preview" && Array.isArray(payload.records)) {
    payload.records.forEach(assertNoReservedTransactionFields);
  }
};

export { requiresIdempotencyKey };
const buckets = new Map();
const MAX_RATE_LIMIT_BUCKETS = 5_000;

const pruneRateLimitBuckets = (now) => {
  if (buckets.size < 1_000) return;
  for (const [bucketKey, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(bucketKey);
  }
  while (buckets.size >= MAX_RATE_LIMIT_BUCKETS) {
    buckets.delete(buckets.keys().next().value);
  }
};

export const clientRateLimitKey = (request, scope) => {
  const headers = request?.headers || {};
  const forwarded = headers["x-vercel-forwarded-for"]
    ?? headers["x-forwarded-for"]
    ?? headers["x-real-ip"]
    ?? request?.socket?.remoteAddress
    ?? "unknown";
  const firstAddress = String(Array.isArray(forwarded) ? forwarded[0] : forwarded)
    .split(",")[0]
    .trim()
    .slice(0, 200) || "unknown";
  const digest = crypto.createHash("sha256").update(firstAddress).digest("base64url");
  return `${scope}:${digest}`;
};

export const enforceBestEffortRateLimit = (key, { limit = 80, windowMs = 60_000 } = {}) => {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    pruneRateLimitBuckets(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw Object.assign(new Error("Terlalu banyak request. Coba lagi sebentar."), {
      status: 429,
      code: "RATE_LIMITED",
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    });
  }
};

export const identityRateLimitKey = (scope, identity) => {
  const digest = crypto.createHash("sha256").update(String(identity || "unknown")).digest("base64url");
  return `${scope}:${digest}`;
};


export const verifyScheduledJobSignature = (body, { now = Date.now() } = {}) => {
  const secret = String(process.env.JOBS_SHARED_SECRET || "");
  if (secret.length < 32 || !body?.message || !body?.signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(String(body.message)).digest("hex");
  const actual = String(body.signature);
  const a = Buffer.from(expected); const b = Buffer.from(actual);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let message;
  try { message = JSON.parse(body.message); } catch { return null; }
  if (Math.abs(now - Number(message.timestamp || 0)) > 120_000 || !message.nonce) return null;
  return message;
};
