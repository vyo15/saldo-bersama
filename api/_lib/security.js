import crypto from "node:crypto";

const SESSION_COOKIE = "sb_session";
const encoder = (value) => Buffer.from(value).toString("base64url");
const decoder = (value) => Buffer.from(value, "base64url").toString("utf8");

export const parseAllowedUsers = (raw = process.env.ALLOWED_USERS_JSON || "[]") => {
  let users;
  try { users = JSON.parse(raw); } catch { throw new Error("ALLOWED_USERS_JSON tidak valid."); }
  if (!Array.isArray(users)) throw new Error("ALLOWED_USERS_JSON harus berupa array.");
  return users.map((item) => ({ email: String(item.email || "").trim().toLowerCase(), role: item.role === "owner" ? "owner" : "member" })).filter((item) => item.email);
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
    "system.initialize", "system.health", "bootstrap.get", "users.list", "users.upsert", "users.deactivate", "audit.list", "dashboard.overview",
    "accounts.list", "accounts.create", "accounts.update", "accounts.archive",
    "categories.list", "categories.create", "categories.update", "categories.archive",
    "transactions.list", "transactions.create", "transactions.update", "transactions.cancel",
    "envelopes.list", "envelopes.createRule", "envelopes.createPeriod", "envelopes.move", "envelopes.close",
    "recurring.list", "recurring.createRule", "recurring.updateRule", "recurring.payOccurrence",
    "budgets.list", "budgets.upsert", "goals.list", "goals.create", "goals.move", "reports.monthly",
    "reconciliations.create", "periods.close", "periods.reopen", "calendar.sync",
    "notifications.register", "notifications.unregister", "backup.create", "export.create", "import.preview", "import.apply", "restore.preview", "restore.apply", "integrity.run",
  ]),
  member: new Set([
    "system.health", "bootstrap.get", "dashboard.overview", "accounts.list", "categories.list",
    "transactions.list", "transactions.create", "transactions.update", "transactions.cancel",
    "envelopes.list", "envelopes.move", "recurring.list", "recurring.payOccurrence",
    "budgets.list", "goals.list", "goals.move", "reports.monthly", "reconciliations.create",
    "notifications.register", "notifications.unregister",
  ]),
});

export const authorizeAction = (session, action) => Boolean(session && ACTION_PERMISSIONS[session.role]?.has(action));

const buckets = new Map();
export const enforceBestEffortRateLimit = (key, { limit = 80, windowMs = 60_000 } = {}) => {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) throw Object.assign(new Error("Terlalu banyak request. Coba lagi sebentar."), { status: 429, code: "RATE_LIMITED" });
};

export const createInternalEnvelope = ({ actor, action, payload, requestId, idempotencyKey, rowVersion }) => {
  const secret = process.env.INTERNAL_SHARED_SECRET;
  if (!secret || secret.length < 32) throw new Error("INTERNAL_SHARED_SECRET minimal 32 karakter.");
  const message = JSON.stringify({
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
    actor,
    action,
    payload: payload || {},
    requestId,
    idempotencyKey: idempotencyKey || null,
    rowVersion: rowVersion ?? null,
  });
  return { message, signature: crypto.createHmac("sha256", secret).update(message).digest("hex") };
};

export const verifyInternalPushSignature = (body) => {
  const secret = process.env.INTERNAL_SHARED_SECRET;
  if (!secret || !body?.message || !body?.signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(body.message).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(body.signature));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const message = JSON.parse(body.message);
  if (Math.abs(Date.now() - Number(message.timestamp || 0)) > 120_000) return null;
  return message;
};
