CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  firebase_uid TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','member')),
  status TEXT NOT NULL CHECK (status IN ('active','inactive')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('cash','bank','ewallet','savings','emergency_fund','sinking_fund','investment','other')),
  owner_scope TEXT NOT NULL CHECK (owner_scope IN ('shared','personal')),
  owner_user_id TEXT,
  initial_balance INTEGER NOT NULL DEFAULT 0,
  initial_balance_date TEXT NOT NULL,
  allow_negative INTEGER NOT NULL DEFAULT 0 CHECK (allow_negative IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('active','archived')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  CHECK ((owner_scope = 'shared' AND owner_user_id IS NULL) OR (owner_scope = 'personal' AND owner_user_id IS NOT NULL)),
  CHECK (initial_balance >= 0 OR allow_negative = 1)
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS categories (
  category_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income','expense','refund')),
  nature TEXT NOT NULL DEFAULT 'variable' CHECK (nature IN ('fixed','variable','unexpected','discretionary','emergency','savings','other')),
  icon TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active','archived')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  UNIQUE(name, transaction_type)
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS envelope_rules (
  envelope_rule_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily','weekly','biweekly','monthly','paycycle','custom')),
  scope TEXT NOT NULL CHECK (scope IN ('shared','personal')),
  owner_user_id TEXT,
  default_amount INTEGER NOT NULL CHECK (default_amount >= 0),
  source_account_id TEXT,
  rollover_policy TEXT NOT NULL CHECK (rollover_policy IN ('unallocated','carry')),
  overspend_policy TEXT NOT NULL DEFAULT 'confirm' CHECK (overspend_policy IN ('block','confirm','allow')),
  status TEXT NOT NULL CHECK (status IN ('active','archived')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  CHECK ((scope = 'shared' AND owner_user_id IS NULL) OR (scope = 'personal' AND owner_user_id IS NOT NULL))
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS envelope_periods (
  envelope_period_id TEXT PRIMARY KEY,
  envelope_rule_id TEXT NOT NULL,
  name TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  allocated_amount INTEGER NOT NULL CHECK (allocated_amount >= 0),
  reserved_amount INTEGER NOT NULL DEFAULT 0 CHECK (reserved_amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('active','closed','archived')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_by TEXT,
  closed_at TEXT,
  FOREIGN KEY (envelope_rule_id) REFERENCES envelope_rules(envelope_rule_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (closed_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  CHECK (period_start <= period_end),
  UNIQUE(envelope_rule_id, period_start, period_end)
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS recurring_rules (
  recurring_rule_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
  category_id TEXT NOT NULL,
  expected_amount INTEGER NOT NULL CHECK (expected_amount > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','biweekly','monthly','bimonthly','quarterly','semiannual','annual')),
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  default_account_id TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT '',
  auto_debit INTEGER NOT NULL DEFAULT 0 CHECK (auto_debit IN (0,1)),
  start_date TEXT NOT NULL,
  end_date TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  status TEXT NOT NULL CHECK (status IN ('active','archived')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('shared','personal')),
  owner_user_id TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
  FOREIGN KEY (default_account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
  CHECK (end_date IS NULL OR start_date <= end_date),
  CHECK ((scope = 'shared' AND owner_user_id IS NULL) OR (scope = 'personal' AND owner_user_id IS NOT NULL))
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS recurring_occurrences (
  occurrence_id TEXT PRIMARY KEY,
  recurring_rule_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  due_date TEXT NOT NULL,
  expected_amount INTEGER NOT NULL CHECK (expected_amount > 0),
  actual_amount INTEGER NOT NULL DEFAULT 0 CHECK (actual_amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('expected','partial','paid','overdue','cancelled')),
  transaction_ids_json TEXT NOT NULL DEFAULT '[]',
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (recurring_rule_id) REFERENCES recurring_rules(recurring_rule_id) ON DELETE RESTRICT,
  UNIQUE(recurring_rule_id, due_date)
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS savings_goals (
  goal_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('savings','emergency_fund','sinking_fund')),
  target_amount INTEGER NOT NULL CHECK (target_amount > 0),
  target_date TEXT,
  account_id TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  status TEXT NOT NULL CHECK (status IN ('active','completed','archived')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('shared','personal')),
  owner_user_id TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
  CHECK ((scope = 'shared' AND owner_user_id IS NULL) OR (scope = 'personal' AND owner_user_id IS NOT NULL))
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id TEXT PRIMARY KEY,
  transaction_date TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income','expense','transfer','refund','adjustment')),
  source_account_id TEXT,
  destination_account_id TEXT,
  category_id TEXT,
  envelope_period_id TEXT,
  recurring_occurrence_id TEXT,
  goal_id TEXT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL DEFAULT '',
  overspend_reason TEXT NOT NULL DEFAULT '',
  merchant TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL CHECK (scope IN ('shared','personal')),
  owner_user_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','cancelled','archived')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  idempotency_key TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  cancelled_by TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (source_account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
  FOREIGN KEY (destination_account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
  FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
  FOREIGN KEY (envelope_period_id) REFERENCES envelope_periods(envelope_period_id) ON DELETE RESTRICT,
  FOREIGN KEY (recurring_occurrence_id) REFERENCES recurring_occurrences(occurrence_id) ON DELETE RESTRICT,
  FOREIGN KEY (goal_id) REFERENCES savings_goals(goal_id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (cancelled_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  CHECK ((scope = 'shared' AND owner_user_id IS NULL) OR (scope = 'personal' AND owner_user_id IS NOT NULL)),
  CHECK (source_account_id IS NULL OR destination_account_id IS NULL OR source_account_id <> destination_account_id),
  CHECK (
    (transaction_type = 'income' AND source_account_id IS NULL AND destination_account_id IS NOT NULL AND category_id IS NOT NULL) OR
    (transaction_type = 'expense' AND source_account_id IS NOT NULL AND destination_account_id IS NULL AND category_id IS NOT NULL) OR
    (transaction_type = 'refund' AND source_account_id IS NULL AND destination_account_id IS NOT NULL AND category_id IS NOT NULL) OR
    (transaction_type = 'transfer' AND source_account_id IS NOT NULL AND destination_account_id IS NOT NULL AND category_id IS NULL) OR
    (transaction_type = 'adjustment' AND source_account_id IS NOT NULL AND destination_account_id IS NULL AND category_id IS NULL)
  ),
  CHECK (envelope_period_id IS NULL OR transaction_type = 'expense'),
  CHECK (goal_id IS NULL OR transaction_type = 'transfer'),
  CHECK (
    (status = 'active' AND cancelled_by IS NULL AND cancelled_at IS NULL AND cancellation_reason = '') OR
    (status = 'cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND length(cancellation_reason) > 0) OR
    (status = 'archived')
  )
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS envelope_movements (
  movement_id TEXT PRIMARY KEY,
  from_envelope_period_id TEXT NOT NULL,
  to_envelope_period_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('reallocation','rollover','return','goal')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','reversed')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (from_envelope_period_id) REFERENCES envelope_periods(envelope_period_id) ON DELETE RESTRICT,
  FOREIGN KEY (to_envelope_period_id) REFERENCES envelope_periods(envelope_period_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  CHECK (from_envelope_period_id <> to_envelope_period_id)
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS budgets (
  budget_id TEXT PRIMARY KEY,
  period_key TEXT NOT NULL,
  category_id TEXT,
  envelope_rule_id TEXT,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  warning_threshold INTEGER NOT NULL DEFAULT 80 CHECK (warning_threshold BETWEEN 1 AND 100),
  status TEXT NOT NULL CHECK (status IN ('active','archived')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('shared','personal')),
  owner_user_id TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
  FOREIGN KEY (envelope_rule_id) REFERENCES envelope_rules(envelope_rule_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
  CHECK (category_id IS NOT NULL OR envelope_rule_id IS NOT NULL),
  CHECK ((scope = 'shared' AND owner_user_id IS NULL) OR (scope = 'personal' AND owner_user_id IS NOT NULL))
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS goal_movements (
  goal_movement_id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  transaction_id TEXT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('deposit','withdrawal','adjustment')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','reversed')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reversed_by TEXT,
  reversed_at TEXT,
  reversal_reason TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (goal_id) REFERENCES savings_goals(goal_id) ON DELETE RESTRICT,
  FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (reversed_by) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS reconciliations (
  reconciliation_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  reconciled_at TEXT NOT NULL,
  system_balance INTEGER NOT NULL,
  actual_balance INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('matched','difference')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS period_closures (
  closure_id TEXT PRIMARY KEY,
  period_key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('shared')),
  status TEXT NOT NULL CHECK (status IN ('closed','reopened')),
  snapshot_json TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  closed_by TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  reopened_by TEXT,
  reopened_at TEXT,
  FOREIGN KEY (closed_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (reopened_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  UNIQUE(period_key, scope)
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  result TEXT NOT NULL CHECK (result IN ('success','rejected','failed')),
  FOREIGN KEY (actor_id) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;
-- migrate:split
CREATE TRIGGER IF NOT EXISTS audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
-- migrate:split
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
-- migrate:split
CREATE TABLE IF NOT EXISTS idempotency_keys (
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  action TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  entity_id TEXT,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (actor_id, idempotency_key),
  FOREIGN KEY (actor_id) REFERENCES users(user_id) ON DELETE RESTRICT
) WITHOUT ROWID, STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS request_nonces (
  nonce TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('scheduled_job')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) WITHOUT ROWID, STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS integration_outbox (
  outbox_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('sheets','calendar','drive')),
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','completed','failed','dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT NOT NULL,
  locked_at TEXT,
  locked_by TEXT,
  last_error_code TEXT NOT NULL DEFAULT '',
  last_error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS integration_links (
  link_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('sheets','calendar','drive')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  sync_status TEXT NOT NULL CHECK (sync_status IN ('synced','failed','deleted')),
  last_synced_at TEXT NOT NULL,
  last_error_code TEXT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  UNIQUE(provider, entity_type, entity_id)
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS notification_queue (
  notification_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_path TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','sent','failed','dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at TEXT,
  locked_by TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS push_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS backup_runs (
  backup_id TEXT PRIMARY KEY,
  backup_type TEXT NOT NULL,
  external_file_id TEXT,
  file_name TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','completed','failed','verified')),
  checksum TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  verified_at TEXT,
  error_code TEXT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS import_previews (
  preview_id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  records_json TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applying','applied')),
  result_json TEXT,
  applied_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS restore_previews (
  preview_id TEXT PRIMARY KEY,
  backup_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  checksum TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applying','applied')),
  result_json TEXT,
  applied_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (backup_id) REFERENCES backup_runs(backup_id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_id) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;
-- migrate:split
CREATE TABLE IF NOT EXISTS integrity_runs (
  integrity_run_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('passed','failed')),
  issues_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;
-- migrate:split
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_actor_idempotency ON transactions(created_by, idempotency_key);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_transactions_period ON transactions(transaction_date DESC, created_at DESC);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_account_id, transaction_date, status);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_transactions_destination ON transactions(destination_account_id, transaction_date, status);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_transactions_scope ON transactions(scope, owner_user_id, transaction_date DESC);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id, transaction_date, status);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_envelope_periods_date ON envelope_periods(period_start, period_end, status);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_period ON recurring_occurrences(period_key, due_date, status);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period_key, status, scope, owner_user_id);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_goal_movements_goal ON goal_movements(goal_id, created_at, status);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(timestamp DESC);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_outbox_ready ON integration_outbox(status, next_attempt_at, provider);
-- migrate:split
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_coalesced_waiting ON integration_outbox(provider, event_key) WHERE status IN ('pending','failed');
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_notifications_ready ON notification_queue(status, scheduled_at);
-- migrate:split
INSERT OR IGNORE INTO system_config(key, value, updated_at) VALUES
  ('schema_version', '3', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('timezone', 'Asia/Jakarta', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('currency', 'IDR', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('maintenance_mode', 'false', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('recovery_required', 'false', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
