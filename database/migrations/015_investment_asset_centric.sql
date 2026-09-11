-- Asset-centric investment recording. Existing history keeps its historical RDN cash
-- impact, while new Buy/Sell records created by schema v17 are accounting-only and do
-- not mutate any account balance.
ALTER TABLE accounts
  ADD COLUMN is_system_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_system_hidden IN (0,1));
-- migrate:split
ALTER TABLE investment_trades
  ADD COLUMN cash_effect_enabled INTEGER NOT NULL DEFAULT 1 CHECK (cash_effect_enabled IN (0,1));
-- migrate:split
ALTER TABLE investment_corrections
  ADD COLUMN cash_effect_enabled INTEGER NOT NULL DEFAULT 1 CHECK (cash_effect_enabled IN (0,1));
-- migrate:split
DROP VIEW IF EXISTS investment_account_events;
-- migrate:split
CREATE VIEW investment_account_events AS
SELECT
  'trade:' || t.trade_id AS event_id,
  p.rdn_account_id AS account_id,
  t.trade_date AS event_date,
  t.created_at AS created_at,
  CASE WHEN t.trade_type='buy' THEN -t.cash_amount ELSE t.cash_amount END AS cash_effect
FROM investment_trades t
JOIN investment_portfolios p ON p.portfolio_id=t.portfolio_id
WHERE t.cash_effect_enabled=1
UNION ALL
SELECT
  'correction:' || c.correction_id AS event_id,
  p.rdn_account_id AS account_id,
  c.correction_date AS event_date,
  c.created_at AS created_at,
  c.cash_delta AS cash_effect
FROM investment_corrections c
JOIN investment_portfolios p ON p.portfolio_id=c.portfolio_id
WHERE c.cash_delta <> 0 AND c.cash_effect_enabled=1;
-- migrate:split
UPDATE system_config SET value='17',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
