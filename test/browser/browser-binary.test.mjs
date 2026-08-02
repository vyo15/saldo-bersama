import assert from "node:assert/strict";
import { test } from "node:test";
import { chromiumCandidatesFor, resolveChromiumBinary } from "./helpers/browser-binary.mjs";

test("browser resolver memprioritaskan CHROMIUM_BIN eksplisit", () => {
  const explicit = "C:\\Browser\\custom.exe";
  const result = resolveChromiumBinary({
    platform: "win32",
    env: { CHROMIUM_BIN: explicit },
    exists: (candidate) => candidate === explicit,
  });
  assert.equal(result, explicit);
});

test("browser resolver Windows mendukung Microsoft Edge bawaan", () => {
  const env = {
    PROGRAMFILES: "C:\\Program Files",
    "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
    LOCALAPPDATA: "C:\\Users\\vio15\\AppData\\Local",
  };
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const candidates = chromiumCandidatesFor({ platform: "win32", env });
  assert.ok(candidates.includes(edge));
  assert.equal(resolveChromiumBinary({
    platform: "win32",
    env,
    exists: (candidate) => candidate === edge,
  }), edge);
});

test("browser resolver menyediakan command Chromium lintas platform", () => {
  const candidates = chromiumCandidatesFor({ platform: "linux", env: {} });
  assert.ok(candidates.includes("chromium"));
  assert.ok(candidates.includes("google-chrome"));
  assert.ok(candidates.includes("microsoft-edge"));
});
