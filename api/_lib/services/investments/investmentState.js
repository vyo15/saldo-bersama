import { appError, nowIso, sanitizeText, todayJakarta } from "../core.js";
import { accountBalanceAsOf } from "../readModels.js";
import { safeRupiahFromCentsAndUnits, proportionalCost } from "./investmentPrecision.js";

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const INTEGER_PATTERN = /^-?\d+$/;

export const safeInteger = (value, label, { allowNegative = false, allowZero = true } = {}) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || (!allowNegative && number < 0) || (!allowZero && number === 0)) {
    throw appError("INVALID_AMOUNT", `${label} harus berupa bilangan bulat yang valid.`, 400);
  }
  return number;
};

export const safeMultiply = (a, b, label = "Nominal") => {
  const result = BigInt(a) * BigInt(b);
  if (result < 0n || result > MAX_SAFE_BIGINT) throw appError("AMOUNT_TOO_LARGE", `${label} melampaui batas nominal aman.`, 400);
  return Number(result);
};

export const safeAdd = (a, b, label = "Nominal") => {
  const result = BigInt(a) + BigInt(b);
  if (result < 0n || result > MAX_SAFE_BIGINT) throw appError("AMOUNT_TOO_LARGE", `${label} melampaui batas nominal aman.`, 400);
  return Number(result);
};

export const tickerValue = (value) => {
  const ticker = sanitizeText(value, 16).toUpperCase();
  if (!/^[A-Z0-9.-]{1,16}$/.test(ticker)) throw appError("INVALID_TICKER", "Ticker hanya boleh berisi huruf besar, angka, titik, atau tanda hubung.", 400);
  return ticker;
};

export const exchangeValue = (value) => {
  const exchange = sanitizeText(value || "IDX", 16).toUpperCase();
  if (!/^[A-Z0-9.-]{2,16}$/.test(exchange)) throw appError("INVALID_EXCHANGE", "Kode bursa tidak valid.", 400);
  return exchange;
};

export const portfolioRow = async (db, portfolioId) => db.one(`SELECT p.*,a.account_id,a.name AS rdn_account_name,a.account_type,a.owner_scope,a.owner_user_id,a.allow_negative,a.is_system_hidden,a.initial_balance,a.initial_balance_date,a.status AS rdn_status
  FROM investment_portfolios p JOIN accounts a ON a.account_id=p.rdn_account_id WHERE p.portfolio_id=?`, [String(portfolioId || "")]);

export const assertPortfolioReadable = (portfolio) => {
  if (!portfolio || portfolio.status !== "active" || portfolio.rdn_status !== "active") throw appError("PORTFOLIO_NOT_FOUND", "Portfolio investasi aktif tidak ditemukan.", 404);
};

export const assertPortfolioOperable = (context, portfolio) => {
  assertPortfolioReadable(portfolio);
  if (portfolio.owner_scope === "shared") return;
  if (portfolio.owner_scope === "personal" && portfolio.owner_user_id === context.actor.user_id) return;
  throw appError("PORTFOLIO_FORBIDDEN", "Portfolio pribadi pasangan hanya dapat dilihat, bukan diubah.", 403);
};

export const instrumentRow = async (db, instrumentId, { active = false } = {}) => {
  const row = await db.one("SELECT * FROM investment_instruments WHERE instrument_id=?", [String(instrumentId || "")]);
  if (!row || (active && row.status !== "active")) throw appError("INSTRUMENT_NOT_FOUND", active ? "Instrumen investasi aktif tidak ditemukan." : "Instrumen investasi tidak ditemukan.", 404);
  return row;
};

export const latestActivityDate = async (db, portfolioId) => {
  const row = await db.one(`SELECT MAX(activity_date) AS activity_date FROM (
    SELECT trade_date AS activity_date FROM investment_trades WHERE portfolio_id=?
    UNION ALL SELECT correction_date FROM investment_corrections WHERE portfolio_id=?
  )`, [portfolioId, portfolioId]);
  return String(row?.activity_date || "");
};

export const assertChronology = async (db, portfolioId, date) => {
  const latest = await latestActivityDate(db, portfolioId);
  if (latest && date < latest) throw appError("INVESTMENT_CHRONOLOGY_CONFLICT", `Aktivitas investasi harus dicatat berurutan. Tanggal terakhir yang sudah tersimpan adalah ${latest}.`, 409, { latestDate: latest });
};

