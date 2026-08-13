import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertAllowedOrigin, assertPayloadAuthorization, authorizeAction, clientRateLimitKey, createSessionCookie, enforceBestEffortRateLimit, identityRateLimitKey, parseAllowedUsers, readSession } from "../../api/_lib/security.js";
import { normalizeTransaction } from "../../api/_lib/services/finance.js";
import { RESERVED_TRANSACTION_FIELDS } from "../../api/_lib/transactionContract.js";

const withEnv = (values, fn) => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return fn(); } finally { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; }
};

test("allowlist menerima Administrator dan menormalisasinya ke compatibility role internal", () => withEnv({ ALLOWED_USERS_JSON: '[{"email":"Admin@Gmail.com","role":"administrator"}]' }, () => {
  assert.deepEqual(parseAllowedUsers(), [{ email: "admin@gmail.com", role: "owner" }]);
  assert.equal(authorizeAction({ role: "member" }, "backup.create"), false);
  assert.equal(authorizeAction({ role: "owner" }, "backup.create"), true);
  assert.equal(authorizeAction({ role: "member" }, "reset.preview"), false);
  assert.equal(authorizeAction({ role: "member" }, "reset.apply"), false);
  assert.equal(authorizeAction({ role: "member" }, "reset.status"), false);
  assert.equal(authorizeAction({ role: "owner" }, "reset.preview"), true);
  assert.equal(authorizeAction({ role: "owner" }, "reset.status"), true);
  assert.equal(authorizeAction({ role: "owner" }, "reset.apply"), true);
}));


test("allowlist menolak role, email, dan konflik duplikat yang invalid", () => {
  assert.deepEqual(parseAllowedUsers('[{"email":"legacy@gmail.com","role":"owner"}]'), [{ email: "legacy@gmail.com", role: "owner" }]);
  assert.throws(() => parseAllowedUsers('[{"email":"user@gmail.com","role":"admin"}]'), /role tidak valid/);
  assert.throws(() => parseAllowedUsers('[{"email":"bukan-email","role":"member"}]'), /email tidak valid/);
  assert.throws(() => parseAllowedUsers('[{"email":"user@gmail.com","role":"owner"},{"email":"USER@gmail.com","role":"member"}]'), /role konflik/);
  assert.deepEqual(parseAllowedUsers('[{"email":"user@gmail.com","role":"member"},{"email":"USER@gmail.com","role":"member"}]'), [{ email: "user@gmail.com", role: "member" }]);
});

test("session cookie ditandatangani dan dapat diverifikasi", () => withEnv({
  ALLOWED_USERS_JSON: '[{"email":"owner@gmail.com","role":"administrator"}]',
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

test("identity rate-limit key memakai scope dan hash tanpa membocorkan UID", () => {
  const uid = "firebase-uid-sensitive-example";
  const gatewayKey = identityRateLimitKey("gateway", uid);
  const exportKey = identityRateLimitKey("export", uid);
  assert.match(gatewayKey, /^gateway:[A-Za-z0-9_-]+$/);
  assert.match(exportKey, /^export:[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(gatewayKey, /firebase-uid-sensitive-example/);
  assert.doesNotMatch(exportKey, /firebase-uid-sensitive-example/);
  assert.notEqual(gatewayKey, exportKey);
});

test("gateway dan export memakai canonical identity rate-limit key", async () => {
  const [gateway, exportSource] = await Promise.all([
    readFile(new URL("../../api/gateway.js", import.meta.url), "utf8"),
    readFile(new URL("../../api/export.js", import.meta.url), "utf8"),
  ]);
  assert.match(gateway, /enforceBestEffortRateLimit\(identityRateLimitKey\("gateway", session\.uid\)\)/);
  assert.match(exportSource, /enforceBestEffortRateLimit\(identityRateLimitKey\("export", session\.uid\), \{ limit: 5, windowMs: 60_000 \}\)/);
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

test("reserved transaction field contract dijaga konsisten di gateway dan finance service", async () => {
  for (const field of RESERVED_TRANSACTION_FIELDS) {
    assert.throws(
      () => assertPayloadAuthorization({ role: "owner" }, "transactions.create", { transaction_type: "expense", [field]: "forged" }),
      (error) => error.code === "RESERVED_TRANSACTION_FIELD" && error.details.field === field,
      `gateway harus menolak reserved field ${field}`,
    );
    await assert.rejects(
      normalizeTransaction({}, { actor: { role: "owner" } }, { transaction_type: "expense", [field]: "forged" }),
      (error) => error.code === "RESERVED_TRANSACTION_FIELD" && error.details.field === field,
      `finance service harus menolak reserved field ${field}`,
    );
  }
});
