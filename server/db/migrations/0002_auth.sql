-- Better Auth email/password only. Domain users and their existing rows stay intact.
ALTER TABLE users ADD COLUMN image text;
CREATE TABLE sessions (
  id text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  ip_address text,
  user_agent text
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE accounts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  account_id text NOT NULL,
  provider_id text NOT NULL CHECK (provider_id = 'credential'),
  password_hash text,
  access_token text CHECK (access_token IS NULL),
  refresh_token text CHECK (refresh_token IS NULL),
  id_token text CHECK (id_token IS NULL),
  access_token_expires_at timestamptz CHECK (access_token_expires_at IS NULL),
  refresh_token_expires_at timestamptz CHECK (refresh_token_expires_at IS NULL),
  scope text CHECK (scope IS NULL),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(provider_id, account_id)
);
CREATE INDEX accounts_user ON accounts(user_id);
CREATE TABLE auth_verifications (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX auth_verifications_identifier ON auth_verifications(identifier);
