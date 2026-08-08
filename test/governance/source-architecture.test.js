import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (relative) => readFile(path.join(root, relative), "utf8");
const exists = async (relative) => { try { await stat(path.join(root, relative)); return true; } catch { return false; } };

const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)];
}));

test("arsitektur runtime canonical memakai Turso lokal di API dan lima Vercel Function", async () => {
  const apiFiles = (await readdir(path.join(root, "api"), { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".js")).map((entry) => entry.name).sort();
  assert.deepEqual(apiFiles, ["export.js", "gateway.js", "health.js", "jobs.js", "session.js"]);
  const gateway = await source("api/gateway.js");
  assert.match(gateway, /dispatchAction/);
  assert.doesNotMatch(gateway, /callAppsScript|APPS_SCRIPT_WEB_APP_URL/);
  assert.equal(await exists("api/_lib/appsScript.js"), false);
  assert.equal(await exists("api/push.js"), false);
  const devServer = await source("scripts/start-vite-dev.mjs");
  assert.doesNotMatch(devServer, /api\/_lib\/appsScript\.js|\/api\/push/);
  assert.match(devServer, /\/api\/export/);
  assert.match(devServer, /\/api\/jobs/);
});

test("Apps Script hanya bridge Google, bukan database atau business logic", async () => {
  const files = (await readdir(path.join(root, "apps-script"))).filter((name) => name.endsWith(".gs")).sort();
  assert.deepEqual(files, ["CalendarService.gs", "Code.gs", "DriveBackupService.gs", "MirrorService.gs", "Scheduler.gs", "Security.gs"]);
  const combined = (await Promise.all(files.map((name) => source(`apps-script/${name}`)))).join("\n");
  for (const action of ["mirror.rebuild", "calendar.rebuild", "backup.store", "backup.read", "integration.health"]) assert.match(combined, new RegExp(action.replace(".", "\\.")));
  for (const legacy of ["FinanceService", "MasterDataService", "DataStore", "system.initialize", "transactions.create", "rows_("]) assert.doesNotMatch(combined, new RegExp(legacy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("database schema dan service menjaga integer, ownership, audit, idempotency, dan soft delete", async () => {
  const [sql, finance, security] = await Promise.all([
    source("database/migrations/001_initial_schema.sql"),
    source("api/_lib/services/finance.js"),
    source("api/_lib/security.js"),
  ]);
  assert.match(sql, /amount INTEGER NOT NULL CHECK \(amount > 0\)/);
  assert.match(sql, /CHECK \(\(scope = 'shared' AND owner_user_id IS NULL\) OR/);
  assert.match(sql, /audit_log_no_update/);
  assert.match(sql, /PRIMARY KEY \(actor_id, idempotency_key\)/);
  assert.doesNotMatch(sql, /ON DELETE CASCADE/);
  assert.match(finance, /status='cancelled'/);
  assert.doesNotMatch(finance, /DELETE FROM transactions/);
  assert.match(security, /RESERVED_TRANSACTION_FIELDS/);
});

test("Google Sheets adalah mirror satu arah dan tidak memuat secret/push material", async () => {
  const [jobs, mirror] = await Promise.all([source("api/jobs.js"), source("apps-script/MirrorService.gs")]);
  assert.match(jobs, /Mirror read-only/);
  assert.match(jobs, /safeRows/);
  const mirrorSnapshotSource = jobs.slice(jobs.indexOf("const mirrorSnapshot"), jobs.indexOf("const calendarSnapshot"));
  assert.doesNotMatch(mirrorSnapshotSource, /p256dh|push_subscriptions|idempotency_keys|firebase_uid|auth key/i);
  assert.match(mirrorSnapshotSource, /owner_scope='shared'/);
  assert.match(mirrorSnapshotSource, /scope='shared'/);
  assert.doesNotMatch(mirrorSnapshotSource, /owner_user_id/);
  assert.match(mirror, /Perubahan manual akan ditimpa/);
  assert.match(mirror, /safeCell_/);
  assert.doesNotMatch(mirror, /doPost[\s\S]*transactions\.create/);
});

test("Calendar hanya menyinkronkan recurring shared dan memakai stable entity ID", async () => {
  const [jobs, calendar] = await Promise.all([source("api/jobs.js"), source("apps-script/CalendarService.gs")]);
  assert.match(jobs, /r\.scope='shared'/);
  assert.match(jobs, /entityId: item\.occurrence_id/);
  assert.match(calendar, /saldo_bersama_entity_id/);
  assert.match(calendar, /saldo_bersama_managed/);
  assert.doesNotMatch(calendar, /audit|token|firebase_uid|p256dh/i);
});



test("Google bridge memakai deployment server-to-server dan scheduler nonce persisten", async () => {
  const [manifestText, jobs, schema] = await Promise.all([
    source("apps-script/appsscript.json"), source("api/jobs.js"), source("database/migrations/001_initial_schema.sql"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.webapp.executeAs, "USER_DEPLOYING");
  assert.equal(manifest.webapp.access, "ANYONE_ANONYMOUS");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS request_nonces/);
  assert.match(jobs, /consumeScheduledNonce/);
  assert.match(jobs, /REPLAY_DENIED/);
});


test("status Integrasi Google memverifikasi health Apps Script tanpa memindahkan resource ID ke Vercel", async () => {
  const [bridge, integrations] = await Promise.all([source("apps-script/Code.gs"), source("api/_lib/services/integrations.js")]);
  for (const field of ["mirrorConfigured", "calendarConfigured", "backupConfigured", "jobsConfigured", "triggerReady"]) {
    assert.match(bridge, new RegExp(field));
    assert.match(integrations, new RegExp(field));
  }
  assert.match(integrations, /callGoogleBridge\("integration\.health"/);
  assert.match(integrations, /context\?\.action === "integrations\.status"/);
  for (const key of ["MIRROR_SPREADSHEET_ID", "GOOGLE_CALENDAR_ID", "BACKUP_FOLDER_ID", "JOBS_ENDPOINT_URL"]) {
    assert.doesNotMatch(integrations, new RegExp(`process\.env\.${key}`));
  }
});

test("maintenance mode tetap menyediakan read-only UI dan hanya memblokir write biasa", async () => {
  const [dispatcher, policy] = await Promise.all([
    source("api/_lib/actionDispatcher.js"),
    source("api/_lib/actions/policy.js"),
  ]);
  assert.match(dispatcher, /!isReadAction\(action\) && !isMaintenanceAllowedAction\(action\)/);
  assert.match(dispatcher, /Data tetap dapat dibaca/);
  assert.match(policy, /"restore\.apply"[\s\S]*maintenanceAllowed: true/);
  assert.match(policy, /"app\.initialState"[\s\S]*read\(\)/);
});


test("export Excel memakai POST agar origin guard konsisten pada browser", async () => {
  const [endpoint, transport] = await Promise.all([source("api/export.js"), source("frontend/src/services/api/transport.js")]);
  assert.match(endpoint, /request\.method !== "POST"/);
  assert.match(endpoint, /assertAllowedOrigin\(request\)/);
  assert.match(transport, /fetch\("\/api\/export"/);
  assert.match(transport, /method: "POST"/);
});

test("action internal kantong tidak diekspos dan health publik tidak membocorkan aktivitas integrasi", async () => {
  const [dispatcher, security, health] = await Promise.all([
    source("api/_lib/actionDispatcher.js"), source("api/_lib/security.js"), source("api/health.js"),
  ]);
  assert.doesNotMatch(dispatcher, /envelopes\.createRule|envelopes\.createPeriod/);
  assert.doesNotMatch(security, /envelopes\.createRule|envelopes\.createPeriod/);
  assert.doesNotMatch(health, /integrationStatus/);
  assert.match(health, /configured/);
});

test("environment template hanya memakai daftar canonical tanpa duplikasi legacy", async () => {
  const values = parseEnv(await source(".env.example"));
  for (const key of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "SESSION_SECRET", "GOOGLE_BRIDGE_SHARED_SECRET", "JOBS_SHARED_SECRET", "VAPID_PRIVATE_KEY"]) assert.equal(values[key], "", `${key} wajib kosong`);
  for (const key of ["VITE_APP_NAME", "VITE_GOOGLE_CLIENT_ID", "VITE_FIREBASE_API_KEY", "ALLOWED_USERS_JSON", "ALLOWED_ORIGINS", "GOOGLE_BRIDGE_WEB_APP_URL", "VITE_VAPID_PUBLIC_KEY", "VAPID_SUBJECT"]) assert.ok(key in values, key);
  for (const legacy of ["INTERNAL_SHARED_SECRET", "APPS_SCRIPT_WEB_APP_URL", "FIREBASE_WEB_API_KEY", "VAPID_PUBLIC_KEY", "VITE_DEV_MODE", "SPREADSHEET_ID", "MIRROR_SPREADSHEET_ID", "GOOGLE_CALENDAR_ID", "BACKUP_FOLDER_ID", "JOBS_ENDPOINT_URL"]) assert.equal(legacy in values, false, legacy);
});

test("packager dan source validator menolak env, secret, archive, serta local database dump", async () => {
  const [packager, validator, policy] = await Promise.all([
    source("scripts/create-clean-archive.mjs"),
    source("scripts/validate-source-tree.mjs"),
    source("scripts/artifact-policy.mjs"),
  ]);
  assert.match(policy, /db\|sqlite\|sqlite3\|dump\|gz/);
  assert.match(policy, /service-account/);
  assert.match(packager, /\.env\.example/);
  assert.match(validator, /database/);
  assert.match(validator, /"jobs\.js"/);
});

test("PWA iOS/Android memiliki manifest standalone, offline guard, update prompt, dan tidak mengantre write offline", async () => {
  const [manifestText, client, shell, sw] = await Promise.all([
    source("frontend/public/site.webmanifest"), source("frontend/src/services/api/client.js"), source("frontend/src/layouts/AppShell.jsx"), source("frontend/public/sw.js"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.shortcuts[0].url, "/transaksi");
  assert.match(client, /code: "OFFLINE"/);
  assert.doesNotMatch(client, /pendingWrites|offlineQueue|localStorage/);
  assert.match(shell, /OfflineBanner/);
  assert.match(shell, /UpdateAvailableNotice/);
  assert.match(shell, /InstallAppCard/);
  assert.match(sw, /SKIP_WAITING/);
});


test("Web Push memakai secure context, status backend, payload privat, dan delivery per perangkat", async () => {
  const [frontendNotifications, notificationsPage, serviceWorker, backendNotifications, jobs, deliveryMigration] = await Promise.all([
    source("frontend/src/services/notifications.js"),
    source("frontend/src/features/settings/DeviceNotificationsPage.jsx"),
    source("frontend/public/sw.js"),
    source("api/_lib/services/notifications.js"),
    source("api/jobs.js"),
    source("database/migrations/004_notification_deliveries.sql"),
  ]);
  assert.doesNotMatch(frontendNotifications, /import\.meta\.env\.DEV/);
  assert.match(frontendNotifications, /window\.isSecureContext/);
  assert.match(frontendNotifications, /ios_install_required/);
  assert.match(frontendNotifications, /notifications\.status/);
  assert.match(frontendNotifications, /notifications\.test/);
  assert.match(frontendNotifications, /verification = await apiClient\.request/);
  assert.doesNotMatch(notificationsPage, /Uji notifikasi/);
  assert.match(notificationsPage, /Ketuk tile/);
  assert.match(serviceWorker, /Ada pengingat keuangan yang perlu diperiksa/);
  assert.doesNotMatch(serviceWorker, /payload\.title|payload\.body/);
  assert.match(backendNotifications, /normalizePushEndpoint/);
  assert.match(backendNotifications, /PUSH_ENDPOINT_OWNERSHIP_CONFLICT/);
  assert.match(jobs, /notification_deliveries/);
  assert.match(jobs, /webPushRequestOptions\(3_600\)/);
  assert.match(backendNotifications, /PUSH_ENDPOINT_PRIVATE_ADDRESS/);
  assert.match(deliveryMigration, /UNIQUE\(notification_id, subscription_id\)/);
});

test("dokumen arsitektur baru tersedia dan dokumen schema Sheets legacy sudah dihapus", async () => {
  for (const file of ["docs/TURSO_SCHEMA.md", "docs/GOOGLE_INTEGRATIONS.md", "docs/LEGACY_SHEETS_TO_TURSO_CUTOVER.md", "docs/RECOVERY_RUNBOOK.md", "docs/ENVIRONMENT_VARIABLES.md"]) assert.equal(await exists(file), true, file);
  assert.equal(await exists("docs/GOOGLE_SHEETS_SCHEMA.md"), false);
  const architecture = await source("docs/ARCHITECTURE.md");
  assert.match(architecture, /Turso/);
  assert.match(architecture, /source of truth/i);
  assert.match(architecture, /mirror/i);
});

test("runtime memakai satu Firebase public key dan tidak menduplikasi resource ID Google di Vercel", async () => {
  const [firebase, jobs, notifications, integrations, maintenance, environmentDoc] = await Promise.all([
    source("api/_lib/firebase.js"),
    source("api/jobs.js"),
    source("api/_lib/services/notifications.js"),
    source("api/_lib/services/integrations.js"),
    Promise.all(["shared.js", "backup.js", "restore.js", "import.js", "integrity.js"].map((name) => source(`api/_lib/services/maintenance/${name}`))).then((parts) => parts.join("\n")),
    source("docs/ENVIRONMENT_VARIABLES.md"),
  ]);
  assert.match(firebase, /process\.env\.VITE_FIREBASE_API_KEY/);
  assert.doesNotMatch(firebase, /FIREBASE_WEB_API_KEY/);
  assert.match(notifications, /process\.env|environment = process\.env/);
  assert.match(notifications, /VITE_VAPID_PUBLIC_KEY/);
  assert.doesNotMatch(notifications, /process\.env\.VAPID_PUBLIC_KEY/);
  for (const sourceText of [jobs, integrations, maintenance]) {
    assert.doesNotMatch(sourceText, /process\.env\.(MIRROR_SPREADSHEET_ID|GOOGLE_CALENDAR_ID|BACKUP_FOLDER_ID|JOBS_ENDPOINT_URL)/);
  }
  assert.match(environmentDoc, /Scope Production canonical/i);
  assert.match(environmentDoc, /Scope Development canonical/i);
  assert.match(environmentDoc, /Preview.*kosong/i);
  assert.doesNotMatch(environmentDoc, /Development \+ Production|Production \+ Development/);
});
