CREATE TABLE IF NOT EXISTS commitments (
  commitment_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  commitment_type TEXT NOT NULL CHECK (commitment_type IN ('mortgage','installment','loan','arisan','other')),
  provider TEXT NOT NULL DEFAULT '',
  original_amount INTEGER NOT NULL CHECK (original_amount > 0),
  opening_balance INTEGER NOT NULL CHECK (opening_balance >= 0),
  current_balance INTEGER NOT NULL CHECK (current_balance >= 0),
  installment_amount INTEGER NOT NULL CHECK (installment_amount > 0),
  total_installments INTEGER NOT NULL DEFAULT 0 CHECK (total_installments >= 0),
  installments_paid INTEGER NOT NULL DEFAULT 0 CHECK (installments_paid >= 0),
  received_amount INTEGER NOT NULL DEFAULT 0 CHECK (received_amount >= 0),
  received_at TEXT,
  default_account_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily','weekly','biweekly','monthly','bimonthly','quarterly','semiannual','annual')),
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  payment_method TEXT NOT NULL DEFAULT 'transfer',
  auto_debit INTEGER NOT NULL DEFAULT 0 CHECK (auto_debit IN (0,1)),
  start_date TEXT NOT NULL,
  end_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('shared','personal')),
  owner_user_id TEXT,
  FOREIGN KEY (default_account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
  FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
  CHECK (current_balance <= original_amount OR commitment_type='arisan'),
  CHECK (installments_paid <= total_installments OR total_installments=0),
  CHECK (end_date IS NULL OR start_date <= end_date),
  CHECK ((scope = 'shared' AND owner_user_id IS NULL) OR (scope = 'personal' AND owner_user_id IS NOT NULL))
) STRICT;
-- migrate:split
ALTER TABLE recurring_rules ADD COLUMN commitment_id TEXT REFERENCES commitments(commitment_id) ON DELETE RESTRICT;
-- migrate:split
CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_rules_commitment ON recurring_rules(commitment_id) WHERE commitment_id IS NOT NULL;
-- migrate:split
ALTER TABLE transactions ADD COLUMN commitment_id TEXT REFERENCES commitments(commitment_id) ON DELETE RESTRICT;
-- migrate:split
ALTER TABLE transactions ADD COLUMN commitment_flow TEXT CHECK (commitment_flow IN ('payment','receipt'));
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_transactions_commitment ON transactions(commitment_id) WHERE commitment_id IS NOT NULL;
-- migrate:split
CREATE TABLE IF NOT EXISTS commitment_movements (
  commitment_movement_id TEXT PRIMARY KEY,
  commitment_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('payment','receipt','adjustment')),
  recurring_occurrence_id TEXT,
  transaction_id TEXT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  principal_amount INTEGER NOT NULL DEFAULT 0 CHECK (principal_amount >= 0),
  interest_amount INTEGER NOT NULL DEFAULT 0 CHECK (interest_amount >= 0),
  balance_before INTEGER NOT NULL CHECK (balance_before >= 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  installments_delta INTEGER NOT NULL DEFAULT 0 CHECK (installments_delta IN (0,1)),
  principal_known INTEGER NOT NULL DEFAULT 1 CHECK (principal_known IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','reversed')),
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reversed_by TEXT,
  reversed_at TEXT,
  FOREIGN KEY (commitment_id) REFERENCES commitments(commitment_id) ON DELETE RESTRICT,
  FOREIGN KEY (recurring_occurrence_id) REFERENCES recurring_occurrences(occurrence_id) ON DELETE RESTRICT,
  FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (reversed_by) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;
-- migrate:split
CREATE UNIQUE INDEX IF NOT EXISTS idx_commitment_movements_transaction ON commitment_movements(transaction_id) WHERE transaction_id IS NOT NULL;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_commitments_status_scope ON commitments(status,scope,owner_user_id);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_commitment_movements_commitment ON commitment_movements(commitment_id,created_at);
-- migrate:split
UPDATE system_config SET value='22',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
