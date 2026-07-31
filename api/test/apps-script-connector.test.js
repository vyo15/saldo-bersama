import assert from "node:assert/strict";
import test from "node:test";
import { callAppsScript } from "../_lib/appsScript.js";

const withConnector = async (body, fn) => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
  process.env.APPS_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/test/exec";
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => body,
  });
  try {
    await fn();
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.APPS_SCRIPT_WEB_APP_URL;
    else process.env.APPS_SCRIPT_WEB_APP_URL = previousUrl;
  }
};

test("signature Apps Script yang tidak cocok menjadi error konektor, bukan sesi pengguna", async () => {
  await withConnector({ ok: false, error: { code: "INVALID_SIGNATURE", status: 401 } }, async () => {
    await assert.rejects(
      () => callAppsScript({ message: "{}", signature: "x" }),
      (error) => error.code === "CONNECTOR_AUTH_FAILED" && error.status === 502,
    );
  });
});

test("secret Apps Script yang belum ada menjadi konfigurasi konektor", async () => {
  await withConnector({ ok: false, error: { code: "CONFIG_MISSING", status: 503 } }, async () => {
    await assert.rejects(
      () => callAppsScript({ message: "{}", signature: "x" }),
      (error) => error.code === "CONNECTOR_NOT_CONFIGURED" && error.status === 503,
    );
  });
});

test("error bisnis Apps Script tetap diteruskan tanpa diubah", async () => {
  const upstream = { ok: false, error: { code: "ACCOUNT_NOT_ALLOWED", status: 403, message: "Akun tidak terdaftar." } };
  await withConnector(upstream, async () => {
    assert.deepEqual(await callAppsScript({ message: "{}", signature: "x" }), upstream);
  });
});
