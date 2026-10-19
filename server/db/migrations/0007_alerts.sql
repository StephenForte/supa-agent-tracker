-- P2-G: opt-in email alerts. Existing users stay opted out and nothing is delivered.
ALTER TABLE users ADD COLUMN alert_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN alert_stale boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN alert_review boolean NOT NULL DEFAULT false;

-- One row per run per kind. source distinguishes a baseline (no email) from a send.
-- Once a pair exists it is never alerted again, including after the run leaves and re-enters that kind.
CREATE TABLE alert_deliveries (
  user_id text NOT NULL,
  run_id text NOT NULL,
  kind text NOT NULL,
  source text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, kind),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (run_id) REFERENCES runs (id) ON DELETE RESTRICT,
  CONSTRAINT alert_deliveries_kind CHECK (kind IN ('blocked', 'stale', 'review')),
  CONSTRAINT alert_deliveries_source CHECK (source IN ('baseline', 'sent'))
);
