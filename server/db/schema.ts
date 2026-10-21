import { sql } from 'drizzle-orm';
import { pgTable, text, integer, boolean, timestamp, jsonb, check, unique, uniqueIndex, index, primaryKey, foreignKey, customType } from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const users = pgTable('users', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  displayName: text('display_name').notNull().default(''),
  timezone: text('timezone').notNull().default('UTC'),
  image: text('image'),
  publicHandle: text('public_handle'),
  publicName: text('public_name'),
  publicBio: text('public_bio'),
  publicGithub: text('public_github'),
  publicX: text('public_x'),
  publicLinkedin: text('public_linkedin'),
  profileTimezone: text('profile_timezone').notNull().default('UTC'),
  alertBlocked: boolean('alert_blocked').notNull().default(false),
  alertStale: boolean('alert_stale').notNull().default(false),
  alertReview: boolean('alert_review').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_email_ci').on(sql`lower(${t.email})`),
  uniqueIndex('users_public_handle_ci').on(sql`lower(${t.publicHandle})`),
  check('users_public_handle_format', sql`${t.publicHandle} IS NULL OR ${t.publicHandle} ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'`),
  check('users_public_name_format', sql`${t.publicName} IS NULL OR (char_length(${t.publicName}) BETWEEN 1 AND 60 AND ${t.publicName} !~ '^[[:space:]]' AND ${t.publicName} !~ '[[:space:]]$')`),
  check('users_public_bio_format', sql`${t.publicBio} IS NULL OR (char_length(${t.publicBio}) BETWEEN 1 AND 160 AND ${t.publicBio} !~ '^[[:space:]]' AND ${t.publicBio} !~ '[[:space:]]$')`),
  check('users_public_github_format', sql`${t.publicGithub} IS NULL OR ${t.publicGithub} ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'`),
  check('users_public_x_format', sql`${t.publicX} IS NULL OR ${t.publicX} ~ '^[A-Za-z0-9_]{1,15}$'`),
  check('users_public_linkedin_format', sql`${t.publicLinkedin} IS NULL OR ${t.publicLinkedin} ~ '^[A-Za-z0-9-]{3,100}$'`),
  check('users_profile_timezone_format', sql`${t.profileTimezone} ~ '^[A-Za-z0-9_+/-]{1,100}$'`),
]);

/** Avatar bytes live off the users row so account reads never load them. */
export const userAvatars = pgTable('user_avatars', {
  userId: text('user_id').primaryKey(),
  contentType: text('content_type').notNull(),
  bytes: bytea('bytes').notNull(),
  byteSize: integer('byte_size').notNull(),
  sha256: text('sha256').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ name: 'user_avatars_user_fk', columns: [t.userId], foreignColumns: [users.id] }).onDelete('cascade'),
  check('user_avatars_content_type', sql`${t.contentType} IN ('image/png', 'image/jpeg', 'image/webp')`),
  check('user_avatars_byte_size', sql`${t.byteSize} BETWEEN 1 AND 262144 AND ${t.byteSize} = octet_length(${t.bytes})`),
  check('user_avatars_sha256', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
]);

export const projects = pgTable('projects', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  type: text('type', { enum: ['coding', 'automation'] }).notNull(),
  lifecycle: text('lifecycle', { enum: ['active', 'paused', 'completed', 'archived'] }).notNull().default('active'),
  repositoryName: text('repository_name'),
  repositoryUrl: text('repository_url'),
  prdUrl: text('prd_url'),
  tags: text('tags').array().notNull().default(sql`'{}'`),
  isPublic: boolean('is_public').notNull().default(false),
  staleThresholdMinutes: integer('stale_threshold_minutes').notNull().default(15),
  heartbeatExpected: boolean('heartbeat_expected').notNull().default(false),
  reportingInstructions: text('reporting_instructions').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  revision: integer('revision').notNull().default(1),
}, (t) => [
  check('projects_revision_positive', sql`revision > 0`),
  foreignKey({ columns: [t.ownerId], foreignColumns: [users.id] }).onDelete('restrict'),
  unique().on(t.id, t.ownerId),
  check('projects_type_valid', sql`type IN ('coding', 'automation')`),
  check('projects_lifecycle_valid', sql`lifecycle IN ('active', 'paused', 'completed', 'archived')`),
  check('projects_stale_positive', sql`stale_threshold_minutes > 0`),
  index('projects_owner').on(t.ownerId),
]);

