import { appendAudit } from "./audit.js";
import {
  appError, assertOwner, assertVersion, dateValue, nonNegativeInteger, nowIso, operableAccountSql, positiveInteger, publicRow, sanitizeText, todayJakarta, uuid,
} from "./core.js";
import { accountBalanceAsOf, firstNegativeBalance } from "./readModels.js";
import { createAccountInternal } from "./masterData/accounts.js";

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const INTEGER_PATTERN = /^-?\d+$/;

const safeInteger = (value, label, { allowNegative = false, allowZero = true } = {}) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || (!allowNegative && number < 0) || (!allowZero && number === 0)) {
    throw appError("INVALID_AMOUNT", `${label} harus berupa bilangan bulat yang valid.`, 400);
  }
  return number;
};

const safeMultiply = (a, b, label = "Nominal") => {
  const result = BigInt(a) * BigInt(b);
  if (result < 0n || result > MAX_SAFE_BIGINT) throw appError("AMOUNT_TOO_LARGE", `${label} melampaui batas nominal aman.`, 400);
  return Number(result);
};

const safeAdd = (a, b, label = "Nominal") => {
  const result = BigInt(a) + BigInt(b);
  if (result < 0n || result > MAX_SAFE_BIGINT) throw appError("AMOUNT_TOO_LARGE", `${label} melampaui batas nominal aman.`, 400);
  return Number(result);
};

const tickerValue = (value) => {
  const ticker = sanitizeText(value, 16).toUpperCase();
  if (!/^[A-Z0-9.-]{1,16}$/.test(ticker)) throw appError("INVALID_TICKER", "Ticker hanya boleh berisi huruf besar, angka, titik, atau tanda hubung.", 400);
  return ticker;
};

const exchangeValue = (value) => {
  const exchange = sanitizeText(value || "IDX", 16).toUpperCase();
  if (!/^[A-Z0-9.-]{2,16}$/.test(exchange)) throw appError("INVALID_EXCHANGE", "Kode bursa tidak valid.", 400);
  return exchange;
};

const portfolioRow = async (db, portfolioId) => db.one(`SELECT p.*,a.account_id,a.name AS rdn_account_name,a.account_type,a.owner_scope,a.owner_user_id,a.allow_negative,a.initial_balance,a.initial_balance_date,a.status AS rdn_status
  FROM investment_portfolios p JOIN accounts a ON a.account_id=p.rdn_account_id WHERE p.portfolio_id=?`, [String(portfolioId || "")]);

const assertPortfolioReadable = (portfolio) => {
  if (!portfolio || portfolio.status !== "active" || portfolio.rdn_status !== "active") throw appError("PORTFOLIO_NOT_FOUND", "Portfolio investasi aktif tidak ditemukan.", 404);
};

const assertPortfolioOperable = (context, portfolio) => {
  assertPortfolioReadable(portfolio);
  if (context.actor.role === "owner") return;
  if (portfolio.owner_scope === "shared") return;
  if (portfolio.owner_scope === "personal" && portfolio.owner_user_id === context.actor.user_id) return;
  throw appError("PORTFOLIO_FORBIDDEN", "Portfolio ini tidak dapat diubah oleh akun Anda.", 403);
};

const instrumentRow = async (db, instrumentId, { active = false } = {}) => {
  const row = await db.one("SELECT * FROM investment_instruments WHERE instrument_id=?", [String(instrumentId || "")]);
  if (!row || (active && row.status !== "active")) throw appError("INSTRUMENT_NOT_FOUND", active ? "Instrumen investasi aktif tidak ditemukan." : "Instrumen investasi tidak ditemukan.", 404);
  return row;
};

const latestActivityDate = async (db, portfolioId) => {
  const row = await db.one(`SELECT MAX(activity_date) AS activity_date FROM (
    SELECT trade_date AS activity_date FROM investment_trades WHERE portfolio_id=?
    UNION ALL SELECT correction_date FROM investment_corrections WHERE portfolio_id=?
  )`, [portfolioId, portfolioId]);
  return String(row?.activity_date || "");
};

const assertChronology = async (db, portfolioId, date) => {
  const latest = await latestActivityDate(db, portfolioId);
  if (latest && date < latest) throw appError("INVESTMENT_CHRONOLOGY_CONFLICT", `Aktivitas investasi harus dicatat berurutan. Tanggal terakhir yang sudah tersimpan adalah ${latest}.`, 409, { latestDate: latest });
};

const assertActivityAfterReconciliation = async (db, portfolioId, activityDate) => {
  const row = await db.one("SELECT MAX(reconciliation_date) AS reconciliation_date FROM investment_reconciliations WHERE portfolio_id=?", [portfolioId]);
  const latest = String(row?.reconciliation_date || "");
  if (latest && activityDate <= latest) {
    throw appError("INVESTMENT_RECONCILED_PERIOD_LOCKED", `Periode sampai ${latest} sudah direkonsiliasi. Gunakan Koreksi untuk selisih historis agar checkpoint rekonsiliasi tidak ditulis ulang.`, 409, { reconciliationDate: latest });
  }
};

