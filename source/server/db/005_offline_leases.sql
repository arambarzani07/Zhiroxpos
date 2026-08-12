BEGIN;

CREATE TABLE IF NOT EXISTS devices (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  label text NOT NULL,
  registered_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS devices_market_branch_idx ON devices(market_id,branch_id,status);

CREATE TABLE IF NOT EXISTS offline_leases (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS offline_leases_branch_idx ON offline_leases(market_id,branch_id,expires_at DESC);

CREATE TABLE IF NOT EXISTS receipt_blocks (
  id text PRIMARY KEY,
  market_id text NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  branch_id text NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  lease_id text NOT NULL REFERENCES offline_leases(id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  receipt_prefix text NOT NULL,
  start_sequence bigint NOT NULL CHECK (start_sequence > 0),
  end_sequence bigint NOT NULL CHECK (end_sequence >= start_sequence),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id,branch_id,business_date,start_sequence,end_sequence)
);
CREATE INDEX IF NOT EXISTS receipt_blocks_lease_idx ON receipt_blocks(lease_id,business_date);

COMMIT;
