import { publicRow } from "../core.js";
import { openingPositionAvailable, portfolioState } from "./investmentState.js";

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

