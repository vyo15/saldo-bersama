CREATE TABLE IF NOT EXISTS manual_reminders (
  reminder_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('recurring_occurrence','budget','envelope_period','goal')),
  entity_id TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','queued','cancelled')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT
) STRICT;

-- migrate:split

CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_reminders_active_entity
ON manual_reminders(user_id, entity_type, entity_id)
WHERE status = 'scheduled';

-- migrate:split

CREATE INDEX IF NOT EXISTS idx_manual_reminders_due
ON manual_reminders(status, scheduled_at, user_id);

-- migrate:split

UPDATE system_config
SET value = '10', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key = 'schema_version';
