CREATE TABLE IF NOT EXISTS investment_portfolios (
  portfolio_id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  broker TEXT NOT NULL DEFAULT 'ajaib' CHECK (broker IN ('ajaib','other')),
  rdn_account_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (rdn_account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_investment_portfolios_status
  ON investment_portfolios(status, updated_at DESC);
-- migrate:split
CREATE TABLE IF NOT EXISTS investment_instruments (
  instrument_id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL UNIQUE CHECK (length(ticker) BETWEEN 1 AND 16),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  exchange TEXT NOT NULL DEFAULT 'IDX' CHECK (length(exchange) BETWEEN 2 AND 16),
  lot_size INTEGER NOT NULL DEFAULT 100 CHECK (lot_size > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_investment_instruments_status_ticker
  ON investment_instruments(status, ticker);
-- migrate:split
CREATE TABLE IF NOT EXISTS investment_trades (
  trade_id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('buy','sell')),
  trade_date TEXT NOT NULL CHECK (length(trade_date) = 10),
  lots INTEGER NOT NULL CHECK (lots > 0),
  share_quantity INTEGER NOT NULL CHECK (share_quantity > 0),
  price_per_share INTEGER NOT NULL CHECK (price_per_share > 0),
  fee_amount INTEGER NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  gross_amount INTEGER NOT NULL CHECK (gross_amount > 0),
  cash_amount INTEGER NOT NULL CHECK (cash_amount > 0),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES investment_portfolios(portfolio_id) ON DELETE RESTRICT,
  FOREIGN KEY (instrument_id) REFERENCES investment_instruments(instrument_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  UNIQUE(created_by, idempotency_key),
  CHECK (
    (trade_type='buy' AND cash_amount = gross_amount + fee_amount)
    OR
    (trade_type='sell' AND fee_amount < gross_amount AND cash_amount = gross_amount - fee_amount)
  )
) STRICT;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_investment_trades_portfolio_date
  ON investment_trades(portfolio_id, trade_date, created_at, trade_id);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_investment_trades_instrument
  ON investment_trades(portfolio_id, instrument_id, trade_date, created_at);
-- migrate:split
CREATE TABLE IF NOT EXISTS investment_valuations (
  valuation_id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  valuation_date TEXT NOT NULL CHECK (length(valuation_date) = 10),
  price_per_share INTEGER NOT NULL CHECK (price_per_share > 0),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES investment_portfolios(portfolio_id) ON DELETE RESTRICT,
  FOREIGN KEY (instrument_id) REFERENCES investment_instruments(instrument_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  UNIQUE(created_by, idempotency_key)
) STRICT;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_investment_valuations_latest
  ON investment_valuations(portfolio_id, instrument_id, valuation_date DESC, created_at DESC);
-- migrate:split
CREATE TABLE IF NOT EXISTS investment_reconciliations (
  reconciliation_id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  reconciliation_date TEXT NOT NULL CHECK (length(reconciliation_date) = 10),
  recorded_cash INTEGER NOT NULL,
  actual_cash INTEGER NOT NULL,
  recorded_holdings_json TEXT NOT NULL CHECK (json_valid(recorded_holdings_json)),
  actual_holdings_json TEXT NOT NULL CHECK (json_valid(actual_holdings_json)),
  difference_json TEXT NOT NULL CHECK (json_valid(difference_json)),
  status TEXT NOT NULL CHECK (status IN ('matched','mismatch')),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES investment_portfolios(portfolio_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  UNIQUE(created_by, idempotency_key)
) STRICT;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_investment_reconciliations_portfolio
  ON investment_reconciliations(portfolio_id, reconciliation_date DESC, created_at DESC);
-- migrate:split
CREATE TABLE IF NOT EXISTS investment_corrections (
  correction_id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  instrument_id TEXT,
  correction_date TEXT NOT NULL CHECK (length(correction_date) = 10),
  share_delta INTEGER NOT NULL DEFAULT 0,
  cost_basis_delta INTEGER NOT NULL DEFAULT 0,
  cash_delta INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 500),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 200),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES investment_portfolios(portfolio_id) ON DELETE RESTRICT,
  FOREIGN KEY (instrument_id) REFERENCES investment_instruments(instrument_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  UNIQUE(created_by, idempotency_key),
  CHECK (share_delta <> 0 OR cost_basis_delta <> 0 OR cash_delta <> 0),
  CHECK (
    (share_delta = 0 AND cost_basis_delta = 0 AND instrument_id IS NULL)
    OR (share_delta > 0 AND cost_basis_delta > 0 AND instrument_id IS NOT NULL)
    OR (share_delta < 0 AND cost_basis_delta < 0 AND instrument_id IS NOT NULL)
  )
) STRICT;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_investment_corrections_portfolio_date
  ON investment_corrections(portfolio_id, correction_date, created_at, correction_id);
-- migrate:split
CREATE VIEW IF NOT EXISTS investment_account_events AS
SELECT
  'trade:' || t.trade_id AS event_id,
  p.rdn_account_id AS account_id,
  t.trade_date AS event_date,
  t.created_at AS created_at,
  CASE WHEN t.trade_type='buy' THEN -t.cash_amount ELSE t.cash_amount END AS cash_effect
FROM investment_trades t
JOIN investment_portfolios p ON p.portfolio_id=t.portfolio_id
UNION ALL
SELECT
  'correction:' || c.correction_id AS event_id,
  p.rdn_account_id AS account_id,
  c.correction_date AS event_date,
  c.created_at AS created_at,
  c.cash_delta AS cash_effect
FROM investment_corrections c
JOIN investment_portfolios p ON p.portfolio_id=c.portfolio_id
WHERE c.cash_delta <> 0;
-- migrate:split
UPDATE system_config SET value='15',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
