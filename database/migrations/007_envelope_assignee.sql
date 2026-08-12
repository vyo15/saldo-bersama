ALTER TABLE envelope_rules
ADD COLUMN assignee_user_id TEXT REFERENCES users(user_id) ON DELETE RESTRICT;

-- migrate:split

UPDATE envelope_rules
SET assignee_user_id = owner_user_id
WHERE scope = 'personal' AND owner_user_id IS NOT NULL AND assignee_user_id IS NULL;

-- migrate:split

CREATE INDEX IF NOT EXISTS idx_envelope_rules_assignee
ON envelope_rules(assignee_user_id, status);

-- migrate:split

UPDATE system_config
SET value = '9', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key = 'schema_version';
