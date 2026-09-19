ALTER TABLE savings_goals
ADD COLUMN funding_mode TEXT NOT NULL DEFAULT 'cash'
CHECK (funding_mode IN ('cash','investment','mixed'));

-- migrate:split

CREATE TABLE IF NOT EXISTS goal_investment_events (
  goal_investment_event_id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  portfolio_id TEXT NOT NULL,
  instrument_id TEXT,
  trade_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('allocate','buy','sell_retain','sell_release','release','cash_release')),
  event_date TEXT NOT NULL CHECK (length(event_date) = 10),
  share_delta INTEGER NOT NULL DEFAULT 0,
  cost_basis_delta INTEGER NOT NULL DEFAULT 0,
  cash_delta INTEGER NOT NULL DEFAULT 0,
  realized_pl_delta INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 300),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reversed_by TEXT,
  reversed_at TEXT,
  reversal_reason TEXT NOT NULL DEFAULT '' CHECK (length(reversal_reason) <= 300),
  FOREIGN KEY (goal_id) REFERENCES savings_goals(goal_id) ON DELETE RESTRICT,
  FOREIGN KEY (portfolio_id) REFERENCES investment_portfolios(portfolio_id) ON DELETE RESTRICT,
  FOREIGN KEY (instrument_id) REFERENCES investment_instruments(instrument_id) ON DELETE RESTRICT,
  FOREIGN KEY (trade_id) REFERENCES investment_trades(trade_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (reversed_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  CHECK (share_delta <> 0 OR cash_delta <> 0),
  CHECK (instrument_id IS NOT NULL OR share_delta = 0),
  CHECK (
    (status='active' AND reversed_by IS NULL AND reversed_at IS NULL AND reversal_reason='')
    OR
    (status='reversed' AND reversed_by IS NOT NULL AND reversed_at IS NOT NULL AND length(reversal_reason) > 0)
  )
) STRICT;

-- migrate:split

CREATE INDEX IF NOT EXISTS idx_goal_investment_events_goal
ON goal_investment_events(goal_id,status,event_date,created_at);

-- migrate:split

CREATE INDEX IF NOT EXISTS idx_goal_investment_events_holding
ON goal_investment_events(portfolio_id,instrument_id,status,event_date,created_at);

-- migrate:split

CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_investment_events_trade
ON goal_investment_events(trade_id)
WHERE trade_id IS NOT NULL;

-- migrate:split

UPDATE system_config
SET value='24',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key='schema_version';
