import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  buildVerificationFailureReport,
  sanitizeVerificationOutput,
} from "../../scripts/verified-clean-archive.mjs";

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

test("verify menjalankan full gate sekali tanpa alias internal atau backend test ganda", () => {
  assert.deepEqual(VERIFY_STEPS.map((step) => step.id), [
    "source", "lint", "frontend-test", "build", "build-budget", "backend-coverage",
  ]);
  assert.equal(VERIFY_STEPS.some((step) => step.args.includes("check")), false);
  assert.equal(VERIFY_STEPS.some((step) => step.args.includes("test:guard")), false);
  assert.equal(VERIFY_STEPS.filter((step) => step.args.some((arg) => arg.endsWith("run-backend-tests.mjs"))).length, 1);
  assert.equal(VERIFY_STEPS.find((step) => step.id === "backend-coverage")?.args.includes("--coverage"), true);

  const executed = [];
  let dependencyChecks = 0;
  const logs = [];

  assert.equal(runVerification({
    nodeVersion: "v24.18.1",
    dependencyCheck: () => { dependencyChecks += 1; },
    runStep: (step) => { executed.push(step.id); return { status: 0 }; },
    logger: { log: (message) => logs.push(message) },
  }), true);

  assert.equal(dependencyChecks, 1);
  assert.deepEqual(executed, VERIFY_STEPS.map((step) => step.id));
  assert.match(logs.at(-1), /PASS/);
});

test("verify berhenti pada step pertama yang gagal", () => {
  const executed = [];
  assert.throws(
    () => runVerification({
      nodeVersion: "24.18.1",
      dependencyCheck: () => {},
      runStep: (step) => {
        executed.push(step.id);
        return { status: step.id === "build-budget" ? 7 : 0 };
      },
      logger: { log: () => {} },
    }),
    (error) => error.code === "VERIFY_STEP_FAILED"
      && error.step === "build-budget"
      && error.exitCode === 7,
  );
  assert.deepEqual(executed, ["source", "lint", "frontend-test", "build", "build-budget"]);
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
    runStep: () => ({ status: 0 }),
    logger: { log: () => {} },
    cleanupLogger: { log: (message) => cleanupLogs.push(message) },
  }), true);
  assert.ok(cleanupLogs.length >= 1);

  await assert.rejects(() => runVerificationWithCleanup({
    nodeVersion: "v24.18.1",
    dependencyCheck: () => {},
    runStep: (step) => ({ status: step.id === "source" ? 3 : 0 }),
    logger: { log: () => {} },
    cleanupLogger: { log: (message) => cleanupLogs.push(message) },
  }), (error) => error.code === "VERIFY_STEP_FAILED" && error.step === "source");
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
  assert.match(zipWrapper, /runVerificationWithCleanup\(/);
  assert.match(zipWrapper, /createCleanArchive\(args\)/);
  assert.match(zipWrapper, /saldo-bersama-UNVERIFIED\.zip/);
  assert.match(zipWrapper, /UNVERIFIED_BUILD_REPORT\.md/);
  assert.match(zipWrapper, /verified:\s*false/);
  assert.match(zipWrapper, /process\.exitCode/);
  assert.match(prePush, /verify = runVerificationWithCleanup/);
  assert.match(prePush, /await verify\(\)/);
  assert.match(prePush, /await releasePreflight\(\)/);
  assert.match(prePush, /checkProductionReleasePreflight/);
  assert.match(prePush, /parsePrePushUpdates/);
  assert.match(hookInstaller, /pre-push/);
  assert.match(hookInstaller, /saldo-bersama-managed-pre-push/);
  assert.match(devStart, /installGitHooks\(\{ projectRoot \}\)/);
});

test("ZIP unverified menandai failure dan menyamarkan credential pada laporan staging", () => {
  process.env.TEST_SESSION_SECRET = "super-secret-session-value";
  try {
    const sanitized = sanitizeVerificationOutput("Bearer abc.def token=visible super-secret-session-value");
    assert.doesNotMatch(sanitized, /abc\.def|visible|super-secret-session-value/);
    assert.match(sanitized, /\[REDACTED\]|\[REDACTED_ENV\]/);

    const report = buildVerificationFailureReport({
      error: Object.assign(new Error("lint gagal"), { code: "VERIFY_STEP_FAILED", step: "lint", exitCode: 1 }),
      transcript: "eslint: CompactNotice is not defined",
      archiveName: "saldo-bersama-UNVERIFIED.zip",
    });
    assert.match(report, /STATUS: FAILED \/ UNVERIFIED/);
    assert.match(report, /Verification step: `lint`/);
    assert.match(report, /CompactNotice is not defined/);
    assert.match(report, /bukan release\/deployment artifact/);
  } finally {
    delete process.env.TEST_SESSION_SECRET;
  }
});

test("build budget memberi warning headroom sebelum route benar-benar melewati batas", async () => {
  const budget = await readFile(new URL("../../scripts/check-build-budget.mjs", import.meta.url), "utf8");
  assert.match(budget, /const warningRatio = 0\.9;/);
  assert.match(budget, /headroom:/);
  assert.match(budget, /Mendekati batas/);
  assert.match(budget, /Budget terlampaui/);
  assert.doesNotMatch(budget, /routeChunkGzip:\s*(?:9|1[0-9])\s*\*\s*1024/, "budget route tidak boleh dinaikkan sebagai shortcut");
});
