import { appendAudit } from "../audit.js";
import { appError, assertVersion, dateValue, nonNegativeInteger, nowIso, positiveInteger, publicRow, sanitizeText, todayJakarta, uuid } from "../core.js";
import { assertActivityAfterReconciliation, assertChronology, assertPortfolioHistoryDate, assertPortfolioOperable, bumpPortfolio, instrumentRow, portfolioRow, portfolioState, safeAdd, safeInteger, safeMultiply } from "./investmentState.js";

const createTrade = async (db, context, tradeType) => {
  const payload = context.payload || {};
  const portfolio = await portfolioRow(db, payload.portfolio_id);
  assertPortfolioOperable(context, portfolio);
  assertVersion(portfolio, context.rowVersion ?? payload.row_version);
  const instrument = await instrumentRow(db, payload.instrument_id, { active: tradeType === "buy" });
  const tradeDate = dateValue(payload.trade_date || context.today || todayJakarta(), "Tanggal transaksi investasi");
  if (tradeDate > (context.today || todayJakarta())) throw appError("FUTURE_DATE", "Transaksi investasi tidak boleh bertanggal di masa depan.", 400);
  assertPortfolioHistoryDate(portfolio, tradeDate, "Tanggal transaksi investasi");
  await assertChronology(db, portfolio.portfolio_id, tradeDate);
  await assertActivityAfterReconciliation(db, portfolio.portfolio_id, tradeDate);
  const lots = positiveInteger(payload.lots, "Jumlah lot");
  const shares = safeMultiply(lots, Number(instrument.lot_size), "Jumlah lembar");
  const price = positiveInteger(payload.price_per_share, "Harga per saham");
  const fee = nonNegativeInteger(payload.fee_amount || 0, "Fee");
  const gross = safeMultiply(shares, price, "Nilai transaksi");
  if (tradeType === "sell" && fee >= gross) throw appError("INVALID_FEE", "Fee jual harus lebih kecil dari nilai transaksi.", 400);
  const cashAmount = tradeType === "buy" ? safeAdd(gross, fee, "Dana pembelian") : gross - fee;
  const currentState = await portfolioState(db, portfolio);
  if (tradeType === "sell") {
    const holding = currentState.holdings.find((item) => item.instrument_id === instrument.instrument_id);
    if (!holding || shares > holding.shares) throw appError("INSUFFICIENT_HOLDING", "Jumlah yang dijual melebihi kepemilikan yang tersedia.", 409, { availableShares: holding?.shares || 0 });
  }
  // Schema v17 treats Buy/Sell as an investment position record only. The cash amount
  // remains part of the immutable trade history for cost basis/realized P&L, but it no
  // longer mutates an RDN/account balance. Historical v16 rows keep their old cash impact.
  const record = { trade_id: uuid(), portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, trade_type: tradeType, trade_date: tradeDate, lots, share_quantity: shares, price_per_share: price, fee_amount: fee, gross_amount: gross, cash_amount: cashAmount, cash_effect_enabled: 0, notes: sanitizeText(payload.notes, 500), idempotency_key: context.idempotencyKey, created_by: context.actor.user_id, created_at: nowIso() };
  await db.execute(`INSERT INTO investment_trades(trade_id,portfolio_id,instrument_id,trade_type,trade_date,lots,share_quantity,price_per_share,fee_amount,gross_amount,cash_amount,cash_effect_enabled,notes,idempotency_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  const rowVersion = await bumpPortfolio(db, context, portfolio);
  await appendAudit(db, context, { entityType: "investment_trade", entityId: record.trade_id, next: { ...record, row_version: rowVersion } });
  return { ...publicRow(record), row_version: rowVersion };
};

export const buyInvestment = (db, context) => createTrade(db, context, "buy");
export const sellInvestment = (db, context) => createTrade(db, context, "sell");

export const updateInvestmentValuation = async (db, context) => {
  const payload = context.payload || {};
  const portfolio = await portfolioRow(db, payload.portfolio_id);
  assertPortfolioOperable(context, portfolio);
  assertVersion(portfolio, context.rowVersion ?? payload.row_version);
  const instrument = await instrumentRow(db, payload.instrument_id);
  const valuationDate = dateValue(payload.valuation_date || context.today || todayJakarta(), "Tanggal harga");
  if (valuationDate > (context.today || todayJakarta())) throw appError("FUTURE_DATE", "Harga manual tidak boleh bertanggal di masa depan.", 400);
  assertPortfolioHistoryDate(portfolio, valuationDate, "Tanggal harga");
  const latest = await db.one("SELECT valuation_date FROM investment_valuations WHERE portfolio_id=? AND instrument_id=? ORDER BY valuation_date DESC,created_at DESC LIMIT 1", [portfolio.portfolio_id, instrument.instrument_id]);
  if (latest?.valuation_date && valuationDate < latest.valuation_date) throw appError("VALUATION_CHRONOLOGY_CONFLICT", `Harga terbaru sudah tercatat pada ${latest.valuation_date}.`, 409);
  const price = positiveInteger(payload.price_per_share, "Harga per saham");
  const record = { valuation_id: uuid(), portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, valuation_date: valuationDate, price_per_share: price, idempotency_key: context.idempotencyKey, created_by: context.actor.user_id, created_at: nowIso() };
  await db.execute("INSERT INTO investment_valuations(valuation_id,portfolio_id,instrument_id,valuation_date,price_per_share,idempotency_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)", Object.values(record));
  const rowVersion = await bumpPortfolio(db, context, portfolio);
  await appendAudit(db, context, { entityType: "investment_valuation", entityId: record.valuation_id, next: { ...record, row_version: rowVersion } });
  return { ...publicRow(record), row_version: rowVersion };
};

const actualHoldingMap = (value) => {
  if (!Array.isArray(value)) throw appError("INVALID_RECONCILIATION", "Kepemilikan aktual harus berupa daftar instrumen.", 400);
  const map = new Map();
  for (const item of value) {
    const id = String(item?.instrument_id || "");
    const shares = nonNegativeInteger(item?.shares ?? 0, "Jumlah lembar aktual");
    if (!id || map.has(id)) throw appError("INVALID_RECONCILIATION", "Instrumen aktual harus unik dan valid.", 400);
    map.set(id, shares);
  }
  return map;
};

export const reconcileInvestment = async (db, context) => {
  const payload = context.payload || {};
  const portfolio = await portfolioRow(db, payload.portfolio_id);
  assertPortfolioOperable(context, portfolio);
  assertVersion(portfolio, context.rowVersion ?? payload.row_version);
  const reconciliationDate = dateValue(payload.reconciliation_date || context.today || todayJakarta(), "Tanggal rekonsiliasi");
  if (reconciliationDate > (context.today || todayJakarta())) throw appError("FUTURE_DATE", "Rekonsiliasi investasi tidak boleh bertanggal di masa depan.", 400);
  assertPortfolioHistoryDate(portfolio, reconciliationDate, "Tanggal rekonsiliasi");
  const state = await portfolioState(db, portfolio, reconciliationDate);
  const actualCash = safeInteger(payload.actual_cash, "Cash RDN aktual");
  const actual = actualHoldingMap(payload.holdings || []);
  for (const id of actual.keys()) await instrumentRow(db, id);
  const recorded = new Map(state.holdings.map((item) => [item.instrument_id, item.shares]));
  const ids = [...new Set([...recorded.keys(), ...actual.keys()])].sort();
  const comparisons = ids.map((instrumentId) => ({ instrument_id: instrumentId, recorded_shares: recorded.get(instrumentId) || 0, actual_shares: actual.get(instrumentId) || 0, difference: (actual.get(instrumentId) || 0) - (recorded.get(instrumentId) || 0) }));
  const differences = comparisons.filter((item) => item.difference !== 0);
  const cashDifference = actualCash - state.rdn_cash;
  const status = cashDifference === 0 && differences.length === 0 ? "matched" : "mismatch";
  const record = { reconciliation_id: uuid(), portfolio_id: portfolio.portfolio_id, reconciliation_date: reconciliationDate, recorded_cash: state.rdn_cash, actual_cash: actualCash, recorded_holdings_json: JSON.stringify([...recorded].map(([instrument_id, shares]) => ({ instrument_id, shares }))), actual_holdings_json: JSON.stringify([...actual].map(([instrument_id, shares]) => ({ instrument_id, shares }))), difference_json: JSON.stringify({ cash_difference: cashDifference, holdings: differences }), status, notes: sanitizeText(payload.notes, 500), idempotency_key: context.idempotencyKey, created_by: context.actor.user_id, created_at: nowIso() };
  await db.execute(`INSERT INTO investment_reconciliations(reconciliation_id,portfolio_id,reconciliation_date,recorded_cash,actual_cash,recorded_holdings_json,actual_holdings_json,difference_json,status,notes,idempotency_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  const rowVersion = await bumpPortfolio(db, context, portfolio);
  await appendAudit(db, context, { entityType: "investment_reconciliation", entityId: record.reconciliation_id, next: { portfolio_id: record.portfolio_id, reconciliation_date: record.reconciliation_date, status, cash_difference: cashDifference, holding_differences: differences, row_version: rowVersion } });
  return { reconciliation_id: record.reconciliation_id, status, recorded_cash: state.rdn_cash, actual_cash: actualCash, cash_difference: cashDifference, holding_comparisons: comparisons, holding_differences: differences, row_version: rowVersion };
};

