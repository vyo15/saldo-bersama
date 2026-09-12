-- Cross-device read invalidation. Revision rows are runtime coordination metadata only;
-- canonical financial state remains in domain tables and every client refetches authoritative
-- read models after seeing a revision change.
CREATE TABLE IF NOT EXISTS sync_revisions (
  resource TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at TEXT NOT NULL
) STRICT;
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_sync_revisions_updated_at ON sync_revisions(updated_at);
-- migrate:split
INSERT INTO sync_revisions(resource,revision,updated_at)
VALUES('__global__',0,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(resource) DO NOTHING;
-- migrate:split
UPDATE system_config SET value='18',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
