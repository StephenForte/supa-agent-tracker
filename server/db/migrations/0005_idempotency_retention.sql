-- P1-H: record which mutation stored the key, then let the web process prune it.
-- Existing rows stay NULL. NULL is not a heartbeat: it uses the 30-day class.
ALTER TABLE idempotency_keys ADD COLUMN operation text;

-- Two partial indexes, one per retention predicate.
-- Heartbeats are most of the writes and expire after 24 hours; every other
-- operation, including NULL, expires after 30 days. A single created_at index
-- would make the daily heartbeat delete walk the long-lived rows too.
-- IS DISTINCT FROM matches NULL, so legacy rows sit in the 30-day index only.
CREATE INDEX idempotency_keys_heartbeat_created_at
  ON idempotency_keys (created_at)
  WHERE operation = 'heartbeat';

CREATE INDEX idempotency_keys_other_created_at
  ON idempotency_keys (created_at)
  WHERE operation IS DISTINCT FROM 'heartbeat';
