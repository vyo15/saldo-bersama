-- Pengajuan penghapusan Target adalah permintaan, bukan mutasi finansial.
-- goal_id sengaja tanpa FK: target belum dipakai boleh dihapus permanen,
-- sementara histori pengajuan tetap harus dipertahankan.
CREATE TABLE IF NOT EXISTS goal_deletion_requests (
  request_id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL CHECK(length(goal_id) BETWEEN 1 AND 120),
  goal_name TEXT NOT NULL CHECK(length(goal_name) BETWEEN 1 AND 100),
  goal_row_version INTEGER NOT NULL CHECK(goal_row_version >= 1),
  requested_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version >= 1),
  requested_at TEXT NOT NULL,
  reviewed_by TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  review_reason TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL DEFAULT '' CHECK(outcome IN ('','deleted','archived')),
  CHECK ((status='pending' AND reviewed_at IS NULL AND reviewed_by IS NULL AND outcome='') OR status<>'pending')
) STRICT;
-- migrate:split
CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_deletion_pending_member
  ON goal_deletion_requests(goal_id,requested_by) WHERE status='pending';
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_goal_deletion_status ON goal_deletion_requests(status,requested_at DESC);
-- migrate:split
UPDATE system_config SET value='30',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
