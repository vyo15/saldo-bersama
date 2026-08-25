import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertAllowedOrigin, assertPayloadAuthorization, authorizeAction, clientRateLimitKey, createSessionCookie, enforceBestEffortRateLimit, identityRateLimitKey, isValidEmail, parseAllowedUsers, readSessionCredential } from "../../api/_lib/security.js";
import { normalizeTransaction } from "../../api/_lib/services/finance.js";
import { RESERVED_TRANSACTION_FIELDS } from "../../api/_lib/transactionContract.js";

const withEnv = (values, fn) => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return fn(); } finally { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; }
};

test("validator email server dipakai sebagai predicate canonical", () => {
  assert.equal(isValidEmail(" USER@Example.COM "), true);
  assert.equal(isValidEmail("bukan-email"), false);
  assert.equal(isValidEmail(""), false);
});

test("bootstrap owner config menerima Administrator dan menormalisasinya ke compatibility role internal", () => withEnv({ ALLOWED_USERS_JSON: '[{"email":"Admin@Gmail.com","role":"administrator"}]' }, () => {
  assert.deepEqual(parseAllowedUsers(), [{ email: "admin@gmail.com", role: "owner" }]);
  assert.equal(authorizeAction({ role: "member" }, "backup.create"), false);
  assert.equal(authorizeAction({ role: "owner" }, "backup.create"), true);
  assert.equal(authorizeAction({ role: "member" }, "reset.preview"), false);
  assert.equal(authorizeAction({ role: "member" }, "reset.apply"), false);
  assert.equal(authorizeAction({ role: "member" }, "fullReset.preview"), false);
  assert.equal(authorizeAction({ role: "member" }, "fullReset.status"), false);
  assert.equal(authorizeAction({ role: "member" }, "fullReset.apply"), false);
  assert.equal(authorizeAction({ role: "member" }, "reset.status"), false);
  assert.equal(authorizeAction({ role: "owner" }, "reset.preview"), true);
  assert.equal(authorizeAction({ role: "owner" }, "reset.status"), true);
  assert.equal(authorizeAction({ role: "owner" }, "reset.apply"), true);
  assert.equal(authorizeAction({ role: "owner" }, "fullReset.preview"), true);
  assert.equal(authorizeAction({ role: "owner" }, "fullReset.status"), true);
  assert.equal(authorizeAction({ role: "owner" }, "fullReset.apply"), true);
}));


test("bootstrap owner config menolak role, email, dan konflik duplikat yang invalid", () => {
  assert.deepEqual(parseAllowedUsers('[{"email":"legacy@gmail.com","role":"owner"}]'), [{ email: "legacy@gmail.com", role: "owner" }]);
  assert.throws(() => parseAllowedUsers('[{"email":"user@gmail.com","role":"admin"}]'), /role tidak valid/);
  assert.throws(() => parseAllowedUsers('[{"email":"bukan-email","role":"member"}]'), /email tidak valid/);
  assert.throws(() => parseAllowedUsers('[{"email":"user@gmail.com","role":"owner"},{"email":"USER@gmail.com","role":"member"}]'), /role konflik/);
  assert.deepEqual(parseAllowedUsers('[{"email":"user@gmail.com","role":"member"},{"email":"USER@gmail.com","role":"member"}]'), [{ email: "user@gmail.com", role: "member" }]);
});

