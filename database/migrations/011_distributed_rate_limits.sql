CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY CHECK (length(bucket_key) BETWEEN 16 AND 256),
  window_started_at_ms INTEGER NOT NULL CHECK (window_started_at_ms >= 0),
  reset_at_ms INTEGER NOT NULL CHECK (reset_at_ms > window_started_at_ms),
  request_count INTEGER NOT NULL CHECK (request_count >= 1),
  updated_at TEXT NOT NULL
) WITHOUT ROWID, STRICT;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_expiry ON rate_limit_buckets(reset_at_ms);
-- migrate:split
UPDATE system_config SET value='13',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
