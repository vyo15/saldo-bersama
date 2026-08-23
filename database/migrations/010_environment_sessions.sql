CREATE TABLE IF NOT EXISTS user_sessions (
  session_id TEXT PRIMARY KEY CHECK (length(session_id) BETWEEN 22 AND 128),
  user_id TEXT NOT NULL,
  verifier_hash TEXT NOT NULL CHECK (length(verifier_hash) = 64 AND verifier_hash NOT GLOB '*[^0-9a-f]*'),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT,
  revoked_reason TEXT,
  device_label TEXT,
  client_family TEXT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CHECK (expires_at > issued_at)
) STRICT;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id, revoked_at, expires_at);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at, revoked_at);
-- migrate:split
INSERT OR IGNORE INTO system_config(key,value,updated_at)
VALUES('database_environment','unbound',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
-- migrate:split
INSERT OR IGNORE INTO system_config(key,value,updated_at)
VALUES('scheduler_last_run_at','',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
-- migrate:split
INSERT OR IGNORE INTO system_config(key,value,updated_at)
VALUES('scheduler_last_success_at','',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
-- migrate:split
INSERT OR IGNORE INTO system_config(key,value,updated_at)
VALUES('scheduler_last_failure_at','',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
-- migrate:split
INSERT OR IGNORE INTO system_config(key,value,updated_at)
VALUES('scheduler_last_error_code','',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
-- migrate:split
UPDATE system_config SET value='12',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
