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

test("quality workflow menjalankan verify canonical dan verifikasi clean archive", async () => {
  const workflow = await source(".github/workflows/quality.yml");
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /concurrency:[\s\S]*group:\s*quality-/);
  assert.match(workflow, /cancel-in-progress:\s*true/);
  assert.match(workflow, /actions\/setup-node@v5/);
  assert.match(workflow, /node-version-file:\s*["']?\.node-version["']?/);
  assert.match(workflow, /Check changed whitespace/);
  assert.match(workflow, /git diff --check/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run verify/);
  assert.doesNotMatch(workflow, /npm run (?:check|test:guard)/);
  assert.match(workflow, /npx --yes jscpd@4\.2\.5/);
  assert.match(workflow, /node scripts\/create-clean-archive\.mjs/);
  assert.doesNotMatch(workflow, /npm run zip --/, "CI sudah menjalankan verify sehingga archive tidak boleh mengulang full verification");
});

test("tooling kualitas canonical mengekspos command manusia yang ringkas", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  const frontendPackage = JSON.parse(await source("frontend/package.json"));
  assert.equal(packageJson.scripts.clean, "node scripts/clean-generated-artifacts.mjs");
  assert.equal(packageJson.scripts["clean:dependencies"], "node scripts/clean-development-dependencies.mjs");
  assert.equal(packageJson.scripts.verify, "node scripts/verify-project.mjs");
  assert.equal(packageJson.scripts["test:browser"], "node scripts/browser-smoke.mjs");
  assert.equal(packageJson.scripts.zip, "node scripts/verified-clean-archive.mjs");
  assert.equal(packageJson.scripts.postinstall, "node scripts/install-git-hooks.mjs");
  assert.match(packageJson.scripts.lint, /node_modules\/eslint\/bin\/eslint\.js api scripts test/);

  for (const retired of [
    "check", "test:guard", "validate:source", "build:budget", "lint:backend",
    "audit:production", "audit:all", "check:duplicates", "test:coverage:backend",
    "env:push:development:settings", "clean:dry-run",
    "task:check", "task:list", "task:finish",
  ]) assert.equal(packageJson.scripts[retired], undefined, `Script ${retired} harus tetap internal/retired`);

  assert.equal(frontendPackage.scripts.dev, undefined);
  assert.equal(frontendPackage.scripts.preview, undefined);
  assert.deepEqual(Object.keys(frontendPackage.scripts).sort(), ["build", "lint", "test"]);
  assert.equal(packageJson.engines.node, "24.x");
  assert.equal((await source(".node-version")).trim(), "24.18.1");
  for (const retired of ["scripts/finish-task.mjs", "scripts/validate-task.mjs", "scripts/list-tasks.mjs"]) assert.equal(await exists(retired), false);
});

test("dependency audit dan Dependabot menjaga dependency source serta GitHub Actions", async () => {
  const workflow = await source(".github/workflows/dependency-audit.yml");
  const dependabot = await source(".github/dependabot.yml");
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/);
  assert.match(workflow, /npm audit --audit-level=high/);
  assert.doesNotMatch(workflow, /npm run audit:/);
  assert.match(dependabot, /package-ecosystem:\s*npm/);
  assert.match(dependabot, /package-ecosystem:\s*github-actions/);
});

test("test backend terkelompok berdasarkan tanggung jawab dan namespace runtime tetap bersih", async () => {
  assert.equal(await exists("test/api"), false);
  for (const directory of ["test/business", "test/database", "test/governance", "test/integrations", "test/maintenance", "test/migration", "test/performance", "test/security", "test/tooling", "test/guards"]) {
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

test("document lifecycle labels retired task archive as historical and branch/PR Git as canonical", async () => {
  const lifecycle = await source("docs/DOCUMENT_LIFECYCLE.md");
  for (const label of ["Canonical", "Snapshot", "Runbook", "Historical", "Template"]) assert.match(lifecycle, new RegExp(label, "i"));
  assert.match(lifecycle, /docs\/tasks\/archive\//);
  assert.match(await source("docs/GIT_WORKFLOW.md"), /git push origin main/);
  assert.match(await source("docs/GITHUB_RULESET.md"), /Block force pushes/);
});

test("quality docs memakai routing perubahan, regression behavior, dan checklist evergreen", async () => {
  const [agents, index, workflow, lifecycle, done, checklist, testPlan, prTemplate] = await Promise.all([
    source("AGENTS.md"),
    source("docs/INDEX.md"),
    source("docs/WORKFLOW.md"),
    source("docs/DOCUMENT_LIFECYCLE.md"),
    source("docs/DEFINITION_OF_DONE.md"),
    source("docs/QA_CHECKLIST.md"),
    source("docs/TEST_PLAN.md"),
    source(".github/PULL_REQUEST_TEMPLATE.md"),
  ]);
  assert.match(agents, /docs\/INDEX\.md.*Peta perubahan/s);
  assert.match(index, /## Peta perubahan/);
  assert.match(workflow, /source -> behavior\/contract -> test -> docs/);
  assert.match(testPlan, /Static\/source contract test/);
  assert.match(testPlan, /Jangan mengunci nama variabel lokal/);
  assert.match(done, /targeted regression PASS/);
  assert.match(lifecycle, /QA_CHECKLIST\.md.*checklist evergreen/);
  assert.doesNotMatch(checklist, /- \[x\]/i, "QA checklist tidak boleh menyimpan status patch lama");
  assert.doesNotMatch(checklist, /Baseline operator|sebelum patch browser-readiness/i);
  assert.equal((checklist.match(/Login Google mobile/g) || []).length, 0, "Detail feature tidak boleh diduplikasi di QA checklist");
  assert.match(prTemplate, /Regression test terkait/);
  assert.match(prTemplate, /Docs canonical yang diperbarui/);
});

test("maintainability convention menjadi dokumentasi canonical dan terhubung dari governance", async () => {
  const [guide, agents, contributing, index, done] = await Promise.all([
    source("docs/CODE_MAINTAINABILITY.md"),
    source("AGENTS.md"),
    source("CONTRIBUTING.md"),
    source("docs/INDEX.md"),
    source("docs/DEFINITION_OF_DONE.md"),
  ]);
  assert.match(guide, /Code menjelaskan WHAT/i);
  assert.match(guide, /saldo\/ledger invariant|financial invariant|invariant finansial/i);
  assert.match(guide, /public facade|stable facade|façade/i);
  assert.match(agents, /CODE_MAINTAINABILITY\.md/);
  assert.match(contributing, /CODE_MAINTAINABILITY\.md/);
  assert.match(index, /CODE_MAINTAINABILITY\.md/);
  assert.match(done, /rationale|invariant/i);
});