export const assertActivityAfterReconciliation = async (db, portfolioId, activityDate) => {
  const row = await db.one("SELECT MAX(reconciliation_date) AS reconciliation_date FROM investment_reconciliations WHERE portfolio_id=?", [portfolioId]);
  const latest = String(row?.reconciliation_date || "");
  if (latest && activityDate <= latest) {
    throw appError("INVESTMENT_RECONCILED_PERIOD_LOCKED", `Periode sampai ${latest} sudah direkonsiliasi. Gunakan Koreksi untuk selisih historis agar checkpoint rekonsiliasi tidak ditulis ulang.`, 409, { reconciliationDate: latest });
  }
};

export const normalizeEvents = async (db, portfolioId, cutoffDate = null) => {
  const cutoff = cutoffDate ? " AND trade_date<=?" : "";
  const correctionCutoff = cutoffDate ? " AND correction_date<=?" : "";
  return db.all(`SELECT trade_date AS event_date,created_at,'trade' AS event_kind,trade_type AS event_type,trade_id AS event_id,instrument_id,trade_type,lots,COALESCE(unit_quantity_hundredths/100.0,share_quantity) AS share_quantity,COALESCE(price_cents/100.0,price_per_share) AS price_per_share,fee_amount,gross_amount,cash_amount,0 AS share_delta,0 AS cost_basis_delta,0 AS cash_delta,0 AS average_price,notes,0 AS event_priority,rowid AS source_order
    FROM investment_trades WHERE portfolio_id=?${cutoff}
    UNION ALL
    SELECT correction_date AS event_date,created_at,'correction' AS event_kind,correction_type AS event_type,correction_id AS event_id,instrument_id,'' AS trade_type,0 AS lots,0 AS share_quantity,COALESCE(reference_price_cents/100.0,reference_price) AS price_per_share,0 AS fee_amount,0 AS gross_amount,0 AS cash_amount,COALESCE(unit_delta_hundredths/100.0,share_delta) AS share_delta,cost_basis_delta,cash_delta,COALESCE(average_price_cents/100.0,0) AS average_price,notes,1 AS event_priority,rowid AS source_order
    FROM investment_corrections WHERE portfolio_id=?${correctionCutoff}
    ORDER BY event_date,created_at,event_priority,source_order`, cutoffDate ? [portfolioId, cutoffDate, portfolioId, cutoffDate] : [portfolioId, portfolioId]);
};

// Harga terakhir yang diketahui boleh berasal dari trade atau snapshot manual. Tanpa fallback
// trade, holding baru akan terlihat kehilangan seluruh nilai sampai user mengisi harga manual.
export const latestKnownPrices = async (db, portfolioId, cutoffDate = null) => {
  const valuationCutoff = cutoffDate ? " AND valuation_date<=?" : "";
  const tradeCutoff = cutoffDate ? " AND trade_date<=?" : "";
  const correctionCutoff = cutoffDate ? " AND correction_date<=?" : "";
  const rows = await db.all(`SELECT instrument_id,valuation_date AS price_date,COALESCE(price_cents/100.0,price_per_share) AS price_per_share,created_at,'valuation' AS price_source,3 AS price_priority,rowid AS source_order,market_value_rupiah
    FROM investment_valuations WHERE portfolio_id=?${valuationCutoff}
    UNION ALL
    SELECT instrument_id,trade_date AS price_date,COALESCE(price_cents/100.0,price_per_share) AS price_per_share,created_at,'trade' AS price_source,2 AS price_priority,rowid AS source_order,NULL AS market_value_rupiah
    FROM investment_trades WHERE portfolio_id=?${tradeCutoff}
    UNION ALL
    SELECT instrument_id,correction_date AS price_date,COALESCE(reference_price_cents/100.0,reference_price) AS price_per_share,created_at,'opening_position' AS price_source,1 AS price_priority,rowid AS source_order,market_value_rupiah
    FROM investment_corrections WHERE portfolio_id=? AND correction_type='opening_position' AND reference_price>0${correctionCutoff}
    ORDER BY price_date DESC,created_at DESC,price_priority DESC,source_order DESC`, cutoffDate ? [portfolioId, cutoffDate, portfolioId, cutoffDate, portfolioId, cutoffDate] : [portfolioId, portfolioId, portfolioId]);
  const latest = new Map();
  for (const row of rows) if (!latest.has(row.instrument_id)) latest.set(row.instrument_id, { ...row, valuation_date: row.price_date });
  return [...latest.values()];
};

