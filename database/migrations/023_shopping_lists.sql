CREATE TABLE IF NOT EXISTS shopping_lists (
  shopping_list_id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','completed','archived')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (budget_id) REFERENCES budgets(budget_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;

-- migrate:split

CREATE TABLE IF NOT EXISTS shopping_checkouts (
  shopping_checkout_id TEXT PRIMARY KEY,
  shopping_list_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL UNIQUE,
  total_amount INTEGER NOT NULL CHECK (total_amount > 0),
  item_count INTEGER NOT NULL CHECK (item_count > 0),
  checkout_date TEXT NOT NULL CHECK (length(checkout_date) = 10),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (shopping_list_id) REFERENCES shopping_lists(shopping_list_id) ON DELETE RESTRICT,
  FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;

-- migrate:split

CREATE TABLE IF NOT EXISTS shopping_items (
  shopping_item_id TEXT PRIMARY KEY,
  shopping_list_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  quantity_milli INTEGER NOT NULL DEFAULT 1000 CHECK (quantity_milli > 0 AND quantity_milli <= 1000000),
  unit_key TEXT NOT NULL DEFAULT 'pcs' CHECK (length(unit_key) BETWEEN 1 AND 24),
  estimated_unit_price INTEGER NOT NULL DEFAULT 0 CHECK (estimated_unit_price >= 0),
  estimated_amount INTEGER NOT NULL DEFAULT 0 CHECK (estimated_amount >= 0),
  actual_amount INTEGER NOT NULL DEFAULT 0 CHECK (actual_amount >= 0),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  group_name TEXT NOT NULL DEFAULT '' CHECK (length(group_name) <= 60),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_cart','purchased','removed')),
  purchased_checkout_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (shopping_list_id) REFERENCES shopping_lists(shopping_list_id) ON DELETE RESTRICT,
  FOREIGN KEY (purchased_checkout_id) REFERENCES shopping_checkouts(shopping_checkout_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  CHECK ((status='purchased' AND purchased_checkout_id IS NOT NULL) OR (status<>'purchased' AND purchased_checkout_id IS NULL))
) STRICT;

-- migrate:split

CREATE INDEX IF NOT EXISTS idx_shopping_lists_budget_status
ON shopping_lists(budget_id,status,updated_at);

-- migrate:split

CREATE UNIQUE INDEX IF NOT EXISTS ux_shopping_lists_open_budget
ON shopping_lists(budget_id)
WHERE status IN ('draft','active');

-- migrate:split

CREATE INDEX IF NOT EXISTS idx_shopping_items_list_status
ON shopping_items(shopping_list_id,status,sort_order,created_at);

-- migrate:split

CREATE INDEX IF NOT EXISTS idx_shopping_checkouts_list
ON shopping_checkouts(shopping_list_id,checkout_date,created_at);

-- migrate:split

UPDATE system_config
SET value='25',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key='schema_version';
