import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (relative) => readFile(path.join(root, relative), "utf8");
const exists = async (relative) => {
  try {
    await access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
};

test("quality workflow menjalankan check, guard regression, browser journey, dan verifikasi clean archive", async () => {
  const workflow = await source(".github/workflows/quality.yml");
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /actions\/setup-node@v5/);
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /Guarded mutation regression[\s\S]*npm run test:guard/);
  assert.match(workflow, /Browser smoke and human-error journey[\s\S]*timeout-minutes:\s*3/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /VITE_GOOGLE_CLIENT_ID:\s*ci-browser-smoke\.apps\.googleusercontent\.com/);
  assert.match(workflow, /VITE_FIREBASE_API_KEY:\s*ci-browser-smoke-public-key/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /Duplication report \(non-blocking\)[\s\S]*continue-on-error:\s*true[\s\S]*npm run check:duplicates/);
  assert.match(workflow, /npm run test:browser/);
  assert.match(workflow, /npm run zip --/);

  const browserSmoke = await source("test/browser/browser-smoke.test.mjs");
  assert.match(browserSmoke, /detached:\s*process\.platform !== "win32"/);
  assert.match(browserSmoke, /stdio:\s*"ignore"/);
  assert.match(browserSmoke, /terminateChromiumTree/);
  assert.match(browserSmoke, /Network\.setBlockedURLs/);
  assert.match(browserSmoke, /accounts\.google\.com\/gsi\/client/);
  assert.ok(
    browserSmoke.indexOf("await chromium?.close()") < browserSmoke.indexOf("await page?.close()"),
    "Chromium process tree harus ditutup sebelum koneksi CDP agar tidak meninggalkan handle pada runner.",
  );
});

test("tooling kualitas dan lifecycle dokumentasi terhubung dari package canonical", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  assert.equal(packageJson.scripts.clean, "node scripts/clean-generated-artifacts.mjs");
  assert.equal(packageJson.scripts["clean:dry-run"], "node scripts/clean-generated-artifacts.mjs --dry-run");
  assert.equal(packageJson.scripts["clean:dependencies"], "node scripts/clean-development-dependencies.mjs");
  assert.equal(packageJson.scripts["test:browser"], "node scripts/prepare-browser-test-build.mjs && node --test test/browser/*.test.mjs");
  assert.equal(packageJson.scripts["audit:production"], "npm audit --omit=dev --audit-level=high");
  assert.equal(packageJson.scripts["audit:all"], "npm audit --audit-level=high");
  assert.equal(packageJson.scripts["check:duplicates"], "npx --yes jscpd@4.2.5 --config .jscpd.json api frontend/src scripts test");
  assert.equal(packageJson.scripts["task:check"], "node scripts/validate-task.mjs");
  assert.equal(packageJson.scripts["task:list"], "node scripts/list-tasks.mjs");
  assert.match(packageJson.scripts.check, /^npm run task:check && /);
  assert.equal(packageJson.scripts["lint:backend"], "node node_modules/eslint/bin/eslint.js api scripts test --config eslint.backend.config.js");
  assert.match(packageJson.scripts.lint, /npm run lint:backend/);
  assert.match(packageJson.scripts.check, /build:budget/);
  assert.equal(packageJson.engines.node, "24.x");
  assert.equal((await source(".node-version")).trim(), "24.18.1");
  const duplicationConfig = JSON.parse(await source(".jscpd.json"));
  assert.equal(duplicationConfig.threshold, undefined, "duplikasi masih report-only dan tidak boleh menjadi gate angka buta");
  assert.ok(duplicationConfig.ignore.includes("database/migrations/**"));
  assert.ok(duplicationConfig.ignore.includes("**/*.module.css"));

  const dependencyAudit = await source(".github/workflows/dependency-audit.yml");
  assert.match(dependencyAudit, /workflow_dispatch/);
  assert.match(dependencyAudit, /schedule:/);
  assert.match(dependencyAudit, /node-version:\s*24/);
  assert.match(dependencyAudit, /npm run audit:production/);
  assert.match(dependencyAudit, /npm run audit:all/);
  const dependabot = await source(".github/dependabot.yml");
  assert.match(dependabot, /package-ecosystem:\s*npm/);
  assert.match(dependabot, /interval:\s*weekly/);

  const backendLint = await source("eslint.backend.config.js");
  assert.match(backendLint, /"no-undef": "error"/);
  assert.match(backendLint, /"no-unused-vars"/);

  const lifecycle = await source("docs/DOCUMENT_LIFECYCLE.md");
  for (const label of ["Canonical", "Snapshot", "Runbook", "Historical", "Template"]) {
    assert.match(lifecycle, new RegExp(label, "i"));
  }
});

test("test backend terkelompok berdasarkan tanggung jawab dan namespace runtime tetap bersih", async () => {
  assert.equal(await exists("test/api"), false);
  for (const directory of [
    "test/business",
    "test/database",
    "test/governance",
    "test/integrations",
    "test/maintenance",
    "test/migration",
    "test/performance",
    "test/security",
    "test/tooling",
    "test/browser",
    "test/guards",
  ]) {
    assert.equal(await exists(directory), true, `Missing test boundary: ${directory}`);
  }
});
