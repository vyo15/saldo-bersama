ALTER TABLE transactions
ADD COLUMN cost_share_mode TEXT NOT NULL DEFAULT 'unspecified'
CHECK (cost_share_mode IN ('unspecified','equal','percentage'));

-- migrate:split

ALTER TABLE transactions
ADD COLUMN cost_share_json TEXT NOT NULL DEFAULT '[]';

-- migrate:split

UPDATE system_config
SET value = '11', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key = 'schema_version';
