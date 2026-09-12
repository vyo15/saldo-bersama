ALTER TABLE budgets
ADD COLUMN released_amount INTEGER NOT NULL DEFAULT 0 CHECK (released_amount >= 0);
-- migrate:split
ALTER TABLE budgets
ADD COLUMN ended_reason TEXT NOT NULL DEFAULT '';
-- migrate:split
ALTER TABLE budgets
ADD COLUMN ended_by TEXT;
-- migrate:split
ALTER TABLE budgets
ADD COLUMN ended_at TEXT;
-- migrate:split
ALTER TABLE transactions
ADD COLUMN budget_id TEXT;
-- migrate:split
ALTER TABLE recurring_rules
ADD COLUMN budget_id TEXT;
-- migrate:split
CREATE TABLE IF NOT EXISTS budget_history (
  budget_id TEXT PRIMARY KEY,
  period_key TEXT NOT NULL,
  category_id TEXT,
  category_name TEXT NOT NULL DEFAULT '',
  envelope_rule_id TEXT,
  envelope_name TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  warning_threshold INTEGER NOT NULL DEFAULT 80 CHECK (warning_threshold BETWEEN 1 AND 100),
  used_amount INTEGER NOT NULL DEFAULT 0 CHECK (used_amount >= 0),
  released_amount INTEGER NOT NULL DEFAULT 0 CHECK (released_amount >= 0),
  final_status TEXT NOT NULL CHECK (final_status IN ('closed','ended')),
  ended_reason TEXT NOT NULL DEFAULT '',
  ended_by TEXT,
  ended_at TEXT,
  row_version INTEGER NOT NULL CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('shared','personal')),
  owner_user_id TEXT,
  compacted_by TEXT NOT NULL,
  compacted_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
  FOREIGN KEY (envelope_rule_id) REFERENCES envelope_rules(envelope_rule_id) ON DELETE RESTRICT,
  FOREIGN KEY (ended_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (compacted_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  CHECK ((scope = 'shared' AND owner_user_id IS NULL) OR (scope = 'personal' AND owner_user_id IS NOT NULL))
) STRICT;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_transactions_budget_id ON transactions(budget_id) WHERE budget_id IS NOT NULL;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_recurring_rules_budget_id ON recurring_rules(budget_id) WHERE budget_id IS NOT NULL;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_budget_history_period ON budget_history(period_key,final_status);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_budget_history_category ON budget_history(category_id) WHERE category_id IS NOT NULL;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_budget_history_envelope ON budget_history(envelope_rule_id) WHERE envelope_rule_id IS NOT NULL;
-- migrate:split
UPDATE system_config SET value='19',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
