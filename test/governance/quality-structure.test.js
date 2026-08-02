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

test("quality workflow menjalankan check, browser smoke, dan verifikasi clean archive", async () => {
  const workflow = await source(".github/workflows/quality.yml");
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/setup-node@v5/);
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /Browser smoke[\s\S]*timeout-minutes:\s*2/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run test:browser/);
  assert.match(workflow, /npm run zip --/);

  const browserSmoke = await source("test/browser/browser-smoke.test.mjs");
  assert.match(browserSmoke, /detached:\s*process\.platform !== "win32"/);
  assert.match(browserSmoke, /stdio:\s*"ignore"/);
  assert.match(browserSmoke, /terminateChromiumTree/);
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
  assert.equal(packageJson.scripts["test:browser"], "node --test test/browser/*.test.mjs");
  assert.match(packageJson.scripts.check, /build:budget/);

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
  ]) {
    assert.equal(await exists(directory), true, `Missing test boundary: ${directory}`);
  }
});
