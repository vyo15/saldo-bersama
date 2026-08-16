import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  REQUIRED_NODE_MAJOR,
  REQUIRED_NODE_VERSION,
  VERIFY_STEPS,
  assertCanonicalNode,
  dependencyRecoveryMessage,
  runVerification,
  runVerificationWithCleanup,
  verifyInstalledDependencies,
} from "../../scripts/verify-project.mjs";

test("verify memakai Node 24 canonical", () => {
  assert.equal(REQUIRED_NODE_MAJOR, 24);
  assert.equal(REQUIRED_NODE_VERSION, "24.18.1");
  assert.equal(assertCanonicalNode("v24.18.1"), "24.18.1");
  assert.throws(
    () => assertCanonicalNode("v24.17.0"),
    (error) => error.code === "VERIFY_NODE_VERSION" && /fnm use/.test(error.message),
  );
});

test("verify menjalankan full local gate tanpa npm ci", () => {
  assert.deepEqual(VERIFY_STEPS.map((step) => step.script), ["check", "test:guard", "test:browser"]);
  const executed = [];
  let dependencyChecks = 0;
  const logs = [];

  assert.equal(runVerification({
    nodeVersion: "v24.18.1",
    dependencyCheck: () => { dependencyChecks += 1; },
    runScript: (script) => { executed.push(script); return { status: 0 }; },
    logger: { log: (message) => logs.push(message) },
  }), true);

  assert.equal(dependencyChecks, 1);
  assert.deepEqual(executed, ["check", "test:guard", "test:browser"]);
  assert.equal(executed.includes("ci"), false);
  assert.match(logs.at(-1), /PASS/);
});

test("verify berhenti pada step pertama yang gagal", () => {
  const executed = [];
  assert.throws(
    () => runVerification({
      nodeVersion: "24.18.1",
      dependencyCheck: () => {},
      runScript: (script) => {
        executed.push(script);
        return { status: script === "test:guard" ? 7 : 0 };
      },
      logger: { log: () => {} },
    }),
    (error) => error.code === "VERIFY_STEP_FAILED"
      && error.step === "test:guard"
      && error.exitCode === 7,
  );
  assert.deepEqual(executed, ["check", "test:guard"]);
});

test("dependency preflight fail closed dengan recovery Windows yang eksplisit", () => {
  assert.throws(
    () => verifyInstalledDependencies({
      runner: () => ({ status: 1, stdout: "", stderr: "npm ERR! missing: vite" }),
    }),
    (error) => error.code === "VERIFY_DEPENDENCIES"
      && /Jangan menjalankan npm ci setiap selesai patch/.test(error.message)
      && /clean:dependencies/.test(error.message)
      && /npm ERR! missing: vite/.test(error.message),
  );
  assert.match(dependencyRecoveryMessage(), /bootstrap\/reinstall dependency/);
});


test("verification wrapper selalu membersihkan generated artifact setelah PASS maupun gagal", async () => {
  const cleanupLogs = [];
  assert.equal(await runVerificationWithCleanup({
    nodeVersion: "v24.18.1",
    dependencyCheck: () => {},
    runScript: () => ({ status: 0 }),
    logger: { log: () => {} },
    cleanupLogger: { log: (message) => cleanupLogs.push(message) },
  }), true);
  assert.ok(cleanupLogs.length >= 1);

  await assert.rejects(() => runVerificationWithCleanup({
    nodeVersion: "v24.18.1",
    dependencyCheck: () => {},
    runScript: (script) => ({ status: script === "check" ? 3 : 0 }),
    logger: { log: () => {} },
    cleanupLogger: { log: (message) => cleanupLogs.push(message) },
  }), (error) => error.code === "VERIFY_STEP_FAILED" && error.step === "check");
});

test("zip lokal dan pre-push memakai full verification canonical", async () => {
  const [packageText, zipWrapper, hookInstaller, prePush, devStart] = await Promise.all([
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/verified-clean-archive.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/install-git-hooks.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/pre-push-verify.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/start-vite-dev.mjs", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);
  assert.equal(packageJson.scripts.zip, "node scripts/verified-clean-archive.mjs");
  assert.equal(packageJson.scripts.postinstall, "node scripts/install-git-hooks.mjs");
  assert.match(zipWrapper, /installGitHooks\(\)/);
  assert.match(zipWrapper, /runVerificationWithCleanup\(\)/);
  assert.match(zipWrapper, /createCleanArchive\(args\)/);
  assert.match(prePush, /runVerificationWithCleanup\(\)/);
  assert.match(hookInstaller, /pre-push/);
  assert.match(hookInstaller, /saldo-bersama-managed-pre-push/);
  assert.match(devStart, /installGitHooks\(\{ projectRoot \}\)/);
});
