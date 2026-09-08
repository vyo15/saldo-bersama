import assert from "node:assert/strict";
import test from "node:test";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { createTransaction } from "../../api/_lib/services/finance.js";
import { createEnvelope, listEnvelopes } from "../../api/_lib/services/planning/envelopes.js";
import { createRecurringRule, listRecurring } from "../../api/_lib/services/planning/recurring.js";
import { dashboardOverview, monthlyReport } from "../../api/_lib/services/reporting/dashboard.js";
import { createReconciliation } from "../../api/_lib/services/reporting/reconciliations.js";
import { visibleAccounts } from "../../api/_lib/services/readModels.js";
import { buyInvestment, createInvestmentPortfolio, investmentOverview, reconcileInvestment, upsertInvestmentInstrument } from "../../api/_lib/services/investments.js";
import { monthBounds, todayJakarta } from "../../api/_lib/services/core.js";

const owner = { user_id: "owner", firebase_uid: "uid-owner", email: "owner@example.com", name: "Owner", role: "owner", status: "active" };
const now = "2026-09-07T06:00:00.000Z";
const today = todayJakarta();
const period = today.slice(0, 7);
const bounds = monthBounds(period);

const context = (action, payload = {}, options = {}) => ({
  actor: owner,
  action,
  payload,
  rowVersion: options.rowVersion ?? payload.row_version ?? null,
  idempotencyKey: options.key || `${action}:${Math.random().toString(16).slice(2)}`,
  requestId: options.key || `test:${action}:${Math.random().toString(16).slice(2)}`,
  signedActor: { uid: owner.firebase_uid },
  enqueueMirror: async () => {},
  today,
});

const seed = async () => {
  const db = await createSqliteTestDatabase();
  await db.execute(
    "INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [owner.user_id, owner.firebase_uid, owner.email, owner.name, owner.role, owner.status, 1, now, now],
  );
  for (const row of [
    ["bank", "BCA", "bank", 20_000_000],
    ["rdn", "Ajaib RDN", "investment", 15_000_000],
  ]) {
    await db.execute(
      "INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [row[0], row[1], row[2], "shared", null, row[3], "2026-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now],
    );
  }
  await db.execute(
    "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ["expense", "Belanja", "expense", "variable", "", "active", 1, owner.user_id, now, owner.user_id, now],
  );
  await db.execute(
    "INSERT INTO categories(category_id,name,transaction_type,nature,icon,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ["income", "Gaji", "income", "fixed", "", "active", 1, owner.user_id, now, owner.user_id, now],
  );
  return db;
};

const seedLegacyInvestmentPlanning = async (db) => {
  await db.execute(
    "INSERT INTO envelope_rules(envelope_rule_id,name,period_type,scope,owner_user_id,default_amount,source_account_id,rollover_policy,overspend_policy,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["legacy-rdn-rule", "Legacy RDN", "monthly", "shared", null, 5_000_000, "rdn", "unallocated", "confirm", "active", 1, owner.user_id, now, owner.user_id, now],
  );
  await db.execute(
    "INSERT INTO envelope_periods(envelope_period_id,envelope_rule_id,name,period_start,period_end,allocated_amount,reserved_amount,status,row_version,created_by,created_at,updated_by,updated_at,closed_by,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["legacy-rdn-period", "legacy-rdn-rule", "Legacy RDN", bounds.start, bounds.end, 5_000_000, 0, "active", 1, owner.user_id, now, owner.user_id, now, null, null],
  );
  await db.execute(
    "INSERT INTO recurring_rules(recurring_rule_id,name,kind,category_id,expected_amount,frequency,due_day,default_account_id,payment_method,auto_debit,start_date,end_date,priority,status,row_version,created_by,created_at,updated_by,updated_at,scope,owner_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ["legacy-rdn-recurring", "Legacy bill RDN", "expense", "expense", 3_000_000, "monthly", 7, "rdn", "", 0, bounds.start, null, "normal", "active", 1, owner.user_id, now, owner.user_id, now, "shared", null],
  );
  await db.execute(
    "INSERT INTO recurring_occurrences(occurrence_id,recurring_rule_id,period_key,due_date,expected_amount,actual_amount,status,transaction_ids_json,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ["legacy-rdn-occurrence", "legacy-rdn-recurring", period, today, 3_000_000, 0, "expected", "[]", 1, now, now],
  );
};

