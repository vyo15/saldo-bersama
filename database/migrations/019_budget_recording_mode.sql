ALTER TABLE budgets
ADD COLUMN recording_mode TEXT NOT NULL DEFAULT 'flexible' CHECK (recording_mode IN ('flexible','fixed_once','recurring'));
-- migrate:split
ALTER TABLE budget_history
ADD COLUMN recording_mode TEXT NOT NULL DEFAULT 'flexible' CHECK (recording_mode IN ('flexible','fixed_once','recurring'));
-- migrate:split
UPDATE budgets
SET recording_mode='recurring'
WHERE EXISTS (
  SELECT 1 FROM recurring_rules rr
  WHERE rr.budget_id=budgets.budget_id
);
-- migrate:split
UPDATE budget_history
SET recording_mode='recurring'
WHERE EXISTS (
  SELECT 1 FROM recurring_rules rr
  WHERE rr.budget_id=budget_history.budget_id
);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_budgets_need_identity
ON budgets(period_key,envelope_rule_id,scope,owner_user_id,name);
-- migrate:split
UPDATE system_config SET value='21',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
