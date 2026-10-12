-- Existing Wishlist rows remain planned (1). New unplanned Wishlist items (0)
-- can be stored without changing the canonical funding_strategy CHECK or ledger.
ALTER TABLE wishlist_items ADD COLUMN planning_enabled INTEGER NOT NULL DEFAULT 1 CHECK(planning_enabled IN (0,1));
-- migrate:split
UPDATE system_config SET value='28',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
