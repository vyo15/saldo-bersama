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
  assert.doesNotMatch(cache, /localStorage|sessionStorage|caches\.open/);
  assert.match(client, /MUTATION_INTENT_STORAGE_PREFIX/);
  assert.match(client, /localStorage/);
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
  const mirror = jobs.match(/const mirrorSnapshot = async \(db\) => \{[\s\S]*?\n\};\n\nconst calendarSnapshot/)?.[0] || "";
  assert.match(mirror, /readJobBatchRows\(db, \[/);
  assert.doesNotMatch(mirror, /await Promise\.all\(\[\s*db\.all/);
  assert.doesNotMatch(mirror, /await db\.one/);
});

test("push notification diklaim atomik sebelum network untuk mencegah kirim ganda", async () => {
  const jobs = await source("api/jobs.js");
  assert.match(jobs, /status='processing'[\s\S]*notification_id=\?[\s\S]*status IN \('pending','failed'\)/);
  assert.match(jobs, /return claim\.rowsAffected === 1/);
  assert.match(jobs, /status='processing' AND last_attempt_at<\?/);
  assert.match(jobs, /locked_by=\?/);
  assert.match(jobs, /notification_id=\? AND status='processing' AND locked_by=\?/);
});

test("service worker hanya meng-cache app shell dan melewatkan seluruh API", async () => {
  const sw = await source("frontend/public/sw.js");
  assert.match(sw, /pathname === "\/api"/);
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(sw, /isInfrastructurePath\(url\.pathname\)\) return/);
  assert.doesNotMatch(sw, /cache\.put\([^\n]*\/api\//);
  assert.match(sw, /saldo-bersama-static-v10/);
  assert.match(sw, /response\.bodyUsed/);
  assert.match(sw, /event\.waitUntil/);
  assert.match(sw, /if \(isHtmlResponse\(response\)\) cacheResponse\(event, RUNTIME_CACHE, "\/", response\)/);
  assert.match(sw, /request\.destination === "image"/);
  assert.match(sw, /const network = caches\.open\(RUNTIME_CACHE\)[\s\S]*fetch\(request\)/);
  assert.match(sw, /event\.waitUntil\(network\.then/);
  assert.match(sw, /caches\.match\(request\)[\s\S]*cached \|\| network/);
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
  const [finance, goals, batchReader] = await Promise.all([
    source("api/_lib/services/finance.js"),
    source("api/_lib/services/planning/goals.js"),
    source("api/_lib/db/readBatchRows.js"),
  ]);
  assert.match(finance, /const transactionListStatements =/);
  assert.match(finance, /period_closures/);
  assert.match(finance, /readBatchRows\(db, transactionListStatements/);
  assert.match(finance, /const periodLocked = Boolean\(closureRows\[0\]\)/);
  assert.doesNotMatch(finance, /for \(const row of rows\)[\s\S]{0,220}isTransactionDateLocked/);
  assert.match(goals, /readBatchRows\(db, statements\)/);
  assert.match(goals, /GROUP BY m\.goal_id/);
  assert.match(goals, /movementLookup/);
  assert.match(batchReader, /typeof db\.batch === "function"/);
});

test("dashboard memakai opening balance bulk, envelope ringan, dan laporan trend tidak N+1 rekening", async () => {
  const dashboard = [
    await source("api/_lib/services/reporting/dashboard.js"),
    await source("api/_lib/services/reporting/dashboard/readModel.js"),
  ].join("\n");
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
  assert.equal(initialDb.metrics.network, 1, "initial state menggabungkan bootstrap dan dashboard ke satu pipeline batch");
  assert.equal(initialDb.metrics.accountBalanceStatements, 2, "current accounts bootstrap direuse; initial state hanya membaca current + opening balance sekali masing-masing");

  const historicalInitialDb = makeDashboardDb();
  await appInitialState(historicalInitialDb, { actor, payload: { period: "2026-07" } });
  assert.equal(historicalInitialDb.metrics.network, 1, "initial state historis tetap satu pipeline batch");
  assert.equal(historicalInitialDb.metrics.accountBalanceStatements, 3, "periode historis tetap membaca current bootstrap, cutoff historis, dan opening balance secara terpisah di batch yang sama");

  const reportDb = makeDashboardDb();
  const { monthlyReport } = await import("../../api/_lib/services/reporting/dashboard.js");
  await monthlyReport(reportDb, { actor, payload: { period: "2026-08", trend_months: 12 } });
  assert.equal(reportDb.metrics.network, 1, "laporan bulanan menggabungkan dashboard, breakdown, dan trend ke satu pipeline batch");
});


test("read snapshot tambahan tidak memecah query independen menjadi pipeline serial", async () => {
  const [{ listArchivedData }, { previewTrialDataReset }, { previewFullDataReset }, { integrityIssues }, resetModel, fullResetModel] = await Promise.all([
    import("../../api/_lib/services/masterData.js"),
    import("../../api/_lib/services/maintenance/reset.js"),
    import("../../api/_lib/services/maintenance/fullReset.js"),
    import("../../api/_lib/services/reporting/integrity.js"),
    import("../../api/_lib/services/maintenance/resetModel.js"),
    import("../../api/_lib/services/maintenance/fullResetModel.js"),
  ]);
  const actor = { user_id: "u1", email: "owner@example.test", role: "owner", status: "active" };

  const archiveMetrics = { network: 0, statements: 0 };
  const archiveDb = {
    async batch(statements) {
      archiveMetrics.network += 1;
      archiveMetrics.statements += statements.length;
      return statements.map(() => ({ rows: [] }));
    },
  };
  await listArchivedData(archiveDb, { actor, payload: {} });
  assert.equal(archiveMetrics.network, 1, "archive.list harus satu batch, bukan enam read snapshot serial");
  assert.equal(archiveMetrics.statements, 6);

  const resetMetrics = { network: 0, statements: 0 };
  const resetDb = {
    async batch(statements) {
      resetMetrics.network += 1;
      resetMetrics.statements += statements.length;
      return statements.map((statement) => ({ rows: statement.sql.includes("database_environment") ? [{ value: "development" }] : statement.sql.includes("COUNT(*) AS count") ? [{ count: 0 }] : [] }));
    },
  };
  const preview = await previewTrialDataReset(resetDb, { actor, payload: {} });
  assert.equal(preview.summary.totalRows, 0);
  assert.equal(resetMetrics.network, 1, "reset.preview harus membaca state dan preserved count dalam satu batch");
  assert.equal(resetMetrics.statements, 1 + resetModel.RESET_STATE_STATEMENTS.length + resetModel.PRESERVED_COUNT_STATEMENTS.length);

  const fullResetMetrics = { network: 0, statements: 0 };
  const fullResetDb = {
    async batch(statements) {
      fullResetMetrics.network += 1;
      fullResetMetrics.statements += statements.length;
      return statements.map((statement) => ({ rows: statement.sql.includes("COUNT(*) AS count") ? [{ count: 0 }] : [] }));
    },
  };
  const fullResetPreview = await previewFullDataReset(fullResetDb, { actor, payload: {} });
  assert.equal(fullResetPreview.summary.totalRows, 0);
  assert.equal(fullResetMetrics.network, 1, "fullReset.preview harus membaca seluruh scope dan preserved count dalam satu batch");
  assert.equal(fullResetMetrics.statements, fullResetModel.FULL_RESET_STATE_STATEMENTS.length + fullResetModel.FULL_RESET_PRESERVED_STATEMENTS.length);

  const integrityMetrics = { network: 0, statements: [] };
  const integrityDb = {
    async batch(statements) {
      integrityMetrics.network += 1;
      integrityMetrics.statements.push(statements.length);
      return statements.map((statement) => {
        if (statement.sql.includes("protected_account_id")) {
          return { rows: [{ protected_account_id: "a1", protected_initial_balance: 0, protected_initial_balance_date: "2026-08-01", transaction_id: null }] };
        }
        if (statement.sql.includes("GROUP BY idempotency_key,created_by")) return { rows: [] };
        if (statement.sql.includes("FROM system_config")) return { rows: [{ key: "currency", value: "IDR" }, { key: "timezone", value: "Asia/Jakarta" }] };
        if (statement.sql.trim().startsWith("SELECT COUNT(*) AS count") || statement.sql.includes("SELECT COUNT(DISTINCT")) return { rows: [{ count: 0 }] };
        return { rows: [] };
      });
    },
  };
  assert.deepEqual(await integrityIssues(integrityDb), []);
  assert.equal(integrityMetrics.network, 1, "integrity check termasuk histori rekening protected harus satu batch");
  assert.deepEqual(integrityMetrics.statements, [17]);
});

test("preview lifecycle owner menggabungkan read independen menjadi satu batch snapshot", async () => {
  const [masterData, envelopes, recurring, budgets, goals] = await Promise.all([
    import("../../api/_lib/services/masterData.js"),
    import("../../api/_lib/services/planning/envelopes.js"),
    import("../../api/_lib/services/planning/recurring.js"),
    import("../../api/_lib/services/planning/budgets.js"),
    import("../../api/_lib/services/planning/goals.js"),
  ]);
  const actor = { user_id: "u1", email: "owner@example.test", role: "owner", status: "active" };
  const makeDb = (currentMatcher, currentRow) => {
    const metrics = { network: 0, statements: [] };
    return {
      metrics,
      async batch(statements) {
        metrics.network += 1;
        metrics.statements.push(statements.length);
        return statements.map((statement) => {
          if (currentMatcher(statement.sql)) return { rows: [currentRow] };
          if (statement.sql.includes(" AS balance")) return { rows: [{ balance: 0 }] };
          if (statement.sql.includes(" AS total") && statement.sql.includes("goal_movements")) return { rows: [{ total: 0 }] };
          return { rows: [{}] };
        });
      },
    };
  };

  const accountDb = makeDb((sql) => sql === "SELECT * FROM accounts WHERE account_id=?", {
    account_id: "a1", name: "Tunai", status: "active", row_version: 1, initial_balance: 0,
    initial_balance_date: "2026-08-01", owner_scope: "shared", owner_user_id: null, allow_negative: 1,
  });
  await masterData.previewAccountLifecycle(accountDb, { actor, payload: { account_id: "a1", row_version: 1 }, today: "2026-08-12" });
  assert.deepEqual(accountDb.metrics, { network: 1, statements: [3] });

  const categoryDb = makeDb((sql) => sql === "SELECT * FROM categories WHERE category_id=?", {
    category_id: "c1", name: "Makan", status: "active", row_version: 1, transaction_type: "expense",
  });
  await masterData.previewCategoryArchive(categoryDb, { actor, payload: { category_id: "c1", row_version: 1 } });
  assert.deepEqual(categoryDb.metrics, { network: 1, statements: [2] });

  const envelopeDb = makeDb((sql) => sql.includes("SELECT * FROM envelope_rules WHERE envelope_rule_id=?"), {
    envelope_rule_id: "e1", name: "Makan", status: "active", row_version: 1,
  });
  await envelopes.previewEnvelopeRuleLifecycle(envelopeDb, { actor, payload: { envelope_rule_id: "e1", row_version: 1 } });
  assert.deepEqual(envelopeDb.metrics, { network: 1, statements: [2] });

  const recurringDb = makeDb((sql) => sql === "SELECT * FROM recurring_rules WHERE recurring_rule_id=?", {
    recurring_rule_id: "r1", name: "Tagihan", status: "active", row_version: 1,
  });
  await recurring.previewRecurringRuleLifecycle(recurringDb, { actor, payload: { recurring_rule_id: "r1", row_version: 1 } });
  assert.deepEqual(recurringDb.metrics, { network: 1, statements: [2] });

  const budgetDb = makeDb((sql) => sql === "SELECT * FROM budgets WHERE budget_id=?", {
    budget_id: "b1", period_key: "2026-08", status: "active", row_version: 1,
  });
  await budgets.previewBudgetLifecycle(budgetDb, { actor, payload: { budget_id: "b1", row_version: 1 } });
  assert.deepEqual(budgetDb.metrics, { network: 1, statements: [2] });

  const goalDb = makeDb((sql) => sql.includes("SELECT * FROM savings_goals WHERE goal_id=?"), {
    goal_id: "g1", name: "Dana", status: "active", row_version: 1,
  });
  await goals.previewGoalLifecycle(goalDb, { actor, payload: { goal_id: "g1", row_version: 1 } });
  assert.deepEqual(goalDb.metrics, { network: 1, statements: [3] });
});

test("status sistem dan notifikasi tidak memecah read independen ke beberapa pipeline", async () => {
  const [{ getActionDefinition }, { notificationStatus }] = await Promise.all([
    import("../../api/_lib/actions/registry.js"),
    import("../../api/_lib/services/notifications.js"),
  ]);
  const previousUrl = process.env.GOOGLE_BRIDGE_WEB_APP_URL;
  const previousSecret = process.env.GOOGLE_BRIDGE_SHARED_SECRET;
  delete process.env.GOOGLE_BRIDGE_WEB_APP_URL;
  delete process.env.GOOGLE_BRIDGE_SHARED_SECRET;
  try {
    let healthNetwork = 0;
    const healthDb = {
      async batch(statements) {
        healthNetwork += 1;
        assert.equal(statements.length, 4);
        return [
          { rows: [{ key: "schema_version", value: "13" }, { key: "maintenance_mode", value: "false" }, { key: "timezone", value: "Asia/Jakarta" }, { key: "currency", value: "IDR" }] },
          { rows: [] },
          { rows: [] },
          { rows: [{ latest_backup_status: "", latest_integrity_status: "", notification_dead_letter_count: 0 }] },
        ];
      },
    };
    const health = await getActionDefinition("system.health").handler(healthDb, {});
    assert.equal(health.status, "ok");
    assert.equal(healthNetwork, 1);

    let notificationNetwork = 0;
    let notificationStatements = 0;
    const notificationDb = {
      async batch(statements) {
        notificationNetwork += 1;
        notificationStatements += statements.length;
        return statements.map((statement) => {
          if (statement.sql.includes("FROM push_subscriptions WHERE endpoint=?")) return { rows: [{ subscription_id: "s1", user_id: "u1", status: "active", updated_at: "2026-08-12T00:00:00Z" }] };
          if (statement.sql.includes("COUNT(*) AS count FROM push_subscriptions")) return { rows: [{ count: 1 }] };
          return { rows: [] };
        });
      },
    };
    const status = await notificationStatus(notificationDb, { actor: { user_id: "u1" }, payload: { endpoint: "https://push.example.com/device" } });
    assert.equal(status.currentDevice.state, "active");
    assert.equal(status.activeDeviceCount, 1);
    assert.equal(notificationNetwork, 1);
    assert.equal(notificationStatements, 5);
  } finally {
    if (previousUrl === undefined) delete process.env.GOOGLE_BRIDGE_WEB_APP_URL; else process.env.GOOGLE_BRIDGE_WEB_APP_URL = previousUrl;
    if (previousSecret === undefined) delete process.env.GOOGLE_BRIDGE_SHARED_SECRET; else process.env.GOOGLE_BRIDGE_SHARED_SECRET = previousSecret;
  }
});

test("scheduler notifikasi menggabungkan seluruh source read dan saldo rekening dalam satu batch", async () => {
  const { queueActionableNotifications } = await import("../../api/_lib/services/notifications.js");
  const metrics = { network: 0, statements: 0, executes: 0, ones: 0, alls: 0 };
  const db = {
    async batch(statements) {
      metrics.network += 1;
      metrics.statements += statements.length;
      return statements.map(() => ({ rows: [] }));
    },
    async execute() { metrics.executes += 1; return { rowsAffected: 1 }; },
    async one() { metrics.ones += 1; return null; },
    async all() { metrics.alls += 1; return []; },
  };
  const queued = await queueActionableNotifications(db);
  assert.equal(queued, 0);
  assert.equal(metrics.network, 1, "source scheduler notifikasi harus satu batch");
  assert.equal(metrics.statements, 9, "user, preferensi, recurring, budget, alokasi, target, unallocated, dan saldo harus dibaca bulk");
  assert.equal(metrics.alls, 0, "tidak boleh ada source read serial di luar batch");
  assert.equal(metrics.ones, 0, "saldo recurring tidak boleh lagi N+1 per occurrence");
  assert.equal(metrics.executes, 0, "tanpa item actionable tidak boleh ada write queue");
});

test("preview tutup periode menggabungkan statistik dan integrity base setelah blocker closure", async () => {
  const { previewClosePeriod } = await import("../../api/_lib/services/reporting/periods.js");
  const metrics = { one: 0, batch: 0, statements: [] };
  const db = {
    async one(sql) {
      metrics.one += 1;
      assert.match(sql, /period_closures/);
      return null;
    },
    async batch(statements) {
      metrics.batch += 1;
      metrics.statements.push(statements.length);
      return statements.map((statement) => {
        if (statement.sql.includes("transaction_count")) return { rows: [{ transaction_count: 0, active_count: 0, cancelled_count: 0, income_total: 0, expense_total: 0 }] };
        if (statement.sql.includes("envelope_period_id IS NULL")) return { rows: [{ count: 0 }] };
        if (statement.sql.includes("protected_account_id")) return { rows: [] };
        if (statement.sql.includes("FROM system_config")) return { rows: [{ key: "currency", value: "IDR" }, { key: "timezone", value: "Asia/Jakarta" }] };
        if (statement.sql.includes("GROUP BY idempotency_key,created_by")) return { rows: [] };
        if (statement.sql.includes("COUNT(*) AS count") || statement.sql.includes("COUNT(DISTINCT")) return { rows: [{ count: 0 }] };
        return { rows: [] };
      });
    },
  };
  const result = await previewClosePeriod(db, {
    actor: { user_id: "u1", role: "owner" },
    payload: { period_key: "2026-07" },
  });
  assert.equal(result.canClose, true);
  assert.equal(metrics.one, 1, "closure blocker tetap dibaca dulu agar closed period fail-fast");
  assert.equal(metrics.batch, 1, "integrity base, unallocated, dan statistik harus satu batch setelah blocker");
  assert.deepEqual(metrics.statements, [19]);
});
