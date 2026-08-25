import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAuthReturnTo } from "../src/services/auth/googleAuthRouting.js";
import {
  MOBILE_ONBOARDING_STORAGE_KEY,
  hasSeenMobileOnboarding,
  markMobileOnboardingSeen,
} from "../src/features/auth/loginOnboardingPreference.js";

test("returnTo OAuth production hanya menerima path lokal yang aman", () => {
  assert.equal(normalizeAuthReturnTo("/"), "/");
  assert.equal(normalizeAuthReturnTo("/transaksi?filter=mine"), "/transaksi?filter=mine");
  assert.equal(normalizeAuthReturnTo("https://evil.example/path"), "/");
  assert.equal(normalizeAuthReturnTo("//evil.example/path"), "/");
  assert.equal(normalizeAuthReturnTo("/\\evil"), "/");
  assert.equal(normalizeAuthReturnTo(`/x?${"a".repeat(1_100)}`), "/");
});

test("preferensi onboarding hanya menyimpan flag presentasional dan tahan storage failure", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(hasSeenMobileOnboarding(storage), false);
  assert.equal(markMobileOnboardingSeen(storage), true);
  assert.equal(values.get(MOBILE_ONBOARDING_STORAGE_KEY), "1");
  assert.equal(hasSeenMobileOnboarding(storage), true);

  const blockedStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };
  assert.equal(hasSeenMobileOnboarding(blockedStorage), false);
  assert.equal(markMobileOnboardingSeen(blockedStorage), false);
});
