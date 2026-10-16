CREATE TABLE invites (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email text NOT NULL CHECK (email = lower(email)),
  token_hash text NOT NULL UNIQUE,
  invited_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  used_by text REFERENCES users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  CONSTRAINT invites_used_together CHECK ((used_at IS NULL) = (used_by IS NULL)),
  CONSTRAINT invites_used_or_revoked CHECK (used_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX invites_email ON invites(email);
