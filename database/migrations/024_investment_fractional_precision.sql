-- Additive precision columns: legacy integer columns remain untouched for historical records.
-- Amounts remain whole Rupiah. Price is in cents; quantities are in hundredths of a unit.
ALTER TABLE investment_trades ADD COLUMN unit_quantity_hundredths INTEGER CHECK (unit_quantity_hundredths IS NULL OR unit_quantity_hundredths > 0);
-- migrate:split
ALTER TABLE investment_trades ADD COLUMN price_cents INTEGER CHECK (price_cents IS NULL OR price_cents > 0);
-- migrate:split
ALTER TABLE investment_corrections ADD COLUMN unit_delta_hundredths INTEGER;
-- migrate:split
ALTER TABLE investment_corrections ADD COLUMN reference_price_cents INTEGER CHECK (reference_price_cents IS NULL OR reference_price_cents >= 0);
-- migrate:split
ALTER TABLE investment_corrections ADD COLUMN average_price_cents INTEGER CHECK (average_price_cents IS NULL OR average_price_cents > 0);
-- migrate:split
ALTER TABLE investment_valuations ADD COLUMN price_cents INTEGER CHECK (price_cents IS NULL OR price_cents > 0);
-- migrate:split
ALTER TABLE investment_corrections ADD COLUMN market_value_rupiah INTEGER CHECK (market_value_rupiah IS NULL OR market_value_rupiah >= 0);
-- migrate:split
ALTER TABLE investment_valuations ADD COLUMN market_value_rupiah INTEGER CHECK (market_value_rupiah IS NULL OR market_value_rupiah >= 0);
-- migrate:split
UPDATE system_config SET value='26',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='schema_version';
