-- Wishlist is purchase planning, not a second account, budget or money ledger.
-- An item always has an estimated price and a funding strategy. Merely saving it
-- does not reserve money or create any financial transaction.
CREATE TABLE wishlist_items (
  wishlist_item_id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK(scope IN ('personal','shared')),
  owner_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  estimated_amount INTEGER NOT NULL CHECK(estimated_amount > 0),
  priority TEXT NOT NULL CHECK(priority IN ('soon','planned','later')),
  funding_strategy TEXT NOT NULL CHECK(funding_strategy IN ('gradual','available','combined')),
  target_date TEXT,
  monthly_plan INTEGER NOT NULL DEFAULT 0 CHECK(monthly_plan >= 0),
  product_url TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','purchased')),
  purchase_transaction_id TEXT REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
  purchased_amount INTEGER NOT NULL DEFAULT 0 CHECK(purchased_amount >= 0),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK(row_version > 0),
  created_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL,
  CHECK ((scope='personal' AND owner_user_id IS NOT NULL) OR (scope='shared' AND owner_user_id IS NULL)),
  CHECK ((status='purchased' AND purchase_transaction_id IS NOT NULL) OR (status<>'purchased' AND purchase_transaction_id IS NULL))
) STRICT;
-- migrate:split
CREATE INDEX idx_wishlist_scope_owner_status ON wishlist_items(scope,owner_user_id,status,updated_at);
-- migrate:split
CREATE UNIQUE INDEX idx_wishlist_purchase_transaction ON wishlist_items(purchase_transaction_id);
-- migrate:split
UPDATE system_config SET value='27',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
