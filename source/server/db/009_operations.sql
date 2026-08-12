BEGIN;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS debt_remaining_iqd bigint NOT NULL DEFAULT 0 CHECK (debt_remaining_iqd >= 0);
UPDATE sales SET debt_remaining_iqd=debt_iqd WHERE debt_iqd>0 AND debt_remaining_iqd=0;

CREATE TABLE IF NOT EXISTS customer_receipts (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  receipt_number text NOT NULL,
  amount_iqd bigint NOT NULL CHECK (amount_iqd > 0),
  method text NOT NULL CHECK (method IN ('cash','card','bank')),
  received_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,receipt_number)
);
CREATE TABLE IF NOT EXISTS customer_receipt_allocations (
  receipt_id text NOT NULL REFERENCES customer_receipts(id) ON DELETE RESTRICT,
  sale_id text NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  amount_iqd bigint NOT NULL CHECK (amount_iqd > 0),
  PRIMARY KEY (receipt_id,sale_id)
);

CREATE TABLE IF NOT EXISTS sale_returns (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  sale_id text NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  return_number text NOT NULL,
  total_iqd bigint NOT NULL CHECK (total_iqd > 0),
  debt_reversal_iqd bigint NOT NULL DEFAULT 0 CHECK (debt_reversal_iqd >= 0),
  refund_iqd bigint NOT NULL DEFAULT 0 CHECK (refund_iqd >= 0),
  refund_method text CHECK (refund_method IN ('cash','card','bank')),
  returned_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,return_number)
);
CREATE TABLE IF NOT EXISTS sale_return_items (
  id text PRIMARY KEY,
  return_id text NOT NULL REFERENCES sale_returns(id) ON DELETE RESTRICT,
  sale_item_id text NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  refund_iqd bigint NOT NULL CHECK (refund_iqd >= 0),
  cost_iqd bigint NOT NULL CHECK (cost_iqd >= 0)
);
CREATE INDEX IF NOT EXISTS sale_return_items_sale_item_idx ON sale_return_items(sale_item_id);

CREATE TABLE IF NOT EXISTS expenses (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  expense_number text NOT NULL,
  category text NOT NULL,
  description text,
  amount_iqd bigint NOT NULL CHECK (amount_iqd > 0),
  method text NOT NULL CHECK (method IN ('cash','card','bank')),
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,expense_number)
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  cashier_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  opening_amount_iqd bigint NOT NULL CHECK (opening_amount_iqd >= 0),
  expected_amount_iqd bigint,
  counted_amount_iqd bigint,
  difference_iqd bigint,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  version bigint NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_device_open_uidx ON cash_sessions(market_id,branch_id,device_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS cash_sessions_branch_opened_idx ON cash_sessions(market_id,branch_id,opened_at DESC);

COMMIT;
