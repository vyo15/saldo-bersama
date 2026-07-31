import assert from "node:assert/strict";
import test from "node:test";
import { calculateConnectorClockOffset, callAppsScript } from "../_lib/appsScript.js";
import { createInternalEnvelope } from "../_lib/security.js";

const withConnector = async (responses, fn) => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
  const previousSecret = process.env.INTERNAL_SHARED_SECRET;
  process.env.APPS_SCRIPT_WEB_APP_URL = "https://script.google.com/macros/s/test/exec";
  process.env.INTERNAL_SHARED_SECRET = "a".repeat(64);
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    const body = queue.shift();
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => body,
    };
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.APPS_SCRIPT_WEB_APP_URL;
    else process.env.APPS_SCRIPT_WEB_APP_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.INTERNAL_SHARED_SECRET;
    else process.env.INTERNAL_SHARED_SECRET = previousSecret;
  }
};

const envelope = () => createInternalEnvelope({
  actor: { uid: "u1", email: "owner@gmail.com", name: "Owner", role: "owner" },
  action: "bootstrap.get",
  payload: {},
  requestId: "req-test",
});


test("clock offset terkalibrasi dapat kembali nol setelah waktu PC diperbaiki", () => {
  assert.equal(calculateConnectorClockOffset(300_000, -300_000), 0);
  assert.equal(calculateConnectorClockOffset(0, 300_000), 300_000);
  assert.equal(calculateConnectorClockOffset(0, 25 * 60 * 60 * 1_000), null);
});

test("signature Apps Script yang tidak cocok menjadi error konektor, bukan sesi pengguna", async () => {
  await withConnector({ ok: false, error: { code: "INVALID_SIGNATURE", status: 401 } }, async () => {
    await assert.rejects(
      () => callAppsScript(envelope()),
      (error) => error.code === "CONNECTOR_AUTH_FAILED" && error.status === 502,
    );
  });
});

test("secret Apps Script yang belum ada menjadi konfigurasi konektor", async () => {
  await withConnector({ ok: false, error: { code: "CONFIG_MISSING", status: 503 } }, async () => {
    await assert.rejects(
      () => callAppsScript(envelope()),
      (error) => error.code === "CONNECTOR_NOT_CONFIGURED" && error.status === 503,
    );
  });
});

test("error bisnis Apps Script tetap diteruskan tanpa diubah", async () => {
  const upstream = { ok: false, error: { code: "ACCOUNT_NOT_ALLOWED", status: 403, message: "Akun tidak terdaftar." } };
  await withConnector(upstream, async () => {
    assert.deepEqual(await callAppsScript(envelope()), upstream);
  });
});

test("request expired mengkalibrasi clock dan retry tepat satu kali tanpa mengubah identitas operasi", async () => {
  const skewMs = 300_000;
  await withConnector([], async (calls) => {
    const firstEnvelope = envelope();
    const firstMessage = JSON.parse(firstEnvelope.message);
    const responses = [
      {
        ok: false,
        error: {
          code: "REQUEST_EXPIRED",
          status: 401,
          message: "Request sudah kedaluwarsa.",
          details: {
            serverEpochMs: firstMessage.timestamp + skewMs,
            requestEpochMs: firstMessage.timestamp,
            skewMs,
            toleranceMs: 120_000,
          },
        },
      },
      { ok: true, data: { ready: true } },
    ];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => responses.shift(),
      };
    };
    try {
      assert.deepEqual(await callAppsScript(firstEnvelope), { ok: true, data: { ready: true } });
    } finally {
      globalThis.fetch = previousFetch;
    }
    assert.equal(calls.length, 2);
    const first = JSON.parse(calls[0].message);
    const second = JSON.parse(calls[1].message);
    assert.equal(second.requestId, first.requestId);
    assert.equal(second.action, first.action);
    assert.deepEqual(second.payload, first.payload);
    assert.equal(second.idempotencyKey, first.idempotencyKey);
    assert.notEqual(second.nonce, first.nonce);
    assert.notEqual(calls[1].signature, calls[0].signature);
    assert.ok(second.timestamp - first.timestamp > 250_000);
  });
});
