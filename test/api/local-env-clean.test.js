import assert from "node:assert/strict";
import test from "node:test";
import { cleanEnvironmentText } from "../../scripts/clean-local-environment.mjs";

test("pembersihan environment menghapus legacy, OIDC, optional group parsial, dan duplikat", () => {
  const result = cleanEnvironmentText([
    "VITE_APP_NAME=Saldo Lama",
    "VITE_APP_NAME=Saldo Bersama",
    "INTERNAL_SHARED_SECRET=legacy",
    "APPS_SCRIPT_WEB_APP_URL=https://legacy.invalid",
    "FIREBASE_WEB_API_KEY=legacy",
    "VAPID_SUBJECT=mailto:test@example.com",
    "VERCEL_OIDC_TOKEN=temporary",
    "TURSO_DATABASE_URL=libsql://example",
    "",
  ].join("\n"));

  assert.match(result.text, /VITE_APP_NAME=Saldo Bersama/);
  assert.doesNotMatch(result.text, /Saldo Lama/);
  assert.doesNotMatch(result.text, /INTERNAL_SHARED_SECRET|APPS_SCRIPT_WEB_APP_URL|FIREBASE_WEB_API_KEY|VAPID_SUBJECT|VERCEL_OIDC_TOKEN/);
  assert.match(result.text, /TURSO_DATABASE_URL=libsql:\/\/example/);
  assert.deepEqual(result.duplicates, ["VITE_APP_NAME"]);
});

test("pembersihan environment mempertahankan optional group yang lengkap", () => {
  const result = cleanEnvironmentText([
    "VITE_VAPID_PUBLIC_KEY=public",
    "VAPID_PRIVATE_KEY=private",
    "VAPID_SUBJECT=mailto:test@example.com",
    "",
  ].join("\n"));
  assert.match(result.text, /VITE_VAPID_PUBLIC_KEY=public/);
  assert.match(result.text, /VAPID_PRIVATE_KEY=private/);
  assert.match(result.text, /VAPID_SUBJECT=mailto:test@example.com/);
});
