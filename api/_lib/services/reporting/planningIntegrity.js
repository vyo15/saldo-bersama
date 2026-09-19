export const planningIntegrityStatement = () => ({
  sql: `WITH holding_events AS (
    SELECT portfolio_id,instrument_id,CASE WHEN trade_type='buy' THEN share_quantity ELSE -share_quantity END AS share_delta FROM investment_trades
    UNION ALL
    SELECT portfolio_id,instrument_id,share_delta FROM investment_corrections WHERE instrument_id IS NOT NULL
  ), holdings AS (
    SELECT portfolio_id,instrument_id,COALESCE(SUM(share_delta),0) AS shares FROM holding_events GROUP BY portfolio_id,instrument_id
  ), goal_allocations AS (
    SELECT portfolio_id,instrument_id,COALESCE(SUM(share_delta),0) AS shares
    FROM goal_investment_events WHERE status='active' AND instrument_id IS NOT NULL GROUP BY portfolio_id,instrument_id
  ), goal_cash AS (
    SELECT goal_id,portfolio_id,COALESCE(SUM(cash_delta),0) AS retained_cash
    FROM goal_investment_events WHERE status='active' GROUP BY goal_id,portfolio_id
  ), planning_issues AS (
    SELECT 'GOAL_INVESTMENT_ALLOCATION_INVALID' AS code FROM goal_allocations ga
      LEFT JOIN holdings h ON h.portfolio_id=ga.portfolio_id AND h.instrument_id=ga.instrument_id
      WHERE ga.shares<0 OR ga.shares>COALESCE(h.shares,0)
    UNION ALL
    SELECT 'GOAL_INVESTMENT_RETAINED_CASH_NEGATIVE' FROM goal_cash WHERE retained_cash<0
    UNION ALL
    SELECT 'GOAL_INVESTMENT_FUNDING_MODE_MISMATCH' FROM goal_investment_events e
      JOIN savings_goals g ON g.goal_id=e.goal_id WHERE e.status='active' AND g.funding_mode='cash'
    UNION ALL
    SELECT 'GOAL_INVESTMENT_TRADE_MISMATCH' FROM goal_investment_events e
      JOIN investment_trades t ON t.trade_id=e.trade_id
      WHERE e.trade_id IS NOT NULL AND (e.portfolio_id<>t.portfolio_id OR e.instrument_id<>t.instrument_id
        OR (t.trade_type='buy' AND (e.event_type<>'buy' OR e.share_delta<>t.share_quantity))
        OR (t.trade_type='sell' AND (e.event_type NOT IN ('sell_retain','sell_release') OR e.share_delta<>-t.share_quantity)))
    UNION ALL
    SELECT 'COMMITMENT_SCHEDULE_MISSING'
    FROM commitments c LEFT JOIN recurring_rules r ON r.commitment_id=c.commitment_id
    WHERE c.status<>'archived' AND r.recurring_rule_id IS NULL
    UNION ALL
    SELECT 'COMMITMENT_SCHEDULE_STATUS_MISMATCH'
    FROM commitments c JOIN recurring_rules r ON r.commitment_id=c.commitment_id
    WHERE (c.status='active' AND r.status<>'active') OR (c.status='completed' AND r.status<>'archived')
    UNION ALL
    SELECT 'COMMITMENT_SCHEDULE_SCOPE_MISMATCH'
    FROM commitments c JOIN recurring_rules r ON r.commitment_id=c.commitment_id
    WHERE c.scope<>r.scope OR COALESCE(c.owner_user_id,'')<>COALESCE(r.owner_user_id,'')
    UNION ALL
    SELECT 'COMMITMENT_MOVEMENT_TRANSACTION_MISMATCH'
    FROM commitment_movements cm
    LEFT JOIN transactions t ON t.transaction_id=cm.transaction_id
    WHERE cm.status='active' AND (
      t.transaction_id IS NULL OR t.status<>'active' OR t.commitment_id<>cm.commitment_id
      OR (cm.movement_type='payment' AND t.commitment_flow<>'payment')
      OR (cm.movement_type='receipt' AND t.commitment_flow<>'receipt')
    )
  ) SELECT code,COUNT(*) AS count FROM planning_issues GROUP BY code ORDER BY code`,
  args: [],
});

export const appendPlanningIntegrityIssues = (issues, rows) => {
  for (const row of rows || []) {
    const count = Number(row.count || 0);
    if (count > 0) issues.push({ code: row.code, count });
  }
};
