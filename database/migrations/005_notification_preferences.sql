CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT NOT NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('recurring_due','recurring_funding_shortage','recurring_completed','budget_threshold','envelope_threshold','goal_behind','unallocated_expense')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, notification_type),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT
) WITHOUT ROWID, STRICT;

-- migrate:split

CREATE INDEX IF NOT EXISTS idx_notification_preferences_enabled
ON notification_preferences(user_id, enabled, notification_type);

-- migrate:split

UPDATE system_config
SET value = '7', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key = 'schema_version';
