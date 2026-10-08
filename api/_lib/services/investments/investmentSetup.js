import { appendAudit } from "../audit.js";
import { appError, nonNegativeInteger, assertOwner, assertVersion, dateValue, nowIso, operableAccountSql, positiveInteger, publicRow, sanitizeText, todayJakarta, uuid } from "../core.js";
import { createAccountInternal } from "../masterData/accounts.js";
import { allocateGoalInvestment } from "../planning/goalInvestments.js";
import { assertActivityAfterReconciliation, assertPortfolioHistoryDate, assertPortfolioOperable, bumpPortfolio, exchangeValue, instrumentRow, portfolioRow, tickerValue } from "./investmentState.js";
import { decimalHundredths, isMutualFund, safeRupiahFromCentsAndUnits } from "./investmentPrecision.js";
import { accountBalanceAsOf } from "../readModels.js";
import { assertTransactionDateUnlocked } from "../finance/transactionValidation.js";
import { buyInvestment } from "./investmentTrading.js";

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
  owner_scope: "personal",
  owner_user_id: context.actor.user_id,
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
  const access = operableAccountSql(context.actor, "a");
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

const ensureUnusedOpeningAsset = async (db, portfolioId, instrumentId) => {
  const existing = await db.one(`SELECT 1 AS found FROM (
    SELECT instrument_id FROM investment_trades WHERE portfolio_id=? AND instrument_id=?
    UNION ALL SELECT instrument_id FROM investment_valuations WHERE portfolio_id=? AND instrument_id=?
    UNION ALL SELECT instrument_id FROM investment_corrections WHERE portfolio_id=? AND instrument_id=?
  ) LIMIT 1`, [portfolioId, instrumentId, portfolioId, instrumentId, portfolioId, instrumentId]);
  if (existing) throw appError("INVESTMENT_ASSET_EXISTS", "Aset ini sudah memiliki catatan. Gunakan Beli, Jual, atau Perbarui nilai pada detail aset.", 409);
};

