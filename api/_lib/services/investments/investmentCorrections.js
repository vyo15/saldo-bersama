import { appendAudit } from "../audit.js";
import { appError, assertOwner, assertVersion, dateValue, nonNegativeInteger, nowIso, positiveInteger, publicRow, sanitizeText, todayJakarta, uuid } from "../core.js";
import { firstNegativeBalance } from "../readModels.js";
import { assertChronology, assertPortfolioHistoryDate, assertPortfolioOperable, bumpPortfolio, instrumentRow, openingPositionAvailable, portfolioRow, portfolioState, safeInteger } from "./investmentState.js";

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