test("session cookie v2 hanya membawa credential opaque bertanda tangan, foto Google tepercaya, dan tidak bergantung pada bootstrap env", () => withEnv({
  ALLOWED_USERS_JSON: "not-json-on-purpose",
  SESSION_SECRET: "12345678901234567890123456789012",
  VERCEL_ENV: "development",
}, () => {
  const photoURL = "https://lh3.googleusercontent.com/a/example-profile=s96-c";
  const cookie = createSessionCookie({ sessionId: "session-opaque-123", sessionSecret: "verifier-opaque-456", expiresAt: new Date(Date.now() + 60_000).toISOString(), photoURL });
  const token = cookie.split(";")[0];
  const credential = readSessionCredential({ headers: { cookie: token } });
  assert.equal(credential.sessionId, "session-opaque-123");
  assert.equal(credential.sessionSecret, "verifier-opaque-456");
  assert.equal(credential.photoURL, photoURL);
  assert.doesNotMatch(token, /owner@gmail\.com|\"role\"|\"uid\"/);
}));

test("session cookie tidak mempersist URL foto profil di luar host Google yang diizinkan CSP", () => withEnv({
  SESSION_SECRET: "12345678901234567890123456789012",
  VERCEL_ENV: "development",
}, () => {
  const cookie = createSessionCookie({ sessionId: "session-opaque-123", sessionSecret: "verifier-opaque-456", expiresAt: new Date(Date.now() + 60_000).toISOString(), photoURL: "https://example.com/avatar.jpg" });
  const credential = readSessionCredential({ headers: { cookie: cookie.split(";")[0] } });
  assert.equal(credential.photoURL, "");
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

test("gateway dan export memakai canonical identity key untuk local dan durable rate limit", async () => {
  const [gateway, exportSource] = await Promise.all([
    readFile(new URL("../../api/gateway.js", import.meta.url), "utf8"),
    readFile(new URL("../../api/export.js", import.meta.url), "utf8"),
  ]);
  assert.match(gateway, /const rateLimitKey = identityRateLimitKey\("gateway", session\.uid\)/);
  assert.match(gateway, /enforceBestEffortRateLimit\(rateLimitKey\)/);
  assert.match(gateway, /await enforceDistributedRateLimit\(db, rateLimitKey\)/);
  assert.match(exportSource, /const rateLimitKey = identityRateLimitKey\("export", session\.uid\)/);
  assert.match(exportSource, /enforceBestEffortRateLimit\(rateLimitKey, \{ limit: 5, windowMs: 60_000 \}\)/);
  assert.match(exportSource, /await enforceDistributedRateLimit\(db, rateLimitKey, \{ limit: 5, windowMs: 60_000 \}\)/);
  assert.match(exportSource, /"Retry-After"/);
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

test("CSP dan route OAuth server menjaga login mobile production tanpa Firebase browser redirect", async () => {
  const [vercelSource, envExample, productionAuth, mobileAuth, sessionSource] = await Promise.all([
    readFile(new URL("../../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/services/auth/googleAuthRouting.js", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/services/auth/mobileFirebaseGoogleAuth.js", import.meta.url), "utf8"),
    readFile(new URL("../../api/session.js", import.meta.url), "utf8"),
  ]);
  const vercel = JSON.parse(vercelSource);
  const authDomain = envExample.match(/^VITE_FIREBASE_AUTH_DOMAIN=(.+)$/m)?.[1]?.trim();
  assert.equal(authDomain, "saldo-bersama.firebaseapp.com");
  assert.match(envExample, /^GOOGLE_OAUTH_CLIENT_SECRET=$/m);

  assert.deepEqual(vercel.rewrites?.slice(0, 2), [
    { source: "/api/auth/google/start", destination: "/api/session?flow=google-start" },
    { source: "/api/auth/google/callback", destination: "/api/session?flow=google-callback" },
  ]);
  assert.equal(vercel.rewrites?.some((entry) => String(entry.destination || "").includes("firebaseapp.com/__/auth")), false);

  const appHeaderRule = vercel.headers?.find((entry) => entry.source === "/(.*)");
  assert.ok(appHeaderRule, "security header aplikasi harus kembali berlaku global setelah Firebase auth proxy dipensiunkan");
  const csp = appHeaderRule.headers?.find((header) => header.key === "Content-Security-Policy")?.value || "";
  assert.match(csp, /frame-src[^;]*'self'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.doesNotMatch(csp, /accounts\.google\.com\/gsi\//, "CSP tidak boleh mempertahankan allowance Google GSI yang sudah dipensiunkan");

  assert.match(productionAuth, /SERVER_OAUTH_START_PATH = "\/api\/auth\/google\/start"/);
  assert.match(productionAuth, /window\.location\.assign/);
  assert.doesNotMatch(productionAuth, /@firebase\//);
  assert.doesNotMatch(productionAuth, /GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.match(mobileAuth, /signInWithPopup/);
  assert.doesNotMatch(mobileAuth, /SERVER_OAUTH_START_PATH|window\.location\.assign|signInWithRedirect|getRedirectResult|browserLocalPersistence/);
  assert.doesNotMatch(mobileAuth, /GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.match(sessionSource, /GOOGLE_OAUTH_CLIENT_SECRET/);
  assert.match(sessionSource, /scope: "openid email profile"/);
  assert.match(sessionSource, /nonce: transaction\.nonce/);
  assert.match(sessionSource, /grant_type: "authorization_code"/);
  assert.match(sessionSource, /providerId=google\.com/);
  assert.match(sessionSource, /OAUTH_NETWORK_TIMEOUT_MS/);
  assert.doesNotMatch(sessionSource, /console\.(?:log|error|warn)\(/);
});
