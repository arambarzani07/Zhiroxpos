BEGIN;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS customers_market_version_idx ON customers(market_id, version);
COMMIT;
