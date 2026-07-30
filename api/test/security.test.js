import test from "node:test";
import assert from "node:assert/strict";
import { assertAllowedOrigin, assertPayloadAuthorization, authorizeAction, clientRateLimitKey, createSessionCookie, enforceBestEffortRateLimit, parseAllowedUsers, readSession } from "../_lib/security.js";

const withEnv = (values, fn) => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return fn(); } finally { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; }
};

test("allowlist memetakan role secara deny by default", () => withEnv({ ALLOWED_USERS_JSON: '[{"email":"Owner@Gmail.com","role":"owner"}]' }, () => {
  assert.deepEqual(parseAllowedUsers(), [{ email: "owner@gmail.com", role: "owner" }]);
  assert.equal(authorizeAction({ role: "member" }, "backup.create"), false);
  assert.equal(authorizeAction({ role: "owner" }, "backup.create"), true);
}));


test("allowlist menolak role, email, dan konflik duplikat yang invalid", () => {
  assert.throws(() => parseAllowedUsers('[{"email":"user@gmail.com","role":"admin"}]'), /role tidak valid/);
  assert.throws(() => parseAllowedUsers('[{"email":"bukan-email","role":"member"}]'), /email tidak valid/);
  assert.throws(() => parseAllowedUsers('[{"email":"user@gmail.com","role":"owner"},{"email":"USER@gmail.com","role":"member"}]'), /role konflik/);
  assert.deepEqual(parseAllowedUsers('[{"email":"user@gmail.com","role":"member"},{"email":"USER@gmail.com","role":"member"}]'), [{ email: "user@gmail.com", role: "member" }]);
});

test("session cookie ditandatangani dan dapat diverifikasi", () => withEnv({
  ALLOWED_USERS_JSON: '[{"email":"owner@gmail.com","role":"owner"}]',
  SESSION_SECRET: "12345678901234567890123456789012",
  VERCEL_ENV: "development",
}, () => {
  const cookie = createSessionCookie({ uid: "u1", email: "owner@gmail.com", role: "owner", name: "Owner" });
  const token = cookie.split(";")[0];
  const session = readSession({ headers: { cookie: token } });
  assert.equal(session.uid, "u1");
  assert.equal(session.role, "owner");
}));


test("origin wajib ada dan harus termasuk allowlist", () => withEnv({
  ALLOWED_ORIGINS: "http://localhost:5173,https://saldo-bersama.vercel.app",
}, () => {
  assert.doesNotThrow(() => assertAllowedOrigin({ headers: { origin: "http://localhost:5173" } }));
  assert.throws(() => assertAllowedOrigin({ headers: {} }), (error) => error.code === "ORIGIN_REQUIRED");
  assert.throws(() => assertAllowedOrigin({ headers: { origin: "https://evil.example" } }), (error) => error.code === "ORIGIN_DENIED");
}));

test("rate limit login memakai IP Vercel yang di-hash dan menolak request berlebih", () => {
  const request = {
    headers: {
      "x-vercel-forwarded-for": "203.0.113.10",
      "x-forwarded-for": "198.51.100.20",
    },
  };
  const key = clientRateLimitKey(request, `session:test:${Date.now()}`);
  assert.match(key, /^session:test:\d+:[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(key, /203\.0\.113\.10/);
  assert.doesNotThrow(() => enforceBestEffortRateLimit(key, { limit: 1 }));
  assert.throws(
    () => enforceBestEffortRateLimit(key, { limit: 1 }),
    (error) => error.code === "RATE_LIMITED" && error.status === 429,
  );
});

test("gateway menolak adjustment member dan field transaksi internal", () => {
  assert.throws(
    () => assertPayloadAuthorization({ role: "member" }, "transactions.create", { transaction_type: "adjustment" }),
    (error) => error.code === "ADJUSTMENT_OWNER_ONLY" && error.status === 403,
  );
  assert.throws(
    () => assertPayloadAuthorization({ role: "owner" }, "transactions.create", { transaction_type: "expense", recurring_occurrence_id: "forged" }),
    (error) => error.code === "RESERVED_TRANSACTION_FIELD" && error.details.field === "recurring_occurrence_id",
  );
  assert.throws(
    () => assertPayloadAuthorization({ role: "owner" }, "import.preview", { records: [{ transaction_type: "expense", scope: "personal" }] }),
    (error) => error.code === "RESERVED_TRANSACTION_FIELD" && error.details.field === "scope",
  );
});
