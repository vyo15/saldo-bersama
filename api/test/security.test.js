import test from "node:test";
import assert from "node:assert/strict";
import { assertAllowedOrigin, authorizeAction, createSessionCookie, parseAllowedUsers, readSession } from "../_lib/security.js";

const withEnv = (values, fn) => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return fn(); } finally { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; }
};

test("allowlist memetakan role secara deny by default", () => withEnv({ ALLOWED_USERS_JSON: '[{"email":"Owner@Gmail.com","role":"owner"}]' }, () => {
  assert.deepEqual(parseAllowedUsers(), [{ email: "owner@gmail.com", role: "owner" }]);
  assert.equal(authorizeAction({ role: "member" }, "backup.create"), false);
  assert.equal(authorizeAction({ role: "owner" }, "backup.create"), true);
}));

test("session cookie ditandatangani dan dapat diverifikasi", () => withEnv({
  ALLOWED_USERS_JSON: '[{"email":"owner@gmail.com","role":"owner"}]',
  SESSION_SECRET: "12345678901234567890123456789012",
  VERCEL_ENV: "development",
}, () => {
  const cookie = createSessionCookie({ uid: "u1", email: "owner@gmail.com", role: "owner", name: "Owner" });
  const token = cookie.split(";")[0];
  const session = readSession({ headers: { cookie: token } });
  assert.equal(session.uid, "u1");
  assert.equal(session.role, "owner");
}));


test("origin wajib ada dan harus termasuk allowlist", () => withEnv({
  ALLOWED_ORIGINS: "http://localhost:5173,https://saldo-bersama.vercel.app",
}, () => {
  assert.doesNotThrow(() => assertAllowedOrigin({ headers: { origin: "http://localhost:5173" } }));
  assert.throws(() => assertAllowedOrigin({ headers: {} }), (error) => error.code === "ORIGIN_REQUIRED");
  assert.throws(() => assertAllowedOrigin({ headers: { origin: "https://evil.example" } }), (error) => error.code === "ORIGIN_DENIED");
}));
