BEGIN;
CREATE INDEX IF NOT EXISTS products_barcodes_gin_idx ON products USING gin (barcodes);
CREATE INDEX IF NOT EXISTS products_market_status_id_idx ON products(market_id,status,id);
COMMIT;
