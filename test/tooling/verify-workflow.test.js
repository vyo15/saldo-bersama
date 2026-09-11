import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  createVerifiedCleanArchive,
} from "../../scripts/verified-clean-archive.mjs";

import {
  REQUIRED_NODE_MAJOR,
  REQUIRED_NODE_VERSION,
  SUPPORTED_NODE_RANGE,
  isSupportedNode,
  VERIFY_STEPS,
  assertCanonicalNode,
  dependencyRecoveryMessage,
  runVerification,
  runVerificationWithCleanup,
  verifyInstalledDependencies,
} from "../../scripts/verify-project.mjs";

test("verify mendukung Node kantor 22.15+ dan Node 24", () => {
  assert.equal(REQUIRED_NODE_MAJOR, 22);
  assert.equal(REQUIRED_NODE_VERSION, "22.15.0");
  assert.match(SUPPORTED_NODE_RANGE, /22\.15\.0\+/);
  assert.equal(isSupportedNode("v22.15.0"), true);
  assert.equal(isSupportedNode("v22.16.0"), true);
  assert.equal(isSupportedNode("v24.18.1"), true);
  assert.equal(isSupportedNode("v22.14.9"), false);
  assert.equal(assertCanonicalNode("v22.15.0"), "22.15.0");
  assert.equal(assertCanonicalNode("v24.18.1"), "24.18.1");
  assert.throws(
    () => assertCanonicalNode("v22.14.9"),
    (error) => error.code === "VERIFY_NODE_VERSION" && /fnm use/.test(error.message),
  );
});

test("verify menjalankan full gate sekali tanpa alias internal atau backend test ganda", () => {
  assert.deepEqual(VERIFY_STEPS.map((step) => step.id), [
    "source", "lint", "frontend-test", "build", "build-budget", "browser-smoke", "backend-coverage",
  ]);
  assert.equal(VERIFY_STEPS.some((step) => step.args.includes("check")), false);
  assert.equal(VERIFY_STEPS.some((step) => step.args.includes("test:guard")), false);
  assert.equal(VERIFY_STEPS.filter((step) => step.args.some((arg) => arg.endsWith("run-backend-tests.mjs"))).length, 1);
  assert.equal(VERIFY_STEPS.find((step) => step.id === "backend-coverage")?.args.includes("--coverage"), true);
  assert.deepEqual(VERIFY_STEPS.find((step) => step.id === "browser-smoke")?.args, ["scripts/browser-smoke.mjs"]);

  const executed = [];
  let dependencyChecks = 0;
  const logs = [];

  assert.equal(runVerification({
    nodeVersion: "v22.15.0",
    dependencyCheck: () => { dependencyChecks += 1; },
    runStep: (step) => { executed.push(step.id); return { status: 0 }; },
    logger: { log: (message) => logs.push(message) },
  }), true);

  assert.equal(dependencyChecks, 1);
  assert.deepEqual(executed, VERIFY_STEPS.map((step) => step.id));
  assert.match(logs.at(-1), /PASS/);
});

test("browser smoke memeriksa rendered login tanpa auth bypass atau dependency test tambahan", async () => {
  const browser = await readFile(new URL("../../scripts/browser-smoke.mjs", import.meta.url), "utf8");
  for (const viewport of ["[320, 568]", "[390, 844]", "[820, 900]", "[821, 900]", "[940, 900]", "[941, 900]", "[1440, 900]"]) assert.match(browser, new RegExp(viewport.replace(/[\[\]]/g, "\\$&")));
  assert.match(browser, /scrollWidth - root\.clientWidth/);
  assert.match(browser, /prefers-reduced-motion/);
  assert.match(browser, /wcag-text-spacing-smoke/);
  assert.match(browser, /\/api\/session/);
  assert.doesNotMatch(browser, /firebaseIdToken|mock(?:ed)?User|testSessionCookie/i);
});

