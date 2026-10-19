-- P2-B: public pages are opt-in. Existing rows stay unpublished.
ALTER TABLE users ADD COLUMN public_handle text;

ALTER TABLE users ADD CONSTRAINT users_public_handle_format
  CHECK (
    public_handle IS NULL
    OR public_handle ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'
  );

-- Case-insensitive uniqueness. NULL handles stay allowed (many unpublished accounts).
CREATE UNIQUE INDEX users_public_handle_ci ON users (lower(public_handle));

ALTER TABLE projects ADD COLUMN is_public boolean NOT NULL DEFAULT false;