const normalizeEvents = async (db, portfolioId, cutoffDate = null) => {
  const cutoff = cutoffDate ? " AND trade_date<=?" : "";
  const correctionCutoff = cutoffDate ? " AND correction_date<=?" : "";
  return db.all(`SELECT trade_date AS event_date,created_at,'trade' AS event_kind,trade_type AS event_type,trade_id AS event_id,instrument_id,trade_type,lots,share_quantity,price_per_share,fee_amount,gross_amount,cash_amount,0 AS share_delta,0 AS cost_basis_delta,0 AS cash_delta,notes,0 AS event_priority,rowid AS source_order
    FROM investment_trades WHERE portfolio_id=?${cutoff}
    UNION ALL
    SELECT correction_date AS event_date,created_at,'correction' AS event_kind,correction_type AS event_type,correction_id AS event_id,instrument_id,'' AS trade_type,0 AS lots,0 AS share_quantity,reference_price AS price_per_share,0 AS fee_amount,0 AS gross_amount,0 AS cash_amount,share_delta,cost_basis_delta,cash_delta,notes,1 AS event_priority,rowid AS source_order
    FROM investment_corrections WHERE portfolio_id=?${correctionCutoff}
    ORDER BY event_date,created_at,event_priority,source_order`, cutoffDate ? [portfolioId, cutoffDate, portfolioId, cutoffDate] : [portfolioId, portfolioId]);
};

// Harga terakhir yang diketahui boleh berasal dari trade atau snapshot manual. Tanpa fallback
// trade, holding baru akan terlihat kehilangan seluruh nilai sampai user mengisi harga manual.
const latestKnownPrices = async (db, portfolioId, cutoffDate = null) => {
  const valuationCutoff = cutoffDate ? " AND valuation_date<=?" : "";
  const tradeCutoff = cutoffDate ? " AND trade_date<=?" : "";
  const correctionCutoff = cutoffDate ? " AND correction_date<=?" : "";
  const rows = await db.all(`SELECT instrument_id,valuation_date AS price_date,price_per_share,created_at,'valuation' AS price_source,3 AS price_priority,rowid AS source_order
    FROM investment_valuations WHERE portfolio_id=?${valuationCutoff}
    UNION ALL
    SELECT instrument_id,trade_date AS price_date,price_per_share,created_at,'trade' AS price_source,2 AS price_priority,rowid AS source_order
    FROM investment_trades WHERE portfolio_id=?${tradeCutoff}
    UNION ALL
    SELECT instrument_id,correction_date AS price_date,reference_price AS price_per_share,created_at,'opening_position' AS price_source,1 AS price_priority,rowid AS source_order
    FROM investment_corrections WHERE portfolio_id=? AND correction_type='opening_position' AND reference_price>0${correctionCutoff}
    ORDER BY price_date DESC,created_at DESC,price_priority DESC,source_order DESC`, cutoffDate ? [portfolioId, cutoffDate, portfolioId, cutoffDate, portfolioId, cutoffDate] : [portfolioId, portfolioId, portfolioId]);
  const latest = new Map();
  for (const row of rows) if (!latest.has(row.instrument_id)) latest.set(row.instrument_id, { ...row, valuation_date: row.price_date });
  return [...latest.values()];
};

