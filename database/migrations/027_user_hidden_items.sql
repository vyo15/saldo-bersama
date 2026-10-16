-- Visibility is a per-user presentation preference, never a financial lifecycle mutation.
-- No source records, ledger rows, purchase relationships, or audit trails are deleted.
CREATE TABLE IF NOT EXISTS user_hidden_items (
  user_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL CHECK(entity_kind IN ('wishlist_item','shopping_item')),
  entity_id TEXT NOT NULL CHECK(length(entity_id) BETWEEN 1 AND 120),
  hidden INTEGER NOT NULL DEFAULT 1 CHECK(hidden IN (0,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,entity_kind,entity_id),
  FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;
-- migrate:split
UPDATE system_config SET value='29',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
