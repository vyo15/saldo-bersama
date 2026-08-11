import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (relative) => readFile(path.join(root, relative), "utf8");
const exists = async (relative) => {
  try { await access(path.join(root, relative)); return true; }
  catch { return false; }
};

test("quality workflow menjalankan check, guard regression, browser journey, dan verifikasi clean archive", async () => {
  const workflow = await source(".github/workflows/quality.yml");
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/setup-node@v5/);
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run test:guard/);
  assert.match(workflow, /npm run test:browser/);
  assert.match(workflow, /npm run zip --/);
});

test("tooling kualitas canonical tidak bergantung pada task automation", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  assert.equal(packageJson.scripts.clean, "node scripts/clean-generated-artifacts.mjs");
  assert.equal(packageJson.scripts["clean:dependencies"], "node scripts/clean-development-dependencies.mjs");
  assert.equal(packageJson.scripts["test:browser"], "node scripts/prepare-browser-test-build.mjs && node --test test/browser/*.test.mjs");
  assert.equal(packageJson.scripts.verify, "node scripts/verify-project.mjs");
  assert.equal(packageJson.scripts["audit:production"], "npm audit --omit=dev --audit-level=high");
  assert.equal(packageJson.scripts["check:duplicates"], "npx --yes jscpd@4.2.5 --config .jscpd.json api frontend/src scripts test");
  assert.equal(packageJson.scripts["task:check"], undefined);
  assert.equal(packageJson.scripts["task:list"], undefined);
  assert.equal(packageJson.scripts["task:finish"], undefined);
  assert.equal(packageJson.scripts.check, "npm run validate:source && npm run lint && npm run test && npm run test:coverage:backend && npm run build && npm run build:budget");
  assert.equal(packageJson.engines.node, "24.x");
  assert.equal((await source(".node-version")).trim(), "24.18.1");
  for (const retired of ["scripts/finish-task.mjs", "scripts/validate-task.mjs", "scripts/list-tasks.mjs"]) assert.equal(await exists(retired), false);
});

test("test backend terkelompok berdasarkan tanggung jawab dan namespace runtime tetap bersih", async () => {
  assert.equal(await exists("test/api"), false);
  for (const directory of ["test/business", "test/database", "test/governance", "test/integrations", "test/maintenance", "test/migration", "test/performance", "test/security", "test/tooling", "test/browser", "test/guards"]) {
    assert.equal(await exists(directory), true, `Missing test boundary: ${directory}`);
  }
});

test("quality CI runs on main and pull requests without task branch coupling", async () => {
  const workflow = await source(".github/workflows/quality.yml");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:[\s\S]*branches:[\s\S]*- main/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.equal(await exists(".github/workflows/task-submit.yml"), false);
});

test("CODEOWNERS guards backend, data, tooling, config, and frontend trust boundaries", async () => {
  const codeowners = await source(".github/CODEOWNERS");
  for (const ownerPath of [
    "api/", "database/", "apps-script/", ".github/", "scripts/",
    "frontend/src/features/auth/", "frontend/src/services/auth/", "frontend/src/services/api/", "frontend/src/domain/",
  ]) {
    assert.match(codeowners, new RegExp(`^${ownerPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+@vyo15$`, "m"));
  }
  for (const file of ["package.json", "package-lock.json", "frontend/package.json", "frontend/vite.config.js", ".node-version", ".npmrc", ".jscpd.json", "eslint.backend.config.js"]) {
    assert.match(codeowners, new RegExp(`^${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+@vyo15$`, "m"));
  }
});

test("document lifecycle labels retired task archive as historical and direct Git as canonical", async () => {
  const lifecycle = await source("docs/DOCUMENT_LIFECYCLE.md");
  for (const label of ["Canonical", "Snapshot", "Runbook", "Historical", "Template"]) assert.match(lifecycle, new RegExp(label, "i"));
  assert.match(lifecycle, /docs\/tasks\/archive\//);
  assert.match(await source("docs/GIT_WORKFLOW.md"), /git push origin main/);
});
