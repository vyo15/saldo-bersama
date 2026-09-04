-- Additive Investment onboarding semantics. No historical trade is rewritten.
ALTER TABLE investment_trades
  ADD COLUMN notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 500);
-- migrate:split
ALTER TABLE investment_corrections
  ADD COLUMN correction_type TEXT NOT NULL DEFAULT 'correction' CHECK (correction_type IN ('correction','opening_position'));
-- migrate:split
ALTER TABLE investment_corrections
  ADD COLUMN reference_price INTEGER NOT NULL DEFAULT 0 CHECK (reference_price >= 0);
-- migrate:split
ALTER TABLE investment_corrections
  ADD COLUMN notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 500);
-- migrate:split
CREATE INDEX IF NOT EXISTS idx_investment_corrections_type_date
  ON investment_corrections(portfolio_id, correction_type, correction_date, created_at);
-- migrate:split
UPDATE system_config SET value='16',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
