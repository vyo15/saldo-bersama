import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ApiError, parseResponse, shouldInvalidateSession } from "../src/services/api/client.js";
import { createServerSession, destroyServerSession } from "../src/services/api/transport.js";
import { stableValue } from "../src/services/api/serialization.js";

const successfulResponse = (data, requestId = "") => ({
  ok: true,
  status: 200,
  headers: { get: (name) => name.toLowerCase() === "x-request-id" ? requestId : null },
  json: async () => ({ ok: true, data }),
});

test("createServerSession menunggu Response dan mempertahankan kontrak login", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  let resolveFetch;
  globalThis.fetch = (url, options) => {
    request = { url, options };
    return new Promise((resolve) => { resolveFetch = resolve; });
  };
  try {
    const pending = createServerSession("firebase-token-test");
    assert.equal(request.url, "/api/session");
    assert.equal(request.options.method, "POST");
    assert.equal(request.options.credentials, "include");
    assert.equal(request.options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(request.options.body), {
      action: "login",
      firebaseIdToken: "firebase-token-test",
    });
    resolveFetch(successfulResponse({ uid: "firebase-owner", email: "owner@example.com" }));
    assert.deepEqual(await pending, { uid: "firebase-owner", email: "owner@example.com" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("destroyServerSession menunggu Response dan mempertahankan kontrak logout", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  let resolveFetch;
  globalThis.fetch = (url, options) => {
    request = { url, options };
    return new Promise((resolve) => { resolveFetch = resolve; });
  };
  try {
    const pending = destroyServerSession();
    assert.equal(request.url, "/api/session");
    assert.equal(request.options.method, "POST");
    assert.equal(request.options.credentials, "include");
    assert.deepEqual(JSON.parse(request.options.body), { action: "logout" });
    resolveFetch(successfulResponse({ loggedOut: true }));
    assert.deepEqual(await pending, { loggedOut: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("transport sesi meneruskan error API terstruktur, bukan TypeError parser", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    headers: { get: (name) => name.toLowerCase() === "x-request-id" ? "req-session-503" : null },
    json: async () => ({ ok: false, error: { code: "SESSION_UNAVAILABLE", message: "Sesi sementara tidak tersedia." } }),
  });
  try {
    await assert.rejects(
      () => createServerSession("firebase-token-test"),
      (error) => error instanceof ApiError
        && error.code === "SESSION_UNAVAILABLE"
        && error.status === 503
        && error.requestId === "req-session-503",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("transport API menunggu Response, mengklasifikasikan outcome write, dan tidak mem-parse Promise fetch langsung", async () => {
  const source = await readFile(new URL("../src/services/api/transport.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /parseResponse\s*\(\s*fetch\s*\(/);
  assert.match(source, /const fetchJson = async/);
  assert.match(source, /if \(outcomeSensitive\) throw outcomeUnknownError/);
  assert.match(source, /createServerSession\s*=\s*async[\s\S]*fetchJson\("\/api\/session"/);
  assert.match(source, /destroyServerSession\s*=\s*async[\s\S]*fetchJson\("\/api\/session"/);
});

test("frontend hanya mengakhiri sesi untuk UNAUTHENTICATED dari API sendiri", () => {
  assert.equal(shouldInvalidateSession(401, "UNAUTHENTICATED"), true);
  assert.equal(shouldInvalidateSession(401, "INVALID_SIGNATURE"), false);
  assert.equal(shouldInvalidateSession(502, "CONNECTOR_AUTH_FAILED"), false);
  assert.equal(shouldInvalidateSession(401, "INVALID_TOKEN"), false);
});

test("ApiError membawa kode dan request reference dari response header", async () => {
  const response = {
    ok: false,
    status: 502,
    headers: { get: (name) => name.toLowerCase() === "x-request-id" ? "req-connector-1" : null },
    json: async () => ({ ok: false, error: { code: "CONNECTOR_REQUEST_EXPIRED", message: "Clock skew." } }),
  };
  await assert.rejects(
    () => parseResponse(response),
    (error) => error.code === "CONNECTOR_REQUEST_EXPIRED"
      && error.status === 502
      && error.requestId === "req-connector-1",
  );
});


test("stableValue menormalisasi object secara rekursif tanpa mengubah urutan array", () => {
  assert.deepEqual(stableValue({ z: 1, a: { d: 4, b: 2 }, list: [{ y: 2, x: 1 }, 3] }), {
    a: { b: 2, d: 4 },
    list: [{ x: 1, y: 2 }, 3],
    z: 1,
  });
});

test("query key stabil untuk payload dengan urutan property berbeda", async () => {
  const { stableQueryKey } = await import("../src/services/api/client.js");
  assert.equal(
    stableQueryKey("transactions.list", { period: "2026-07", filter: { type: "all", query: "" } }, "u1"),
    stableQueryKey("transactions.list", { filter: { query: "", type: "all" }, period: "2026-07" }, "u1"),
  );
});


test("cache key dan mutation fingerprint memakai serialisasi canonical yang sama", async () => {
  const { mutationIntentFingerprint, stableQueryKey } = await import("../src/services/api/client.js");
  const left = { period: "2026-08", filter: { query: "", type: "expense" }, ids: ["a", "b"] };
  const right = { ids: ["a", "b"], filter: { type: "expense", query: "" }, period: "2026-08" };
  assert.equal(stableQueryKey("transactions.list", left, "u-serial"), stableQueryKey("transactions.list", right, "u-serial"));
  assert.equal(
    mutationIntentFingerprint("reports.example", left, 3),
    mutationIntentFingerprint("reports.example", right, 3),
  );
});

test("read identik dikoaleskan, dicache di memory, dan dapat diinvalidasi", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ ok: true, data: { items: [calls] } }),
    };
  };
  try {
    const { apiClient } = await import("../src/services/api/client.js");
    apiClient.clearCache();
    apiClient.setSessionScope("u-read-test");
    const [left, right] = await Promise.all([
      apiClient.request("transactions.list", { period: "current" }),
      apiClient.request("transactions.list", { period: "current" }),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(left, right);
    await apiClient.request("transactions.list", { period: "current" });
    assert.equal(calls, 1, "hasil warm harus berasal dari memory cache");
    apiClient.invalidate("transactions.list");
    await apiClient.request("transactions.list", { period: "current" });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("abort satu subscriber tidak membatalkan read identik yang masih dipakai subscriber lain", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 20);
      options.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
    });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ ok: true, data: { value: "ok" } }),
    };
  };
  try {
    const { apiClient, isAbortError } = await import("../src/services/api/client.js");
    apiClient.clearCache();
    apiClient.setSessionScope("u-abort-test");
    const controller = new AbortController();
    const cancelled = apiClient.request("envelopes.list", {}, { signal: controller.signal });
    const active = apiClient.request("envelopes.list", {});
    controller.abort();
    await assert.rejects(cancelled, isAbortError);
    assert.deepEqual(await active, { value: "ok" });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("FinanceContext tidak men-seed daftar master aktif sebagai daftar manajemen lengkap", async () => {
  const source = await readFile(new URL("../src/app/FinanceContext.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /apiClient\.seed\("accounts\.list"/);
  assert.doesNotMatch(source, /apiClient\.seed\("categories\.list"/);
});


test("FinanceContext memakai initial state Turso tanpa bootstrap Apps Script legacy", async () => {
  const source = await readFile(new URL("../src/app/FinanceContext.jsx", import.meta.url), "utf8");
  assert.match(source, /apiClient\.request\("app\.initialState", \{\}, \{ force \}\)/);
  assert.doesNotMatch(source, /IDENTITY_BIND_REQUIRED|system\.initialize|Apps Script/);
});

test("useApiResource memperlakukan idle enabled sebagai initial loading agar halaman tidak berkedip siap lalu loading", async () => {
  const source = await readFile(new URL("../src/hooks/useApiResource.js", import.meta.url), "utf8");
  assert.match(source, /enabled && state\.status === "idle" \? "loading" : state\.status/);
  assert.match(source, /return \{[\s\S]*status,[\s\S]*isRefreshing: status === "refreshing"/);
});


test("resource aktif berlangganan invalidation action agar mutation global tidak meninggalkan state stale", async () => {
  const source = await readFile(new URL("../src/hooks/useApiResource.js", import.meta.url), "utf8");
  assert.match(source, /subscribeToInvalidation\(action/);
  assert.match(source, /load\(\{ force: true \}\)\.catch/);

  const { apiClient, subscribeToInvalidation } = await import("../src/services/api/client.js");
  apiClient.clearCache();
  let transactions = 0;
  let accounts = 0;
  const unsubscribeTransactions = subscribeToInvalidation("transactions.list", () => { transactions += 1; });
  const unsubscribeAccounts = subscribeToInvalidation("accounts.list", () => { accounts += 1; });
  apiClient.invalidate(["transactions.list", "accounts.list"]);
  assert.equal(transactions, 1);
  assert.equal(accounts, 1);
  unsubscribeTransactions();
  apiClient.invalidate("transactions.list");
  assert.equal(transactions, 1, "listener yang sudah dilepas tidak boleh menerima invalidation baru");
  unsubscribeAccounts();
});

test("preview lifecycle dan arsip owner tetap diklasifikasikan sebagai read tanpa cache stale", async () => {
  const { isReadAction, READ_CACHE_TTL_MS } = await import("../src/services/api/cache.js");
  for (const action of [
    "accounts.previewLifecycle", "categories.previewArchive", "envelopes.previewRuleLifecycle",
    "recurring.previewRuleLifecycle", "budgets.previewLifecycle", "goals.previewLifecycle", "periods.previewClose",
  ]) {
    assert.equal(isReadAction(action), true, `${action} harus memakai transport read`);
    assert.equal(READ_CACHE_TTL_MS[action], 0, `${action} tidak boleh memakai hasil preview stale`);
  }
  assert.equal(isReadAction("archive.list"), true);
  assert.equal(READ_CACHE_TTL_MS["archive.list"], 30_000);
  assert.equal(isReadAction("integrations.status"), true);
  assert.equal(READ_CACHE_TTL_MS["integrations.status"], 0);
  assert.equal(isReadAction("reset.status"), true);
  assert.equal(READ_CACHE_TTL_MS["reset.status"], 0);
});

test("mutation identik yang dikirim bersamaan dikoaleskan menjadi satu write dan satu idempotency intent", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    await new Promise((resolve) => setTimeout(resolve, 10));
    return successfulResponse({ created: true });
  };
  try {
    const { apiClient } = await import("../src/services/api/client.js");
    apiClient.clearCache();
    apiClient.setSessionScope("mutation-coalesce");
    const payload = { name: "Dana darurat", target_amount: 1_000_000, account_id: "a1" };
    const [left, right] = await Promise.all([
      apiClient.request("goals.create", payload, { idempotencyKey: "caller-key-a" }),
      apiClient.request("goals.create", payload, { idempotencyKey: "caller-key-b" }),
    ]);
    assert.deepEqual(left, { created: true });
    assert.deepEqual(right, { created: true });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].idempotencyKey, "caller-key-a");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mutation activity global melaporkan proses dan hasil tanpa memecah guard idempotency", async () => {
  const originalFetch = globalThis.fetch;
  let resolveFetch;
  globalThis.fetch = () => new Promise((resolve) => { resolveFetch = resolve; });
  try {
    const { apiClient, getMutationActivitySnapshot, subscribeToMutationActivity } = await import("../src/services/api/client.js");
    apiClient.clearCache();
    apiClient.setSessionScope("mutation-activity");
    const snapshots = [];
    const unsubscribe = subscribeToMutationActivity(() => snapshots.push(getMutationActivitySnapshot()));
    const pending = apiClient.request("goals.create", { name: "Aktivitas" }, {});
    assert.equal(getMutationActivitySnapshot().status, "submitting");
    assert.equal(getMutationActivitySnapshot().activeCount, 1);
    assert.equal(getMutationActivitySnapshot().action, "goals.create");
    resolveFetch(successfulResponse({ created: true }));
    assert.deepEqual(await pending, { created: true });
    assert.equal(getMutationActivitySnapshot().status, "success");
    assert.equal(getMutationActivitySnapshot().activeCount, 0);
    assert.equal(getMutationActivitySnapshot().action, "goals.create");
    assert.ok(snapshots.some((item) => item.status === "submitting"));
    assert.ok(snapshots.some((item) => item.status === "success"));
    unsubscribe();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("network putus saat write mempertahankan idempotency key untuk retry intent yang sama", async () => {
  const originalFetch = globalThis.fetch;
  const keys = [];
  let attempt = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    keys.push(body.idempotencyKey);
    attempt += 1;
    if (attempt === 1) throw new Error("connection reset after request");
    return successfulResponse({ created: true });
  };
  try {
    const { apiClient, isOutcomeUnknownError } = await import("../src/services/api/client.js");
    apiClient.clearCache();
    apiClient.setSessionScope("mutation-retry");
    const payload = { name: "Jatah rumah", default_amount: 750_000 };
    await assert.rejects(() => apiClient.request("envelopes.create", payload, {}), isOutcomeUnknownError);
    assert.deepEqual(await apiClient.request("envelopes.create", payload, {}), { created: true });
    assert.equal(keys.length, 2);
    assert.ok(keys[0]);
    assert.equal(keys[1], keys[0], "retry logical intent wajib memakai key yang sama");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("success HTTP dengan body rusak dianggap outcome write tidak pasti dan bukan aman untuk intent baru", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "req-malformed-write" },
    json: async () => { throw new SyntaxError("invalid json"); },
  });
  try {
    const { apiClient, isOutcomeUnknownError } = await import("../src/services/api/client.js");
    apiClient.clearCache();
    apiClient.setSessionScope("mutation-malformed");
    await assert.rejects(
      () => apiClient.request("goals.create", { name: "Target" }, {}),
      (error) => isOutcomeUnknownError(error) && error.requestId === "req-malformed-write",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("parseResponse menolak HTTP sukses yang tidak memenuhi envelope kontrak", async () => {
  await assert.rejects(
    () => parseResponse({
      ok: true,
      status: 200,
      headers: { get: () => "req-invalid-envelope" },
      json: async () => ({ result: { unexpected: true } }),
    }),
    (error) => error.code === "INVALID_RESPONSE" && error.requestId === "req-invalid-envelope",
  );
});
