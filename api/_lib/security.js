import crypto from "node:crypto";
import { requiresIdempotencyKey } from "./actions/policy.js";

const SESSION_COOKIE = "sb_session";
const encoder = (value) => Buffer.from(value).toString("base64url");
const decoder = (value) => Buffer.from(value, "base64url").toString("utf8");

const ALLOWED_ROLES = new Set(["owner", "member"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const parseAllowedUsers = (raw = process.env.ALLOWED_USERS_JSON || "[]") => {
  let users;
  try { users = JSON.parse(raw); } catch { throw new Error("ALLOWED_USERS_JSON tidak valid."); }
  if (!Array.isArray(users)) throw new Error("ALLOWED_USERS_JSON harus berupa array.");

  const uniqueUsers = new Map();
  users.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`ALLOWED_USERS_JSON item ke-${index + 1} harus berupa object.`);
    const email = String(item.email || "").trim().toLowerCase();
    const role = String(item.role || "").trim();
    if (!EMAIL_PATTERN.test(email)) throw new Error(`ALLOWED_USERS_JSON item ke-${index + 1} memiliki email tidak valid.`);
    if (!ALLOWED_ROLES.has(role)) throw new Error(`ALLOWED_USERS_JSON item ke-${index + 1} memiliki role tidak valid.`);

    const existing = uniqueUsers.get(email);
    if (existing && existing.role !== role) throw new Error(`ALLOWED_USERS_JSON memiliki role konflik untuk ${email}.`);
    if (!existing) uniqueUsers.set(email, { email, role });
  });
  return [...uniqueUsers.values()];
};

export const findAllowedUser = (email) => parseAllowedUsers().find((item) => item.email === String(email || "").toLowerCase()) || null;

const sign = (value, secret) => crypto.createHmac("sha256", secret).update(value).digest("base64url");

export const createSessionCookie = (user, { maxAgeSeconds = 43_200 } = {}) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET minimal 32 karakter.");
  const payload = encoder(JSON.stringify({
    uid: user.uid,
    email: user.email,
    name: user.name || user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  }));
  const token = `${payload}.${sign(payload, secret)}`;
  const secure = process.env.VERCEL_ENV === "development" ? "" : "; Secure";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
};

export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.VERCEL_ENV === "development" ? "" : "; Secure"}`;

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
    "system.health", "app.initialState", "bootstrap.get", "users.list", "users.upsert", "users.deactivate", "audit.list", "dashboard.overview",
    "accounts.list", "accounts.create", "accounts.update", "accounts.archive",
    "categories.list", "categories.create", "categories.update", "categories.archive",
    "transactions.list", "transactions.create", "transactions.update", "transactions.cancel",
    "envelopes.list", "envelopes.create", "envelopes.move", "envelopes.close",
    "recurring.list", "recurring.createRule", "recurring.updateRule", "recurring.payOccurrence", "recurring.reversePayment",
    "budgets.list", "budgets.upsert", "budgets.archive", "goals.list", "goals.create", "goals.update", "goals.move", "goals.reverseMovement", "reports.monthly",
    "reconciliations.list", "reconciliations.create", "periods.list", "periods.close", "periods.reopen",
    "calendar.sync", "mirror.sync", "mirror.rebuild", "integrations.status",
    "notifications.register", "notifications.unregister", "backup.create", "import.preview", "import.apply", "restore.preview", "restore.apply", "integrity.run",
  ]),
  member: new Set([
    "system.health", "app.initialState", "bootstrap.get", "dashboard.overview", "accounts.list", "categories.list",
    "transactions.list", "transactions.create", "transactions.update", "transactions.cancel",
    "envelopes.list", "envelopes.move", "recurring.list", "recurring.payOccurrence", "recurring.reversePayment",
    "budgets.list", "goals.list", "goals.move", "goals.reverseMovement", "reports.monthly", "reconciliations.list", "reconciliations.create",
    "notifications.register", "notifications.unregister", "integrations.status",
  ]),
});
export const authorizeAction = (session, action) => Boolean(session && ACTION_PERMISSIONS[session.role]?.has(action));

const RESERVED_TRANSACTION_FIELDS = new Set([
  "recurring_occurrence_id",
  "goal_id",
  "scope",
  "owner_user_id",
  "idempotency_key",
  "created_by",
  "created_at",
  "updated_by",
  "updated_at",
  "cancelled_by",
  "cancelled_at",
  "cancellation_reason",
  "status",
]);

const assertNoReservedTransactionFields = (payload) => {
  const field = Object.keys(payload || {}).find((key) => RESERVED_TRANSACTION_FIELDS.has(key));
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
      throw Object.assign(new Error("Penyesuaian saldo hanya dapat dibuat owner."), {
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