export const agents = pgTable('agents', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  title: text('title').notNull(),
  workloadType: text('workload_type', { enum: ['coding', 'automation'] }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.id, t.projectId),
  unique().on(t.projectId, t.name),
  foreignKey({ columns: [t.projectId], foreignColumns: [projects.id] }).onDelete('restrict'),
  check('agents_workload_type_valid', sql`workload_type IN ('coding', 'automation')`),
]);

export const mcpCredentials = pgTable('mcp_credentials', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  userId: text('user_id').notNull(),
  label: text('label').notNull(),
  tokenHash: text('token_hash').notNull(),
  displaySuffix: text('display_suffix').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  allProjects: boolean('all_projects').notNull().default(false),
  revision: integer('revision').notNull().default(1),
}, (t) => [
  check('mcp_credentials_revision_positive', sql`revision > 0`),
  foreignKey({ columns: [t.userId], foreignColumns: [users.id] }).onDelete('restrict'),
  unique().on(t.id, t.userId),
  unique().on(t.tokenHash),
]);

export const mcpCredentialProjects = pgTable('mcp_credential_projects', {
  credentialId: text('credential_id').notNull(),
  projectId: text('project_id').notNull(),
  userId: text('user_id').notNull(),
}, (t) => [
  primaryKey({ columns: [t.credentialId, t.projectId] }),
  foreignKey({ columns: [t.credentialId, t.userId], foreignColumns: [mcpCredentials.id, mcpCredentials.userId] }).onDelete('restrict'),
  foreignKey({ columns: [t.projectId, t.userId], foreignColumns: [projects.id, projects.ownerId] }).onDelete('restrict'),
  index('mcp_credential_projects_project').on(t.projectId),
]);

export const runs = pgTable('runs', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  projectId: text('project_id').notNull(),
  agentId: text('agent_id').notNull(),
  taskId: text('task_id'),
  title: text('title').notNull(),
  workloadType: text('workload_type', { enum: ['coding', 'automation'] }).notNull(),
  executionState: text('execution_state', { enum: ['running', 'finished', 'failed', 'cancelled'] }).notNull().default('running'),
  workStatus: text('work_status', { enum: ['in_progress', 'blocked', 'waiting_for_review', 'completed', 'failed', 'cancelled'] }).notNull().default('in_progress'),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
  lastContactAt: timestamp('last_contact_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  harness: text('harness'),
  model: text('model'),
  observedClientInfo: jsonb('observed_client_info'),
  observedUserAgent: text('observed_user_agent'),
  message: text('message').notNull().default(''),
  completionSummary: text('completion_summary'),
  blocker: text('blocker'),
  noPrReason: text('no_pr_reason'),
  parentRunId: text('parent_run_id'),
  externalExecutionId: text('external_execution_id'),
  revision: integer('revision').notNull().default(1),
}, (t) => [
  check('runs_revision_positive', sql`revision > 0`),
  unique().on(t.id, t.projectId),
  foreignKey({ columns: [t.projectId], foreignColumns: [projects.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.agentId, t.projectId], foreignColumns: [agents.id, agents.projectId] }).onDelete('restrict'),
  foreignKey({ columns: [t.parentRunId, t.projectId], foreignColumns: [t.id, t.projectId] }).onDelete('restrict'),
  check('runs_not_own_parent', sql`parent_run_id IS NULL OR parent_run_id <> id`),
  check('runs_finish_matches_state', sql`(finished_at IS NULL) = (execution_state = 'running')`),
  check('runs_finish_after_start', sql`finished_at IS NULL OR finished_at >= started_at`),
  check('runs_workload_type_valid', sql`workload_type IN ('coding', 'automation')`),
  check('runs_execution_state_valid', sql`execution_state IN ('running', 'finished', 'failed', 'cancelled')`),
  check('runs_work_status_valid', sql`work_status IN ('in_progress', 'blocked', 'waiting_for_review', 'completed', 'failed', 'cancelled')`),
  index('runs_project_activity').on(t.projectId, t.lastContactAt.desc()),
  index('runs_project_status').on(t.projectId, t.executionState, t.workStatus),
  index('runs_agent_started').on(t.agentId, t.startedAt.desc()),
]);

/** Dedup for opt-in digests. A baseline row and a sent row are the same primary key; source tells them apart. */
export const alertDeliveries = pgTable('alert_deliveries', {
  userId: text('user_id').notNull(),
  runId: text('run_id').notNull(),
  kind: text('kind', { enum: ['blocked', 'stale', 'review'] }).notNull(),
  source: text('source', { enum: ['baseline', 'sent'] }).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.runId, t.kind] }),
  foreignKey({ columns: [t.userId], foreignColumns: [users.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.runId], foreignColumns: [runs.id] }).onDelete('restrict'),
  check('alert_deliveries_kind', sql`kind IN ('blocked', 'stale', 'review')`),
  check('alert_deliveries_source', sql`source IN ('baseline', 'sent')`),
]);

