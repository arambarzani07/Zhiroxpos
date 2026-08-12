BEGIN;

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_en text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, name)
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id text REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcodes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'دانە';
ALTER TABLE products ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'IQD' CHECK (currency IN ('IQD','USD'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_trackable boolean NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by text REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by text REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_market_id_idx ON products(market_id, id);
CREATE INDEX IF NOT EXISTS customers_market_id_idx ON customers(market_id, id);

COMMIT;
