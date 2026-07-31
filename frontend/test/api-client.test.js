import assert from "node:assert/strict";
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
