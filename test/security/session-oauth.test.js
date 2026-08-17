import assert from "node:assert/strict";
import test from "node:test";
import sessionHandler from "../../api/session.js";
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
  SESSION_SECRET: process.env.SESSION_SECRET,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY,
  VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID,
};

const setTestEnv = () => {
  process.env.ALLOWED_ORIGINS = "https://saldo-bersama.vercel.app,http://localhost:5173";
  process.env.ALLOWED_USERS_JSON = JSON.stringify([{ email: "owner@gmail.com", role: "administrator" }]);
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "test-oauth-secret-value-at-least-32-chars";
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

test("server-side Google OAuth membuat Firebase-backed session tanpa browser redirect state", async () => {
  setTestEnv();
  const originalFetch = globalThis.fetch;
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
    const firebaseRequest = JSON.parse(fetchCalls[1].options.body);
    assert.equal(firebaseRequest.requestUri, "https://saldo-bersama.vercel.app");
    assert.match(firebaseRequest.postBody, /providerId=google\.com/);

    const sessionCookie = setCookies.find((value) => String(value).startsWith("sb_session="));
    const readResponse = createResponse();
    await sessionHandler({
      method: "GET",
      headers: requestHeaders({ cookie: cookiePair(sessionCookie), "x-forwarded-for": "203.0.113.23" }),
      query: {},
      url: "/api/session",
    }, readResponse);
    assert.equal(readResponse.statusCode, 200);
    const body = JSON.parse(readResponse.body);
    assert.equal(body.data.email, "owner@gmail.com");
    assert.equal(body.data.role, "owner");
  } finally {
    globalThis.fetch = originalFetch;
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
