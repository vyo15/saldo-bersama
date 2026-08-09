import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { decodeBase64Url } from "../../api/_lib/encoding.js";
import { fail, methodNotAllowed, ok, readJsonBody } from "../../api/_lib/http.js";
import {
  assertDatabaseReady,
  checksumText,
  invalidateSchemaCache,
  readSchemaStatus,
} from "../../api/_lib/db/schema.js";
import { createSecureRandomId, neutralizeSpreadsheetFormula } from "../../frontend/src/domain/security.js";
import { abortError, ApiError, isAbortError, isOutcomeUnknownError, outcomeUnknownError } from "../../frontend/src/services/api/errors.js";
import { stableStringify, stableValue } from "../../frontend/src/services/api/serialization.js";

const responseStub = () => {
  const headers = new Map();
  return {
    statusCode: 0,
    body: "",
    headers,
    setHeader(name, value) {
      headers.set(name, value);
    },
    end(value) {
      this.body = value;
    },
  };
};

test("HTTP helpers menghasilkan envelope JSON dan header defensive canonical", () => {
  const success = responseStub();
  ok(success, { saved: true }, 201);
  assert.equal(success.statusCode, 201);
  assert.equal(success.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.equal(success.headers.get("Cache-Control"), "no-store");
  assert.equal(success.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(JSON.parse(success.body), { ok: true, data: { saved: true } });

  const rejected = responseStub();
  fail(rejected, 409, "CONFLICT", "Data berubah.", { rowVersion: 2 }, { "Retry-After": "1" });
  assert.equal(rejected.headers.get("Retry-After"), "1");
  assert.deepEqual(JSON.parse(rejected.body), {
    ok: false,
    error: { code: "CONFLICT", message: "Data berubah.", details: { rowVersion: 2 } },
  });

  const method = responseStub();
  methodNotAllowed(method, ["GET", "POST"]);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.get("Allow"), "GET, POST");
});

test("readJsonBody menerima body valid dan fail closed untuk kosong, invalid, serta terlalu besar", async () => {
  assert.deepEqual(await readJsonBody(Readable.from([])), {});
  assert.deepEqual(await readJsonBody(Readable.from([Buffer.from('{"ok":true}')])), { ok: true });

  await assert.rejects(
    () => readJsonBody(Readable.from([Buffer.from("{")]), 10),
    (error) => error?.code === "INVALID_JSON" && error?.status === 400,
  );
  await assert.rejects(
    () => readJsonBody(Readable.from([Buffer.from("12345")]), 4),
    (error) => error?.code === "PAYLOAD_TOO_LARGE" && error?.status === 413,
  );
});

test("encoding dan serializer canonical menangani validasi serta urutan property secara stabil", () => {
  assert.equal(decodeBase64Url("SGVsbG8")?.toString("utf8"), "Hello");
  assert.equal(decodeBase64Url("bad value"), null);
  assert.deepEqual(stableValue({ z: 1, a: { y: 2, x: 3 }, list: [3, 2, 1] }), {
    a: { x: 3, y: 2 },
    list: [3, 2, 1],
    z: 1,
  });
  assert.equal(
    stableStringify({ b: 2, a: 1 }),
    stableStringify({ a: 1, b: 2 }),
  );
});

test("schema helpers memverifikasi version 7, mismatch, cache invalidation, dan checksum", async () => {
  invalidateSchemaCache();
  const readyDb = { one: async () => ({ value: "7" }) };
  const ready = await readSchemaStatus(readyDb, { force: true });
  assert.deepEqual(ready, { ready: true, version: 7, expectedVersion: 7 });
  assert.equal((await assertDatabaseReady(readyDb)).ready, true);

  invalidateSchemaCache();
  const staleDb = { one: async () => ({ value: "6" }) };
  await assert.rejects(
    () => assertDatabaseReady(staleDb),
    (error) => error?.code === "DATABASE_SCHEMA_MISMATCH" && error?.status === 503,
  );

  invalidateSchemaCache();
  const missingDb = { one: async () => { throw new Error("missing"); } };
  assert.deepEqual(await readSchemaStatus(missingDb, { force: true }), {
    ready: false,
    version: 0,
    expectedVersion: 7,
  });
  assert.match(checksumText("saldo-bersama"), /^[a-f0-9]{64}$/);
});

test("security dan API error helpers mempertahankan formula guard, secure id, dan klasifikasi error", () => {
  assert.equal(neutralizeSpreadsheetFormula("=SUM(A1:A2)"), "'=SUM(A1:A2)");
  assert.equal(neutralizeSpreadsheetFormula("Aman"), "Aman");
  assert.match(createSecureRandomId(), /^[0-9a-f-]{36}$/i);

  const aborted = abortError();
  assert.equal(isAbortError(aborted), true);
  assert.equal(isAbortError({ code: "ABORTED" }), true);
  assert.equal(isAbortError(new Error("lain")), false);

  const unknown = outcomeUnknownError(new Error("network"), { requestId: "req-1" });
  assert.equal(unknown instanceof ApiError, true);
  assert.equal(unknown.requestId, "req-1");
  assert.equal(isOutcomeUnknownError(unknown), true);
  assert.equal(isOutcomeUnknownError({ code: "IDEMPOTENCY_IN_PROGRESS" }), true);
  assert.equal(isOutcomeUnknownError({ code: "OTHER" }), false);
});