const emptyHoldingState = (instrumentId) => ({
  instrument_id: instrumentId,
  shares: 0,
  cost_basis: 0,
  realized_pl: 0,
  realized_cost_basis: 0,
  sale_proceeds: 0,
  activity_count: 0,
  first_activity_date: "",
  last_activity_date: "",
  last_trade_created_at: "",
  last_trade_date: "",
  display_average_price: 0,
});

const holdingStateFor = (states, instrumentId) => {
  if (!states.has(instrumentId)) states.set(instrumentId, emptyHoldingState(instrumentId));
  return states.get(instrumentId);
};

const touchHoldingActivity = (state, eventDate) => {
  state.activity_count += 1;
  if (!eventDate) return;
  if (!state.first_activity_date || eventDate < state.first_activity_date) state.first_activity_date = eventDate;
  if (!state.last_activity_date || eventDate > state.last_activity_date) state.last_activity_date = eventDate;
};

const applyBuyEvent = (state, event) => {
  state.shares = Math.round((state.shares + Number(event.share_quantity)) * 100) / 100;
  state.cost_basis += Number(event.cash_amount);
  state.display_average_price = 0;
};

const sellCostBasis = (state, quantity) => Math.abs(quantity - state.shares) < 0.00000001
  ? state.cost_basis
  : proportionalCost(state.cost_basis, quantity, state.shares);

const applySellEvent = (state, event) => {
  const quantity = Number(event.share_quantity);
  if (quantity > state.shares + 0.00000001) throw appError("INVESTMENT_INTEGRITY_ERROR", "Riwayat jual melebihi kepemilikan yang tersedia.", 500, { instrumentId: event.instrument_id, eventId: event.event_id });
  const removedCost = sellCostBasis(state, quantity);
  const proceeds = Number(event.cash_amount);
  const realized = proceeds - removedCost;
  state.shares = Math.round((state.shares - quantity) * 100) / 100;
  state.cost_basis -= removedCost;
  state.realized_pl += realized;
  state.realized_cost_basis += removedCost;
  state.sale_proceeds += proceeds;
  state.display_average_price = 0;
  return { cost_basis_released: removedCost, realized_pl: realized, sale_proceeds: proceeds };
};

const applyCorrectionEvent = (state, event) => {
  const nextShares = Math.round((state.shares + Number(event.share_delta || 0)) * 100) / 100;
  const nextCost = state.cost_basis + Number(event.cost_basis_delta || 0);
  if (nextShares < 0 || nextCost < 0 || (nextShares === 0 && nextCost !== 0)) {
    throw appError("INVESTMENT_INTEGRITY_ERROR", "Koreksi menghasilkan kepemilikan atau cost basis yang tidak valid.", 500, { instrumentId: event.instrument_id, eventId: event.event_id });
  }
  state.shares = nextShares;
  state.cost_basis = nextCost;
  state.display_average_price = event.event_type === "opening_position" && Number(event.average_price) > 0 ? Number(event.average_price) : 0;
};

const applyHoldingEvent = (states, event) => {
  if (!event.instrument_id) return null;
  const state = holdingStateFor(states, event.instrument_id);
  touchHoldingActivity(state, String(event.event_date || ""));
  if (event.event_kind === "trade") { state.last_trade_created_at = String(event.created_at || ""); state.last_trade_date = String(event.event_date || ""); }
  if (event.event_kind === "trade" && event.trade_type === "buy") {
    applyBuyEvent(state, event);
    return null;
  }
  if (event.event_kind === "trade" && event.trade_type === "sell") return applySellEvent(state, event);
  if (event.event_kind === "correction") applyCorrectionEvent(state, event);
  return null;
};

const tradeIsAfterSnapshot = (state, snapshotDate, snapshotCreated) => state.last_trade_date > snapshotDate || (state.last_trade_date === snapshotDate && state.last_trade_created_at >= snapshotCreated);