const openingPositionAmounts = (payload, instrument) => {
  const fund = isMutualFund(instrument);
  const sharesInHundredths = fund ? decimalHundredths(payload.shares, "Jumlah unit") : positiveInteger(payload.shares, "Jumlah lembar") * 100;
  const shares = sharesInHundredths / 100;
  const costBasis = positiveInteger(payload.cost_basis, "Modal tercatat");
  const referencePriceCents = fund ? decimalHundredths(payload.reference_price, "NAB saat ini") : positiveInteger(payload.reference_price, "Harga terakhir") * 100;
  const marketValueRupiah = payload.market_value === undefined || payload.market_value === null || payload.market_value === ""
    ? null : nonNegativeInteger(payload.market_value, "Total nilai aktual dari broker");
  const averagePriceCents = payload.average_price === undefined || payload.average_price === null || payload.average_price === ""
    ? null : decimalHundredths(payload.average_price, "Harga rata-rata investasi");
  if (payload.goal_id && !Number.isInteger(shares)) throw appError("FRACTIONAL_GOAL_UNSUPPORTED", "Unit reksa dana pecahan belum bisa ditautkan ke Target. Simpan posisi investasi dahulu tanpa Target agar jumlah dan modal tidak berubah.", 409);
  return { sharesInHundredths, shares, costBasis, referencePriceCents, marketValueRupiah, averagePriceCents };
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
  await ensureUnusedOpeningAsset(db, portfolio.portfolio_id, instrument.instrument_id);
  const { sharesInHundredths, shares, costBasis, referencePriceCents, marketValueRupiah, averagePriceCents } = openingPositionAmounts(payload, instrument);
  const record = {
    correction_id: uuid(), portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, correction_date: positionDate,
    share_delta: Math.ceil(shares), cost_basis_delta: costBasis, cash_delta: 0, reason: "Posisi awal aset", correction_type: "opening_position",
    reference_price: Math.max(1, Math.round(referencePriceCents / 100)), cash_effect_enabled: 0, notes: sanitizeText(payload.notes, 500), idempotency_key: context.idempotencyKey, created_by: context.actor.user_id, created_at: nowIso(),
  };
  await db.execute(`INSERT INTO investment_corrections(correction_id,portfolio_id,instrument_id,correction_date,share_delta,cost_basis_delta,cash_delta,reason,correction_type,reference_price,cash_effect_enabled,notes,idempotency_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  await db.execute("UPDATE investment_corrections SET unit_delta_hundredths=?,reference_price_cents=?,average_price_cents=?,market_value_rupiah=? WHERE correction_id=?", [sharesInHundredths, referencePriceCents, averagePriceCents, marketValueRupiah, record.correction_id]);
  const rowVersion = await bumpPortfolio(db, context, portfolio);
  let goalLink = null;
  if (payload.goal_id) {
    goalLink = await allocateGoalInvestment(db, {
      ...context,
      action: "goals.investments.allocate",
      payload: {
        goal_id: payload.goal_id,
        portfolio_id: portfolio.portfolio_id,
        instrument_id: instrument.instrument_id,
    shares,
        event_date: positionDate,
        reason: `Posisi awal ${instrument.ticker || instrument.name || "investasi"} ditautkan ke Target`,
      },
    });
  }
  const preciseRecord = { ...record, share_delta: shares, reference_price: referencePriceCents / 100, average_price: averagePriceCents === null ? null : averagePriceCents / 100, market_value: marketValueRupiah };
  await appendAudit(db, context, { entityType: "investment_asset_position", entityId: record.correction_id, next: { ...preciseRecord, row_version: rowVersion, goal_id: goalLink?.goal_id || "" } });
  return {
    ...publicRow(preciseRecord),
    portfolio_id: portfolio.portfolio_id,
    instrument_id: instrument.instrument_id,
    row_version: rowVersion,
    goal_id: goalLink?.goal_id || "",
    goal_investment_event: goalLink?.event || null,
  };
};


/** Only explicit, usable RDN accounts may fund recorded broker purchases. */
const purchaseAccount = async (db, context, payload, tradeDate) => {
  const access = operableAccountSql(context.actor, "a");
  const account = await db.one(`SELECT a.* FROM accounts a WHERE a.account_id=? AND a.account_type='investment' AND a.status='active' AND COALESCE(a.is_system_hidden,0)=0 AND ${access.sql}`, [String(payload.rdn_account_id || ""), ...access.args]);
  if (!account) throw appError("RDN_ACCOUNT_NOT_FOUND", "Pilih RDN aktif dan terlihat yang dapat digunakan untuk pembelian.", 404);
  if (Number(account.allow_negative)) throw appError("RDN_NEGATIVE_NOT_ALLOWED", "RDN tidak boleh memiliki saldo negatif.", 409);
  if (tradeDate < account.initial_balance_date) throw appError("INVALID_DATE", "Tanggal pembelian mendahului tanggal saldo awal RDN.", 409);
  return account;
};

const purchaseNumbers = (payload, instrument) => {
  const fund = isMutualFund(instrument);
  const units = fund ? decimalHundredths(payload.purchase_quantity, "Jumlah unit") : positiveInteger(payload.purchase_quantity, "Jumlah lot") * positiveInteger(instrument.lot_size || 100, "Ukuran lot") * 100;
  const cents = fund ? decimalHundredths(payload.purchase_price, "NAB beli") : positiveInteger(payload.purchase_price, "Harga beli") * 100;
  if (!Number.isSafeInteger(units) || !Number.isSafeInteger(cents)) throw appError("INVALID_AMOUNT", "Jumlah atau harga pembelian terlalu besar.", 400);
  const fee = nonNegativeInteger(payload.fee_amount || 0, "Biaya pembelian");
  const gross = safeRupiahFromCentsAndUnits(units, cents, "Nilai pembelian");
  if (!gross || !Number.isSafeInteger(gross + fee)) throw appError("INVALID_AMOUNT", "Nilai pembelian tidak valid.", 400);
  if (payload.goal_id && units % 100 !== 0) throw appError("FRACTIONAL_GOAL_UNSUPPORTED", "Unit pecahan belum dapat dihubungkan ke Target.", 409);
  return { fee, required: gross + fee };
};

const ensurePurchasePortfolio = async (db, context, account) => {
  const existing = await db.one("SELECT portfolio_id,row_version FROM investment_portfolios WHERE rdn_account_id=? AND status='active'", [account.account_id]);
  if (existing) return existing;
  return createInvestmentPortfolio(db, { ...context, payload: { rdn_account_id: account.account_id, name: `Investasi ${account.name}`, broker: "other" } });
};

/** Records a broker purchase atomically within the action transaction. */
export const recordInvestmentAssetPurchase = async (db, context) => {
  const payload = context.payload || {};
  const tradeDate = dateValue(payload.position_date || context.today || todayJakarta(), "Tanggal pembelian");
  if (tradeDate > (context.today || todayJakarta())) throw appError("FUTURE_DATE", "Pembelian tidak boleh bertanggal di masa depan.", 400);
  await assertTransactionDateUnlocked(db, tradeDate);
  const account = await purchaseAccount(db, context, payload, tradeDate);
  const registered = payload.instrument_id
    ? await instrumentRow(db, payload.instrument_id, { active: true })
    : await db.one("SELECT * FROM investment_instruments WHERE ticker=?", [tickerValue(payload.ticker)]);
  if (registered?.status === "inactive") throw appError("INSTRUMENT_NOT_FOUND", "Aset tidak aktif.", 404);
  if (!registered) { assertOwner(context.actor); investmentInstrumentInput(payload, null); }
  const instrumentInput = registered || payload;
  const { fee, required } = purchaseNumbers(payload, instrumentInput);
  const balance = await accountBalanceAsOf(db, account, tradeDate);
  if (balance < required) throw appError("INSUFFICIENT_RDN_CASH", "Saldo RDN tercatat kurang. Catat transfer dana ke RDN sebelum pembelian.", 409, { balance, required });
  const portfolio = await ensurePurchasePortfolio(db, context, account);
  const instrument = registered || await resolveAssetPositionInstrument(db, context, payload);
  const bought = await buyInvestment(db, {
    ...context, rowVersion: portfolio.row_version,
    payload: { portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id,
      lots: payload.purchase_quantity, price_per_share: payload.purchase_price,
      fee_amount: fee, trade_date: tradeDate, notes: payload.notes || "", goal_id: payload.goal_id || "" },
  });
  return { ...bought, portfolio_id: portfolio.portfolio_id, instrument_id: instrument.instrument_id, goal_id: bought.goal_investment_event?.goal_id || "", purchase_recorded: true };
};
