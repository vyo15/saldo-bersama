import { appendAudit } from "../audit.js";
import { appError, dateValue, nowIso, positiveInteger, publicRow, sanitizeText, todayJakarta, uuid } from "../core.js";
import { assertOwnedAccess } from "./shared.js";
import { assertPortfolioOperable, instrumentRow, portfolioRow, portfolioState } from "../investments/investmentState.js";

const investmentFundingEnabled = (goal) => ["investment", "mixed"].includes(String(goal?.funding_mode || "cash"));

const goalInvestmentTarget = async (db, context, goalId, { allowCompleted = false } = {}) => {
  const goal = await db.one("SELECT * FROM savings_goals WHERE goal_id=?", [String(goalId || "")]);
  if (!goal || goal.status === "archived" || (!allowCompleted && goal.status !== "active")) {
    throw appError("GOAL_NOT_AVAILABLE", allowCompleted ? "Target tidak tersedia." : "Target aktif tidak ditemukan.", 404);
  }
  assertOwnedAccess(context.actor, goal);
  if (!investmentFundingEnabled(goal)) throw appError("GOAL_INVESTMENT_DISABLED", "Target ini belum menggunakan sumber dana Investasi.", 409);
  return goal;
};

const assertGoalPortfolioScope = (goal, portfolio) => {
  const sameScope = String(goal.scope || "") === String(portfolio.owner_scope || "")
    && String(goal.owner_user_id || "") === String(portfolio.owner_user_id || "");
  if (!sameScope) {
    throw appError("GOAL_INVESTMENT_SCOPE_MISMATCH", "Investasi dan Target harus berada pada kepemilikan yang sama.", 409);
  }
};

const allocationRow = async (db, goalId, portfolioId, instrumentId, cutoffDate = todayJakarta()) => db.one(`SELECT
  COALESCE(SUM(share_delta),0) AS shares,
  COALESCE(SUM(cost_basis_delta),0) AS cost_basis,
  COALESCE(SUM(cash_delta),0) AS retained_cash,
  COALESCE(SUM(realized_pl_delta),0) AS realized_pl
  FROM goal_investment_events
  WHERE goal_id=? AND portfolio_id=? AND instrument_id=? AND status='active' AND event_date<=?`,
[goalId, portfolioId, instrumentId, cutoffDate]);

const allocatedSharesAcrossGoals = async (db, portfolioId, instrumentId, cutoffDate = todayJakarta()) => {
  const row = await db.one(`SELECT COALESCE(SUM(share_delta),0) AS shares
    FROM goal_investment_events
    WHERE portfolio_id=? AND instrument_id=? AND status='active' AND event_date<=?`, [portfolioId, instrumentId, cutoffDate]);
  return Number(row?.shares || 0);
};

const proportionalBasis = (basis, shares, totalShares) => {
  const normalizedBasis = Math.max(0, Number(basis || 0));
  const normalizedShares = Math.max(0, Number(shares || 0));
  const normalizedTotal = Math.max(0, Number(totalShares || 0));
  if (!normalizedShares || !normalizedTotal) return 0;
  if (normalizedShares >= normalizedTotal) return normalizedBasis;
  return Number((BigInt(normalizedBasis) * BigInt(normalizedShares)) / BigInt(normalizedTotal));
};