export const runEvents = pgTable('run_events', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  runId: text('run_id').notNull(),
  kind: text('kind', { enum: ['check_in', 'status', 'heartbeat', 'check_out', 'manual_close'] }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }),
  actorUserId: text('actor_user_id'),
  actorCredentialId: text('actor_credential_id'),
  message: text('message').notNull().default(''),
  executionState: text('execution_state', { enum: ['running', 'finished', 'failed', 'cancelled'] }).notNull(),
  workStatus: text('work_status', { enum: ['in_progress', 'blocked', 'waiting_for_review', 'completed', 'failed', 'cancelled'] }).notNull(),
}, (t) => [
  foreignKey({ columns: [t.runId], foreignColumns: [runs.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.actorUserId], foreignColumns: [users.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.actorCredentialId], foreignColumns: [mcpCredentials.id] }).onDelete('restrict'),
  check('run_events_one_actor', sql`(actor_user_id IS NULL) <> (actor_credential_id IS NULL)`),
  check('run_events_execution_state_valid', sql`execution_state IN ('running', 'finished', 'failed', 'cancelled')`),
  check('run_events_work_status_valid', sql`work_status IN ('in_progress', 'blocked', 'waiting_for_review', 'completed', 'failed', 'cancelled')`),
  check('run_events_kind_valid', sql`kind IN ('check_in', 'status', 'heartbeat', 'check_out', 'manual_close')`),
  index('run_events_run_time').on(t.runId, t.receivedAt, t.id),
]);

export const pullRequestRefs = pgTable('pull_request_refs', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  runId: text('run_id').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  repositoryName: text('repository_name').notNull(),
  primary: boolean('primary').notNull().default(false),
}, (t) => [
  foreignKey({ columns: [t.runId], foreignColumns: [runs.id] }).onDelete('restrict'),
  unique().on(t.runId, t.repositoryName, t.number),
  check('pull_request_refs_positive_number', sql`number > 0`),
  uniqueIndex('pull_request_refs_one_primary').on(t.runId).where(sql`${t.primary}`),
]);

export const toolUsageAggregates = pgTable('tool_usage_aggregates', {
  runId: text('run_id').notNull(),
  name: text('name').notNull(),
  source: text('source', { enum: ['mcp', 'native', 'shell', 'other'] }).notNull(),
  callCount: integer('call_count').notNull(),
  successCount: integer('success_count'),
  failureCount: integer('failure_count'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
  coverage: text('coverage', { enum: ['self_reported', 'adapter_captured'] }).notNull(),
}, (t) => [
  foreignKey({ columns: [t.runId], foreignColumns: [runs.id] }).onDelete('restrict'),
  primaryKey({ columns: [t.runId, t.name, t.source] }),
  check('tool_counts_valid', sql`call_count >= 0 AND (success_count IS NULL OR success_count >= 0) AND (failure_count IS NULL OR failure_count >= 0) AND coalesce(success_count, 0) + coalesce(failure_count, 0) <= call_count`),
  check('tool_usage_aggregates_source_valid', sql`source IN ('mcp', 'native', 'shell', 'other')`),
  check('tool_usage_aggregates_coverage_valid', sql`coverage IN ('self_reported', 'adapter_captured')`),
]);

export const nextSteps = pgTable('next_steps', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  projectId: text('project_id').notNull(),
  position: integer('position').notNull(),
  instruction: text('instruction').notNull(),
  done: boolean('done').notNull().default(false),
  sourceRunId: text('source_run_id').notNull(),
  completionChangedBy: text('completion_changed_by'),
  completionChangedAt: timestamp('completion_changed_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  revision: integer('revision').notNull().default(1),
}, (t) => [
  check('next_steps_revision_positive', sql`revision > 0`),
  foreignKey({ columns: [t.projectId], foreignColumns: [projects.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.sourceRunId, t.projectId], foreignColumns: [runs.id, runs.projectId] }).onDelete('restrict'),
  foreignKey({ columns: [t.completionChangedBy], foreignColumns: [users.id] }).onDelete('restrict'),
  check('next_steps_position_valid', sql`position >= 0`),
  check('next_steps_completion_actor', sql`(completion_changed_by IS NULL) = (completion_changed_at IS NULL)`),
  index('next_steps_completion').on(t.projectId, t.done, t.position, t.id),
]);

export const waitingNotes = pgTable('waiting_notes', {
  projectId: text('project_id').primaryKey(),
  text: text('text').notNull(),
  sourceRunId: text('source_run_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  revision: integer('revision').notNull().default(1),
}, (t) => [
  check('waiting_notes_revision_positive', sql`revision > 0`),
  foreignKey({ columns: [t.projectId], foreignColumns: [projects.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.sourceRunId, t.projectId], foreignColumns: [runs.id, runs.projectId] }).onDelete('restrict'),
]);

export const privateNotes = pgTable('private_notes', {
  projectId: text('project_id').primaryKey(),
  text: text('text').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  revision: integer('revision').notNull().default(1),
}, (t) => [
  check('private_notes_revision_positive', sql`revision > 0`),
  foreignKey({ columns: [t.projectId], foreignColumns: [projects.id] }).onDelete('restrict'),
]);

export const auditEvents = pgTable('audit_events', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  userId: text('user_id').notNull(),
  projectId: text('project_id'),
  actorUserId: text('actor_user_id'),
  actorCredentialId: text('actor_credential_id'),
  action: text('action').notNull(),
  target: text('target').notNull(),
  details: jsonb('details').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.actorUserId], foreignColumns: [users.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.actorCredentialId], foreignColumns: [mcpCredentials.id] }).onDelete('restrict'),
  check('audit_events_one_actor', sql`(actor_user_id IS NULL) <> (actor_credential_id IS NULL)`),
  foreignKey({ columns: [t.userId], foreignColumns: [users.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.projectId, t.userId], foreignColumns: [projects.id, projects.ownerId] }).onDelete('restrict'),
  index('audit_events_owner_time').on(t.userId, t.createdAt, t.id),
]);

