ALTER TABLE envelope_rules
ADD COLUMN decoration_key TEXT NOT NULL DEFAULT 'auto'
CHECK (decoration_key IN ('auto','home','shopping','love','education','travel','gift','pet','food','car','plant'));
-- migrate:split
UPDATE system_config SET value='20',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
