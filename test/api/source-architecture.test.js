import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { ACTION_PERMISSIONS } from "../../api/_lib/security.js";

const projectRoot = new URL("../../", import.meta.url);
const appsScriptRoot = new URL("../../apps-script/", import.meta.url);

const readAppsScriptSource = async () => {
  const entries = await readdir(appsScriptRoot, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".gs"))
    .sort((left, right) => left.name.localeCompare(right.name));
  return (await Promise.all(files.map((entry) => readFile(new URL(entry.name, appsScriptRoot), "utf8")))).join("\n");
};

const sorted = (items) => [...items].sort();

const parseAppsScriptRoleActions = (source, role) => {
  const body = new RegExp(`${role}:\\s*\\[([\\s\\S]*?)\\]`).exec(source)?.[1] || "";
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
};

const canonicalApiEndpoints = ["gateway.js", "health.js", "push.js", "session.js"];
const vercelFunctionExtension = /\.(?:js|mjs|cjs|ts)$/i;

const collectVercelFunctionCandidates = async (directory, relative = "") => {
  const candidates = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith("_")) {
        candidates.push(...await collectVercelFunctionCandidates(url, nextRelative));
      }
    } else if (entry.isFile() && vercelFunctionExtension.test(entry.name)) {
      candidates.push(nextRelative);
    }
  }
  return candidates.sort();
};