export const idempotencyKeys = pgTable('idempotency_keys', {
  scope: text('scope').notNull(),
  requestId: text('request_id').notNull(),
  userId: text('user_id').notNull(),
  credentialId: text('credential_id'),
  credentialProjectIds: text('credential_project_ids').array(),
  requestHash: text('request_hash').notNull(),
  response: jsonb('response').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  /** MCP tool name or REST action. NULL is the legacy 30-day class, never a heartbeat. */
  operation: text('operation'),
}, (t) => [
  primaryKey({ columns: [t.scope, t.requestId] }),
  foreignKey({ columns: [t.userId], foreignColumns: [users.id] }).onDelete('restrict'),
  foreignKey({ columns: [t.credentialId, t.userId], foreignColumns: [mcpCredentials.id, mcpCredentials.userId] }).onDelete('restrict'),
  check('idempotency_scope_snapshot', sql`(credential_id IS NULL) = (credential_project_ids IS NULL)`),
  check('idempotency_scope_matches_actor', sql`(credential_id IS NULL AND scope = 'user:' || user_id) OR (credential_id IS NOT NULL AND scope = 'credential:' || credential_id)`),
  index('idempotency_keys_heartbeat_created_at').on(t.createdAt).where(sql`${t.operation} = 'heartbeat'`),
  index('idempotency_keys_other_created_at').on(t.createdAt).where(sql`${t.operation} is distinct from 'heartbeat'`),
]);


// P1-B2: Better Auth models. FKs intentionally RESTRICT domain identity deletion.
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
}, (t) => [index('sessions_user').on(t.userId)]);

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  passwordHash: text('password_hash'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true, mode: 'date' }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true, mode: 'date' }),
  scope: text('scope'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => [unique().on(t.providerId, t.accountId), index('accounts_user').on(t.userId), check('accounts_credential_only', sql`provider_id = 'credential'`)]);

export const authVerifications = pgTable('auth_verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (t) => [index('auth_verifications_identifier').on(t.identifier)]);

// P1-I: invite secrets are stored only as SHA-256 hashes.
export const invites = pgTable('invites', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()::text`),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: text('invited_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull().default(sql`now() + interval '7 days'`),
  usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
  usedBy: text('used_by').references(() => users.id, { onDelete: 'restrict' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
}, (t) => [
  index('invites_email').on(t.email),
  check('invites_email_lower', sql`email = lower(email)`),
  check('invites_used_together', sql`(used_at IS NULL) = (used_by IS NULL)`),
  check('invites_used_or_revoked', sql`used_at IS NULL OR revoked_at IS NULL`),
]);
