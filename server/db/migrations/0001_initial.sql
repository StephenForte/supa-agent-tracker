-- Text IDs accommodate better-auth adapters; defaults are PostgreSQL-generated UUID strings.
-- History uses RESTRICT, never cascading deletes. Auth-library tables belong to 0002.

CREATE TABLE users (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "email" text NOT NULL,
  "email_verified" boolean NOT NULL DEFAULT false,
  "display_name" text NOT NULL DEFAULT '',
  "timezone" text NOT NULL DEFAULT 'UTC',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_ci ON users (lower(email));

CREATE TABLE projects (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "owner_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "type" text NOT NULL,
  "lifecycle" text NOT NULL DEFAULT 'active',
  "repository_name" text,
  "repository_url" text,
  "prd_url" text,
  "tags" text[] NOT NULL DEFAULT '{}',
  "stale_threshold_minutes" integer NOT NULL DEFAULT 15,
  "heartbeat_expected" boolean NOT NULL DEFAULT false,
  "reporting_instructions" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "revision" integer NOT NULL DEFAULT 1,
  CONSTRAINT projects_revision_positive CHECK (revision > 0),
  FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE RESTRICT,
  UNIQUE (id, owner_id),
  CONSTRAINT projects_type_valid CHECK (type IN ('coding', 'automation')),
  CONSTRAINT projects_lifecycle_valid CHECK (lifecycle IN ('active', 'paused', 'completed', 'archived')),
  CONSTRAINT projects_stale_positive CHECK (stale_threshold_minutes > 0)
);

CREATE TABLE agents (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "project_id" text NOT NULL,
  "name" text NOT NULL,
  "title" text NOT NULL,
  "workload_type" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, project_id),
  UNIQUE (project_id, name),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
  CONSTRAINT agents_workload_type_valid CHECK (workload_type IN ('coding', 'automation'))
);

CREATE TABLE mcp_credentials (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "user_id" text NOT NULL,
  "label" text NOT NULL,
  "token_hash" text NOT NULL,
  "display_suffix" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz,
  "revoked_at" timestamptz,
  "revision" integer NOT NULL DEFAULT 1,
  CONSTRAINT mcp_credentials_revision_positive CHECK (revision > 0),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  UNIQUE (id, user_id),
  UNIQUE (token_hash)
);

CREATE TABLE mcp_credential_projects (
  "credential_id" text NOT NULL,
  "project_id" text NOT NULL,
  "user_id" text NOT NULL,
  PRIMARY KEY (credential_id, project_id),
  FOREIGN KEY (credential_id, user_id) REFERENCES mcp_credentials (id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, user_id) REFERENCES projects (id, owner_id) ON DELETE RESTRICT
);

CREATE TABLE runs (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "project_id" text NOT NULL,
  "agent_id" text NOT NULL,
  "task_id" text,
  "title" text NOT NULL,
  "workload_type" text NOT NULL,
  "execution_state" text NOT NULL DEFAULT 'running',
  "work_status" text NOT NULL DEFAULT 'in_progress',
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "last_contact_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "harness" text,
  "model" text,
  "observed_client_info" jsonb,
  "observed_user_agent" text,
  "message" text NOT NULL DEFAULT '',
  "completion_summary" text,
  "blocker" text,
  "no_pr_reason" text,
  "parent_run_id" text,
  "external_execution_id" text,
  "revision" integer NOT NULL DEFAULT 1,
  CONSTRAINT runs_revision_positive CHECK (revision > 0),
  UNIQUE (id, project_id),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
  FOREIGN KEY (agent_id, project_id) REFERENCES agents (id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_run_id, project_id) REFERENCES runs (id, project_id) ON DELETE RESTRICT,
  CONSTRAINT runs_not_own_parent CHECK (parent_run_id IS NULL OR parent_run_id <> id),
  CONSTRAINT runs_finish_matches_state CHECK ((finished_at IS NULL) = (execution_state = 'running')),
  CONSTRAINT runs_finish_after_start CHECK (finished_at IS NULL OR finished_at >= started_at),
  CONSTRAINT runs_workload_type_valid CHECK (workload_type IN ('coding', 'automation')),
  CONSTRAINT runs_execution_state_valid CHECK (execution_state IN ('running', 'finished', 'failed', 'cancelled')),
  CONSTRAINT runs_work_status_valid CHECK (work_status IN ('in_progress', 'blocked', 'waiting_for_review', 'completed', 'failed', 'cancelled'))
);

CREATE TABLE run_events (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "run_id" text NOT NULL,
  "kind" text NOT NULL,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "occurred_at" timestamptz,
  "actor_user_id" text,
  "actor_credential_id" text,
  "message" text NOT NULL DEFAULT '',
  "execution_state" text NOT NULL,
  "work_status" text NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_credential_id) REFERENCES mcp_credentials (id) ON DELETE RESTRICT,
  CONSTRAINT run_events_one_actor CHECK ((actor_user_id IS NULL) <> (actor_credential_id IS NULL)),
  CONSTRAINT run_events_execution_state_valid CHECK (execution_state IN ('running', 'finished', 'failed', 'cancelled')),
  CONSTRAINT run_events_work_status_valid CHECK (work_status IN ('in_progress', 'blocked', 'waiting_for_review', 'completed', 'failed', 'cancelled')),
  CONSTRAINT run_events_kind_valid CHECK (kind IN ('check_in', 'status', 'heartbeat', 'check_out', 'manual_close'))
);

