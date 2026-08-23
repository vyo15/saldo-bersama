import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import sessionHandler from "../../api/session.js";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { deactivateUser, listUsers, reactivateUser, resolveLoginIdentity, upsertUser } from "../../api/_lib/services/users.js";
import {
  createGoogleOAuthTransaction,
  normalizeInternalReturnPath,
  readGoogleOAuthTransaction,
  trustedRequestOrigin,
} from "../../api/_lib/security.js";

const originalEnv = {
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  ALLOWED_USERS_JSON: process.env.ALLOWED_USERS_JSON,
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  DATABASE_ENVIRONMENT: process.env.DATABASE_ENVIRONMENT,
  SESSION_SECRET: process.env.SESSION_SECRET,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY,
  VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID,
};

const setTestEnv = () => {
  process.env.ALLOWED_ORIGINS = "https://saldo-bersama.vercel.app,http://localhost:5173";
  process.env.ALLOWED_USERS_JSON = JSON.stringify([{ email: "owner@gmail.com", role: "administrator" }]);
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-oauth-secret-value-at-least-32-chars";
  process.env.DATABASE_ENVIRONMENT = "production";
  process.env.SESSION_SECRET = "session-secret-test-value-at-least-32-characters";
  process.env.VERCEL_ENV = "production";
  process.env.VITE_FIREBASE_API_KEY = "firebase-api-key-test";
  process.env.VITE_GOOGLE_CLIENT_ID = "google-client-id.apps.googleusercontent.com";
};

const restoreEnv = () => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const createResponse = () => {
  const headers = new Map();
  return {
    statusCode: 0,
    body: "",
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    end(value = "") { this.body += String(value || ""); },
    header(name) { return headers.get(String(name).toLowerCase()); },
  };
};

const cookiePair = (setCookie) => String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0];
const fakeJwt = (payload) => [
  Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify(payload)).toString("base64url"),
  "signature",
].join(".");

const requestHeaders = (extra = {}) => ({
  host: "saldo-bersama.vercel.app",
  "x-forwarded-host": "saldo-bersama.vercel.app",
  "x-forwarded-proto": "https",
  "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
  ...extra,
});

const createProductionDatabase = async () => {
  const db = await createSqliteTestDatabase();
  await db.execute("UPDATE system_config SET value='production' WHERE key='database_environment'");
  return db;
};

const jsonRequest = ({ body, headers = {}, url = "/api/session", database = null }) => ({
  method: "POST",
  database,
  headers: requestHeaders({ origin: "https://saldo-bersama.vercel.app", ...headers }),
  url,
  async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); },
});

test.afterEach(() => {
  restoreEnv();
});

test("OAuth transaction cookie ditandatangani, short-lived, SameSite=Lax, dan returnTo dibatasi internal", () => {
  setTestEnv();
  const transaction = createGoogleOAuthTransaction({ returnTo: "/transaksi?periode=2026-08" });
  assert.match(transaction.cookie, /^sb_google_oauth=/);
  assert.match(transaction.cookie, /Path=\/api\/auth\/google\/callback/);
  assert.match(transaction.cookie, /HttpOnly/);
  assert.match(transaction.cookie, /SameSite=Lax/);
  assert.match(transaction.cookie, /Secure/);
  assert.equal(transaction.returnTo, "/transaksi?periode=2026-08");

  const request = { headers: { cookie: cookiePair(transaction.cookie) } };
  const restored = readGoogleOAuthTransaction(request);
  assert.equal(restored.state, transaction.state);
  assert.equal(restored.nonce, transaction.nonce);
  assert.ok(restored.codeVerifier);
  assert.equal(crypto.createHash("sha256").update(restored.codeVerifier).digest("base64url"), transaction.codeChallenge);
  assert.equal(restored.returnTo, "/transaksi?periode=2026-08");

  const tampered = `${cookiePair(transaction.cookie)}x`;
  assert.equal(readGoogleOAuthTransaction({ headers: { cookie: tampered } }), null);
  assert.equal(normalizeInternalReturnPath("https://evil.example/steal"), "/");
  assert.equal(normalizeInternalReturnPath("//evil.example/steal"), "/");
  assert.equal(normalizeInternalReturnPath("/api/session"), "/");
  assert.equal(normalizeInternalReturnPath("/__\/auth"), "/");
});

