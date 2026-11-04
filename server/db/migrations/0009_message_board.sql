CREATE TABLE board_entries (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 project_id text NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK (kind IN ('note','decision','question','hazard','handoff','state')),
 key text CHECK (key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
 title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
 body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 10000),
 task_ref text CHECK (char_length(task_ref) <= 200),
 addressed_to text CHECK (char_length(addressed_to) <= 200),
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
 resolution text CHECK (char_length(resolution) <= 2000),
 resolved_at timestamptz,
 resolved_by_run_id text,
 resolved_by_user_id text REFERENCES users(id) ON DELETE RESTRICT,
 source_run_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 FOREIGN KEY (source_run_id, project_id) REFERENCES runs(id, project_id) ON DELETE RESTRICT,
 FOREIGN KEY (resolved_by_run_id, project_id) REFERENCES runs(id, project_id) ON DELETE RESTRICT,
 CONSTRAINT board_entries_state_key CHECK ((kind = 'state') = (key IS NOT NULL)),
 CONSTRAINT board_entries_resolution CHECK (
  (status = 'open' AND resolved_at IS NULL AND resolved_by_run_id IS NULL AND resolved_by_user_id IS NULL AND resolution IS NULL)
  OR (status = 'resolved' AND resolved_at IS NOT NULL AND ((resolved_by_run_id IS NOT NULL)::int + (resolved_by_user_id IS NOT NULL)::int) = 1)
 )
);
CREATE UNIQUE INDEX board_entries_project_key ON board_entries(project_id, key) WHERE key IS NOT NULL;
CREATE INDEX board_entries_listing ON board_entries(project_id, status, updated_at DESC, id);