const marketValuationForState = (state, valuation) => {
  const price = Number(valuation?.price_per_share || 0);
  const calculatedValue = state.shares > 0 && price
    ? safeRupiahFromCentsAndUnits(Math.round(state.shares * 100), Math.round(price * 100), "Nilai pasar") : 0;
  // Broker snapshots override rounded NAV x units only until another trade.
  const reported = valuation?.market_value_rupiah;
  const snapshotDate = String(valuation?.valuation_date || "");
  const snapshotCreated = String(valuation?.created_at || "");
  const tradedAfterSnapshot = tradeIsAfterSnapshot(state, snapshotDate, snapshotCreated);
  const snapshotFresh = valuation?.price_source !== "trade" && snapshotDate >= String(state.last_activity_date || "") && !tradedAfterSnapshot;
  const useSnapshot = state.shares > 0 && snapshotFresh && reported !== null && reported !== undefined;
  return { price, marketValue: useSnapshot ? Number(reported) : calculatedValue, marketValueSource: useSnapshot ? "broker_snapshot" : "calculated" };
};

const positionFromState = (state, valuation) => {
  const { price, marketValue, marketValueSource } = marketValuationForState(state, valuation);
  return {
    ...state,
    is_closed: state.shares === 0 && state.activity_count > 0,
    average_cost: state.shares ? (state.display_average_price || state.cost_basis / state.shares) : 0,
    price_per_share: price,
    valuation_date: valuation?.valuation_date || "",
    price_source: valuation?.price_source || "",
    market_value: marketValue,
    market_value_source: marketValueSource,
    unrealized_pl: state.shares > 0 ? marketValue - state.cost_basis : 0,
  };
};

export const holdingStateFromEvents = (events, valuations = []) => {
  const states = new Map();
  const tradeRealizations = {};
  let realizedTotal = 0;
  for (const event of events) {
    const realization = applyHoldingEvent(states, event);
    if (!realization) continue;
    tradeRealizations[event.event_id] = realization;
    realizedTotal += realization.realized_pl;
  }
  const valuationMap = new Map(valuations.map((row) => [row.instrument_id, row]));
  const positions = [...states.values()].map((state) => positionFromState(state, valuationMap.get(state.instrument_id) || null));
  const holdings = positions.filter((state) => state.shares > 0);
  return {
    holdings,
    positions,
    trade_realizations: tradeRealizations,
    market_value: holdings.reduce((total, state) => total + state.market_value, 0),
    cost_basis: holdings.reduce((total, state) => total + state.cost_basis, 0),
    realized_pl: realizedTotal,
    unrealized_pl: holdings.reduce((total, state) => total + state.unrealized_pl, 0),
  };
};

export const portfolioState = async (db, portfolio, cutoffDate = todayJakarta()) => {
  const [events, prices, rdnCash] = await Promise.all([
    normalizeEvents(db, portfolio.portfolio_id, cutoffDate),
    latestKnownPrices(db, portfolio.portfolio_id, cutoffDate),
    accountBalanceAsOf(db, portfolio, cutoffDate),
  ]);
  return { ...holdingStateFromEvents(events, prices), rdn_cash: rdnCash, events };
};

export const assertPortfolioHistoryDate = (portfolio, date, label) => {
  if (date < portfolio.initial_balance_date) {
    throw appError("INVESTMENT_DATE_BEFORE_RDN_START", `${label} tidak boleh sebelum tanggal saldo awal RDN ${portfolio.initial_balance_date}.`, 409, { initialBalanceDate: portfolio.initial_balance_date });
  }
};

export const bumpPortfolio = async (db, context, portfolio) => {
  const nextVersion = Number(portfolio.row_version) + 1;
  const result = await db.execute("UPDATE investment_portfolios SET row_version=?,updated_by=?,updated_at=? WHERE portfolio_id=? AND row_version=? AND status='active'", [nextVersion, context.actor.user_id, nowIso(), portfolio.portfolio_id, portfolio.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Portfolio berubah di perangkat lain. Muat ulang sebelum menyimpan.", 409);
  return nextVersion;
};

export const openingPositionAvailable = async (db, portfolioId) => {
  const row = await db.one(`SELECT (
    (SELECT COUNT(*) FROM investment_trades WHERE portfolio_id=?)
    + (SELECT COUNT(*) FROM investment_valuations WHERE portfolio_id=?)
    + (SELECT COUNT(*) FROM investment_reconciliations WHERE portfolio_id=?)
    + (SELECT COUNT(*) FROM investment_corrections WHERE portfolio_id=? AND correction_type<>'opening_position')
  ) AS count`, [portfolioId, portfolioId, portfolioId, portfolioId]);
  return Number(row?.count || 0) === 0;
};
