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
  assert.match(finance, /t\.transaction_date BETWEEN \? AND \?/);
  assert.doesNotMatch(finance, /baseConditions = \["substr\(t\.transaction_date,1,7\)=\?"/);
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
  assert.match(jobs, /return claim\.rowsAffected === 1/);
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


test("single-query read menghindari snapshot overhead dan multi-query finansial tetap konsisten", async () => {
  const [policy, dispatcher] = await Promise.all([
    source("api/_lib/actions/policy.js"),
    source("api/_lib/actionDispatcher.js"),
  ]);
  assert.match(policy, /"app\.initialState": snapshotRead\(\)/);
  assert.match(policy, /"dashboard\.overview": snapshotRead\(\)/);
  assert.match(policy, /"reports\.monthly": snapshotRead\(\)/);
  assert.match(policy, /"transactions\.list": snapshotRead\(\)/);
  assert.match(policy, /"goals\.list": snapshotRead\(\)/);
  assert.match(policy, /"accounts\.list": read\(\)/);
  assert.match(policy, /"categories\.list": read\(\)/);
  assert.match(policy, /"budgets\.list": read\(\)/);
  assert.match(policy, /"recurring\.list": read\(\)/);
  assert.match(dispatcher, /isSnapshotReadAction\(context\.action\)/);
  assert.match(dispatcher, /database\.read\.metrics/);
  assert.match(dispatcher, /dbQueryCount/);
  assert.match(dispatcher, /dbPipelineCount/);
  assert.match(dispatcher, /if \(!readAction\) await assertMaintenanceAllows/);
});

test("list transaksi menggabungkan filter, rows, dan period lock dalam satu batch; target tetap bulk", async () => {
  const [finance, goals] = await Promise.all([
    source("api/_lib/services/finance.js"),
    source("api/_lib/services/planning/goals.js"),
  ]);
  assert.match(finance, /const transactionListStatements =/);
  assert.match(finance, /period_closures/);
  assert.match(finance, /typeof db\.batch === "function"/);
  assert.match(finance, /const periodLocked = Boolean\(closureRows\[0\]\)/);
  assert.doesNotMatch(finance, /for \(const row of rows\)[\s\S]{0,220}isTransactionDateLocked/);
  assert.match(goals, /typeof db\.batch === "function"/);
  assert.match(goals, /GROUP BY m\.goal_id/);
  assert.match(goals, /movementLookup/);
});

test("dashboard memakai opening balance bulk, envelope ringan, dan laporan trend tidak N+1 rekening", async () => {
  const dashboard = await source("api/_lib/services/reporting/dashboard.js");
  assert.match(dashboard, /openingAccounts/);
  assert.match(dashboard, /openingAccounts\.reduce/);
  assert.doesNotMatch(dashboard, /for \(const account of accounts\) openingBalance/);
  assert.match(dashboard, /envelopeItemsStatement\(context\.actor, \{ period, includeClosed: false \}\)/);
  assert.doesNotMatch(dashboard, /listEnvelopes/);
  assert.match(dashboard, /WITH cutoffs\(period_key,cutoff_date\) AS/);
  assert.doesNotMatch(dashboard, /for \(const period of periods\)[\s\S]{0,220}visibleAccounts/);
  assert.match(dashboard, /readBatchRows\(db, plan\.statements\)/);
});

test("grafik pengeluaran rekening memakai satu laporan backend untuk 3 6 atau 12 bulan", async () => {
  const accountsApi = await source("frontend/src/features/accounts/accounts.api.js");
  assert.match(accountsApi, /apiClient\.request\("reports\.monthly"/);
  assert.match(accountsApi, /trend_months: months/);
  assert.match(accountsApi, /account_id: accountId/);
  assert.match(accountsApi, /accountExpenseTrend/);
  assert.doesNotMatch(accountsApi, /for \(const period of periods\).*await/s);
});

test("initial state menanam cache read-model periode tanpa menyamakan bootstrap dengan daftar master manajemen", async () => {
  const finance = await source("frontend/src/app/FinanceContext.jsx");
  assert.doesNotMatch(finance, /apiClient\.seed\("accounts\.list"/);
  assert.doesNotMatch(finance, /apiClient\.seed\("categories\.list"/);
  assert.match(finance, /apiClient\.seed\("budgets\.list", \{ period \}, budgets\)/);
});


test("query budget transaksi memakai satu batch dan dashboard memakai satu batch per overview", async () => {
  const [{ listTransactions }, { dashboardOverview, appInitialState }] = await Promise.all([
    import("../../api/_lib/services/finance.js"),
    import("../../api/_lib/services/reporting/dashboard.js"),
  ]);
  const actor = { user_id: "u1", role: "owner" };
  const transactionRows = Array.from({ length: 20 }, (_, index) => ({
    transaction_id: `t${index}`, transaction_date: "2026-08-10", transaction_type: "expense",
    source_account_id: "a1", destination_account_id: null, category_id: "c1", amount: 1000,
    description: "", merchant: "", scope: "shared", owner_user_id: null, status: "active",
    created_by: "u1", created_at: `2026-08-10T00:00:${String(index).padStart(2, "0")}Z`,
    recurring_occurrence_id: null, goal_id: null, envelope_period_id: null,
  }));
  let transactionNetworkReads = 0;
  let transactionStatements = 0;
  let closureStatements = 0;
  const transactionDb = {
    async batch(statements) {
      transactionNetworkReads += 1;
      transactionStatements += statements.length;
      closureStatements += statements.filter((statement) => statement.sql.includes("period_closures")).length;
      return statements.map((statement) => {
        if (statement.sql.includes("COUNT(*) AS total")) return { rows: [{ total: 20 }] };
        if (statement.sql.includes("SELECT t.*") && statement.sql.includes("LIMIT")) return { rows: transactionRows };
        return { rows: [] };
      });
    },
  };
  const result = await listTransactions(transactionDb, { actor, payload: { period: "2026-08", limit: 20, offset: 0 } });
  assert.equal(result.items.length, 20);
  assert.equal(transactionNetworkReads, 1, "enam statement transaksi harus dikirim dalam satu batch");
  assert.equal(transactionStatements, 6);
  assert.equal(closureStatements, 1);

  const makeDashboardDb = () => {
    const metrics = { network: 0, statements: 0, accountBalanceStatements: 0 };
    return {
      metrics,
      async batch(statements) {
        metrics.network += 1;
        metrics.statements += statements.length;
        metrics.accountBalanceStatements += statements.filter((statement) => statement.sql.includes("FROM accounts a") && statement.sql.includes("AS balance")).length;
        return statements.map(() => ({ rows: [] }));
      },
    };
  };
  const dashboardDb = makeDashboardDb();
  await dashboardOverview(dashboardDb, { actor, payload: { period: "2026-08" } });
  assert.equal(dashboardDb.metrics.network, 1, "dashboard overview harus satu pipeline batch pada adapter yang mendukung batch");

  const initialDb = makeDashboardDb();
  await appInitialState(initialDb, { actor, payload: { period: "2026-08" } });
  assert.equal(initialDb.metrics.network, 2, "initial state memakai satu bootstrap batch dan satu dashboard batch");
  assert.equal(initialDb.metrics.accountBalanceStatements, 2, "current accounts bootstrap direuse; initial state hanya membaca current + opening balance sekali masing-masing");

  const reportDb = makeDashboardDb();
  const { monthlyReport } = await import("../../api/_lib/services/reporting/dashboard.js");
  await monthlyReport(reportDb, { actor, payload: { period: "2026-08", trend_months: 12 } });
  assert.equal(reportDb.metrics.network, 2, "laporan bulanan memakai satu dashboard batch dan satu batch gabungan breakdown+trend");
});
