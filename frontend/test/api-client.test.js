import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseResponse, shouldInvalidateSession } from "../src/services/api/client.js";

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

test("query key stabil untuk payload dengan urutan property berbeda", async () => {
  const { stableQueryKey } = await import("../src/services/api/client.js");
  assert.equal(
    stableQueryKey("transactions.list", { period: "2026-07", filter: { type: "all", query: "" } }, "u1"),
    stableQueryKey("transactions.list", { filter: { query: "", type: "all" }, period: "2026-07" }, "u1"),
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
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/app/FinanceContext.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /apiClient\.seed\("accounts\.list"/);
  assert.doesNotMatch(source, /apiClient\.seed\("categories\.list"/);
});


test("FinanceContext mengikat UID baru melalui bootstrap lock sebelum retry initial state", async () => {
  const source = await readFile(new URL("../src/app/FinanceContext.jsx", import.meta.url), "utf8");
  assert.match(source, /IDENTITY_BIND_REQUIRED/);
  assert.match(source, /apiClient\.request\("bootstrap\.get", \{\}, \{ force: true \}\)/);
  assert.match(source, /apiClient\.request\("app\.initialState", \{\}, \{ force: true \}\)/);
});
