ALTER TABLE next_steps
  ADD COLUMN completed_by_run_id text,
  ADD COLUMN completion_note text,
  ADD CONSTRAINT next_steps_completed_by_run_fk
    FOREIGN KEY (completed_by_run_id, project_id) REFERENCES runs (id, project_id) ON DELETE RESTRICT,
  ADD CONSTRAINT next_steps_completed_by_run_requires_done
    CHECK (completed_by_run_id IS NULL OR done),
  ADD CONSTRAINT next_steps_completion_note_pair
    CHECK ((completion_note IS NULL) = (completed_by_run_id IS NULL));
