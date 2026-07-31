import assert from "node:assert/strict";
import test from "node:test";
import { shouldInvalidateSession } from "../src/services/api/client.js";

test("frontend hanya mengakhiri sesi untuk UNAUTHENTICATED dari API sendiri", () => {
  assert.equal(shouldInvalidateSession(401, "UNAUTHENTICATED"), true);
  assert.equal(shouldInvalidateSession(401, "INVALID_SIGNATURE"), false);
  assert.equal(shouldInvalidateSession(502, "CONNECTOR_AUTH_FAILED"), false);
  assert.equal(shouldInvalidateSession(401, "INVALID_TOKEN"), false);
});
