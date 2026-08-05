CREATE TABLE IF NOT EXISTS notification_deliveries (
  delivery_id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','sent','failed','expired','dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at TEXT,
  locked_by TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (notification_id) REFERENCES notification_queue(notification_id) ON DELETE RESTRICT,
  FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(subscription_id) ON DELETE RESTRICT,
  UNIQUE(notification_id, subscription_id)
) STRICT;

-- migrate:split

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_ready
ON notification_deliveries(status, last_attempt_at, notification_id);

-- migrate:split

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_subscription
ON notification_deliveries(subscription_id, status);

-- migrate:split

UPDATE system_config
SET value = '6', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key = 'schema_version';