test("dashboard memisahkan Cash RDN dari saldo rekening, dana aman, dan alokasi operasional termasuk legacy planning", async () => {
  const db = await seed();
  try {
    await seedLegacyInvestmentPlanning(db);
    const overview = await dashboardOverview(db, context("dashboard.overview", { period }));
    assert.equal(overview.totalBalance, 35_000_000);
    assert.equal(overview.nonInvestmentBalance, 20_000_000);
    assert.equal(overview.liquidBalance, 20_000_000);
    assert.equal(overview.safeToSpend, 20_000_000);
    assert.equal(overview.unallocatedFunds, 20_000_000);
    assert.equal(overview.allocatedRemaining, 0);
    assert.equal(overview.reservedBills, 0);

    const envelopes = await listEnvelopes(db, context("envelopes.list", { period }));
    const legacyEnvelope = envelopes.items.find((item) => item.envelope_period_id === "legacy-rdn-period");
    assert.equal(legacyEnvelope.source_account_type, "investment");
    assert.equal(legacyEnvelope.can_adjust, false);
    assert.equal(legacyEnvelope.can_move, false);
    assert.equal(legacyEnvelope.can_record_expense, false);

    const recurring = await listRecurring(db, context("recurring.list", { period }));
    const legacyRecurring = recurring.items.find((item) => item.occurrence_id === "legacy-rdn-occurrence");
    assert.equal(legacyRecurring.default_account_type, "investment");
    assert.equal(legacyRecurring.can_pay, false);

    const withdrawal = await createTransaction(db, context("transactions.create", {
      transaction_date: today, transaction_type: "transfer", source_account_id: "rdn", destination_account_id: "bank", amount: 1_000_000, description: "Tarik Cash RDN legacy",
    }));
    assert.equal(withdrawal.transaction_type, "transfer");
  } finally {
    db.close();
  }
});

test("ordinary transaction, Alokasi Dana, dan Jadwal Rutin menolak RDN sementara Transfer tetap valid", async () => {
  const db = await seed();
  try {
    await assert.rejects(
      () => createTransaction(db, context("transactions.create", {
        transaction_date: today, transaction_type: "expense", source_account_id: "rdn", category_id: "expense", amount: 100_000, description: "Tidak boleh",
      })),
      (error) => error.code === "INVESTMENT_ACCOUNT_TRANSFER_ONLY",
    );
    await assert.rejects(
      () => createTransaction(db, context("transactions.create", {
        transaction_date: today, transaction_type: "income", destination_account_id: "rdn", category_id: "income", amount: 100_000, description: "Tidak boleh",
      })),
      (error) => error.code === "INVESTMENT_ACCOUNT_TRANSFER_ONLY",
    );
    await assert.rejects(
      () => createTransaction(db, context("transactions.create", {
        transaction_date: today, transaction_type: "refund", destination_account_id: "rdn", category_id: "expense", amount: 100_000, description: "Refund biasa tidak boleh",
      })),
      (error) => error.code === "INVESTMENT_ACCOUNT_TRANSFER_ONLY",
    );
    await assert.rejects(
      () => createTransaction(db, context("transactions.create", {
        transaction_date: today, transaction_type: "adjustment", source_account_id: "rdn", amount: 100_000, description: "Koreksi biasa tidak boleh",
      })),
      (error) => error.code === "INVESTMENT_ACCOUNT_TRANSFER_ONLY",
    );

    await assert.rejects(
      () => createEnvelope(db, context("envelopes.create", {
        name: "Investasi bukan alokasi", default_amount: 1_000_000, allocated_amount: 1_000_000, source_account_id: "rdn",
        period_type: "monthly", period_start: bounds.start, period_end: bounds.end, rollover_policy: "unallocated", overspend_policy: "confirm",
      })),
      (error) => error.code === "INVESTMENT_ACCOUNT_NOT_OPERATIONAL",
    );
    await assert.rejects(
      () => createRecurringRule(db, context("recurring.create", {
        name: "Rutin RDN", kind: "expense", category_id: "expense", expected_amount: 500_000, frequency: "monthly", due_day: 7,
        default_account_id: "rdn", start_date: today, priority: "normal",
      })),
      (error) => error.code === "INVESTMENT_ACCOUNT_NOT_OPERATIONAL",
    );

    const transfer = await createTransaction(db, context("transactions.create", {
      transaction_date: today, transaction_type: "transfer", source_account_id: "bank", destination_account_id: "rdn", amount: 5_000_000, description: "Dana investasi",
    }));
    assert.equal(transfer.transaction_type, "transfer");
    const overview = await dashboardOverview(db, context("dashboard.overview", { period }));
    assert.equal(overview.totalBalance, 35_000_000);
    assert.equal(overview.nonInvestmentBalance, 15_000_000);
    assert.equal(overview.safeToSpend, 15_000_000);
  } finally {
    db.close();
  }
});