test("trustedRequestOrigin hanya menerima host yang ada di ALLOWED_ORIGINS", () => {
  setTestEnv();
  assert.equal(trustedRequestOrigin({ headers: requestHeaders() }), "https://saldo-bersama.vercel.app");
  assert.throws(
    () => trustedRequestOrigin({ headers: requestHeaders({ host: "evil.example", "x-forwarded-host": "evil.example" }) }),
    (error) => error.code === "ORIGIN_DENIED",
  );
});

test("server-side Google OAuth membuat Firebase-backed session dari registry user backend tanpa browser redirect state", async () => {
  setTestEnv();
  const originalFetch = globalThis.fetch;
  const db = await createProductionDatabase();
  try {
    const startResponse = createResponse();
    await sessionHandler({
      method: "GET",
      headers: requestHeaders({ "x-forwarded-for": "203.0.113.21" }),
      query: { flow: "google-start", returnTo: "/transaksi" },
      url: "/api/session?flow=google-start&returnTo=%2Ftransaksi",
    }, startResponse);

    assert.equal(startResponse.statusCode, 302);
    const authorizeUrl = new URL(startResponse.header("location"));
    assert.equal(authorizeUrl.origin, "https://accounts.google.com");
    assert.equal(authorizeUrl.searchParams.get("response_type"), "code");
    assert.equal(authorizeUrl.searchParams.get("scope"), "openid email profile");
    assert.equal(authorizeUrl.searchParams.get("redirect_uri"), "https://saldo-bersama.vercel.app/api/auth/google/callback");
    assert.equal(authorizeUrl.searchParams.has("client_secret"), false);
    assert.ok(authorizeUrl.searchParams.get("state"));
    assert.ok(authorizeUrl.searchParams.get("nonce"));
    assert.equal(authorizeUrl.searchParams.get("code_challenge_method"), "S256");
    assert.ok(authorizeUrl.searchParams.get("code_challenge"));
    assert.equal(startResponse.header("referrer-policy"), "no-referrer");

    const googleIdToken = fakeJwt({
      aud: process.env.VITE_GOOGLE_CLIENT_ID,
      iss: "https://accounts.google.com",
      nonce: authorizeUrl.searchParams.get("nonce"),
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    const fetchCalls = [];
    globalThis.fetch = async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      if (String(url) === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ id_token: googleIdToken }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (String(url).startsWith("https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp")) {
        return new Response(JSON.stringify({ idToken: "firebase-id-token" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (String(url).startsWith("https://identitytoolkit.googleapis.com/v1/accounts:lookup")) {
        return new Response(JSON.stringify({ users: [{
          localId: "uid-owner",
          email: "owner@gmail.com",
          emailVerified: true,
          displayName: "Owner",
          photoUrl: "https://lh3.googleusercontent.com/avatar",
        }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const callbackResponse = createResponse();
    await sessionHandler({
      method: "GET",
      database: db,
      headers: requestHeaders({
        cookie: cookiePair(startResponse.header("set-cookie")),
        "x-forwarded-for": "203.0.113.22",
      }),
      query: {
        flow: "google-callback",
        state: authorizeUrl.searchParams.get("state"),
        code: "authorization-code",
      },
      url: `/api/session?flow=google-callback&state=${encodeURIComponent(authorizeUrl.searchParams.get("state"))}&code=authorization-code`,
    }, callbackResponse);

    assert.equal(callbackResponse.statusCode, 303);
    assert.equal(callbackResponse.header("location"), "/transaksi");
    const setCookies = callbackResponse.header("set-cookie");
    assert.ok(Array.isArray(setCookies));
    assert.equal(setCookies.some((value) => String(value).startsWith("sb_google_oauth=;")), true);
    assert.equal(setCookies.some((value) => String(value).startsWith("sb_session=")), true);
    assert.equal(fetchCalls.length, 3);

    const tokenRequest = new URLSearchParams(String(fetchCalls[0].options.body));
    assert.equal(tokenRequest.get("grant_type"), "authorization_code");
    assert.equal(tokenRequest.get("redirect_uri"), "https://saldo-bersama.vercel.app/api/auth/google/callback");
    assert.equal(tokenRequest.get("client_secret"), process.env.GOOGLE_OAUTH_CLIENT_SECRET);
    assert.ok(tokenRequest.get("code_verifier"));
    assert.equal(crypto.createHash("sha256").update(tokenRequest.get("code_verifier")).digest("base64url"), authorizeUrl.searchParams.get("code_challenge"));
    const firebaseRequest = JSON.parse(fetchCalls[1].options.body);
    assert.equal(firebaseRequest.requestUri, "https://saldo-bersama.vercel.app");
    assert.match(firebaseRequest.postBody, /providerId=google\.com/);

    const sessionCookie = setCookies.find((value) => String(value).startsWith("sb_session="));
    const readResponse = createResponse();
    await sessionHandler({
      method: "GET",
      database: db,
      headers: requestHeaders({ cookie: cookiePair(sessionCookie), "x-forwarded-for": "203.0.113.23" }),
      query: {},
      url: "/api/session",
    }, readResponse);
    assert.equal(readResponse.statusCode, 200);
    const body = JSON.parse(readResponse.body);
    assert.equal(body.data.email, "owner@gmail.com");
    assert.equal(body.data.role, "owner");
    const stored = await db.one("SELECT session_id,verifier_hash FROM user_sessions");
    assert.equal(stored.verifier_hash.length, 64);
    assert.doesNotMatch(String(sessionCookie), new RegExp(stored.verifier_hash));
    const canonical = await db.one("SELECT email,role,status,firebase_uid FROM users WHERE email=? COLLATE NOCASE", ["owner@gmail.com"]);
    assert.deepEqual({ ...canonical }, { email: "owner@gmail.com", role: "owner", status: "active", firebase_uid: "uid-owner" });
    assert.ok(await db.one("SELECT audit_id FROM audit_log WHERE action='bootstrap.owner' AND actor_email='owner@gmail.com'"));
  } finally {
    db.close();
    globalThis.fetch = originalFetch;
  }
});

const userActionContext = (actor, action, payload = {}, rowVersion = null) => ({
  actor,
  signedActor: { uid: actor.firebase_uid, email: actor.email, name: actor.name, role: actor.role },
  action,
  payload,
  rowVersion,
  requestId: `session-oauth:${action}:${payload.user_id || payload.email || actor.user_id}`,
  idempotencyKey: `session-oauth:${action}:${payload.user_id || payload.email || actor.user_id}`,
});

test("anggota yang dibuat Administrator dapat login tanpa ditambahkan ke ALLOWED_USERS_JSON", async () => {
  setTestEnv();
  const originalFetch = globalThis.fetch;
  const db = await createProductionDatabase();
  try {
    const now = new Date().toISOString();
    await db.execute(
      "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      ["member-db", null, "partner@gmail.com", "Partner", "member", "active", 1, now, now],
    );
    process.env.ALLOWED_USERS_JSON = JSON.stringify([{ email: "owner@gmail.com", role: "administrator" }]);
    globalThis.fetch = async (url) => {
      if (String(url).startsWith("https://identitytoolkit.googleapis.com/v1/accounts:lookup")) {
        return new Response(JSON.stringify({ users: [{
          localId: "uid-partner",
          email: "partner@gmail.com",
          emailVerified: true,
          displayName: "Partner Google",
        }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const loginResponse = createResponse();
    await sessionHandler(jsonRequest({
      body: { action: "login", firebaseIdToken: "firebase-token-member" },
      headers: { "x-forwarded-for": "203.0.113.27" },
      database: db,
    }), loginResponse);

    assert.equal(loginResponse.statusCode, 200);
    const body = JSON.parse(loginResponse.body);
    assert.equal(body.data.email, "partner@gmail.com");
    assert.equal(body.data.role, "member");
    assert.match(String(loginResponse.header("set-cookie")), /^sb_session=/);
    const canonical = await db.one("SELECT firebase_uid,row_version FROM users WHERE user_id='member-db'");
    assert.equal(canonical.firebase_uid, "uid-partner");
    assert.equal(Number(canonical.row_version), 2);
    const bindAudit = await db.one("SELECT action,actor_email,new_value FROM audit_log WHERE action='identity.firebase.bind' AND entity_id='member-db'");
    assert.equal(bindAudit?.actor_email, "partner@gmail.com");
    assert.doesNotMatch(String(bindAudit?.new_value || ""), /uid-partner|firebase_uid/i, "audit binding tidak boleh menyimpan Firebase UID");
  } finally {
    db.close();
    globalThis.fetch = originalFetch;
  }
});

test("provisioning anggota menjaga pending state, role, deaktivasi, konflik identitas, dan audit tanpa UID", async () => {
  setTestEnv();
  const db = await createSqliteTestDatabase();
  try {
    const now = new Date().toISOString();
    const owner = {
      user_id: "owner-db",
      firebase_uid: "uid-owner-db",
      email: "owner@gmail.com",
      name: "Owner",
      role: "owner",
      status: "active",
      row_version: 1,
      created_at: now,
      updated_at: now,
    };
    await db.execute(
      "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      Object.values(owner),
    );
    process.env.ALLOWED_USERS_JSON = JSON.stringify([{ email: owner.email, role: "administrator" }]);

    const created = await upsertUser(db, userActionContext(owner, "users.upsert", {
      email: "partner@gmail.com",
      name: "Partner",
      role: "member",
    }));
    assert.equal(created.identity_status, "pending");
    assert.equal(created.role, "member");
    assert.equal("firebase_uid" in created, false);

    const pendingList = await listUsers(db, userActionContext(owner, "users.list"));
    const pending = pendingList.items.find((item) => item.email === "partner@gmail.com");
    assert.equal(pending?.identity_status, "pending");
    assert.equal("firebase_uid" in pending, false);

    const linked = await resolveLoginIdentity(db, {
      uid: "uid-partner-db",
      email: "partner@gmail.com",
      name: "Partner Google",
    }, { requestId: "session-oauth:member-first-login" });
    assert.equal(linked.role, "member");
    assert.equal("firebase_uid" in linked, false);

    const canonicalAfterBind = await db.one("SELECT user_id,firebase_uid,row_version FROM users WHERE email=? COLLATE NOCASE", ["partner@gmail.com"]);
    assert.equal(canonicalAfterBind.firebase_uid, "uid-partner-db");
    assert.equal(Number(canonicalAfterBind.row_version), 2);

    const edited = await upsertUser(db, userActionContext(owner, "users.upsert", {
      email: "partner@gmail.com",
      name: "Partner Baru",
      role: "member",
      row_version: 2,
    }, 2));
    assert.equal(edited.name, "Partner Baru");
    assert.equal(edited.identity_status, "linked");
    assert.equal("firebase_uid" in edited, false);

    const upsertAudits = await db.all("SELECT previous_value,new_value FROM audit_log WHERE action='users.upsert' AND entity_id=?", [created.user_id]);
    assert.equal(upsertAudits.length, 2);
    for (const audit of upsertAudits) {
      assert.doesNotMatch(`${audit.previous_value || ""}${audit.new_value || ""}`, /uid-partner-db|firebase_uid/i);
    }

    await assert.rejects(
      resolveLoginIdentity(db, { uid: "uid-other", email: "partner@gmail.com", name: "Partner" }),
      (error) => error.code === "IDENTITY_CONFLICT" && error.status === 409,
    );

    await assert.rejects(
      upsertUser(db, userActionContext(owner, "users.upsert", {
        email: owner.email,
        name: owner.name,
        role: "member",
        row_version: 1,
      }, 1)),
      (error) => error.code === "SELF_ROLE_CHANGE_DENIED" && error.status === 409,
    );

    const deactivated = await deactivateUser(db, userActionContext(owner, "users.deactivate", {
      user_id: created.user_id,
      row_version: 3,
      reason: "Uji penonaktifan akun",
    }, 3));
    assert.equal(deactivated.status, "inactive");
    assert.equal("firebase_uid" in deactivated, false);
    await assert.rejects(
      resolveLoginIdentity(db, { uid: "uid-partner-db", email: "partner@gmail.com", name: "Partner" }),
      (error) => error.code === "ACCOUNT_INACTIVE" && error.status === 403,
    );

    const reactivated = await reactivateUser(db, userActionContext(owner, "users.reactivate", {
      user_id: created.user_id,
      row_version: 4,
      reason: "Uji pemulihan akses",
    }, 4));
    assert.equal(reactivated.status, "active");
    assert.equal("firebase_uid" in reactivated, false);

    const relogin = await resolveLoginIdentity(db, { uid: "uid-partner-db", email: "partner@gmail.com", name: "Partner" });
    assert.equal(relogin.role, "member");
    const bindAudits = await db.one("SELECT COUNT(*) AS count FROM audit_log WHERE action='identity.firebase.bind' AND entity_id=?", [created.user_id]);
    assert.equal(Number(bindAudits.count), 1, "UID yang sudah terikat tidak boleh menghasilkan audit bind duplikat");
  } finally {
    db.close();
  }
});

test("callback OAuth fail closed saat state tidak cocok dan tidak menukar code", async () => {
  setTestEnv();
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error("should not fetch"); };
  try {
    const transaction = createGoogleOAuthTransaction({ returnTo: "/" });
    const response = createResponse();
    await sessionHandler({
      method: "GET",
      headers: requestHeaders({ cookie: cookiePair(transaction.cookie), "x-forwarded-for": "203.0.113.24" }),
      query: { flow: "google-callback", state: "tampered", code: "authorization-code" },
      url: "/api/session?flow=google-callback&state=tampered&code=authorization-code",
    }, response);
    assert.equal(response.statusCode, 303);
    assert.equal(response.header("location"), "/login?authError=failed");
    assert.equal(fetchCalled, false);
    assert.match(String(response.header("set-cookie")), /sb_google_oauth=;/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("callback OAuth menolak nonce Google yang tidak cocok sebelum Firebase exchange", async () => {
  setTestEnv();
  const originalFetch = globalThis.fetch;
  try {
    const transaction = createGoogleOAuthTransaction({ returnTo: "/" });
    const googleIdToken = fakeJwt({
      aud: process.env.VITE_GOOGLE_CLIENT_ID,
      iss: "https://accounts.google.com",
      nonce: "wrong-nonce",
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ id_token: googleIdToken }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const response = createResponse();
    await sessionHandler({
      method: "GET",
      headers: requestHeaders({ cookie: cookiePair(transaction.cookie), "x-forwarded-for": "203.0.113.25" }),
      query: { flow: "google-callback", state: transaction.state, code: "authorization-code" },
      url: `/api/session?flow=google-callback&state=${encodeURIComponent(transaction.state)}&code=authorization-code`,
    }, response);
    assert.equal(response.statusCode, 303);
    assert.equal(response.header("location"), "/login?authError=failed");
    assert.deepEqual(calls, ["https://oauth2.googleapis.com/token"]);
    assert.equal((Array.isArray(response.header("set-cookie")) ? response.header("set-cookie") : [response.header("set-cookie")])
      .some((value) => String(value).startsWith("sb_session=")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OAuth production gagal aman bila client secret belum tersedia", async () => {
  setTestEnv();
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const response = createResponse();
  await sessionHandler({
    method: "GET",
    headers: requestHeaders({ "x-forwarded-for": "203.0.113.26" }),
    query: { flow: "google-start" },
    url: "/api/session?flow=google-start",
  }, response);
  assert.equal(response.statusCode, 303);
  assert.equal(response.header("location"), "/login?authError=config");
  assert.match(String(response.header("set-cookie")), /sb_google_oauth=;/);
});
