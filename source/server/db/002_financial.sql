BEGIN;

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  name text NOT NULL,
  cost_price_iqd bigint NOT NULL CHECK (cost_price_iqd >= 0),
  sale_price_iqd bigint NOT NULL CHECK (sale_price_iqd >= 0),
  stock_quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_limit numeric(18,3) NOT NULL DEFAULT 0 CHECK (low_stock_limit >= 0),
  version bigint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, barcode)
);
CREATE INDEX IF NOT EXISTS products_market_branch_idx ON products(market_id, branch_id, status);

CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  debt_limit_iqd bigint,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, code)
);

CREATE TABLE IF NOT EXISTS customer_balances (
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  balance_iqd bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id, customer_id)
);

CREATE TABLE IF NOT EXISTS sales (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  receipt_number text NOT NULL,
  cashier_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  customer_id text REFERENCES customers(id) ON DELETE RESTRICT,
  client_operation_id text NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('cash','card','bank','debt','mixed')),
  subtotal_iqd bigint NOT NULL CHECK (subtotal_iqd >= 0),
  discount_iqd bigint NOT NULL DEFAULT 0 CHECK (discount_iqd >= 0),
  total_iqd bigint NOT NULL CHECK (total_iqd >= 0),
  paid_iqd bigint NOT NULL CHECK (paid_iqd >= 0),
  debt_iqd bigint NOT NULL CHECK (debt_iqd >= 0),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','cancelled','returned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, receipt_number),
  UNIQUE (market_id, client_operation_id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id text PRIMARY KEY,
  sale_id text NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  barcode text NOT NULL,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  unit_price_iqd bigint NOT NULL CHECK (unit_price_iqd >= 0),
  unit_cost_iqd bigint NOT NULL CHECK (unit_cost_iqd >= 0),
  line_total_iqd bigint NOT NULL CHECK (line_total_iqd >= 0)
);
CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items(sale_id);

CREATE TABLE IF NOT EXISTS payments (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  sale_id text NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  customer_id text REFERENCES customers(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('cash','card','bank')),
  amount_iqd bigint NOT NULL CHECK (amount_iqd > 0),
  received_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('sale','return','purchase','adjustment','loss')),
  quantity_delta numeric(18,3) NOT NULL,
  stock_before numeric(18,3) NOT NULL,
  stock_after numeric(18,3) NOT NULL CHECK (stock_after >= 0),
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements(market_id, product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS journal_batches (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  description text NOT NULL,
  posted_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  posted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, reference_type, reference_id)
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id text PRIMARY KEY,
  batch_id text NOT NULL REFERENCES journal_batches(id) ON DELETE RESTRICT,
  account_code text NOT NULL,
  debit_iqd bigint NOT NULL DEFAULT 0 CHECK (debit_iqd >= 0),
  credit_iqd bigint NOT NULL DEFAULT 0 CHECK (credit_iqd >= 0),
  CHECK ((debit_iqd = 0) <> (credit_iqd = 0))
);
CREATE INDEX IF NOT EXISTS journal_lines_batch_idx ON journal_lines(batch_id);

COMMIT;