test("RDN memakai reconciliation Investasi dan alert selesai dari checkpoint portfolio", async () => {
  const db = await seed();
  try {
    const accounts = await visibleAccounts(db, owner);
    const rdn = accounts.find((item) => item.account_id === "rdn");
    assert.equal(rdn.can_reconcile, false, "RDN tidak boleh ditawarkan ke generic account reconciliation.");

    await assert.rejects(
      () => createReconciliation(db, context("reconciliations.create", { account_id: "rdn", actual_balance: 15_000_000 })),
      (error) => error.code === "INVESTMENT_RECONCILIATION_REQUIRED",
    );

    const beforeSetup = await dashboardOverview(db, context("dashboard.overview", { period }));
    assert.equal(beforeSetup.alerts.some((item) => item.type.startsWith("investment_reconciliation_")), false, "RDN tanpa portfolio tidak boleh diarahkan ke workflow yang belum tersedia.");

    const portfolio = await createInvestmentPortfolio(db, context("investments.portfolios.create", { name: "Ajaib", broker: "ajaib", rdn_account_id: "rdn" }));
    const withPortfolio = await dashboardOverview(db, context("dashboard.overview", { period }));
    const alert = withPortfolio.alerts.find((item) => item.type === "investment_reconciliation_stale");
    assert.equal(alert?.targetPath, "/investasi");
    assert.match(alert?.title || "", /Investasi|investasi/);

    const result = await reconcileInvestment(db, context("investments.reconciliations.create", {
      portfolio_id: portfolio.portfolio_id,
      reconciliation_date: today,
      actual_cash: 15_000_000,
      holdings: [],
      notes: "Cocok",
    }, { rowVersion: portfolio.row_version }));
    assert.equal(result.status, "matched");

    const afterReconciliation = await dashboardOverview(db, context("dashboard.overview", { period }));
    assert.equal(afterReconciliation.alerts.some((item) => item.type.startsWith("investment_reconciliation_")), false, "Checkpoint Investasi hari ini harus menyelesaikan alert RDN.");
  } finally {
    db.close();
  }
});

test("trend laporan merekonsiliasi investment_account_events dan total kekayaan tidak perlu double-count Cash RDN", async () => {
  const db = await seed();
  try {
    await createTransaction(db, context("transactions.create", {
      transaction_date: today, transaction_type: "transfer", source_account_id: "bank", destination_account_id: "rdn", amount: 5_000_000, description: "Dana investasi",
    }));
    const portfolio = await createInvestmentPortfolio(db, context("investments.portfolios.create", { name: "Ajaib", broker: "ajaib", rdn_account_id: "rdn" }));
    const instrument = await upsertInvestmentInstrument(db, context("investments.instruments.upsert", { ticker: "BBCA", name: "Bank Central Asia", exchange: "IDX", lot_size: 100 }));
    await buyInvestment(db, context("investments.trades.buy", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, lots: 5, price_per_share: 10_000, fee_amount: 0,
    }, { rowVersion: portfolio.row_version }));

    const dashboard = await dashboardOverview(db, context("dashboard.overview", { period }));
    const investments = await investmentOverview(db, context("investments.overview"));
    assert.equal(dashboard.totalBalance, 30_000_000);
    assert.equal(dashboard.nonInvestmentBalance, 15_000_000);
    assert.equal(investments.summary.rdn_cash, 15_000_000);
    assert.equal(investments.summary.market_value, 5_000_000);
    assert.equal(investments.summary.portfolio_value, 20_000_000);
    assert.equal(dashboard.nonInvestmentBalance + investments.summary.portfolio_value, 35_000_000);

    const report = await monthlyReport(db, context("reports.monthly", { period, trend_months: 1 }));
    assert.equal(report.trend.items.at(-1)?.totalBalance, dashboard.totalBalance);
  } finally {
    db.close();
  }
});
