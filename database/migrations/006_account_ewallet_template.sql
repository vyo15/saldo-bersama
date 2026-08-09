ALTER TABLE accounts
ADD COLUMN ewallet_template TEXT NOT NULL DEFAULT 'generic'
CHECK (
  (account_type = 'ewallet' AND ewallet_template IN ('generic','shopeepay','dana','gopay','ovo','linkaja'))
  OR (account_type <> 'ewallet' AND ewallet_template = 'generic')
);

-- migrate:split

WITH normalized AS (
  SELECT
    account_id,
    ' ' || lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(trim(name), '-', ' '), '_', ' '), '·', ' '), '.', ' '), ',', ' '), '!', ' '), '/', ' '), '(', ' '), ')', ' '), ':', ' ')) || ' ' AS normalized_lower,
    ' ' || replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(trim(name), '-', ' '), '_', ' '), '·', ' '), '.', ' '), ',', ' '), '!', ' '), '/', ' '), '(', ' '), ')', ' '), ':', ' ') || ' ' AS normalized_case
  FROM accounts
  WHERE account_type = 'ewallet'
)
UPDATE accounts
SET ewallet_template = COALESCE((
  SELECT CASE
    WHEN normalized_lower LIKE '% shopeepay %' OR normalized_lower LIKE '% shopee pay %' THEN 'shopeepay'
    WHEN normalized_case GLOB '* DANA *' THEN 'dana'
    WHEN normalized_lower LIKE '% gopay %' OR normalized_lower LIKE '% go pay %' THEN 'gopay'
    WHEN normalized_lower LIKE '% ovo %' THEN 'ovo'
    WHEN normalized_lower LIKE '% linkaja %' OR normalized_lower LIKE '% link aja %' THEN 'linkaja'
    ELSE 'generic'
  END
  FROM normalized
  WHERE normalized.account_id = accounts.account_id
), 'generic')
WHERE account_type = 'ewallet';

-- migrate:split

UPDATE system_config
SET value = '8', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE key = 'schema_version';
