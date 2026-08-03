ALTER TABLE accounts
ADD COLUMN account_number TEXT NOT NULL DEFAULT ''
CHECK (
  account_number = '' OR (
    account_type = 'bank'
    AND length(account_number) BETWEEN 6 AND 34
    AND account_number NOT GLOB '*[^0-9]*'
  )
);

-- migrate:split

UPDATE system_config
SET value = '4', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key = 'schema_version';
