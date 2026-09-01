import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../../apps-script/Security.gs", import.meta.url), "utf8");
const secret = "bridge-secret-for-test-1234567890abcdef";

const makeRuntime = (initialNow = Date.now()) => {
  const clock = { now: initialNow };
  const properties = new Map([["GOOGLE_BRIDGE_SHARED_SECRET", secret]]);
  const cache = new Map();
  const cacheFaults = { get: false, put: false };
  let locked = false;
  const context = vm.createContext({
    Date: { now: () => clock.now },
    Error,
    JSON,
    Math,
    Number,
    Object,
    String,
    Utilities: {
      Charset: { UTF_8: "UTF_8" },
      computeHmacSha256Signature(message, key) {
        return [...crypto.createHmac("sha256", String(key)).update(String(message)).digest()];
      },
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) { return properties.get(key) ?? null; },
          setProperty(key, value) { properties.set(key, String(value)); },
        };
      },
    },
    CacheService: {
      getScriptCache() {
        return {
          get(key) {
            if (cacheFaults.get) throw new Error("cache get unavailable");
            return cache.get(key) ?? null;
          },
          put(key, value) {
            if (cacheFaults.put) throw new Error("cache put unavailable");
            cache.set(key, String(value));
          },
        };
      },
    },
    LockService: {
      getScriptLock() {
        return {
          tryLock() {
            if (locked) return false;
            locked = true;
            return true;
          },
          releaseLock() { locked = false; },
        };
      },
    },
  });
  vm.runInContext(source, context, { filename: "Security.gs" });
  return { context, properties, cache, cacheFaults, clock };
};
const signedEvent = (nonce, timestamp = Date.now()) => {
  const message = JSON.stringify({ action: "integration.health", payload: {}, timestamp, nonce });
  const signature = crypto.createHmac("sha256", secret).update(message).digest("hex");
  return { postData: { contents: JSON.stringify({ message, signature }) } };
};

test("bridge menolak replay walau cache nonce sudah hilang karena durable replay state tetap authoritative", () => {
  const runtime = makeRuntime();
  const event = signedEvent("nonce-durable-1");
  assert.equal(runtime.context.verifySignedBody_(event).nonce, "nonce-durable-1");
  assert.ok(runtime.properties.get("SB_BRIDGE_NONCES_V1"));

  runtime.cache.clear();
  assert.throws(
    () => runtime.context.verifySignedBody_(event),
    (error) => error.code === "REPLAY_DENIED" && error.status === 409,
  );
});

test("bridge tetap memakai durable nonce authority ketika CacheService gagal", () => {
  const runtime = makeRuntime();
  runtime.cacheFaults.get = true;
  runtime.cacheFaults.put = true;
  const event = signedEvent("nonce-cache-unavailable");

  assert.equal(runtime.context.verifySignedBody_(event).nonce, "nonce-cache-unavailable");
  assert.ok(runtime.properties.get("SB_BRIDGE_NONCES_V1"));

  runtime.cacheFaults.get = false;
  runtime.cacheFaults.put = false;
  runtime.cache.clear();
  assert.throws(
    () => runtime.context.verifySignedBody_(event),
    (error) => error.code === "REPLAY_DENIED" && error.status === 409,
  );
});

test("bridge fail-closed jika durable replay state rusak", () => {
  const runtime = makeRuntime();
  runtime.properties.set("SB_BRIDGE_NONCES_V1", "{invalid-json");
  assert.throws(
    () => runtime.context.verifySignedBody_(signedEvent("nonce-corrupt-state")),
    (error) => error.code === "REPLAY_STATE_INVALID" && error.status === 503,
  );
});

test("bridge mempertahankan nonce sepanjang seluruh signature window walau timestamp berada di batas future skew", () => {
  const initialNow = 1_000_000;
  const runtime = makeRuntime(initialNow);
  const event = signedEvent("nonce-future-skew", initialNow + 120_000);
  assert.equal(runtime.context.verifySignedBody_(event).nonce, "nonce-future-skew");

  runtime.cache.clear();
  runtime.clock.now = initialNow + 190_000;
  assert.throws(
    () => runtime.context.verifySignedBody_(event),
    (error) => error.code === "REPLAY_DENIED" && error.status === 409,
  );
});
