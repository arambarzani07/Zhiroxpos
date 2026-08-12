BEGIN;

CREATE TABLE IF NOT EXISTS suppliers (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  phone text,
  address text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  version bigint NOT NULL DEFAULT 1,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,code)
);

CREATE TABLE IF NOT EXISTS supplier_balances (
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  balance_iqd bigint NOT NULL DEFAULT 0 CHECK (balance_iqd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (market_id,supplier_id)
);

CREATE TABLE IF NOT EXISTS purchases (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  supplier_id text REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_number text NOT NULL,
  client_operation_id text NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('cash','card','bank','credit','mixed')),
  subtotal_iqd bigint NOT NULL CHECK (subtotal_iqd >= 0),
  discount_iqd bigint NOT NULL DEFAULT 0 CHECK (discount_iqd >= 0),
  total_iqd bigint NOT NULL CHECK (total_iqd >= 0),
  paid_iqd bigint NOT NULL CHECK (paid_iqd >= 0),
  debt_iqd bigint NOT NULL CHECK (debt_iqd >= 0),
  debt_remaining_iqd bigint NOT NULL CHECK (debt_remaining_iqd >= 0),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','returned','cancelled')),
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,purchase_number),
  UNIQUE (market_id,client_operation_id)
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id text PRIMARY KEY,
  purchase_id text NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  barcode text NOT NULL,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  unit_cost_iqd bigint NOT NULL CHECK (unit_cost_iqd >= 0),
  line_total_iqd bigint NOT NULL CHECK (line_total_iqd >= 0)
);
CREATE INDEX IF NOT EXISTS purchase_items_purchase_idx ON purchase_items(purchase_id);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  payment_number text NOT NULL,
  amount_iqd bigint NOT NULL CHECK (amount_iqd > 0),
  method text NOT NULL CHECK (method IN ('cash','card','bank')),
  paid_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,payment_number)
);
CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
  payment_id text NOT NULL REFERENCES supplier_payments(id) ON DELETE RESTRICT,
  purchase_id text NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  amount_iqd bigint NOT NULL CHECK (amount_iqd > 0),
  PRIMARY KEY (payment_id,purchase_id)
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  purchase_id text NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  return_number text NOT NULL,
  total_iqd bigint NOT NULL CHECK (total_iqd > 0),
  payable_reversal_iqd bigint NOT NULL DEFAULT 0 CHECK (payable_reversal_iqd >= 0),
  refund_iqd bigint NOT NULL DEFAULT 0 CHECK (refund_iqd >= 0),
  refund_method text CHECK (refund_method IN ('cash','card','bank')),
  returned_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,return_number)
);
CREATE TABLE IF NOT EXISTS purchase_return_items (
  id text PRIMARY KEY,
  return_id text NOT NULL REFERENCES purchase_returns(id) ON DELETE RESTRICT,
  purchase_item_id text NOT NULL REFERENCES purchase_items(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  amount_iqd bigint NOT NULL CHECK (amount_iqd >= 0)
);
CREATE INDEX IF NOT EXISTS purchase_return_items_purchase_item_idx ON purchase_return_items(purchase_item_id);

COMMIT;
