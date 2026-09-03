import assert from "node:assert/strict";
import test from "node:test";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import {
  buyInvestment, correctInvestment, createInvestmentPortfolio, investmentOverview, reconcileInvestment, sellInvestment, updateInvestmentValuation, upsertInvestmentInstrument,
} from "../../api/_lib/services/investments.js";
import { snapshotDatabase, validateSnapshot } from "../../api/_lib/services/maintenance/shared.js";
import { integrityIssues } from "../../api/_lib/services/reporting/integrity.js";
import { visibleAccounts } from "../../api/_lib/services/readModels.js";
import { prepareAccountCreatePayload } from "../../api/_lib/services/masterData/accounts.js";

const NOW = "2026-09-02T01:00:00.000Z";
const TODAY = "2026-09-02";
const owner = { user_id: "owner", email: "owner@example.com", role: "owner" };
const member = { user_id: "member", email: "member@example.com", role: "member" };

const context = (actor, action, payload = {}, { rowVersion = null, key = `${action}:12345678` } = {}) => ({
  action, payload, rowVersion, idempotencyKey: key, requestId: key, actor, signedActor: { uid: `uid-${actor.user_id}` }, today: TODAY,
});

const seed = async ({ initialBalance = 10_000_000, personalOwner = null } = {}) => {
  const db = await createSqliteTestDatabase();
  for (const user of [owner, member]) {
    await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [user.user_id, `uid-${user.user_id}`, user.email, user.role === "owner" ? "Owner" : "Member", user.role, "active", 1, NOW, NOW]);
  }
  await db.execute(`INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ["rdn", "RDN Ajaib", "investment", personalOwner ? "personal" : "shared", personalOwner, initialBalance, "2026-01-01", 0, "active", 1, "owner", NOW, "owner", NOW]);
  return db;
};

const setupPortfolio = async (db, actor = owner) => {
  const portfolio = await createInvestmentPortfolio(db, context(actor, "investments.portfolios.create", { name: "Ajaib", broker: "ajaib", rdn_account_id: "rdn" }));
  const instrument = await upsertInvestmentInstrument(db, context(owner, "investments.instruments.upsert", { ticker: "BBCA", name: "Bank Central Asia", exchange: "IDX", lot_size: 100 }, { key: "instrument:12345678" }));
  return { portfolio, instrument };
};

const buy = (db, actor, portfolio, instrument, overrides = {}) => buyInvestment(db, context(actor, "investments.trades.buy", {
  portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, lots: 10, price_per_share: 8_000, fee_amount: 10_000, ...overrides,
}, { rowVersion: overrides.row_version ?? portfolio.row_version, key: overrides.key || "buy:12345678" }));

test("rekening Investasi memaksa saldo non-negatif dan duplicate ownership memberi arahan RDN", async () => {
  const db = await seed();
  try {
    const prepared = await prepareAccountCreatePayload(db, owner, {
      name: "Investasi personal", account_type: "investment", owner_scope: "personal", owner_user_id: owner.user_id,
      initial_balance: 0, initial_balance_date: TODAY, allow_negative: true,
    }, { today: TODAY });
    assert.equal(prepared.allow_negative, false);
    await assert.rejects(
      () => prepareAccountCreatePayload(db, owner, {
        name: "RDN Ajaib", account_type: "investment", owner_scope: "shared", initial_balance: 0, initial_balance_date: TODAY,
      }, { today: TODAY }),
      (error) => error.code === "DUPLICATE_ACCOUNT" && /Gunakan rekening tersebut sebagai RDN/.test(error.message),
    );
  } finally { db.close(); }
});

test("portfolio manual tanpa input broker memakai metadata generik dan tetap terikat ke RDN", async () => {
  const db = await seed();
  try {
    const portfolio = await createInvestmentPortfolio(db, context(owner, "investments.portfolios.create", { rdn_account_id: "rdn" }, { key: "portfolio:manual:12345678" }));
    assert.equal(portfolio.name, "Catatan investasi");
    assert.equal(portfolio.broker, "other");
    assert.equal(portfolio.rdn_account_id, "rdn");
  } finally { db.close(); }
});

test("investment buy memakai cash RDN tanpa membuat income/expense dan valuation membentuk unrealized P/L", async () => {
  const db = await seed();
  try {
    const { portfolio, instrument } = await setupPortfolio(db);
    const trade = await buy(db, owner, portfolio, instrument);
    assert.equal(trade.cash_amount, 8_010_000);
    assert.equal(await db.one("SELECT COUNT(*) AS count FROM transactions" ).then((row) => Number(row.count)), 0);
    const account = (await visibleAccounts(db, owner)).find((item) => item.account_id === "rdn");
    assert.equal(account.balance, 1_990_000);
    const valuation = await updateInvestmentValuation(db, context(owner, "investments.valuations.update", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, valuation_date: TODAY, price_per_share: 9_000,
    }, { rowVersion: trade.row_version, key: "valuation:12345678" }));
    const overview = await investmentOverview(db, context(owner, "investments.overview"));
    assert.equal(overview.summary.cost_basis, 8_010_000);
    assert.equal(overview.summary.market_value, 9_000_000);
    assert.equal(overview.summary.unrealized_pl, 990_000);
    assert.equal(overview.summary.realized_pl, 0);
    assert.equal(valuation.row_version, 3);
  } finally { db.close(); }
});

test("overview investasi menyediakan detail saham aktual beserta sumber harga dan histori manual", async () => {
  const db = await seed();
  try {
    const { portfolio, instrument } = await setupPortfolio(db);
    const bought = await buy(db, owner, portfolio, instrument);
    await updateInvestmentValuation(db, context(owner, "investments.valuations.update", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, valuation_date: TODAY, price_per_share: 9_100,
    }, { rowVersion: bought.row_version, key: "valuation:detail:12345678" }));
    await db.execute("UPDATE investment_trades SET created_at='2026-09-02T00:00:00.000Z' WHERE portfolio_id=?", [portfolio.portfolio_id]);
    await db.execute("UPDATE investment_valuations SET created_at='2026-09-02T00:00:00.000Z' WHERE portfolio_id=?", [portfolio.portfolio_id]);
    const overview = await investmentOverview(db, context(owner, "investments.overview"));
    const item = overview.portfolios[0];
    const holding = item.holdings[0];
    assert.equal(holding.ticker, "BBCA");
    assert.equal(holding.shares, 1_000);
    assert.equal(holding.price_per_share, 9_100);
    assert.equal(holding.price_source, "valuation");
    assert.equal(item.activity[0].activity_type, "valuation");
    assert.equal(item.activity[0].instrument_id, instrument.instrument_id);
    assert.equal(item.activity[0].price_per_share, 9_100);
    assert.ok(item.activity.some((entry) => entry.activity_type === "trade" && entry.lots === 10 && entry.share_quantity === 1_000));
  } finally { db.close(); }
});

test("weighted-average cost basis tetap konsisten pada multi-buy dan partial sell", async () => {
  const db = await seed({ initialBalance: 30_000_000 });
  try {
    const { portfolio, instrument } = await setupPortfolio(db);
    const first = await buy(db, owner, portfolio, instrument, { lots: 10, price_per_share: 8_000, fee_amount: 10_000 });
    const second = await buyInvestment(db, context(owner, "investments.trades.buy", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, lots: 10, price_per_share: 10_000, fee_amount: 10_000,
    }, { rowVersion: first.row_version, key: "buy:second:12345678" }));
    await db.execute("UPDATE investment_trades SET created_at='2026-09-02T00:00:00.000Z' WHERE portfolio_id=?", [portfolio.portfolio_id]);
    const sold = await sellInvestment(db, context(owner, "investments.trades.sell", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, lots: 5, price_per_share: 11_000, fee_amount: 5_000,
    }, { rowVersion: second.row_version, key: "sell:12345678" }));
    const overview = await investmentOverview(db, context(owner, "investments.overview"));
    const holding = overview.portfolios[0].holdings[0];
    assert.equal(holding.shares, 1_500);
    assert.equal(holding.cost_basis, 13_515_000);
    assert.equal(holding.average_cost, 9_010);
    assert.equal(holding.realized_pl, 990_000);
    assert.equal(sold.row_version, 4);
  } finally { db.close(); }
});

test("backend menolak buy bila RDN tidak cukup, sell melebihi holding, fee invalid, dan stale row_version", async () => {
  const db = await seed({ initialBalance: 1_000_000 });
  try {
    const { portfolio, instrument } = await setupPortfolio(db);
    await assert.rejects(() => buy(db, owner, portfolio, instrument), (error) => error.code === "INSUFFICIENT_RDN");
    await db.execute("UPDATE accounts SET initial_balance=20000000 WHERE account_id='rdn'");
    const bought = await buy(db, owner, portfolio, instrument, { key: "buy:enough:12345678" });
    await assert.rejects(() => sellInvestment(db, context(owner, "investments.trades.sell", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, lots: 11, price_per_share: 9_000, fee_amount: 0,
    }, { rowVersion: bought.row_version, key: "sell:too-many:12345678" })), (error) => error.code === "INSUFFICIENT_HOLDING");
    await assert.rejects(() => sellInvestment(db, context(owner, "investments.trades.sell", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, lots: 1, price_per_share: 1, fee_amount: 100,
    }, { rowVersion: bought.row_version, key: "sell:fee:12345678" })), (error) => error.code === "INVALID_FEE");
    await assert.rejects(() => updateInvestmentValuation(db, context(owner, "investments.valuations.update", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, price_per_share: 9_000,
    }, { rowVersion: portfolio.row_version, key: "valuation:stale:12345678" })), (error) => error.code === "CONFLICT");
  } finally { db.close(); }
});

test("member tidak dapat mengubah portfolio personal milik pengguna lain", async () => {
  const db = await seed({ personalOwner: "owner" });
  try {
    const { portfolio, instrument } = await setupPortfolio(db, owner);
    await assert.rejects(() => buy(db, member, portfolio, instrument, { key: "member-buy:12345678" }), (error) => error.code === "PORTFOLIO_FORBIDDEN");
  } finally { db.close(); }
});

test("reconciliation hanya membandingkan kondisi broker dan tidak auto-adjust", async () => {
  const db = await seed();
  try {
    const { portfolio, instrument } = await setupPortfolio(db);
    const bought = await buy(db, owner, portfolio, instrument);
    const before = await investmentOverview(db, context(owner, "investments.overview"));
    const result = await reconcileInvestment(db, context(owner, "investments.reconciliations.create", {
      portfolio_id: portfolio.portfolio_id,
      actual_cash: before.portfolios[0].rdn_cash + 1_000,
      holdings: [{ instrument_id: instrument.instrument_id, shares: 900 }],
      notes: "Dibandingkan dengan Ajaib",
    }, { rowVersion: bought.row_version, key: "reconcile:12345678" }));
    assert.equal(result.status, "mismatch");
    assert.equal(result.cash_difference, 1_000);
    assert.equal(result.holding_differences[0].difference, -100);
    const after = await investmentOverview(db, context(owner, "investments.overview"));
    assert.equal(after.portfolios[0].rdn_cash, before.portfolios[0].rdn_cash);
    assert.equal(after.portfolios[0].holdings[0].shares, 1_000);
  } finally { db.close(); }
});

test("correction owner-only menjaga histori dan menolak hasil negatif", async () => {
  const db = await seed();
  try {
    const { portfolio, instrument } = await setupPortfolio(db);
    const bought = await buy(db, owner, portfolio, instrument);
    await assert.rejects(() => correctInvestment(db, context(member, "investments.corrections.create", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, share_delta: 100, cost_basis_delta: 800_000, reason: "Koreksi broker",
    }, { rowVersion: bought.row_version, key: "correction:member:12345678" })), (error) => error.code === "OWNER_ONLY");
    const corrected = await correctInvestment(db, context(owner, "investments.corrections.create", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, share_delta: -100, cost_basis_delta: -801_000, reason: "Koreksi hasil pencocokan broker",
    }, { rowVersion: bought.row_version, key: "correction:owner:12345678" }));
    assert.equal(corrected.row_version, 3);
    const overview = await investmentOverview(db, context(owner, "investments.overview"));
    assert.equal(overview.portfolios[0].holdings[0].shares, 900);
    assert.equal(overview.portfolios[0].holdings[0].cost_basis, 7_209_000);
    assert.equal(await db.one("SELECT COUNT(*) AS count FROM investment_trades").then((row) => Number(row.count)), 1);
  } finally { db.close(); }
});


test("harga trade menjadi fallback valuation agar holding baru tidak terlihat kehilangan seluruh nilai", async () => {
  const db = await seed();
  try {
    const { portfolio, instrument } = await setupPortfolio(db);
    await buy(db, owner, portfolio, instrument);
    const overview = await investmentOverview(db, context(owner, "investments.overview"));
    const holding = overview.portfolios[0].holdings[0];
    assert.equal(holding.price_per_share, 8_000);
    assert.equal(holding.market_value, 8_000_000);
    assert.equal(holding.unrealized_pl, -10_000);
  } finally { db.close(); }
});

test("instrumen inactive menolak buy baru tetapi holding existing tetap dapat dijual", async () => {
  const db = await seed({ initialBalance: 20_000_000 });
  try {
    const { portfolio, instrument } = await setupPortfolio(db);
    const bought = await buy(db, owner, portfolio, instrument);
    await upsertInvestmentInstrument(db, context(owner, "investments.instruments.upsert", { instrument_id: instrument.instrument_id, status: "inactive" }, { rowVersion: instrument.row_version, key: "instrument:inactive:12345678" }));
    const valued = await updateInvestmentValuation(db, context(owner, "investments.valuations.update", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, valuation_date: TODAY, price_per_share: 8_500,
    }, { rowVersion: bought.row_version, key: "valuation:inactive:12345678" }));
    const sold = await sellInvestment(db, context(owner, "investments.trades.sell", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, lots: 1, price_per_share: 9_000, fee_amount: 0,
    }, { rowVersion: valued.row_version, key: "sell:inactive:12345678" }));
    assert.equal(sold.share_quantity, 100);
    await assert.rejects(() => buyInvestment(db, context(owner, "investments.trades.buy", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, lots: 1, price_per_share: 9_000, fee_amount: 0,
    }, { rowVersion: sold.row_version, key: "buy:inactive:12345678" })), (error) => error.code === "INSTRUMENT_NOT_FOUND");
  } finally { db.close(); }
});

test("aktivitas investasi sebelum tanggal saldo awal RDN ditolak backend", async () => {
  const db = await seed();
  try {
    const { portfolio, instrument } = await setupPortfolio(db);
    const beforeStart = "2025-12-31";
    await assert.rejects(() => buy(db, owner, portfolio, instrument, { trade_date: beforeStart, key: "buy:before-rdn:12345678" }), (error) => error.code === "INVESTMENT_DATE_BEFORE_RDN_START");
    await assert.rejects(() => updateInvestmentValuation(db, context(owner, "investments.valuations.update", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, valuation_date: beforeStart, price_per_share: 8_000,
    }, { rowVersion: portfolio.row_version, key: "valuation:before-rdn:12345678" })), (error) => error.code === "INVESTMENT_DATE_BEFORE_RDN_START");
    await assert.rejects(() => reconcileInvestment(db, context(owner, "investments.reconciliations.create", {
      portfolio_id: portfolio.portfolio_id, reconciliation_date: beforeStart, actual_cash: 10_000_000, holdings: [],
    }, { rowVersion: portfolio.row_version, key: "reconcile:before-rdn:12345678" })), (error) => error.code === "INVESTMENT_DATE_BEFORE_RDN_START");
    await assert.rejects(() => correctInvestment(db, context(owner, "investments.corrections.create", {
      portfolio_id: portfolio.portfolio_id, correction_date: beforeStart, cash_delta: 1_000, reason: "Koreksi broker",
    }, { rowVersion: portfolio.row_version, key: "correction:before-rdn:12345678" })), (error) => error.code === "INVESTMENT_DATE_BEFORE_RDN_START");
  } finally { db.close(); }
});

test("reconciliation bertanggal lampau membandingkan state portfolio pada tanggal tersebut", async () => {
  const db = await seed({ initialBalance: 10_000_000 });
  try {
    const { portfolio, instrument } = await setupPortfolio(db);
    const first = await buy(db, owner, portfolio, instrument, { lots: 1, fee_amount: 0, trade_date: "2026-08-01", key: "buy:historical:first:12345678" });
    const second = await buyInvestment(db, context(owner, "investments.trades.buy", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, lots: 1, price_per_share: 9_000, fee_amount: 0, trade_date: TODAY,
    }, { rowVersion: first.row_version, key: "buy:historical:second:12345678" }));
    const result = await reconcileInvestment(db, context(owner, "investments.reconciliations.create", {
      portfolio_id: portfolio.portfolio_id, reconciliation_date: "2026-08-15", actual_cash: 9_200_000, holdings: [{ instrument_id: instrument.instrument_id, shares: 100 }],
    }, { rowVersion: second.row_version, key: "reconcile:historical:12345678" }));
    assert.equal(result.status, "matched");
    assert.equal(result.recorded_cash, 9_200_000);
    assert.deepEqual(result.holding_differences, []);
    await assert.rejects(() => reconcileInvestment(db, context(owner, "investments.reconciliations.create", {
      portfolio_id: portfolio.portfolio_id, reconciliation_date: "2026-09-03", actual_cash: 0, holdings: [],
    }, { rowVersion: result.row_version, key: "reconcile:future:12345678" })), (error) => error.code === "FUTURE_DATE");
  } finally { db.close(); }
});

test("trade backdated tidak boleh menulis ulang periode yang sudah direkonsiliasi", async () => {
  const db = await seed({ initialBalance: 20_000_000 });
  try {
    const { portfolio, instrument } = await setupPortfolio(db);
    const bought = await buy(db, owner, portfolio, instrument, { lots: 1, fee_amount: 0, trade_date: "2026-08-01", key: "buy:reconcile-lock:first:12345678" });
    const reconciled = await reconcileInvestment(db, context(owner, "investments.reconciliations.create", {
      portfolio_id: portfolio.portfolio_id, reconciliation_date: "2026-08-31", actual_cash: 19_200_000, holdings: [{ instrument_id: instrument.instrument_id, shares: 100 }],
    }, { rowVersion: bought.row_version, key: "reconcile:lock:12345678" }));
    assert.equal(reconciled.status, "matched");
    await assert.rejects(() => buyInvestment(db, context(owner, "investments.trades.buy", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, lots: 1, price_per_share: 8_500, fee_amount: 0, trade_date: "2026-08-15",
    }, { rowVersion: reconciled.row_version, key: "buy:reconciled-period:12345678" })), (error) => error.code === "INVESTMENT_RECONCILED_PERIOD_LOCKED");
    const correction = await correctInvestment(db, context(owner, "investments.corrections.create", {
      portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, share_delta: 100, cost_basis_delta: 850_000, cash_delta: -850_000, correction_date: TODAY, reason: "Transaksi lama ditemukan setelah rekonsiliasi",
    }, { rowVersion: reconciled.row_version, key: "correction:reconciled-period:12345678" }));
    assert.equal(correction.row_version, reconciled.row_version + 1);
  } finally { db.close(); }
});

test("integrity checker mendeteksi arithmetic trade dan event sebelum awal RDN", async () => {
  const db = await seed();
  try {
    const { portfolio, instrument } = await setupPortfolio(db);
    await buy(db, owner, portfolio, instrument);
    await db.execute("UPDATE investment_trades SET gross_amount=gross_amount-1000,cash_amount=cash_amount-1000,trade_date='2025-12-31'");
    const issues = await integrityIssues(db);
    assert.ok(issues.some((issue) => issue.code === "INVESTMENT_TRADE_ARITHMETIC_MISMATCH"));
    assert.ok(issues.some((issue) => issue.code === "INVESTMENT_EVENT_BEFORE_RDN_START"));
  } finally { db.close(); }
});

test("backup canonical mencakup authoritative investment history dan integrity checker tetap PASS", async () => {
  const db = await seed();
  try {
    const { portfolio, instrument } = await setupPortfolio(db);
    await buy(db, owner, portfolio, instrument);
    const snapshot = await snapshotDatabase(db);
    assert.equal(snapshot.manifest.schemaVersion, 15);
    for (const table of ["investment_instruments", "investment_portfolios", "investment_trades", "investment_valuations", "investment_reconciliations", "investment_corrections"]) {
      assert.ok(Array.isArray(snapshot.tables[table]));
    }
    assert.equal(snapshot.tables.investment_trades.length, 1);
    assert.doesNotThrow(() => validateSnapshot(snapshot));
    assert.deepEqual(await integrityIssues(db), []);
  } finally { db.close(); }
});
