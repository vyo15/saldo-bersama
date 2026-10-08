import { appendAudit } from "../audit.js";
import { appError, assertVersion, dateValue, nonNegativeInteger, nowIso, positiveInteger, publicRow, sanitizeText, todayJakarta, uuid } from "../core.js";
import { assertActivityAfterReconciliation, assertChronology, assertPortfolioHistoryDate, assertPortfolioOperable, bumpPortfolio, instrumentRow, portfolioRow, portfolioState, safeAdd, safeInteger, safeMultiply } from "./investmentState.js";
import { prepareGoalLinkedTrade, recordPreparedGoalLinkedTrade } from "../planning/goalInvestments.js";
import { accountBalanceAsOf, firstNegativeBalance } from "../readModels.js";
import { assertTransactionDateUnlocked } from "../finance/transactionValidation.js";
import { decimalHundredths, isMutualFund, safeRupiahFromCentsAndUnits } from "./investmentPrecision.js";

const tradeAmounts = (payload, instrument, tradeType) => {
  const fund = isMutualFund(instrument);
  const unitHundredths = fund ? decimalHundredths(payload.lots, "Jumlah unit") * Number(instrument.lot_size) : safeMultiply(positiveInteger(payload.lots, "Jumlah lot"), Number(instrument.lot_size), "Jumlah lembar") * 100;
  if (!Number.isSafeInteger(unitHundredths)) throw appError("INVALID_AMOUNT", "Jumlah unit melampaui batas aman.", 400);
  const shares = unitHundredths / 100;
  const lots = fund ? Math.ceil(Number(payload.lots)) : positiveInteger(payload.lots, "Jumlah lot");
  const priceCents = fund ? decimalHundredths(payload.price_per_share, "Nilai per unit") : positiveInteger(payload.price_per_share, "Harga per saham") * 100;
  const price = Math.max(1, Math.round(priceCents / 100));
  const fee = nonNegativeInteger(payload.fee_amount || 0, "Fee");
  if (payload.goal_id && !Number.isInteger(shares)) throw appError("FRACTIONAL_GOAL_UNSUPPORTED", "Unit reksa dana pecahan belum dapat ditautkan ke Target. Catat transaksi tanpa Target dahulu.", 409);
  const gross = safeRupiahFromCentsAndUnits(unitHundredths, priceCents, "Nilai transaksi");
  if (!gross) throw appError("INVALID_AMOUNT", "Total transaksi terlalu kecil untuk dicatat dalam Rupiah.", 400);
  if (tradeType === "sell" && fee >= gross) throw appError("INVALID_FEE", "Fee jual harus lebih kecil dari nilai transaksi.", 400);
  const cashAmount = tradeType === "buy" ? safeAdd(gross, fee, "Dana pembelian") : gross - fee;
  return { shares, lots, unitHundredths, priceCents, price, fee, gross, cashAmount };
};

const assertTradeCashAvailability = async (db, portfolio, tradeType, tradeDate, cashAmount) => {
  // Hidden compatibility portfolios deliberately retain historical no-cash semantics.
  const enabled = Number(portfolio.is_system_hidden || 0) === 0;
  if (!enabled) return false;
  await assertTransactionDateUnlocked(db, tradeDate);
  if (tradeType !== "buy") return true;
  const balance = await accountBalanceAsOf(db, portfolio, tradeDate);
  if (balance < cashAmount) throw appError("INSUFFICIENT_RDN_CASH", "Saldo RDN tidak cukup untuk pembelian ini. Transfer dana ke RDN terlebih dahulu.", 409, { balance, required: cashAmount });
  const issue = await firstNegativeBalance(db, portfolio, { candidate: {
    transaction_date: tradeDate, transaction_type: "investment", investment_account_id: portfolio.account_id,
    investment_cash_effect: -cashAmount,
  }, fromDate: tradeDate });
  if (issue) throw appError("INSUFFICIENT_RDN_CASH", "Pembelian membuat Saldo RDN negatif pada histori transaksi.", 409, { date: issue.date, balance: issue.balance });
  return true;
};

