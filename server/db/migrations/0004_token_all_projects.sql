-- P1-J: an all-projects token authorizes every project its owner owns now or later.
-- Existing rows stay false and keep their mcp_credential_projects grants.
-- Application code deletes those grants when all_projects is true so the modes cannot disagree.
ALTER TABLE mcp_credentials
  ADD COLUMN all_projects boolean NOT NULL DEFAULT false;
