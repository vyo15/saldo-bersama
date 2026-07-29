import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../", import.meta.url);
const appsScriptRoot = new URL("../../apps-script/", import.meta.url);

const readAppsScriptSource = async () => {
  const entries = await readdir(appsScriptRoot, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".gs"))
    .sort((left, right) => left.name.localeCompare(right.name));
  return (await Promise.all(files.map((entry) => readFile(new URL(entry.name, appsScriptRoot), "utf8")))).join("\n");
};

test("source hanya menyimpan arsitektur runtime canonical", async () => {
  for (const path of ["api/", "apps-script/", "docs/", "frontend/", "scripts/", "vercel.dev.json", "vercel.json"]) {
    await access(new URL(path, projectRoot));
  }

  for (const retiredPath of [
    "integrations/",
    "lib/",
    "tests/",
    ".openai/",
    "app/",
    "db/",
    "drizzle/",
    "examples/",
    "worker/",
  ]) {
    await assert.rejects(access(new URL(retiredPath, projectRoot)), undefined, retiredPath);
  }
});

test("Apps Script canonical memuat seluruh sheet sumber kebenaran", async () => {
  const source = await readAppsScriptSource();
  for (const sheet of [
    "System_Config",
    "Users",
    "Accounts",
    "Categories",
    "Transactions",
    "Recurring_Rules",
    "Recurring_Occurrences",
    "Budgets",
    "Envelope_Rules",
    "Envelope_Periods",
    "Envelope_Movements",
    "Savings_Goals",
    "Goal_Movements",
    "Reconciliations",
    "Period_Closures",
    "Calendar_Sync",
    "Notification_Queue",
    "Push_Subscriptions",
    "Audit_Log",
    "Idempotency",
    "Backup_Log",
  ]) {
    assert.match(source, new RegExp(`\\b${sheet}\\b`));
  }
});

test("write kritis memakai lock, idempotency, row version, formula guard, dan replay guard", async () => {
  const source = await readAppsScriptSource();
  assert.match(source, /LockService\.getScriptLock/);
  assert.match(source, /getIdempotentResult_/);
  assert.match(source, /assertVersion_/);
  assert.match(source, /sanitizeText_/);
  assert.match(source, /REPLAY_DETECTED/);
  assert.match(source, /constantTimeEqual_/);
});

test("restore canonical fail closed dan memiliki recovery manual", async () => {
  const source = await readAppsScriptSource();
  assert.match(source, /restore-preview:/);
  assert.match(source, /BACKUP_CHANGED_AFTER_PREVIEW/);
  assert.match(source, /rollbackToSafetyOrFailClosed_/);
  assert.match(source, /RECOVERY_REQUIRED/);
  assert.match(source, /recoverFromSafetyBackup/);
  assert.match(source, /spreadsheetSnapshotChecksum_/);
  assert.match(source, /RESTORE SALDO BERSAMA/);
});

test("Apps Script memiliki test perilaku Node, bukan hanya source matching", async () => {
  const behaviorTest = await readFile(new URL("./apps-script-behavior.test.js", import.meta.url), "utf8");
  assert.match(behaviorTest, /createTransaction_/);
  assert.match(behaviorTest, /restoreApply_/);
  assert.match(behaviorTest, /closePeriod_/);
  assert.match(behaviorTest, /getIdempotentResult_/);
});

test("frontend, API, dan Apps Script memakai action contract yang selaras", async () => {
  const [frontendPermissions, apiPermissions, router] = await Promise.all([
    readFile(new URL("../../frontend/src/domain/constants.js", import.meta.url), "utf8"),
    readFile(new URL("../_lib/security.js", import.meta.url), "utf8"),
    readFile(new URL("../../apps-script/Router.gs", import.meta.url), "utf8"),
  ]);

  const routeActions = [...router.matchAll(/case\s+"([a-z][a-z0-9.]+)"/g)].map((match) => match[1]);
  assert.ok(routeActions.length > 0);
  for (const action of routeActions) {
    assert.match(frontendPermissions, new RegExp(`"${action.replaceAll(".", "\\.")}"`), `frontend permission: ${action}`);
    assert.match(apiPermissions, new RegExp(`"${action.replaceAll(".", "\\.")}"`), `API permission: ${action}`);
  }
});

test("development lokal memakai satu command, satu origin, dan API Node lokal", async () => {
  const [packageJson, productionVercelConfig, developmentVercelConfig, viteConfig, devLauncher, notifications, validator] = await Promise.all([
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../../vercel.dev.json", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/vite.config.js", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/start-vite-dev.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/services/notifications.js", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/validate-source-tree.mjs", import.meta.url), "utf8"),
  ]);

  const packageConfig = JSON.parse(packageJson);
  const productionVercel = JSON.parse(productionVercelConfig);
  const developmentVercel = JSON.parse(developmentVercelConfig);
  assert.equal(packageConfig.scripts.dev, "node scripts/start-vite-dev.mjs");
  assert.equal(packageConfig.scripts["dev:frontend"], undefined);
  assert.equal(packageConfig.scripts["dev:full"], undefined);
  assert.equal(productionVercel.devCommand, undefined);
  assert.equal(developmentVercel.devCommand, undefined);
  assert.equal(developmentVercel.headers, undefined);
  assert.equal(developmentVercel.rewrites, undefined);
  assert.ok(productionVercel.rewrites.some((rewrite) => rewrite.destination === "/index.html"));
  assert.match(viteConfig, /envDir:\s*projectRoot/);
  assert.match(devLauncher, /createServer:\s*createViteServer/);
  assert.match(devLauncher, /middlewareMode:\s*true/);
  assert.match(devLauncher, /"\/api\/session"/);
  assert.match(devLauncher, /"\/api\/gateway"/);
  assert.match(devLauncher, /loadEnv\("development", projectRoot, ""\)/);
  assert.match(devLauncher, /process\.env\.VERCEL_ENV \|\|= "development"/);
  assert.doesNotMatch(devLauncher, /vercel\s+dev|npx.*vercel/i);
  assert.match(notifications, /import\.meta\.env\.DEV/);
  assert.match(notifications, /registration\.unregister\(\)/);
  assert.match(validator, /ignoredLocalFilePatterns/);
});