const assertSaleHoldingAvailable = (state, instrument, shares) => {
  const holding = state.holdings.find((item) => item.instrument_id === instrument.instrument_id);
  if (!holding || shares > holding.shares) throw appError("INSUFFICIENT_HOLDING", "Jumlah yang dijual melebihi kepemilikan yang tersedia.", 409, { availableShares: holding?.shares || 0 });
};

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
  const { shares, lots, unitHundredths, priceCents, price, fee, gross, cashAmount } = tradeAmounts(payload, instrument, tradeType);
  const cashEffectEnabled = await assertTradeCashAvailability(db, portfolio, tradeType, tradeDate, cashAmount);
  const currentState = await portfolioState(db, portfolio);
  if (tradeType === "sell") assertSaleHoldingAvailable(currentState, instrument, shares);
  const goalLink = await prepareGoalLinkedTrade(db, context, {
    portfolio, instrument, tradeType, shares, tradeDate, cashAmount, currentState, retainForGoal: payload.retain_for_goal !== false,
  });
  // The per-trade flag preserves historical semantics; never retroactively
  // change past trades, opening positions, or hidden asset-centric cash.
  const record = { trade_id: uuid(), portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, trade_type: tradeType, trade_date: tradeDate, lots, share_quantity: Math.ceil(shares), price_per_share: price, fee_amount: fee, gross_amount: gross, cash_amount: cashAmount, cash_effect_enabled: cashEffectEnabled ? 1 : 0, notes: sanitizeText(payload.notes, 500), idempotency_key: context.idempotencyKey, created_by: context.actor.user_id, created_at: nowIso() };
  await db.execute(`INSERT INTO investment_trades(trade_id,portfolio_id,instrument_id,trade_type,trade_date,lots,share_quantity,price_per_share,fee_amount,gross_amount,cash_amount,cash_effect_enabled,notes,idempotency_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  await db.execute("UPDATE investment_trades SET unit_quantity_hundredths=?,price_cents=? WHERE trade_id=?", [unitHundredths, priceCents, record.trade_id]);
  const goalEvent = await recordPreparedGoalLinkedTrade(db, context, goalLink, { portfolio, instrument, trade: record, tradeDate });
  const rowVersion = await bumpPortfolio(db, context, portfolio);
  const preciseRecord = { ...record, lots: Number(payload.lots), share_quantity: shares, price_per_share: priceCents / 100 };
  await appendAudit(db, context, { entityType: "investment_trade", entityId: record.trade_id, next: { ...preciseRecord, row_version: rowVersion, goal_id: goalEvent?.goal_id || "" } });
  return { ...publicRow(preciseRecord), row_version: rowVersion, goal_investment_event: goalEvent };
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
  const priceCents = isMutualFund(instrument) ? decimalHundredths(payload.price_per_share, "NAB per unit") : positiveInteger(payload.price_per_share, "Harga per saham") * 100;
  const price = Math.max(1, Math.round(priceCents / 100));
  const marketValue = payload.market_value === undefined || payload.market_value === null || payload.market_value === ""
    ? null : nonNegativeInteger(payload.market_value, "Total nilai aktual dari broker");
  const record = { valuation_id: uuid(), portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, valuation_date: valuationDate, price_per_share: price, idempotency_key: context.idempotencyKey, created_by: context.actor.user_id, created_at: nowIso() };
  await db.execute("INSERT INTO investment_valuations(valuation_id,portfolio_id,instrument_id,valuation_date,price_per_share,idempotency_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)", Object.values(record));
  await db.execute("UPDATE investment_valuations SET price_cents=?,market_value_rupiah=? WHERE valuation_id=?", [priceCents, marketValue, record.valuation_id]);
  const rowVersion = await bumpPortfolio(db, context, portfolio);
  const preciseRecord = { ...record, price_per_share: priceCents / 100, market_value: marketValue };
  await appendAudit(db, context, { entityType: "investment_valuation", entityId: record.valuation_id, next: { ...preciseRecord, row_version: rowVersion } });
  return { ...publicRow(preciseRecord), row_version: rowVersion };
};

const actualHoldingMap = (value) => {
  if (!Array.isArray(value)) throw appError("INVALID_RECONCILIATION", "Kepemilikan aktual harus berupa daftar instrumen.", 400);
  const map = new Map();
  for (const item of value) {
    const id = String(item?.instrument_id || "");
    const shares = decimalHundredths(item?.shares ?? 0, "Jumlah unit aktual", { allowZero: true }) / 100;
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
  for (const [id, shares] of actual) {
    const instrument = await instrumentRow(db, id);
    if (!isMutualFund(instrument) && !Number.isSafeInteger(shares)) throw appError("INVALID_RECONCILIATION", "Jumlah lembar saham aktual wajib bilangan bulat.", 400);
  }
  const recorded = new Map(state.holdings.map((item) => [item.instrument_id, item.shares]));
  const ids = [...new Set([...recorded.keys(), ...actual.keys()])].sort();
  const comparisons = ids.map((instrumentId) => ({ instrument_id: instrumentId, recorded_shares: recorded.get(instrumentId) || 0, actual_shares: actual.get(instrumentId) || 0, difference: Math.round(((actual.get(instrumentId) || 0) - (recorded.get(instrumentId) || 0)) * 100) / 100 }));
  const differences = comparisons.filter((item) => item.difference !== 0);
  const cashDifference = actualCash - state.rdn_cash;
  const status = cashDifference === 0 && differences.length === 0 ? "matched" : "mismatch";
  const record = { reconciliation_id: uuid(), portfolio_id: portfolio.portfolio_id, reconciliation_date: reconciliationDate, recorded_cash: state.rdn_cash, actual_cash: actualCash, recorded_holdings_json: JSON.stringify([...recorded].map(([instrument_id, shares]) => ({ instrument_id, shares }))), actual_holdings_json: JSON.stringify([...actual].map(([instrument_id, shares]) => ({ instrument_id, shares }))), difference_json: JSON.stringify({ cash_difference: cashDifference, holdings: differences }), status, notes: sanitizeText(payload.notes, 500), idempotency_key: context.idempotencyKey, created_by: context.actor.user_id, created_at: nowIso() };
  await db.execute(`INSERT INTO investment_reconciliations(reconciliation_id,portfolio_id,reconciliation_date,recorded_cash,actual_cash,recorded_holdings_json,actual_holdings_json,difference_json,status,notes,idempotency_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  const rowVersion = await bumpPortfolio(db, context, portfolio);
  await appendAudit(db, context, { entityType: "investment_reconciliation", entityId: record.reconciliation_id, next: { portfolio_id: record.portfolio_id, reconciliation_date: record.reconciliation_date, status, cash_difference: cashDifference, holding_differences: differences, row_version: rowVersion } });
  return { reconciliation_id: record.reconciliation_id, status, recorded_cash: state.rdn_cash, actual_cash: actualCash, cash_difference: cashDifference, holding_comparisons: comparisons, holding_differences: differences, row_version: rowVersion };
};