test("source hanya menyimpan arsitektur runtime canonical", async () => {
  for (const path of ["api/", "apps-script/", "docs/", "frontend/", "scripts/", "test/", ".env.example", "vercel.json"]) {
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

test("namespace api hanya mengekspos Vercel Functions canonical", async () => {
  const apiRoot = new URL("../../api/", import.meta.url);
  const candidates = await collectVercelFunctionCandidates(apiRoot);
  assert.deepEqual(candidates, canonicalApiEndpoints);
  assert.ok(candidates.length <= 12, "Jumlah Vercel Functions harus tetap di bawah batas Hobby.");
  await assert.rejects(access(new URL("../../api/test/", import.meta.url)));

  const [packageJson, validator, vercelJson] = await Promise.all([
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/validate-source-tree.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../vercel.json", import.meta.url), "utf8"),
  ]);
  const packageConfig = JSON.parse(packageJson);
  const vercelConfig = JSON.parse(vercelJson);
  assert.equal(packageConfig.scripts.test, "npm run test --workspace saldo-bersama-frontend && node --test test/api/*.test.js");
  assert.deepEqual(Object.keys(vercelConfig.functions).sort(), canonicalApiEndpoints.map((file) => `api/${file}`).sort());
  assert.match(validator, /VERCEL_FUNCTION_LIMIT\s*=\s*12/);
  assert.match(validator, /CANONICAL_API_ENDPOINTS/);
  assert.match(validator, /apiTestViolations/);
  assert.match(validator, /unexpectedFunctionCandidates/);
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
  assert.match(source, /assertScheduledOperationsAllowed_/);
});

test("login dibatasi per IP sebelum Firebase dan initialize memeriksa owner sebelum schema write", async () => {
  const [sessionSource, codeSource] = await Promise.all([
    readFile(new URL("../../api/session.js", import.meta.url), "utf8"),
    readFile(new URL("../../apps-script/Code.gs", import.meta.url), "utf8"),
  ]);
  const loginRateLimit = sessionSource.indexOf('enforceBestEffortRateLimit(clientRateLimitKey(request, "session:login")');
  const firebaseLookup = sessionSource.indexOf("verifyFirebaseIdToken(body.firebaseIdToken)");
  assert.ok(loginRateLimit >= 0 && firebaseLookup > loginRateLimit, "Rate limit login wajib berjalan sebelum lookup Firebase.");

  const initializationGuard = codeSource.indexOf("assertInitializationActor_(signed.actor)");
  const mutationLock = codeSource.indexOf("LockService.getScriptLock()", initializationGuard);
  const schemaInitialization = codeSource.indexOf("initializeSchema_()", mutationLock);
  assert.ok(initializationGuard >= 0 && mutationLock > initializationGuard && schemaInitialization > mutationLock, "Owner dan lock wajib diverifikasi sebelum inisialisasi schema.");
  assert.equal((codeSource.match(/initializeSchema_\(\)/g) || []).length, 1, "Request API hanya boleh memiliki satu titik inisialisasi schema.");
  assert.match(codeSource, /assertRuntimeAvailability_\(signed\.action, schemaIssues\)[\s\S]*resolveRequestActor_/);
  assert.match(codeSource, /return !\["system\.health", "app\.initialState", "users\.list"/);
  assert.doesNotMatch(codeSource, /return !\["system\.health", "bootstrap\.get"/);
  assert.doesNotMatch(codeSource, /isSchemaRecoveryAction_/, "Helper recovery identik tidak boleh diduplikasi.");
});

test("restore canonical fail closed dan memiliki recovery manual", async () => {
  const source = await readAppsScriptSource();
  assert.match(source, /restore-preview:/);
  assert.match(source, /BACKUP_CHANGED_AFTER_PREVIEW/);
  assert.match(source, /rollbackToSafetyOrFailClosed_/);
  assert.match(source, /RECOVERY_REQUIRED/);
  assert.match(source, /recoverFromSafetyBackup/);
  assert.match(source, /spreadsheetSnapshotChecksum_/);
  assert.match(source, /createEmergencySafetySnapshot_/);
  assert.match(source, /applyRawSpreadsheetSnapshot_/);
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
  const [appsScriptPermissions, router] = await Promise.all([
    readFile(new URL("../../apps-script/Security.gs", import.meta.url), "utf8"),
    readFile(new URL("../../apps-script/Router.gs", import.meta.url), "utf8"),
  ]);
  const frontendRoot = new URL("../../frontend/src/", import.meta.url);
  const collectFrontendActions = async (directory) => {
    const actions = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) actions.push(...await collectFrontendActions(url));
      else if (/\.(?:js|jsx)$/.test(entry.name)) {
        const source = await readFile(url, "utf8");
        actions.push(...[...source.matchAll(/(?:apiClient\.request|useApiResource)\(\s*["']([A-Za-z][A-Za-z0-9.]+)["']/g)].map((match) => match[1]));
      }
    }
    return actions;
  };

  const routeActions = [...router.matchAll(/case\s+"([A-Za-z][A-Za-z0-9.]+)"/g)].map((match) => match[1]);
  assert.ok(routeActions.length > 0);
  assert.equal(new Set(routeActions).size, routeActions.length, "Router tidak boleh memiliki case action duplikat.");

  for (const role of ["owner", "member"]) {
    const apiActions = sorted(ACTION_PERMISSIONS[role]);
    const appsScriptActions = sorted(parseAppsScriptRoleActions(appsScriptPermissions, role));
    assert.deepEqual(appsScriptActions, apiActions, `Permission Apps Script ${role} berbeda dari API.`);
  }

  assert.deepEqual(sorted(routeActions), sorted(ACTION_PERMISSIONS.owner), "Seluruh route harus tercakup tepat satu kali oleh permission owner.");
  const frontendActions = await collectFrontendActions(frontendRoot);
  assert.ok(frontendActions.length > 0);
  frontendActions.forEach((action) => assert.ok(ACTION_PERMISSIONS.owner.has(action), `Action frontend tidak dikenal backend: ${action}`));
});

test("development lokal memakai satu command, satu origin, dan API Node lokal", async () => {
  const [packageJson, productionVercelConfig, viteConfig, devLauncher, notifications, validator] = await Promise.all([
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/vite.config.js", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/start-vite-dev.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/services/notifications.js", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/validate-source-tree.mjs", import.meta.url), "utf8"),
  ]);

  const packageConfig = JSON.parse(packageJson);
  const productionVercel = JSON.parse(productionVercelConfig);
  assert.equal(packageConfig.scripts.dev, "node scripts/start-vite-dev.mjs");
  assert.equal(packageConfig.scripts["dev:frontend"], undefined);
  assert.equal(packageConfig.scripts["dev:full"], undefined);
  assert.equal(productionVercel.devCommand, undefined);
  assert.ok(productionVercel.rewrites.some((rewrite) => rewrite.destination === "/index.html"));
  assert.match(viteConfig, /envDir:\s*projectRoot/);
  assert.match(devLauncher, /createServer:\s*createViteServer/);
  assert.match(devLauncher, /middlewareMode:\s*true/);
  assert.match(devLauncher, /"\/api\/session"/);
  assert.match(devLauncher, /"\/api\/gateway"/);
  assert.match(devLauncher, /loadEnv\("development", projectRoot, ""\)/);
  assert.match(devLauncher, /process\.env\.VERCEL_ENV \|\|= "development"/);
  assert.match(devLauncher, /delete request\.headers\["if-none-match"\]/);
  assert.match(devLauncher, /delete request\.headers\["if-modified-since"\]/);
  assert.match(devLauncher, /"Cache-Control": "no-store"/);
  assert.match(devLauncher, /Clear-Site-Data/);
  assert.match(devLauncher, /sb_dev_storage_reset=v1/);
  assert.doesNotMatch(devLauncher, /vercel\s+dev|npx.*vercel/i);
  assert.match(notifications, /import\.meta\.env\.DEV/);
  assert.match(notifications, /registration\.unregister\(\)/);
  assert.match(validator, /ignoredLocalFilePatterns/);
  await assert.rejects(access(new URL("../../vercel.dev.json", import.meta.url)));
});

test("schema v2 memiliki migration guarded untuk ownership data perencanaan", async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL("../../apps-script/Schema.gs", import.meta.url), "utf8"),
    readFile(new URL("../../apps-script/Migration.gs", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /SB_SCHEMA_VERSION\s*=\s*"2"/);
  for (const sheet of ["Recurring_Rules", "Budgets", "Savings_Goals"]) {
    assert.match(schema, new RegExp(`${sheet}: SB_SCHEMA_V1\\.${sheet}\\.concat\\(\\["scope", "owner_user_id"\\]\\)`));
  }
  assert.match(migration, /previewSchemaMigrationV2/);
  assert.match(migration, /applySchemaMigrationV2/);
  assert.match(migration, /runSchemaMigrationV2/);
  assert.match(migration, /deleteProperty\("MIGRATION_CONFIRMATION"\)/);
  assert.match(migration, /createMigrationSafetyBackup_/);
  assert.match(migration, /migrationSafetyIssues_/);
  assert.match(migration, /MIGRATION_BACKUP_INVALID/);
  assert.match(migration, /MIGRATION_OWNERSHIP_AMBIGUOUS/);
  assert.match(migration, /assertMigrationPreviewSafe_\(preview\)/);
  assert.match(migration, /maintenance_mode", "true"/);
  assert.match(migration, /integrityIssues_\(\)/);
  assert.match(migration, /backup_type: "pre-migration"/);
  assert.match(migration, /MIGRATION_ROLLED_BACK/);
  assert.match(migration, /RECOVERY_REQUIRED/);
  assert.match(migration, /let rollbackError = null/);
  assert.match(migration, /ensureSheetHeight_/);
  assert.match(migration, /protectSystemSheets_\(SB_SCHEMA_V1\)/);
});

test("setup baru membersihkan Sheet1 kosong hanya setelah schema valid", async () => {
  const schema = await readFile(new URL("../../apps-script/Schema.gs", import.meta.url), "utf8");
  const validationIndex = schema.indexOf("const issues = validateSchema_()");
  const cleanupIndex = schema.indexOf("removeUnusedDefaultSheet_(spreadsheet)");
  assert.ok(validationIndex >= 0);
  assert.ok(cleanupIndex > validationIndex);
  assert.match(schema, /\["Sheet1", "Sheet 1"\]/);
  assert.match(schema, /sheet\.getLastRow\(\) === 0/);
  assert.match(schema, /spreadsheet\.getSheets\(\)\.length <= 1/);
});

test("frontend production tidak menyimpan demo repository atau dialog native", async () => {
  const frontendRoot = new URL("../../frontend/src/", import.meta.url);
  const sources = [];
  const collect = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) await collect(url);
      else if (/\.(?:js|jsx)$/.test(entry.name)) sources.push(await readFile(url, "utf8"));
    }
  };
  await collect(frontendRoot);
  const source = sources.join("\n");
  assert.doesNotMatch(source, /VITE_DEMO_MODE|services\/demo|demoMode/);
  assert.doesNotMatch(source, /window\.(?:prompt|confirm)\s*\(/);
  await assert.rejects(access(new URL("../../frontend/src/services/demo/repository.js", import.meta.url)));
});

test("template environment dan packager menolak secret serta artifact lokal", async () => {
  const [environmentTemplate, gitignore, validator, packager] = await Promise.all([
    readFile(new URL("../../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/validate-source-tree.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/create-clean-archive.mjs", import.meta.url), "utf8"),
  ]);

  const variables = Object.fromEntries(environmentTemplate
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
  for (const secret of [
    "FIREBASE_WEB_API_KEY",
    "SESSION_SECRET",
    "INTERNAL_SHARED_SECRET",
    "APPS_SCRIPT_WEB_APP_URL",
    "VAPID_PRIVATE_KEY",
  ]) {
    assert.equal(variables[secret], "", `${secret} pada .env.example wajib kosong.`);
  }
  assert.match(validator, /requiredRootEntries/);
  assert.match(packager, /auditStaging/);
  assert.match(packager, /Packaging wajib menyertakan \.env\.example/);
  assert.match(packager, /Commit packaging untuk ZIP wajib menyertakan \.env\.example/);
  assert.match(gitignore, /!\.env\.example\s*$/m);
  for (const excluded of [".git", ".vercel", "node_modules", "dist", "coverage"]) {
    assert.match(packager, new RegExp(excluded.replace(".", "\\.")));
  }
});

test("service worker tidak pernah memakai fallback HTML untuk asset", async () => {
  const source = await readFile(new URL("../../frontend/public/sw.js", import.meta.url), "utf8");
  const navigationBranch = source.indexOf('if (request.mode === "navigate")');
  const navigationReturn = source.indexOf("\n    return;", navigationBranch);
  const htmlFallback = source.indexOf('caches.match("/")');
  const assetBranch = source.indexOf("event.respondWith(caches.match(request)", navigationReturn);
  assert.ok(navigationBranch >= 0 && htmlFallback > navigationBranch && htmlFallback < navigationReturn);
  assert.ok(assetBranch > navigationReturn);
  assert.match(source, /\["localhost", "127\.0\.0\.1", "::1"\]/);
  assert.equal(source.indexOf('caches.match("/")', navigationReturn), -1);
});

test("React Router v8 dikunci pada mode deklaratif tanpa package kompatibilitas, Framework, atau RSC", async () => {
  const frontendRoot = new URL("../../frontend/src/", import.meta.url);
  const sources = [];
  const collect = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) await collect(url);
      else if (/\.(?:js|jsx)$/.test(entry.name)) sources.push(await readFile(url, "utf8"));
    }
  };
  await collect(frontendRoot);

  const [frontendPackageJson, rootPackageJson, workflow, mainSource, appSource] = await Promise.all([
    readFile(new URL("../../frontend/package.json", import.meta.url), "utf8"),
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../.github/workflows/quality.yml", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/main.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/app/App.jsx", import.meta.url), "utf8"),
  ]);
  const frontendPackage = JSON.parse(frontendPackageJson);
  const rootPackage = JSON.parse(rootPackageJson);
  const frontendSource = sources.join("\n");

  assert.equal(frontendPackage.dependencies["react-router"], "8.3.0");
  assert.equal(frontendPackage.dependencies["react-router-dom"], undefined);
  assert.equal(frontendPackage.dependencies.react, "19.2.8");
  assert.equal(frontendPackage.dependencies["react-dom"], "19.2.8");
  assert.equal(rootPackage.engines.node, "24.x");
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /- run: npm ci/);
  assert.match(mainSource, /from "react-router"/);
  assert.match(mainSource, /\bBrowserRouter\b/);
  assert.match(appSource, /\bRoutes\b/);
  assert.match(appSource, /\bRoute\b/);
  assert.doesNotMatch(frontendSource, /react-router-dom/);
  assert.doesNotMatch(frontendSource, /\b(?:createBrowserRouter|RouterProvider|HydratedRouter|ServerRouter|routeRSCServerRequest|matchRSCServerRequest|unstable_[A-Za-z0-9_]+)\b/);
});

test("observability memakai structured log, request reference, redaction, dan clock calibration aman", async () => {
  const [packageJson, logger, connector, gateway, session, health, devLauncher, diagnose, appsSecurity, appsCode, apiClient, errorState] = await Promise.all([
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../api/_lib/observability.js", import.meta.url), "utf8"),
    readFile(new URL("../../api/_lib/appsScript.js", import.meta.url), "utf8"),
    readFile(new URL("../../api/gateway.js", import.meta.url), "utf8"),
    readFile(new URL("../../api/session.js", import.meta.url), "utf8"),
    readFile(new URL("../../api/health.js", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/start-vite-dev.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/diagnose-runtime.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../apps-script/Security.gs", import.meta.url), "utf8"),
    readFile(new URL("../../apps-script/Code.gs", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/services/api/client.js", import.meta.url), "utf8"),
    readFile(new URL("../../frontend/src/components/feedback/ErrorState.jsx", import.meta.url), "utf8"),
  ]);
  const pkg = JSON.parse(packageJson);
  assert.equal(pkg.scripts.diagnose, "node scripts/diagnose-runtime.mjs");
  assert.match(logger, /SENSITIVE_KEY/);
  assert.match(logger, /\[REDACTED\]/);
  assert.match(logger, /X-Request-ID/);
  assert.doesNotMatch(logger, /console\.log\([^)]*(?:secret|token|payload|email)/i);
  assert.match(connector, /connector\.clock\.calibrated/);
  assert.match(connector, /refreshInternalEnvelope/);
  assert.match(connector, /attempt <= 2/);
  assert.match(connector, /MAX_CALIBRATED_SKEW_MS/);
  assert.match(gateway, /attachRequestId/);
  assert.match(session, /attachRequestId/);
  assert.match(health, /runtimeBuildInfo/);
  assert.match(devLauncher, /npm run diagnose/);
  assert.match(diagnose, /Clock check/);
  assert.match(appsSecurity, /serverEpochMs/);
  assert.match(appsSecurity, /requestEpochMs/);
  assert.match(appsSecurity, /skewMs/);
  assert.match(appsCode, /request\.completed/);
  assert.match(apiClient, /x-request-id/);
  assert.match(errorState, /Referensi:/);
});
