CREATE TABLE IF NOT EXISTS notification_read_states (
  user_id TEXT NOT NULL,
  notification_key TEXT NOT NULL CHECK (length(notification_key) BETWEEN 1 AND 200),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) BETWEEN 1 AND 240),
  read_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, notification_key, fingerprint),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT
) WITHOUT ROWID, STRICT;

-- migrate:split

CREATE INDEX IF NOT EXISTS idx_notification_read_states_user_read
ON notification_read_states(user_id, read_at DESC);

-- migrate:split

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id TEXT PRIMARY KEY,
  reconciliation_days INTEGER NOT NULL DEFAULT 30 CHECK (reconciliation_days IN (0,14,30,60)),
  recording_consistency_days INTEGER NOT NULL DEFAULT 0 CHECK (recording_consistency_days IN (0,3,5,7)),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT
) WITHOUT ROWID, STRICT;

-- migrate:split

UPDATE system_config
SET value='23',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key='schema_version';