test("browser smoke memakai DevTools port ephemeral agar stabil di Windows dan GitHub Actions", async () => {
  const source = await readFile(new URL("../../scripts/browser-smoke.mjs", import.meta.url), "utf8");
  assert.match(source, /--remote-debugging-port=0/);
  assert.match(source, /DevToolsActivePort/);
  assert.match(source, /--remote-debugging-address=127\.0\.0\.1/);
  assert.match(source, /stderrTail/);
  assert.match(source, /child\.once\("error"/);
  assert.match(source, /result\?\.errorText/);
  assert.match(source, /Input\.dispatchKeyEvent/);
  assert.match(source, /CSS\.forcePseudoState/);
  assert.match(source, /Rendered focus-visible indicator/);
  assert.doesNotMatch(source, /candidate\?\.focus\(\)/);
  assert.doesNotMatch(source, /19000\s*\+\s*Math\.floor|Math\.random\(\).*debug/i);
});

test("verify berhenti pada step pertama yang gagal", () => {
  const executed = [];
  assert.throws(
    () => runVerification({
      nodeVersion: "22.15.0",
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
    nodeVersion: "v22.15.0",
    dependencyCheck: () => {},
    runStep: () => ({ status: 0 }),
    logger: { log: () => {} },
    cleanupLogger: { log: (message) => cleanupLogs.push(message) },
  }), true);
  assert.ok(cleanupLogs.length >= 1);

  await assert.rejects(() => runVerificationWithCleanup({
    nodeVersion: "v22.15.0",
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
  assert.match(zipWrapper, /installGitHooks/);
  assert.match(zipWrapper, /runVerificationWithCleanup/);
  assert.match(zipWrapper, /createCleanArchive/);
  assert.doesNotMatch(zipWrapper, /saldo-bersama-UNVERIFIED\.zip/);
  assert.doesNotMatch(zipWrapper, /UNVERIFIED_BUILD_REPORT\.md/);
  assert.doesNotMatch(zipWrapper, /verified:\s*false/);
  assert.match(zipWrapper, /process\.exitCode/);

  assert.match(prePush, /verify = runVerificationWithCleanup/);
  assert.match(prePush, /await verify\(\)/);
  assert.match(prePush, /await releasePreflight\(\)/);
  assert.match(prePush, /checkProductionReleasePreflight/);
  assert.match(prePush, /parsePrePushUpdates/);
  assert.match(hookInstaller, /pre-push/);
  assert.match(hookInstaller, /saldo-bersama-managed-pre-push/);
  assert.match(devStart, /assertCanonicalNode\(\)/);
  assert.match(devStart, /installGitHooks\(\{ projectRoot \}\)/);
  assert.ok(devStart.indexOf("assertCanonicalNode()") < devStart.indexOf("installGitHooks({ projectRoot })"));
  assert.ok(devStart.indexOf("assertCanonicalNode()") < devStart.indexOf("ensureDevelopmentDependencies({ projectRoot })"));
  assert.ok(devStart.indexOf("assertCanonicalNode()") < devStart.indexOf("ensureDevelopmentEnvironment({ projectRoot })"));
});

test("zip clean-only tidak membuat archive baru ketika verification gagal", async () => {
  const order = [];
  let archiveCalls = 0;
  const verificationError = Object.assign(new Error("lint gagal"), {
    code: "VERIFY_STEP_FAILED",
    step: "lint",
    exitCode: 7,
  });

  await assert.rejects(
    () => createVerifiedCleanArchive(["../saldo-bersama-clean.zip"], {
      installHooks: async () => { order.push("hooks"); },
      verify: async () => {
        order.push("verify");
        throw verificationError;
      },
      createArchive: async () => {
        archiveCalls += 1;
        order.push("archive");
        return { output: "should-not-exist.zip" };
      },
    }),
    (error) => error === verificationError,
  );

  assert.deepEqual(order, ["hooks", "verify"]);
  assert.equal(archiveCalls, 0);
});

test("zip clean-only membuat archive hanya setelah verification PASS", async () => {
  const order = [];

  const result = await createVerifiedCleanArchive(["../saldo-bersama-clean.zip"], {
    installHooks: async () => { order.push("hooks"); },
    verify: async () => { order.push("verify"); },
    createArchive: async (args) => {
      order.push("archive");
      assert.deepEqual(args, ["../saldo-bersama-clean.zip"]);
      return { output: "../saldo-bersama-clean.zip", stagedFileCount: 123, size: 456 };
    },
  });

  assert.deepEqual(order, ["hooks", "verify", "archive"]);
  assert.equal(result.verified, true);
  assert.equal(result.verificationError, null);
  assert.equal(result.output, "../saldo-bersama-clean.zip");
});

test("build budget memberi warning headroom dan threshold canonical tidak boleh dilonggarkan", async () => {
  const budget = await readFile(new URL("../../scripts/check-build-budget.mjs", import.meta.url), "utf8");
  assert.match(budget, /const warningRatio = 0\.9;/);
  assert.match(budget, /mainJsGzip:\s*110\s*\*\s*1024/);
  assert.match(budget, /globalCssGzip:\s*20\s*\*\s*1024/);
  assert.match(budget, /routeChunkGzip:\s*8\s*\*\s*1024/);
  assert.match(budget, /lazyChunkGzip:\s*32\s*\*\s*1024/);
  assert.match(budget, /lazy interaction/);
  assert.match(budget, /headroom:/);
  assert.match(budget, /Mendekati batas/);
  assert.match(budget, /Budget terlampaui/);
  assert.doesNotMatch(budget, /routeChunkGzip:\s*(?:9|1[0-9])\s*\*\s*1024/, "budget route tidak boleh dinaikkan sebagai shortcut");
  assert.doesNotMatch(budget, /lazyChunkGzip:\s*(?:3[3-9]|[4-9][0-9])\s*\*\s*1024/, "budget lazy interaction tidak boleh dinaikkan sebagai shortcut");
});
