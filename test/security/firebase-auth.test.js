import assert from "node:assert/strict";
import test from "node:test";

import { verifyFirebaseIdToken } from "../../api/_lib/firebase.js";

const withFirebaseLookup = async (user, callback, { ok = true } = {}) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.VITE_FIREBASE_API_KEY;
  process.env.VITE_FIREBASE_API_KEY = "firebase-test-api-key";
  globalThis.fetch = async () => new Response(JSON.stringify(user ? { users: [user] } : {}), {
    status: ok ? 200 : 401,
    headers: { "content-type": "application/json" },
  });
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.VITE_FIREBASE_API_KEY;
    else process.env.VITE_FIREBASE_API_KEY = originalApiKey;
  }
};

test("Firebase lookup menerima user aktif dengan email terverifikasi", async () => {
  const result = await withFirebaseLookup({
    localId: "uid-active",
    email: "owner@example.com",
    emailVerified: true,
    disabled: false,
    displayName: "Owner",
    photoUrl: "https://example.com/photo.jpg",
  }, () => verifyFirebaseIdToken("valid-token"));
  assert.deepEqual(result, {
    uid: "uid-active",
    email: "owner@example.com",
    name: "Owner",
    photoURL: "https://example.com/photo.jpg",
  });
});

test("Firebase lookup menolak account disabled walaupun token lookup berhasil", async () => {
  await assert.rejects(
    () => withFirebaseLookup({
      localId: "uid-disabled",
      email: "owner@example.com",
      emailVerified: true,
      disabled: true,
    }, () => verifyFirebaseIdToken("disabled-token")),
    (error) => error?.code === "ACCOUNT_DISABLED" && error?.status === 403,
  );
});

test("Firebase lookup tetap menolak email yang belum terverifikasi", async () => {
  await assert.rejects(
    () => withFirebaseLookup({
      localId: "uid-unverified",
      email: "owner@example.com",
      emailVerified: false,
      disabled: false,
    }, () => verifyFirebaseIdToken("unverified-token")),
    (error) => error?.code === "EMAIL_NOT_VERIFIED" && error?.status === 403,
  );
});
