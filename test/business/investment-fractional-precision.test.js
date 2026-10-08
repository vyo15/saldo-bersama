import assert from "node:assert/strict";
import test from "node:test";
import { createSqliteTestDatabase } from "../helpers/sqlite-test-database.js";
import { buyInvestment, createInvestmentAssetPosition, createInvestmentPortfolio, investmentOverview, reconcileInvestment, sellInvestment, updateInvestmentValuation, upsertInvestmentInstrument } from "../../api/_lib/services/investments.js";
import { integrityIssues } from "../../api/_lib/services/reporting/integrity.js";
import { decimalHundredths, safeRupiahFromCentsAndUnits } from "../../api/_lib/services/investments/investmentPrecision.js";
import { investmentOpeningPositionPreview, validateInvestmentAssetPosition, validateInvestmentOperation } from "../../frontend/src/features/investments/investments.model.js";

const today = "2026-09-02";
const now = `${today}T00:00:00.000Z`;
const owner = { user_id: "owner", role: "owner", email: "owner@local.test" };
const context = (action, payload = {}, key = `${action}:unique:12345678`) => ({ action, payload, actor: owner, signedActor: { uid: "owner-firebase" }, today, idempotencyKey: key, requestId: key, rowVersion: payload.row_version ?? null });
const initialize = async () => {
  const db = await createSqliteTestDatabase();
  await db.execute("INSERT INTO users(user_id,firebase_uid,email,name,role,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", [owner.user_id, "owner-firebase", owner.email, "Owner", owner.role, "active", 1, now, now]);
  await db.execute("INSERT INTO accounts(account_id,name,account_type,owner_scope,owner_user_id,initial_balance,initial_balance_date,allow_negative,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ["rdn", "RDN investasi", "investment", "personal", owner.user_id, 20_000_000, "2026-01-01", 0, "active", 1, owner.user_id, now, owner.user_id, now]);
  const portfolio = await createInvestmentPortfolio(db, context("investments.portfolios.create", { name: "Ajaib", rdn_account_id: "rdn" }));
  const fund = await upsertInvestmentInstrument(db, context("investments.instruments.upsert", { ticker: "IHAJJ", name: "Reksa Dana Haji Syariah", exchange: "REKSADANA", lot_size: 1 }, "fund-instrument:12345678"));
  return { db, portfolio, fund };
};

test("harga dan unit desimal tetap presisi, modal aktual dari broker tidak dihitung ulang dari avg yang dibulatkan", async () => {
  const { db, fund } = await initialize();
  try {
    const position = await createInvestmentAssetPosition(db, context("investments.assets.create", {
      instrument_id: fund.instrument_id, shares: 977.56, cost_basis: 5_512_754, reference_price: 5696.59, position_date: today,
    }, "fractional-opening:12345678"));
    const raw = await db.one("SELECT share_delta,unit_delta_hundredths,reference_price,reference_price_cents FROM investment_corrections WHERE correction_id=?", [position.correction_id]);
    assert.equal(raw.unit_delta_hundredths, 97756);
    assert.equal(raw.reference_price_cents, 569659);
    const current = await investmentOverview(db, context("investments.overview"));
    const holding = current.portfolios[0].holdings[0];
    assert.equal(holding.shares, 977.56);
    assert.equal(holding.price_per_share, 5696.59);
    assert.equal(holding.cost_basis, 5_512_754);
    assert.equal(holding.market_value, safeRupiahFromCentsAndUnits(97756, 569659));
    assert.equal(holding.unrealized_pl, holding.market_value - 5_512_754);
    assert.equal(current.portfolios[0].activity[0].share_delta, 977.56);
    assert.deepEqual(await integrityIssues(db), []);
  } finally { db.close(); }
});

test("Beli/Jual reksa dana pecahan memotong/mengembalikan RDN tepat sekali dan mempertahankan unit hingga nol", async () => {
  const { db, portfolio, fund } = await initialize();
  try {
    const bought = await buyInvestment(db, context("investments.trades.buy", {
      portfolio_id: portfolio.portfolio_id, instrument_id: fund.instrument_id, row_version: portfolio.row_version, lots: 2.75, price_per_share: 2058.73, trade_date: today,
    }, "fund-buy:12345678"));
    assert.equal(bought.cash_amount, safeRupiahFromCentsAndUnits(275, 205873));
    const stored = await db.one("SELECT unit_quantity_hundredths,price_cents FROM investment_trades WHERE trade_id=?", [bought.trade_id]);
    assert.deepEqual({ ...stored }, { unit_quantity_hundredths: 275, price_cents: 205873 });
    const afterBuy = await investmentOverview(db, context("investments.overview"));
    assert.equal(afterBuy.portfolios[0].holdings[0].shares, 2.75);
    assert.equal(afterBuy.portfolios[0].rdn_cash, 20_000_000 - bought.cash_amount);

    const sold = await sellInvestment(db, context("investments.trades.sell", {
      portfolio_id: portfolio.portfolio_id, instrument_id: fund.instrument_id, row_version: bought.row_version, lots: 0.5, price_per_share: 2101.67, trade_date: today,
    }, "fund-sell:12345678"));
    assert.equal(sold.cash_amount, safeRupiahFromCentsAndUnits(50, 210167));
    const afterSell = await investmentOverview(db, context("investments.overview"));
    assert.equal(afterSell.portfolios[0].holdings[0].shares, 2.25);
    assert.equal(afterSell.portfolios[0].rdn_cash, 20_000_000 - bought.cash_amount + sold.cash_amount);
    assert.deepEqual(await integrityIssues(db), []);
    const valuation = await updateInvestmentValuation(db, context("investments.valuations.update", {
      portfolio_id: portfolio.portfolio_id, instrument_id: fund.instrument_id, row_version: sold.row_version, valuation_date: today, price_per_share: 5696.59,
    }, "fund-valuation:12345678"));
    const afterValuation = await investmentOverview(db, context("investments.overview"));
    assert.equal(valuation.price_per_share, 5696.59);
    assert.equal(afterValuation.portfolios[0].holdings[0].price_per_share, 5696.59);
    assert.equal(afterValuation.portfolios[0].holdings[0].market_value, safeRupiahFromCentsAndUnits(225, 569659));
  } finally { db.close(); }
});

test("validasi reksa dana menerima 977,56 unit dan harga 5.696,59 serta menolak presisi >2", () => {
  const fund = { instrument_id: "fund", ticker: "IHAJJ", exchange: "REKSADANA", lot_size: 1, status: "active" };
  const form = { ticker: "IHAJJ", opening_quantity: "977.56", average_price: "5639.27", reference_price: "5696.59", cost_basis: "5512754", position_date: today };
  assert.deepEqual(validateInvestmentAssetPosition(form, fund, today), {});
  const preview = investmentOpeningPositionPreview({ ...form, instrument_id: "fund" }, [fund]);
  assert.equal(preview.shares, 977.56);
  assert.equal(preview.costBasis, 5512754);
  assert.equal(preview.marketValue, safeRupiahFromCentsAndUnits(97756, 569659));
  const invalid = validateInvestmentAssetPosition({ ...form, reference_price: "5696.599" }, fund, today);
  assert.match(invalid.reference_price, /maksimal 2/);
  const portfolio = { holdings: [{ instrument_id: "fund", shares: 977.56 }] };
  assert.deepEqual(validateInvestmentOperation("sell", { instrument_id: "fund", lots: "0.01", price_per_share: "5696.59", trade_date: today }, { instruments: [fund], portfolio, today }), {});
  assert.equal(decimalHundredths("977.56", "unit"), 97756);
  assert.throws(() => decimalHundredths("977.567", "unit"), /maksimal dua/);
});


test("angka portofolio Ajaib persis: saham BBCA dan dua reksa dana, tanpa memaksa hasil perkalian tampilan", async () => {
  const { db, portfolio, fund } = await initialize();
  try {
    const create = (payload, key) => createInvestmentAssetPosition(db, context("investments.assets.create", { position_date: today, ...payload }, key));
    await create({ instrument_id: fund.instrument_id, shares: 977.56, average_price: 5639.27, cost_basis: 5512754, reference_price: 5696.59, market_value: 5568784 }, "ajaib-hajj:12345678");
    await create({ ticker: "CAPFIX", name: "Capital Fixed Income Fund", exchange: "REKSADANA", lot_size: 1, shares: 1698.78, average_price: 2058.73, cost_basis: 3497328, reference_price: 2101.67, market_value: 3570273 }, "ajaib-cap:12345678");
    await create({ ticker: "BBCA", name: "Bank Central Asia", exchange: "IDX", lot_size: 100, shares: 1600, average_price: 7114.06, cost_basis: 11382499, reference_price: 6150, market_value: 9840000 }, "ajaib-bbca:12345678");
    const overview = await investmentOverview(db, context("investments.overview"));
    const holdings = overview.portfolios[0].holdings;
    const hajj = holdings.find((h) => h.instrument_id === fund.instrument_id);
    const capital = holdings.find((h) => h.ticker === "CAPFIX");
    const bbca = holdings.find((h) => h.ticker === "BBCA");
    assert.deepEqual([hajj.shares, hajj.average_cost, hajj.cost_basis, hajj.price_per_share, hajj.market_value, hajj.unrealized_pl], [977.56, 5639.27, 5512754, 5696.59, 5568784, 56030]);
    assert.deepEqual([capital.shares, capital.average_cost, capital.cost_basis, capital.price_per_share, capital.market_value, capital.unrealized_pl], [1698.78, 2058.73, 3497328, 2101.67, 3570273, 72945]);
    assert.deepEqual([bbca.shares, bbca.average_cost, bbca.cost_basis, bbca.price_per_share, bbca.market_value, bbca.unrealized_pl], [1600, 7114.06, 11382499, 6150, 9840000, -1542499]);
    assert.equal(hajj.market_value_source, "broker_snapshot");
    assert.deepEqual(await integrityIssues(db), []);
    const result = await reconcileInvestment(db, context("investments.reconciliations.create", {
      portfolio_id: portfolio.portfolio_id, row_version: 4, reconciliation_date: today, actual_cash: 20_000_000,
      holdings: holdings.map((h) => ({ instrument_id: h.instrument_id, shares: h.shares })),
    }, "ajaib-reconcile:12345678"));
    assert.equal(result.status, "matched");
  } finally { db.close(); }
});

test("snapshot broker diperbarui tanpa mengubah NAV, dan diabaikan setelah transaksi jual/beli berikutnya", async () => {
  const { db, portfolio, fund } = await initialize();
  try {
    const position = await createInvestmentAssetPosition(db, context("investments.assets.create", {
      instrument_id: fund.instrument_id, shares: 977.56, cost_basis: 5512754,
      reference_price: 5696.59, market_value: 5568784, position_date: today,
    }, "fund-snapshot:12345678"));
    const updated = await updateInvestmentValuation(db, context("investments.valuations.update", {
      portfolio_id: portfolio.portfolio_id, instrument_id: fund.instrument_id, row_version: position.row_version,
      valuation_date: today, price_per_share: 5696.59, market_value: 5568781,
    }, "fund-new-snapshot:12345678"));
    const afterSnapshot = await investmentOverview(db, context("investments.overview"));
    assert.equal(afterSnapshot.portfolios[0].holdings[0].market_value, 5568781);
    assert.equal(afterSnapshot.portfolios[0].holdings[0].price_per_share, 5696.59);
    await buyInvestment(db, context("investments.trades.buy", {
      portfolio_id: portfolio.portfolio_id, instrument_id: fund.instrument_id, row_version: updated.row_version,
      lots: 0.01, price_per_share: 5696.59, trade_date: today,
    }, "fund-after-snapshot:12345678"));
    const afterBuy = await investmentOverview(db, context("investments.overview"));
    const holding = afterBuy.portfolios[0].holdings[0];
    assert.equal(holding.shares, 977.57);
    assert.equal(holding.market_value_source, "calculated");
    assert.equal(holding.market_value, safeRupiahFromCentsAndUnits(97757, 569659));
  } finally { db.close(); }
});
