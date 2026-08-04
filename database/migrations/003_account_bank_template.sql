ALTER TABLE accounts
ADD COLUMN bank_template TEXT NOT NULL DEFAULT 'generic'
CHECK (
  (account_type = 'bank' AND bank_template IN ('generic','bca','bni','btn','mandiri','permata'))
  OR (account_type <> 'bank' AND bank_template = 'generic')
);

-- migrate:split

UPDATE accounts
SET bank_template = CASE
  WHEN lower(trim(name)) LIKE '% · bca' OR lower(trim(name)) LIKE '% - bca' THEN 'bca'
  WHEN lower(trim(name)) LIKE '% · bni' OR lower(trim(name)) LIKE '% - bni' THEN 'bni'
  WHEN lower(trim(name)) LIKE '% · btn' OR lower(trim(name)) LIKE '% - btn' THEN 'btn'
  WHEN lower(trim(name)) LIKE '% · mandiri' OR lower(trim(name)) LIKE '% - mandiri' THEN 'mandiri'
  WHEN lower(trim(name)) LIKE '% · permata' OR lower(trim(name)) LIKE '% - permata' THEN 'permata'
  ELSE 'generic'
END
WHERE account_type = 'bank';

-- migrate:split

UPDATE system_config
SET value = '5', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key = 'schema_version';