CREATE TABLE pull_request_refs (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "run_id" text NOT NULL,
  "number" integer NOT NULL,
  "title" text NOT NULL,
  "url" text NOT NULL,
  "repository_name" text NOT NULL,
  "primary" boolean NOT NULL DEFAULT false,
  FOREIGN KEY (run_id) REFERENCES runs (id) ON DELETE RESTRICT,
  UNIQUE (run_id, repository_name, number),
  CONSTRAINT pull_request_refs_positive_number CHECK (number > 0)
);

CREATE UNIQUE INDEX pull_request_refs_one_primary ON pull_request_refs (run_id) WHERE "primary";

CREATE TABLE tool_usage_aggregates (
  "run_id" text NOT NULL,
  "name" text NOT NULL,
  "source" text NOT NULL,
  "call_count" integer NOT NULL,
  "success_count" integer,
  "failure_count" integer,
  "last_used_at" timestamptz,
  "coverage" text NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id) ON DELETE RESTRICT,
  PRIMARY KEY (run_id, name, source),
  CONSTRAINT tool_counts_valid CHECK (call_count >= 0 AND (success_count IS NULL OR success_count >= 0) AND (failure_count IS NULL OR failure_count >= 0) AND coalesce(success_count, 0) + coalesce(failure_count, 0) <= call_count),
  CONSTRAINT tool_usage_aggregates_source_valid CHECK (source IN ('mcp', 'native', 'shell', 'other')),
  CONSTRAINT tool_usage_aggregates_coverage_valid CHECK (coverage IN ('self_reported', 'adapter_captured'))
);

CREATE TABLE next_steps (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "project_id" text NOT NULL,
  "position" integer NOT NULL,
  "instruction" text NOT NULL,
  "done" boolean NOT NULL DEFAULT false,
  "source_run_id" text NOT NULL,
  "completion_changed_by" text,
  "completion_changed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "revision" integer NOT NULL DEFAULT 1,
  CONSTRAINT next_steps_revision_positive CHECK (revision > 0),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
  FOREIGN KEY (source_run_id, project_id) REFERENCES runs (id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY (completion_changed_by) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT next_steps_position_valid CHECK (position >= 0),
  CONSTRAINT next_steps_completion_actor CHECK ((completion_changed_by IS NULL) = (completion_changed_at IS NULL))
);

CREATE TABLE waiting_notes (
  "project_id" text PRIMARY KEY,
  "text" text NOT NULL,
  "source_run_id" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "revision" integer NOT NULL DEFAULT 1,
  CONSTRAINT waiting_notes_revision_positive CHECK (revision > 0),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
  FOREIGN KEY (source_run_id, project_id) REFERENCES runs (id, project_id) ON DELETE RESTRICT
);

CREATE TABLE private_notes (
  "project_id" text PRIMARY KEY,
  "text" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "revision" integer NOT NULL DEFAULT 1,
  CONSTRAINT private_notes_revision_positive CHECK (revision > 0),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT
);

CREATE TABLE audit_events (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "user_id" text NOT NULL,
  "project_id" text,
  "actor_user_id" text,
  "actor_credential_id" text,
  "action" text NOT NULL,
  "target" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_credential_id) REFERENCES mcp_credentials (id) ON DELETE RESTRICT,
  CONSTRAINT audit_events_one_actor CHECK ((actor_user_id IS NULL) <> (actor_credential_id IS NULL)),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (project_id, user_id) REFERENCES projects (id, owner_id) ON DELETE RESTRICT
);

CREATE TABLE idempotency_keys (
  "scope" text NOT NULL,
  "request_id" text NOT NULL,
  "user_id" text NOT NULL,
  "credential_id" text,
  "request_hash" text NOT NULL,
  "response" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, request_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (credential_id, user_id) REFERENCES mcp_credentials (id, user_id) ON DELETE RESTRICT,
  CONSTRAINT idempotency_scope_matches_actor CHECK ((credential_id IS NULL AND scope = 'user:' || user_id) OR (credential_id IS NOT NULL AND scope = 'credential:' || credential_id))
);

CREATE INDEX projects_owner ON projects (owner_id);

CREATE INDEX runs_project_activity ON runs (project_id, last_contact_at DESC);

CREATE INDEX runs_project_status ON runs (project_id, execution_state, work_status);

CREATE INDEX runs_agent_started ON runs (agent_id, started_at DESC);

CREATE INDEX run_events_run_time ON run_events (run_id, received_at, id);

CREATE INDEX next_steps_completion ON next_steps (project_id, done, position, id);

CREATE INDEX audit_events_owner_time ON audit_events (user_id, created_at, id);

CREATE INDEX mcp_credential_projects_project ON mcp_credential_projects (project_id);

CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'history is append-only' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER run_events_append_only BEFORE UPDATE OR DELETE ON run_events
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE FUNCTION protect_run_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id, NEW.project_id, NEW.agent_id, NEW.parent_run_id, NEW.external_execution_id, NEW.started_at)
 IS DISTINCT FROM ROW(OLD.id, OLD.project_id, OLD.agent_id, OLD.parent_run_id, OLD.external_execution_id, OLD.started_at)
 THEN RAISE EXCEPTION 'run identity is immutable' USING ERRCODE = '23514'; END IF;
 IF OLD.execution_state <> 'running' AND NEW.execution_state = 'running'
 THEN RAISE EXCEPTION 'ended runs cannot reopen' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER runs_identity BEFORE UPDATE ON runs FOR EACH ROW EXECUTE FUNCTION protect_run_identity();