const holdingStateFromEvents = (events, valuations = []) => {
  const states = new Map();
  let realizedTotal = 0;
  const stateFor = (instrumentId) => {
    if (!states.has(instrumentId)) states.set(instrumentId, { instrument_id: instrumentId, shares: 0, cost_basis: 0, realized_pl: 0 });
    return states.get(instrumentId);
  };
  for (const event of events) {
    if (!event.instrument_id) continue;
    const state = stateFor(event.instrument_id);
    if (event.event_kind === "trade" && event.trade_type === "buy") {
      state.shares += Number(event.share_quantity);
      state.cost_basis += Number(event.cash_amount);
      continue;
    }
    if (event.event_kind === "trade" && event.trade_type === "sell") {
      const quantity = Number(event.share_quantity);
      if (quantity > state.shares) throw appError("INVESTMENT_INTEGRITY_ERROR", "Riwayat jual melebihi kepemilikan yang tersedia.", 500, { instrumentId: event.instrument_id, eventId: event.event_id });
      const removedCost = quantity === state.shares ? state.cost_basis : Number((BigInt(state.cost_basis) * BigInt(quantity)) / BigInt(state.shares));
      const realized = Number(event.cash_amount) - removedCost;
      state.shares -= quantity;
      state.cost_basis -= removedCost;
      state.realized_pl += realized;
      realizedTotal += realized;
      continue;
    }
    if (event.event_kind === "correction") {
      const nextShares = state.shares + Number(event.share_delta || 0);
      const nextCost = state.cost_basis + Number(event.cost_basis_delta || 0);
      if (nextShares < 0 || nextCost < 0 || (nextShares === 0 && nextCost !== 0)) {
        throw appError("INVESTMENT_INTEGRITY_ERROR", "Koreksi menghasilkan kepemilikan atau cost basis yang tidak valid.", 500, { instrumentId: event.instrument_id, eventId: event.event_id });
      }
      state.shares = nextShares;
      state.cost_basis = nextCost;
    }
  }
  const valuationMap = new Map(valuations.map((row) => [row.instrument_id, row]));
  let marketValue = 0;
  let costBasis = 0;
  let unrealizedTotal = 0;
  const holdings = [...states.values()].filter((state) => state.shares > 0).map((state) => {
    const valuation = valuationMap.get(state.instrument_id) || null;
    const price = Number(valuation?.price_per_share || 0);
    const value = price ? safeMultiply(state.shares, price, "Nilai pasar") : 0;
    const unrealized = value - state.cost_basis;
    marketValue += value;
    costBasis += state.cost_basis;
    unrealizedTotal += unrealized;
    return {
      ...state,
      average_cost: state.shares ? Math.round(state.cost_basis / state.shares) : 0,
      price_per_share: price,
      valuation_date: valuation?.valuation_date || "",
      price_source: valuation?.price_source || "",
      market_value: value,
      unrealized_pl: unrealized,
    };
  });
  return { holdings, market_value: marketValue, cost_basis: costBasis, realized_pl: realizedTotal, unrealized_pl: unrealizedTotal };
};

const portfolioState = async (db, portfolio, cutoffDate = todayJakarta()) => {
  const [events, prices, rdnCash] = await Promise.all([
    normalizeEvents(db, portfolio.portfolio_id, cutoffDate),
    latestKnownPrices(db, portfolio.portfolio_id, cutoffDate),
    accountBalanceAsOf(db, portfolio, cutoffDate),
  ]);
  return { ...holdingStateFromEvents(events, prices), rdn_cash: rdnCash, events };
};

const assertPortfolioHistoryDate = (portfolio, date, label) => {
  if (date < portfolio.initial_balance_date) {
    throw appError("INVESTMENT_DATE_BEFORE_RDN_START", `${label} tidak boleh sebelum tanggal saldo awal RDN ${portfolio.initial_balance_date}.`, 409, { initialBalanceDate: portfolio.initial_balance_date });
  }
};

const bumpPortfolio = async (db, context, portfolio) => {
  const nextVersion = Number(portfolio.row_version) + 1;
  const result = await db.execute("UPDATE investment_portfolios SET row_version=?,updated_by=?,updated_at=? WHERE portfolio_id=? AND row_version=? AND status='active'", [nextVersion, context.actor.user_id, nowIso(), portfolio.portfolio_id, portfolio.row_version]);
  if (result.rowsAffected !== 1) throw appError("CONFLICT", "Portfolio berubah di perangkat lain. Muat ulang sebelum menyimpan.", 409);
  return nextVersion;
};

export const listInvestmentInstruments = async (db) => ({ items: (await db.all("SELECT * FROM investment_instruments ORDER BY status,ticker")).map((row) => publicRow(row)) });