const appendGoalInvestmentEvent = async (db, context, {
  goal, portfolio, instrumentId = null, tradeId = null, eventType, eventDate,
  shareDelta = 0, costBasisDelta = 0, cashDelta = 0, realizedPlDelta = 0, reason = "",
}) => {
  if (!Number.isSafeInteger(Number(shareDelta)) || !Number.isSafeInteger(Number(costBasisDelta)) || !Number.isSafeInteger(Number(cashDelta)) || !Number.isSafeInteger(Number(realizedPlDelta))) {
    throw appError("INVALID_GOAL_INVESTMENT_EVENT", "Nilai penghubung investasi ke Target tidak valid.", 400);
  }
  if (!Number(shareDelta) && !Number(cashDelta)) throw appError("INVALID_GOAL_INVESTMENT_EVENT", "Perubahan investasi Target tidak boleh kosong.", 400);
  const record = {
    goal_investment_event_id: uuid(),
    goal_id: goal.goal_id,
    portfolio_id: portfolio.portfolio_id,
    instrument_id: instrumentId || null,
    trade_id: tradeId || null,
    event_type: eventType,
    event_date: dateValue(eventDate || context.today || todayJakarta(), "Tanggal investasi Target"),
    share_delta: Number(shareDelta),
    cost_basis_delta: Number(costBasisDelta),
    cash_delta: Number(cashDelta),
    realized_pl_delta: Number(realizedPlDelta),
    reason: sanitizeText(reason, 300),
    status: "active",
    row_version: 1,
    created_by: context.actor.user_id,
    created_at: nowIso(),
    reversed_by: null,
    reversed_at: null,
    reversal_reason: "",
  };
  await db.execute(`INSERT INTO goal_investment_events(
    goal_investment_event_id,goal_id,portfolio_id,instrument_id,trade_id,event_type,event_date,share_delta,cost_basis_delta,cash_delta,realized_pl_delta,reason,status,row_version,created_by,created_at,reversed_by,reversed_at,reversal_reason
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, Object.values(record));
  await appendAudit(db, context, { entityType: "goal_investment_event", entityId: record.goal_investment_event_id, next: publicRow(record) });
  await context.enqueueMirror?.(db, "goal", goal.goal_id);
  return publicRow(record);
};


export const allocateGoalInvestment = async (db, context) => {
  const payload = context.payload || {};
  const goal = await goalInvestmentTarget(db, context, payload.goal_id);
  const portfolio = await portfolioRow(db, payload.portfolio_id);
  assertPortfolioOperable(context, portfolio);
  assertGoalPortfolioScope(goal, portfolio);
  const instrument = await instrumentRow(db, payload.instrument_id);
  const shares = positiveInteger(payload.shares, "Jumlah lembar/unit yang ditautkan");
  const eventDate = dateValue(payload.event_date || context.today || todayJakarta(), "Tanggal pengaitan investasi");
  if (eventDate > (context.today || todayJakarta())) throw appError("FUTURE_DATE", "Tanggal pengaitan investasi tidak boleh di masa depan.", 400);
  const state = await portfolioState(db, portfolio, eventDate);
  const holding = state.holdings.find((item) => item.instrument_id === instrument.instrument_id);
  if (!holding || shares > Number(holding.shares || 0)) throw appError("INSUFFICIENT_HOLDING", "Jumlah yang ditautkan melebihi kepemilikan investasi.", 409, { availableShares: holding?.shares || 0 });
  const allocated = await allocatedSharesAcrossGoals(db, portfolio.portfolio_id, instrument.instrument_id, eventDate);
  const unallocated = Number(holding.shares || 0) - allocated;
  if (shares > unallocated) throw appError("GOAL_INVESTMENT_ALREADY_ALLOCATED", "Sebagian kepemilikan ini sudah dipakai untuk Target lain.", 409, { availableShares: Math.max(0, unallocated) });
  const costBasis = proportionalBasis(holding.cost_basis, shares, holding.shares);
  const event = await appendGoalInvestmentEvent(db, context, {
    goal, portfolio, instrumentId: instrument.instrument_id, eventType: "allocate", eventDate,
    shareDelta: shares, costBasisDelta: costBasis, reason: payload.reason || `Ditautkan ke Target ${goal.name}`,
  });
  return { event, goal_id: goal.goal_id, allocated_shares: shares, available_unallocated_shares: unallocated - shares };
};

export const releaseGoalInvestment = async (db, context) => {
  const payload = context.payload || {};
  const goal = await goalInvestmentTarget(db, context, payload.goal_id, { allowCompleted: true });
  const portfolio = await portfolioRow(db, payload.portfolio_id);
  assertPortfolioOperable(context, portfolio);
  assertGoalPortfolioScope(goal, portfolio);
  const eventDate = dateValue(payload.event_date || context.today || todayJakarta(), "Tanggal pelepasan investasi");
  if (eventDate > (context.today || todayJakarta())) throw appError("FUTURE_DATE", "Tanggal pelepasan investasi tidak boleh di masa depan.", 400);

  if (payload.cash_amount !== undefined && payload.cash_amount !== null && payload.cash_amount !== "") {
    const cashAmount = positiveInteger(payload.cash_amount, "Dana hasil jual yang dilepas");
    const cashRow = await db.one(`SELECT COALESCE(SUM(cash_delta),0) AS retained_cash
      FROM goal_investment_events
      WHERE goal_id=? AND portfolio_id=? AND status='active' AND event_date<=?`, [goal.goal_id, portfolio.portfolio_id, eventDate]);
    const retainedCash = Number(cashRow?.retained_cash || 0);
    if (cashAmount > retainedCash) throw appError("GOAL_INVESTMENT_CASH_INSUFFICIENT", "Dana hasil penjualan yang dilepas melebihi dana Target yang tersedia.", 409, { availableCash: retainedCash });
    const event = await appendGoalInvestmentEvent(db, context, {
      goal, portfolio, eventType: "cash_release", eventDate, cashDelta: -cashAmount,
      reason: payload.reason || `Dana hasil jual dilepas dari Target ${goal.name}`,
    });
    return { event, goal_id: goal.goal_id, released_cash: cashAmount, remaining_retained_cash: retainedCash - cashAmount };
  }

  const instrument = await instrumentRow(db, payload.instrument_id);
  const shares = positiveInteger(payload.shares, "Jumlah lembar/unit yang dilepas");
  const allocated = await allocationRow(db, goal.goal_id, portfolio.portfolio_id, instrument.instrument_id, eventDate);
  const goalShares = Number(allocated?.shares || 0);
  if (shares > goalShares) throw appError("GOAL_INVESTMENT_INSUFFICIENT", "Jumlah yang dilepas melebihi investasi yang terhubung ke Target.", 409, { availableShares: goalShares });
  const basis = proportionalBasis(Number(allocated?.cost_basis || 0), shares, goalShares);
  const event = await appendGoalInvestmentEvent(db, context, {
    goal, portfolio, instrumentId: instrument.instrument_id, eventType: "release", eventDate,
    shareDelta: -shares, costBasisDelta: -basis, reason: payload.reason || `Dilepas dari Target ${goal.name}`,
  });
  return { event, goal_id: goal.goal_id, released_shares: shares, remaining_allocated_shares: goalShares - shares };
};

// Goal-linked buys and sells intentionally validate both unallocated and Target-bound positions in one transaction.
// eslint-disable-next-line complexity
export const prepareGoalLinkedTrade = async (db, context, { portfolio, instrument, tradeType, shares, tradeDate, cashAmount, currentState, retainForGoal = true }) => {
  const goalId = String(context.payload?.goal_id || "");
  if (!goalId) {
    if (tradeType === "sell") {
      const totalAllocated = await allocatedSharesAcrossGoals(db, portfolio.portfolio_id, instrument.instrument_id, tradeDate);
      const holding = currentState.holdings.find((item) => item.instrument_id === instrument.instrument_id);
      const unallocated = Math.max(0, Number(holding?.shares || 0) - totalAllocated);
      if (shares > unallocated) {
        throw appError("GOAL_INVESTMENT_LINK_REQUIRED", "Sebagian aset ini terhubung ke Target. Pilih Target asal penjualan agar progres tetap konsisten.", 409, { availableUnallocatedShares: unallocated });
      }
    }
    return null;
  }
  const goal = await goalInvestmentTarget(db, context, goalId, { allowCompleted: tradeType === "sell" });
  assertGoalPortfolioScope(goal, portfolio);
  if (tradeType === "buy") {
    return {
      goal,
      eventType: "buy",
      shareDelta: shares,
      costBasisDelta: cashAmount,
      cashDelta: 0,
      realizedPlDelta: 0,
      reason: `Pembelian ${instrument.ticker || instrument.name || "investasi"} untuk Target ${goal.name}`,
    };
  }
  const allocated = await allocationRow(db, goal.goal_id, portfolio.portfolio_id, instrument.instrument_id, tradeDate);
  const goalShares = Number(allocated?.shares || 0);
  if (shares > goalShares) throw appError("GOAL_INVESTMENT_INSUFFICIENT", "Jumlah yang dijual melebihi aset yang terhubung ke Target ini.", 409, { availableShares: goalShares });
  const removedBasis = proportionalBasis(Number(allocated?.cost_basis || 0), shares, goalShares);
  const retained = retainForGoal !== false;
  return {
    goal,
    eventType: retained ? "sell_retain" : "sell_release",
    shareDelta: -shares,
    costBasisDelta: -removedBasis,
    cashDelta: retained ? cashAmount : 0,
    realizedPlDelta: retained ? cashAmount - removedBasis : 0,
    reason: retained ? `Hasil penjualan tetap untuk Target ${goal.name}` : `Hasil penjualan dilepas dari Target ${goal.name}`,
  };
};

export const recordPreparedGoalLinkedTrade = async (db, context, prepared, { portfolio, instrument, trade, tradeDate }) => {
  if (!prepared) return null;
  return appendGoalInvestmentEvent(db, context, {
    goal: prepared.goal,
    portfolio,
    instrumentId: instrument.instrument_id,
    tradeId: trade.trade_id,
    eventType: prepared.eventType,
    eventDate: tradeDate,
    shareDelta: prepared.shareDelta,
    costBasisDelta: prepared.costBasisDelta,
    cashDelta: prepared.cashDelta,
    realizedPlDelta: prepared.realizedPlDelta,
    reason: prepared.reason,
  });
};

export const goalInvestmentAllocationsForPortfolio = async (db, portfolioId) => db.all(`SELECT e.goal_id,g.name AS goal_name,g.status AS goal_status,e.instrument_id,
    COALESCE(SUM(e.share_delta),0) AS shares,
    COALESCE(SUM(e.cost_basis_delta),0) AS cost_basis,
    COALESCE(SUM(e.cash_delta),0) AS retained_cash,
    COALESCE(SUM(e.realized_pl_delta),0) AS realized_pl
  FROM goal_investment_events e
  JOIN savings_goals g ON g.goal_id=e.goal_id
  WHERE e.portfolio_id=? AND e.status='active'
  GROUP BY e.goal_id,g.name,g.status,e.instrument_id
  HAVING shares<>0 OR retained_cash<>0
  ORDER BY g.name COLLATE NOCASE`, [portfolioId]);

export const assertGoalInvestmentArchiveAllowed = async (db, goalId) => {
  const row = await db.one(`SELECT COALESCE(SUM(ABS(share_delta)),0) AS historical_shares,
      COALESCE(SUM(CASE WHEN status='active' THEN share_delta ELSE 0 END),0) AS active_shares,
      COALESCE(SUM(CASE WHEN status='active' THEN cash_delta ELSE 0 END),0) AS retained_cash
    FROM goal_investment_events WHERE goal_id=?`, [goalId]);
  if (Number(row?.active_shares || 0) !== 0 || Number(row?.retained_cash || 0) !== 0) {
    throw appError("GOAL_INVESTMENT_ARCHIVE_BLOCKED", "Lepaskan investasi atau hasil penjualan yang masih terhubung sebelum mengarsipkan Target.", 409, {
      activeShares: Number(row?.active_shares || 0), retainedCash: Number(row?.retained_cash || 0),
    });
  }
  return { historicalShares: Number(row?.historical_shares || 0) };
};
