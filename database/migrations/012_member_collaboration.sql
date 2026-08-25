ALTER TABLE users ADD COLUMN photo_url TEXT NOT NULL DEFAULT ''
  CHECK (
    photo_url = '' OR (
      length(photo_url) <= 1024
      AND photo_url LIKE 'https://lh3.googleusercontent.com/%'
    )
  );
-- migrate:split
CREATE TABLE IF NOT EXISTS master_data_requests (
  request_id TEXT PRIMARY KEY,
  request_type TEXT NOT NULL CHECK (request_type IN ('account','category')),
  request_key TEXT NOT NULL CHECK (length(request_key) BETWEEN 16 AND 128),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','cancelled')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT NOT NULL DEFAULT '',
  approved_entity_id TEXT,
  FOREIGN KEY (requested_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND approved_entity_id IS NULL)
    OR
    (status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND approved_entity_id IS NOT NULL)
    OR
    (status IN ('rejected','cancelled') AND approved_entity_id IS NULL)
  )
) STRICT;
-- migrate:split
CREATE UNIQUE INDEX IF NOT EXISTS idx_master_data_requests_pending_unique
  ON master_data_requests(request_type, requested_by, request_key)
  WHERE status='pending';
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_master_data_requests_status_type
  ON master_data_requests(status, request_type, requested_at DESC);
-- migrate:split
CREATE TABLE IF NOT EXISTS transfer_requests (
  request_id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL CHECK (length(request_key) BETWEEN 16 AND 128),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT NOT NULL DEFAULT '',
  approved_transaction_id TEXT,
  FOREIGN KEY (requested_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (approved_transaction_id) REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
  CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND approved_transaction_id IS NULL)
    OR
    (status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND approved_transaction_id IS NOT NULL)
    OR
    (status = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND approved_transaction_id IS NULL)
  )
) STRICT;
-- migrate:split
CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_requests_pending_unique
  ON transfer_requests(requested_by, request_key)
  WHERE status='pending';
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_transfer_requests_status
  ON transfer_requests(status, requested_at DESC);
-- migrate:split
UPDATE system_config SET value='14',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