export const investmentOverview = async (db, context) => {
  const rows = await db.all(`SELECT p.*,a.account_id,a.name AS rdn_account_name,a.account_type,a.owner_scope,a.owner_user_id,a.allow_negative,a.initial_balance,a.initial_balance_date,a.status AS rdn_status
    FROM investment_portfolios p JOIN accounts a ON a.account_id=p.rdn_account_id
    WHERE p.status='active' AND a.status='active' ORDER BY p.name COLLATE NOCASE`);
  const instruments = await db.all("SELECT instrument_id,ticker,name,exchange,lot_size,status FROM investment_instruments");
  const instrumentMap = new Map(instruments.map((row) => [row.instrument_id, row]));
  const items = [];
  let totalMarket = 0; let totalCost = 0; let totalCash = 0; let totalRealized = 0; let totalUnrealized = 0;
  for (const portfolio of rows) {
    const state = await portfolioState(db, portfolio);
    const canOperate = context.actor.role === "owner" || portfolio.owner_scope === "shared" || portfolio.owner_user_id === context.actor.user_id;
    const holdings = state.holdings.map((holding) => ({ ...holding, ...publicRow(instrumentMap.get(holding.instrument_id) || {}) }));
    const activity = (await db.all(`SELECT 'trade' AS activity_type,trade_id AS activity_id,trade_date AS activity_date,trade_type,instrument_id,lots,share_quantity,price_per_share,fee_amount,gross_amount,cash_amount,0 AS share_delta,0 AS cost_basis_delta,'' AS reason,notes,created_at,1 AS activity_priority,rowid AS source_order FROM investment_trades WHERE portfolio_id=?
      UNION ALL SELECT 'valuation',valuation_id,valuation_date,'valuation',instrument_id,NULL,NULL,price_per_share,0,0,0,0,0,'','',created_at,2,rowid FROM investment_valuations WHERE portfolio_id=?
      UNION ALL SELECT correction_type,correction_id,correction_date,correction_type,instrument_id,NULL,NULL,reference_price,0,0,cash_delta,share_delta,cost_basis_delta,reason,notes,created_at,3,rowid FROM investment_corrections WHERE portfolio_id=?
      ORDER BY activity_date DESC,created_at DESC,activity_priority DESC,source_order DESC LIMIT 30`, [portfolio.portfolio_id, portfolio.portfolio_id, portfolio.portfolio_id])).map((row) => {
      const { activity_priority: _priority, source_order: _sourceOrder, ...activityRow } = row;
      return {
        ...publicRow(activityRow),
        event_type: row.activity_type === "trade" ? row.trade_type : row.activity_type,
        ...(instrumentMap.get(row.instrument_id) || {}),
      };
    });
    totalMarket += state.market_value; totalCost += state.cost_basis; totalCash += state.rdn_cash; totalRealized += state.realized_pl; totalUnrealized += state.unrealized_pl;
    items.push({
      ...publicRow(portfolio, ["allow_negative"]),
      can_operate: canOperate,
      is_owned_by_actor: portfolio.owner_scope === "personal" && portfolio.owner_user_id === context.actor.user_id,
      rdn_cash: state.rdn_cash,
      market_value: state.market_value,
      cost_basis: state.cost_basis,
      realized_pl: state.realized_pl,
      unrealized_pl: state.unrealized_pl,
      opening_position_available: await openingPositionAvailable(db, portfolio.portfolio_id),
      holdings,
      activity,
    });
  }
  return { portfolios: items, instruments: instruments.map((row) => publicRow(row)), summary: { market_value: totalMarket, cost_basis: totalCost, rdn_cash: totalCash, portfolio_value: totalMarket + totalCash, realized_pl: totalRealized, unrealized_pl: totalUnrealized, holding_count: items.reduce((sum, item) => sum + item.holdings.length, 0) } };
};

const nextAutomaticRdnName = async (db, sourceLabel) => {
  const qualifier = sanitizeText(sourceLabel, 70);
  const base = qualifier ? `RDN ${qualifier}` : "RDN Portofolio";
  for (let index = 1; index <= 99; index += 1) {
    const candidate = index === 1 ? base : `${base} ${index}`;
    const existing = await db.one("SELECT account_id FROM accounts WHERE lower(name)=lower(?) AND status='active'", [candidate]);
    if (!existing) return candidate;
  }
  return `RDN Portofolio ${uuid().slice(0, 8)}`;
};

const createAutomaticRdn = async (db, context, sourceLabel, initialBalanceDate = context.today || todayJakarta()) => createAccountInternal(db, context, {
  name: await nextAutomaticRdnName(db, sourceLabel),
  account_type: "investment",
  owner_scope: context.actor.role === "owner" ? "shared" : "personal",
  owner_user_id: context.actor.role === "owner" ? "" : context.actor.user_id,
  initial_balance: 0,
  initial_balance_date: initialBalanceDate,
  allow_negative: false,
});

const resolvePortfolioRdn = async (db, context, payload) => {
  if (!payload.rdn_account_id && payload.auto_create_rdn) return { account: await createAutomaticRdn(db, context, payload.source_label || payload.name), autoCreated: true };
  const access = operableAccountSql(context.actor, "a");
  const account = await db.one(`SELECT a.* FROM accounts a WHERE a.account_id=? AND a.status='active' AND a.account_type='investment' AND ${access.sql}`, [String(payload.rdn_account_id || ""), ...access.args]);
  if (!account) throw appError("RDN_ACCOUNT_NOT_FOUND", "Pilih rekening Investasi aktif yang dapat Anda gunakan sebagai RDN, atau buat RDN otomatis.", 404);
  return { account, autoCreated: false };
};

