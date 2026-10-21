-- P2-M: public profile text, timezone, and avatar bytes. Existing users stay null and UTC.
-- GitHub's check is the POSIX form of ^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$ from D-040.
-- Avatar bytes are a separate table so account reads do not load them.

ALTER TABLE users ADD COLUMN public_name text;
ALTER TABLE users ADD COLUMN public_bio text;
ALTER TABLE users ADD COLUMN public_github text;
ALTER TABLE users ADD COLUMN public_x text;
ALTER TABLE users ADD COLUMN public_linkedin text;
ALTER TABLE users ADD COLUMN profile_timezone text NOT NULL DEFAULT 'UTC';

ALTER TABLE users ADD CONSTRAINT users_public_name_format
  CHECK (
    public_name IS NULL
    OR (
      char_length(public_name) BETWEEN 1 AND 60
      AND public_name !~ '^[[:space:]]'
      AND public_name !~ '[[:space:]]$'
    )
  );

ALTER TABLE users ADD CONSTRAINT users_public_bio_format
  CHECK (
    public_bio IS NULL
    OR (
      char_length(public_bio) BETWEEN 1 AND 160
      AND public_bio !~ '^[[:space:]]'
      AND public_bio !~ '[[:space:]]$'
    )
  );

ALTER TABLE users ADD CONSTRAINT users_public_github_format
  CHECK (public_github IS NULL OR public_github ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$');

ALTER TABLE users ADD CONSTRAINT users_public_x_format
  CHECK (public_x IS NULL OR public_x ~ '^[A-Za-z0-9_]{1,15}$');

ALTER TABLE users ADD CONSTRAINT users_public_linkedin_format
  CHECK (public_linkedin IS NULL OR public_linkedin ~ '^[A-Za-z0-9-]{3,100}$');

ALTER TABLE users ADD CONSTRAINT users_profile_timezone_format
  CHECK (profile_timezone ~ '^[A-Za-z0-9_+/-]{1,100}$');

CREATE TABLE user_avatars (
  user_id text PRIMARY KEY,
  content_type text NOT NULL,
  bytes bytea NOT NULL,
  byte_size integer NOT NULL,
  sha256 text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_avatars_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT user_avatars_content_type CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  CONSTRAINT user_avatars_byte_size CHECK (byte_size BETWEEN 1 AND 262144 AND byte_size = octet_length(bytes)),
  CONSTRAINT user_avatars_sha256 CHECK (sha256 ~ '^[0-9a-f]{64}$')
);
