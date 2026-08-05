import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("initial state dan read identik dikoaleskan serta cache frontend tetap private-memory", async () => {
  const [client, cache, finance, gateway] = await Promise.all([
    source("frontend/src/services/api/client.js"),
    source("frontend/src/services/api/cache.js"),
    source("frontend/src/app/FinanceContext.jsx"),
    source("api/gateway.js"),
  ]);
  assert.match(cache, /const readCache = new Map\(\)/);
  assert.match(cache, /const inFlightReads = new Map\(\)/);
  assert.match(client, /clearReadState\(\)/);
  assert.doesNotMatch(`${client}\n${cache}`, /localStorage|sessionStorage|caches\.open/);
  assert.match(finance, /apiClient\.request\("app\.initialState"/);
  assert.doesNotMatch(finance, /system\.initialize|IDENTITY_BIND_REQUIRED|callAppsScript/);
  assert.match(gateway, /const inFlightReads = new Map\(\)/);
  assert.match(gateway, /session\.uid, session\.role, action/);
  assert.match(gateway, /"app\.initialState"/);
});

test("list transaksi memakai filter, index, LIMIT/OFFSET, bukan membaca seluruh storage", async () => {
  const [finance, migration] = await Promise.all([
    source("api/_lib/services/finance.js"),
    source("database/migrations/001_initial_schema.sql"),
  ]);
  assert.match(finance, /LIMIT \? OFFSET \?/);
  assert.match(finance, /COUNT\(\*\) AS total/);
  assert.match(finance, /substr\(t\.transaction_date,1,7\)=\?/);
  assert.match(migration, /idx_transactions_period/);
  assert.match(migration, /idx_transactions_source/);
  assert.match(migration, /idx_transactions_destination/);
  assert.doesNotMatch(finance, /getDataRange|getValues|SpreadsheetApp/);
});

test("Turso client memakai batch dan transaction pipeline dengan timeout serta foreign-key guard", async () => {
  const client = await source("api/_lib/db/httpClient.js");
  assert.match(client, /\/v2\/pipeline/);
  assert.match(client, /PRAGMA foreign_keys = ON/);
  assert.match(client, /BEGIN IMMEDIATE/);
  assert.match(client, /readTransaction[\s\S]*begin: "BEGIN"/);
  assert.match(client, /ROLLBACK/);
  assert.match(client, /AbortController/);
  assert.match(client, /tx\.batch/);
});

test("outbox membatasi claim, merebut kembali worker macet, dan mengelompokkan rebuild Google", async () => {
  const jobs = await source("api/jobs.js");
  assert.match(jobs, /LIMIT 25/);
  assert.match(jobs, /status='processing' AND locked_at<\?/);
  assert.match(jobs, /for \(const provider of \["sheets", "calendar"\]\)/);
  assert.match(jobs, /mirror\.rebuild/);
  assert.match(jobs, /calendar\.rebuild/);
});

test("push notification diklaim atomik sebelum network untuk mencegah kirim ganda", async () => {
  const jobs = await source("api/jobs.js");
  assert.match(jobs, /status='processing'[\s\S]*notification_id=\?[\s\S]*status IN \('pending','failed'\)/);
  assert.match(jobs, /claim\.rowsAffected !== 1/);
  assert.match(jobs, /status='processing' AND last_attempt_at<\?/);
  assert.match(jobs, /locked_by=\?/);
  assert.match(jobs, /notification_id=\? AND status='processing' AND locked_by=\?/);
});

test("service worker hanya meng-cache app shell dan tidak pernah meng-cache API finansial", async () => {
  const sw = await source("frontend/public/sw.js");
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)\) return/);
  assert.doesNotMatch(sw, /cache\.put\([^\n]*\/api\//);
  assert.match(sw, /saldo-bersama-static-v7/);
  assert.match(sw, /response\.bodyUsed/);
  assert.match(sw, /event\.waitUntil/);
});