export const createInvestmentPortfolio = async (db, context) => {
  const payload = context.payload || {};
  const name = sanitizeText(payload.name || "Catatan investasi", 100);
  if (!name) throw appError("NAME_REQUIRED", "Nama portfolio wajib diisi.", 400);
  const broker = String(payload.broker || "other").toLowerCase();
  if (!new Set(["ajaib", "other"]).has(broker)) throw appError("INVALID_BROKER", "Broker investasi tidak didukung.", 400);
  const { account, autoCreated } = await resolvePortfolioRdn(db, context, payload);
  if (Number(account.allow_negative)) throw appError("RDN_NEGATIVE_NOT_ALLOWED", "Rekening RDN investasi tidak boleh mengizinkan saldo negatif.", 409);
  const existing = await db.one("SELECT portfolio_id FROM investment_portfolios WHERE rdn_account_id=?", [account.account_id]);
  if (existing) throw appError("RDN_ALREADY_LINKED", "Rekening Investasi ini sudah terhubung ke portfolio.", 409);
  const timestamp = nowIso();
  const record = { portfolio_id: uuid(), name, broker, rdn_account_id: account.account_id, status: "active", row_version: 1, created_by: context.actor.user_id, created_at: timestamp, updated_by: context.actor.user_id, updated_at: timestamp };
  await db.execute(`INSERT INTO investment_portfolios(portfolio_id,name,broker,rdn_account_id,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  await appendAudit(db, context, { entityType: "investment_portfolio", entityId: record.portfolio_id, next: { ...record, rdn_created_automatically: autoCreated } });
  return { ...publicRow(record), rdn_created_automatically: autoCreated };
};

const investmentInstrumentInput = (payload, existing) => {
  const ticker = tickerValue(payload.ticker ?? existing?.ticker);
  const name = sanitizeText(payload.name ?? existing?.name, 120);
  if (!name) throw appError("NAME_REQUIRED", "Nama instrumen wajib diisi.", 400);
  const exchange = exchangeValue(payload.exchange ?? existing?.exchange);
  const lotSize = positiveInteger(payload.lot_size ?? existing?.lot_size ?? 100, "Ukuran lot");
  const status = String(payload.status ?? existing?.status ?? "active");
  if (!new Set(["active", "inactive"]).has(status)) throw appError("INVALID_STATUS", "Status instrumen tidak valid.", 400);
  return { ticker, name, exchange, lotSize, status };
};

const createInvestmentInstrumentRecord = async (db, context, input, timestamp) => {
  const record = { instrument_id: uuid(), ticker: input.ticker, name: input.name, exchange: input.exchange, lot_size: input.lotSize, status: input.status, row_version: 1, created_by: context.actor.user_id, created_at: timestamp, updated_by: context.actor.user_id, updated_at: timestamp };
  await db.execute(`INSERT INTO investment_instruments(instrument_id,ticker,name,exchange,lot_size,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  await appendAudit(db, context, { entityType: "investment_instrument", entityId: record.instrument_id, next: record });
  return publicRow(record);
};

const updateInvestmentInstrumentRecord = async (db, context, existing, input, timestamp) => {
  const next = { ...existing, ticker: input.ticker, name: input.name, exchange: input.exchange, lot_size: input.lotSize, status: input.status, row_version: Number(existing.row_version) + 1, updated_by: context.actor.user_id, updated_at: timestamp };
  const updated = await db.execute("UPDATE investment_instruments SET ticker=?,name=?,exchange=?,lot_size=?,status=?,row_version=?,updated_by=?,updated_at=? WHERE instrument_id=? AND row_version=?", [input.ticker,input.name,input.exchange,input.lotSize,input.status,next.row_version,next.updated_by,next.updated_at,existing.instrument_id,existing.row_version]);
  if (updated.rowsAffected !== 1) throw appError("CONFLICT", "Instrumen berubah di perangkat lain.", 409);
  await appendAudit(db, context, { entityType: "investment_instrument", entityId: existing.instrument_id, previous: publicRow(existing), next: publicRow(next) });
  return publicRow(next);
};

export const upsertInvestmentInstrument = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const existing = payload.instrument_id ? await instrumentRow(db, payload.instrument_id) : null;
  if (existing) assertVersion(existing, context.rowVersion ?? payload.row_version);
  const input = investmentInstrumentInput(payload, existing);
  const duplicateTicker = await db.one("SELECT instrument_id FROM investment_instruments WHERE ticker=? AND instrument_id<>?", [input.ticker, existing?.instrument_id || ""]);
  if (duplicateTicker) throw appError("DUPLICATE_TICKER", "Ticker instrumen sudah terdaftar.", 409);
  const timestamp = nowIso();
  return existing
    ? updateInvestmentInstrumentRecord(db, context, existing, input, timestamp)
    : createInvestmentInstrumentRecord(db, context, input, timestamp);
};

const defaultPortfolioForActor = async (db, context) => {
  const access = context.actor.role === "owner"
    ? { sql: "a.owner_scope='shared'", args: [] }
    : { sql: "(a.owner_scope='shared' OR (a.owner_scope='personal' AND a.owner_user_id=?))", args: [context.actor.user_id] };
  return db.one(`SELECT p.*,a.account_id,a.name AS rdn_account_name,a.account_type,a.owner_scope,a.owner_user_id,a.allow_negative,a.initial_balance,a.initial_balance_date,a.status AS rdn_status
    FROM investment_portfolios p JOIN accounts a ON a.account_id=p.rdn_account_id
    WHERE p.status='active' AND a.status='active' AND ${access.sql}
    ORDER BY CASE WHEN a.owner_scope='shared' THEN 0 ELSE 1 END,p.updated_at DESC LIMIT 1`, access.args);
};

const createDefaultInvestmentPortfolio = async (db, context, initialBalanceDate) => {
  const account = await createAutomaticRdn(db, context, "Investasi", initialBalanceDate);
  await db.execute("UPDATE accounts SET is_system_hidden=1 WHERE account_id=?", [account.account_id]);
  const timestamp = nowIso();
  const record = { portfolio_id: uuid(), name: "Investasi", broker: "other", rdn_account_id: account.account_id, status: "active", row_version: 1, created_by: context.actor.user_id, created_at: timestamp, updated_by: context.actor.user_id, updated_at: timestamp };
  await db.execute(`INSERT INTO investment_portfolios(portfolio_id,name,broker,rdn_account_id,status,row_version,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  await appendAudit(db, context, { entityType: "investment_portfolio", entityId: record.portfolio_id, next: { ...record, asset_centric: true, rdn_created_automatically: true } });
  return portfolioRow(db, record.portfolio_id);
};

const resolveAssetPositionInstrument = async (db, context, payload) => {
  if (payload.instrument_id) return instrumentRow(db, payload.instrument_id, { active: true });
  const ticker = tickerValue(payload.ticker);
  const existing = await db.one("SELECT * FROM investment_instruments WHERE ticker=?", [ticker]);
  if (existing) {
    if (existing.status !== "active") throw appError("INSTRUMENT_NOT_FOUND", "Instrumen investasi aktif tidak ditemukan.", 404);
    return existing;
  }
  assertOwner(context.actor);
  const input = investmentInstrumentInput(payload, null);
  return createInvestmentInstrumentRecord(db, context, input, nowIso());
};

const assetPositionPortfolio = async (db, context, payload, positionDate) => {
  if (payload.portfolio_id) {
    const portfolio = await portfolioRow(db, payload.portfolio_id);
    assertPortfolioOperable(context, portfolio);
    if (payload.row_version !== undefined && payload.row_version !== null && payload.row_version !== "") assertVersion(portfolio, payload.row_version);
    return portfolio;
  }
  const existing = await defaultPortfolioForActor(db, context);
  if (existing && positionDate >= existing.initial_balance_date) return existing;
  return createDefaultInvestmentPortfolio(db, context, positionDate);
};

export const createInvestmentAssetPosition = async (db, context) => {
  const payload = context.payload || {};
  const positionDate = dateValue(payload.position_date || context.today || todayJakarta(), "Tanggal posisi investasi");
  if (positionDate > (context.today || todayJakarta())) throw appError("FUTURE_DATE", "Posisi investasi tidak boleh bertanggal di masa depan.", 400);
  const portfolio = await assetPositionPortfolio(db, context, payload, positionDate);
  assertPortfolioOperable(context, portfolio);
  const instrument = await resolveAssetPositionInstrument(db, context, payload);
  assertPortfolioHistoryDate(portfolio, positionDate, "Tanggal posisi investasi");
  await assertActivityAfterReconciliation(db, portfolio.portfolio_id, positionDate);
  const existing = await db.one(`SELECT 1 AS found FROM (
    SELECT instrument_id FROM investment_trades WHERE portfolio_id=? AND instrument_id=?
    UNION ALL SELECT instrument_id FROM investment_valuations WHERE portfolio_id=? AND instrument_id=?
    UNION ALL SELECT instrument_id FROM investment_corrections WHERE portfolio_id=? AND instrument_id=?
  ) LIMIT 1`, [portfolio.portfolio_id, instrument.instrument_id, portfolio.portfolio_id, instrument.instrument_id, portfolio.portfolio_id, instrument.instrument_id]);
  if (existing) throw appError("INVESTMENT_ASSET_EXISTS", "Aset ini sudah memiliki catatan. Gunakan Beli, Jual, atau Perbarui nilai pada detail aset.", 409);
  const shares = positiveInteger(payload.shares, "Jumlah kepemilikan");
  const costBasis = positiveInteger(payload.cost_basis, "Modal tercatat");
  const referencePrice = positiveInteger(payload.reference_price, "Harga terakhir");
  const record = {
    correction_id: uuid(), portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, correction_date: positionDate,
    share_delta: shares, cost_basis_delta: costBasis, cash_delta: 0, reason: "Posisi awal aset", correction_type: "opening_position",
    reference_price: referencePrice, cash_effect_enabled: 0, notes: sanitizeText(payload.notes, 500), idempotency_key: context.idempotencyKey, created_by: context.actor.user_id, created_at: nowIso(),
  };
  await db.execute(`INSERT INTO investment_corrections(correction_id,portfolio_id,instrument_id,correction_date,share_delta,cost_basis_delta,cash_delta,reason,correction_type,reference_price,cash_effect_enabled,notes,idempotency_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  const rowVersion = await bumpPortfolio(db, context, portfolio);
  await appendAudit(db, context, { entityType: "investment_asset_position", entityId: record.correction_id, next: { ...record, row_version: rowVersion } });
  return { ...publicRow(record), portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, row_version: rowVersion };
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

const correctionInstrument = async (db, payload, shareDelta, costDelta) => {
  const changesHolding = Boolean(shareDelta || costDelta);
  if (!changesHolding && payload.instrument_id) throw appError("INVALID_CORRECTION", "Instrumen tidak diperlukan untuk koreksi cash saja.", 400);
  if (!changesHolding) return null;
  if (!shareDelta || !costDelta || Math.sign(shareDelta) !== Math.sign(costDelta)) throw appError("INVALID_CORRECTION", "Perubahan lembar dan cost basis harus searah.", 400);
  return instrumentRow(db, payload.instrument_id);
};

const assertCorrectionHolding = (state, instrument, shareDelta, costDelta) => {
  if (!instrument) return;
  const holding = state.holdings.find((item) => item.instrument_id === instrument.instrument_id) || { shares: 0, cost_basis: 0 };
  const nextShares = holding.shares + shareDelta;
  const nextCost = holding.cost_basis + costDelta;
  if (nextShares < 0 || nextCost < 0 || (nextShares === 0 && nextCost !== 0)) throw appError("INVALID_CORRECTION", "Koreksi menghasilkan kepemilikan atau cost basis negatif/tidak konsisten.", 409);
};

const assertCorrectionCash = async (db, portfolio, correctionDate, cashDelta) => {
  if (cashDelta >= 0) return;
  const issue = await firstNegativeBalance(db, portfolio, { candidate: { transaction_date: correctionDate, investment_account_id: portfolio.rdn_account_id, investment_cash_effect: cashDelta }, fromDate: correctionDate });
  if (issue) throw appError("INSUFFICIENT_RDN", "Koreksi cash akan membuat saldo RDN negatif.", 409, { date: issue.date, balance: issue.balance });
};

const correctionInput = (payload) => {
  const shareDelta = safeInteger(payload.share_delta || 0, "Perubahan lembar", { allowNegative: true });
  const costDelta = safeInteger(payload.cost_basis_delta || 0, "Perubahan cost basis", { allowNegative: true });
  const cashDelta = safeInteger(payload.cash_delta || 0, "Perubahan cash", { allowNegative: true });
  if (!shareDelta && !costDelta && !cashDelta) throw appError("EMPTY_CORRECTION", "Koreksi harus mengubah kepemilikan, cost basis, atau cash.", 400);
  const reason = sanitizeText(payload.reason, 500);
  if (reason.length < 5) throw appError("REASON_REQUIRED", "Alasan koreksi minimal 5 karakter.", 400);
  return { shareDelta, costDelta, cashDelta, reason };
};

const openingPositionAvailable = async (db, portfolioId) => {
  const row = await db.one(`SELECT (
    (SELECT COUNT(*) FROM investment_trades WHERE portfolio_id=?)
    + (SELECT COUNT(*) FROM investment_valuations WHERE portfolio_id=?)
    + (SELECT COUNT(*) FROM investment_reconciliations WHERE portfolio_id=?)
    + (SELECT COUNT(*) FROM investment_corrections WHERE portfolio_id=? AND correction_type<>'opening_position')
  ) AS count`, [portfolioId, portfolioId, portfolioId, portfolioId]);
  return Number(row?.count || 0) === 0;
};

const assertOpeningPositionAvailable = async (db, portfolioId) => {
  if (!(await openingPositionAvailable(db, portfolioId))) throw appError("OPENING_POSITION_CLOSED", "Posisi awal hanya dapat ditambahkan sebelum transaksi, harga manual, rekonsiliasi, atau koreksi reguler dicatat.", 409);
};

const openingPositionInstrument = async (db, portfolio, payload) => {
  if (!String(payload.instrument_id || "").trim()) return null;
  const instrument = await instrumentRow(db, payload.instrument_id);
  const duplicate = await db.one(
    "SELECT correction_id FROM investment_corrections WHERE portfolio_id=? AND instrument_id=? AND correction_type='opening_position' LIMIT 1",
    [portfolio.portfolio_id, instrument.instrument_id],
  );
  if (duplicate) throw appError("OPENING_POSITION_DUPLICATE", "Posisi awal aset ini sudah dicatat. Gunakan Koreksi bila jumlah atau modal perlu diperbaiki.", 409);
  return instrument;
};

const openingPositionAmounts = (payload, instrument, state) => {
  const shares = instrument ? positiveInteger(payload.shares, "Jumlah lembar") : 0;
  const costBasis = instrument ? positiveInteger(payload.cost_basis, "Total modal") : 0;
  const referencePrice = instrument ? positiveInteger(payload.reference_price, "Harga referensi") : 0;
  const actualCash = payload.actual_cash === undefined || payload.actual_cash === null || payload.actual_cash === ""
    ? state.rdn_cash
    : nonNegativeInteger(payload.actual_cash, "Cash RDN awal");
  return { shares, costBasis, referencePrice, actualCash, cashDelta: actualCash - state.rdn_cash };
};

export const createOpeningPosition = async (db, context) => {
  const payload = context.payload || {};
  const portfolio = await portfolioRow(db, payload.portfolio_id);
  assertPortfolioOperable(context, portfolio);
  assertVersion(portfolio, context.rowVersion ?? payload.row_version);
  await assertOpeningPositionAvailable(db, portfolio.portfolio_id);
  const positionDate = dateValue(payload.position_date || context.today || todayJakarta(), "Tanggal posisi awal");
  if (positionDate > (context.today || todayJakarta())) throw appError("FUTURE_DATE", "Posisi awal tidak boleh bertanggal di masa depan.", 400);
  assertPortfolioHistoryDate(portfolio, positionDate, "Tanggal posisi awal");
  await assertChronology(db, portfolio.portfolio_id, positionDate);
  const instrument = await openingPositionInstrument(db, portfolio, payload);
  const state = await portfolioState(db, portfolio);
  const { shares, costBasis, referencePrice, actualCash, cashDelta } = openingPositionAmounts(payload, instrument, state);
  if (!instrument && cashDelta === 0) throw appError("OPENING_POSITION_NO_CHANGE", "Saldo RDN awal sudah sama dengan saldo tercatat. Tidak ada kondisi awal baru untuk disimpan.", 400);
  if (instrument) assertCorrectionHolding(state, instrument, shares, costBasis);
  await assertCorrectionCash(db, portfolio, positionDate, cashDelta);
  const record = {
    correction_id: uuid(), portfolio_id: portfolio.portfolio_id, instrument_id: instrument?.instrument_id || null, correction_date: positionDate,
    share_delta: shares, cost_basis_delta: costBasis, cash_delta: cashDelta, reason: instrument ? "Posisi awal" : "Saldo awal RDN", correction_type: "opening_position",
    reference_price: referencePrice, notes: sanitizeText(payload.notes, 500), idempotency_key: context.idempotencyKey, created_by: context.actor.user_id, created_at: nowIso(),
  };
  await db.execute(`INSERT INTO investment_corrections(correction_id,portfolio_id,instrument_id,correction_date,share_delta,cost_basis_delta,cash_delta,reason,correction_type,reference_price,notes,idempotency_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  const rowVersion = await bumpPortfolio(db, context, portfolio);
  await appendAudit(db, context, { entityType: "investment_opening_position", entityId: record.correction_id, next: { ...record, actual_cash: actualCash, row_version: rowVersion } });
  return { ...publicRow(record), actual_cash: actualCash, row_version: rowVersion };
};

export const correctInvestment = async (db, context) => {
  assertOwner(context.actor);
  const payload = context.payload || {};
  const portfolio = await portfolioRow(db, payload.portfolio_id);
  assertPortfolioOperable(context, portfolio);
  assertVersion(portfolio, context.rowVersion ?? payload.row_version);
  const correctionDate = dateValue(payload.correction_date || context.today || todayJakarta(), "Tanggal koreksi");
  if (correctionDate > (context.today || todayJakarta())) throw appError("FUTURE_DATE", "Koreksi tidak boleh bertanggal di masa depan.", 400);
  assertPortfolioHistoryDate(portfolio, correctionDate, "Tanggal koreksi");
  await assertChronology(db, portfolio.portfolio_id, correctionDate);
  const { shareDelta, costDelta, cashDelta, reason } = correctionInput(payload);
  const instrument = await correctionInstrument(db, payload, shareDelta, costDelta);
  const state = await portfolioState(db, portfolio);
  assertCorrectionHolding(state, instrument, shareDelta, costDelta);
  await assertCorrectionCash(db, portfolio, correctionDate, cashDelta);
  const record = { correction_id: uuid(), portfolio_id: portfolio.portfolio_id, instrument_id: instrument?.instrument_id || null, correction_date: correctionDate, share_delta: shareDelta, cost_basis_delta: costDelta, cash_delta: cashDelta, reason, correction_type: "correction", reference_price: 0, notes: "", idempotency_key: context.idempotencyKey, created_by: context.actor.user_id, created_at: nowIso() };
  await db.execute(`INSERT INTO investment_corrections(correction_id,portfolio_id,instrument_id,correction_date,share_delta,cost_basis_delta,cash_delta,reason,correction_type,reference_price,notes,idempotency_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  const rowVersion = await bumpPortfolio(db, context, portfolio);
  await appendAudit(db, context, { entityType: "investment_correction", entityId: record.correction_id, next: { ...record, row_version: rowVersion } });
  return { ...publicRow(record), row_version: rowVersion };
};

export const investmentHoldingStateFromEvents = holdingStateFromEvents;
