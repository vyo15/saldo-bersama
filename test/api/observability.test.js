import assert from "node:assert/strict";
import test from "node:test";
import { logEvent } from "../../api/_lib/observability.js";

test("structured logger meredaksi secret, token, identitas, payload, dan multiline", () => {
  const previous = console.log;
  const previousLevel = process.env.LOG_LEVEL;
  let output = "";
  console.log = (value) => { output = String(value); };
  process.env.LOG_LEVEL = "debug";
  try {
    logEvent("info", "test.event", {
      requestId: "req-1",
      action: "bootstrap.get",
      secret: "very-secret",
      firebaseIdToken: "token-value",
      email: "owner@example.com",
      payload: { amount: 1000, description: "private" },
      note: "baris satu\nbaris dua",
    });
  } finally {
    console.log = previous;
    if (previousLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previousLevel;
  }
  const record = JSON.parse(output);
  assert.equal(record.event, "test.event");
  assert.equal(record.requestId, "req-1");
  assert.equal(record.secret, "[REDACTED]");
  assert.equal(record.firebaseIdToken, "[REDACTED]");
  assert.equal(record.email, "[REDACTED]");
  assert.equal(record.payload, "[REDACTED]");
  assert.equal(record.note, "baris satu baris dua");
  assert.doesNotMatch(output, /very-secret|owner@example\.com|token-value|private/);
});
