BEGIN;
CREATE TABLE IF NOT EXISTS backup_runs (
  id text PRIMARY KEY,
  business_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('running','success','failed')),
  file_name text,
  bytes bigint,
  table_counts jsonb,
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS backup_runs_date_idx ON backup_runs(business_date,started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS backup_runs_success_date_uidx ON backup_runs(business_date) WHERE status='success';
COMMIT;
