import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type pg from 'pg';
import { createDb, type AppDatabase } from '../db/client.js';
import { createPool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { migrationsDir } from '../paths.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { users } from '../db/schema.js';
import type { Access, CredentialAccess, UserAccess } from './access.js';
import * as projects from './projects.js';
import * as agents from './agents.js';
import * as runs from './runs.js';
import * as steps from './next-steps.js';
import * as notes from './private-notes.js';
import * as audits from './audit-events.js';
import * as credentials from './credentials.js';
import * as keys from './idempotency-keys.js';

const a: UserAccess = { kind: 'user', userId: 'user-a' };
const b: UserAccess = { kind: 'user', userId: 'user-b' };
let scratch: ScratchDatabase; let pool: pg.Pool; let db: AppDatabase;
let x: projects.Project; let y: projects.Project; let bProject: projects.Project;
let agent: agents.Agent; let run: runs.Run; let step: steps.NextStep; let credential: credentials.CredentialSummary;
let token: CredentialAccess;

async function snapshot() {
  const result = await pool.query<{ snapshot: unknown }>(`SELECT jsonb_object_agg(name, data) AS snapshot FROM (
    SELECT c.table_name AS name, (xpath('/row/data/text()', query_to_xml(format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), ''[]''::jsonb) AS data FROM %I t', c.table_name), false, true, '')))[1]::text AS data
    FROM information_schema.tables c WHERE c.table_schema='public' AND c.table_type='BASE TABLE'
  ) s`);
  return result.rows[0]!.snapshot;
}
async function denied(operation: () => Promise<unknown>) {
  const before = await snapshot();
  await expect(operation()).rejects.toMatchObject({ code: expect.stringMatching(/^(not_found|forbidden)$/) });
  expect(await snapshot()).toEqual(before);
}
function runInput(agentId = agent.id): runs.RunInput { return { agentId, title: 'Daily bot', workloadType: 'automation' }; }

describe('access-controlled repositories on real Postgres', () => {
  beforeAll(async () => {
    scratch = await createScratchDatabase(); pool = createPool(scratch.connectionString); db = createDb(pool);
    await runMigrations(pool, migrationsDir);
    await db.insert(users).values([{ id: a.userId, email: 'A@example.com' }, { id: b.userId, email: 'b@example.com' }]);
    x = await projects.createProject(db, a, { name: 'X', type: 'automation' });
    y = await projects.createProject(db, a, { name: 'Y', type: 'coding' });
    bProject = await projects.createProject(db, b, { name: 'B', type: 'automation' });
    agent = await agents.createAgent(db, a, x.id, { name: 'weather', title: 'Weather bot', workloadType: 'automation' });
    run = await runs.createRun(db, a, x.id, runInput());
    credential = await credentials.createCredential(db, a, { label: 'X only', tokenHash: 'hash-a', displaySuffix: 'a123', projectIds: [x.id] });
    token = { kind: 'credential', userId: a.userId, credentialId: credential.id, projectIds: [x.id] };
    step = await steps.createNextStep(db, token, x.id, { instruction: 'Review forecast', position: 0, sourceRunId: run.id });
    await steps.setWaitingNote(db, token, x.id, 0, { text: 'Waiting for forecast', sourceRunId: run.id });
    await notes.setPrivateNote(db, a, x.id, 0, 'OWNER SECRET');
    await audits.appendAuditEvent(db, a, x.id, { action: 'seed', target: run.id });
    await keys.withIdempotency(db, a, 'seed', 'body-a', async () => ({ projectId: x.id }));
  });
  afterAll(async () => { await pool?.end(); await scratch?.drop(); });

  it('isolates project lists by owner (mutation-test target)', async () => {
    expect((await projects.listProjects(db, b)).items.map((p) => p.id)).toEqual([bProject.id]);
    expect((await projects.listProjects(db, token)).items.map((p) => p.id)).toEqual([x.id]);
  });
  it('rejects every cross-user project, agent, run, step, note and audit operation without changing any table', async () => {
    const cases: Array<() => Promise<unknown>> = [
      () => projects.getProject(db, b, x.id), () => projects.updateProject(db, b, x.id, 1, { name: 'stolen' }),
      () => agents.listAgents(db, b, x.id), () => agents.getAgent(db, b, x.id, agent.id),
      () => agents.createAgent(db, b, x.id, { name: 'intruder', title: 'Intruder', workloadType: 'automation' }),
      () => runs.listRuns(db, b, x.id), () => runs.getRun(db, b, x.id, run.id), () => runs.createRun(db, b, x.id, runInput()),
      () => runs.updateRun(db, b, x.id, run.id, 1, { message: 'stolen' }, { prReferences: [{ number: 1, title: 'PR', url: 'https://example.com', repositoryName: 'r' }], tools: [{ name: 'shell', source: 'shell', callCount: 1, coverage: 'self_reported' }] }),
      () => steps.listNextSteps(db, b, x.id), () => steps.setStepCompletion(db, b, x.id, step.id, 1, true),
      () => notes.getPrivateNote(db, b, x.id), () => notes.setPrivateNote(db, b, x.id, 1, 'stolen'),
      () => audits.listAuditEvents(db, b, x.id), () => audits.appendAuditEvent(db, b, x.id, { action: 'stolen', target: run.id }),
      () => credentials.getCredential(db, b, credential.id), () => credentials.updateCredential(db, b, credential.id, 1, { revoke: true }),
      () => credentials.touchCredential(db, b, credential.id, 1),
      () => credentials.createCredential(db, b, { label: 'stolen', tokenHash: 'hash-b-stolen', displaySuffix: 'b', projectIds: [x.id] }),
    ];
    for (const operation of cases) await denied(operation);
    expect(await credentials.findCredentialByHash(db, b, 'hash-a')).toBeNull();
    expect(await credentials.listCredentials(db, b)).toEqual([]);
    expect(await keys.getIdempotencyKey(db, b, 'seed')).toBeNull();
    expect(await keys.withIdempotency(db, b, 'seed', 'body-b', async () => 'own-response')).toEqual({ status: 'stored', response: 'own-response' });
    expect((await keys.getIdempotencyKey(db, a, 'seed'))?.response).toEqual({ projectId: x.id });
  });
  it('rejects foreign aggregate IDs even when the supplied project is owned', async () => {
    await denied(() => agents.getAgent(db, b, bProject.id, agent.id));
    await denied(() => runs.getRun(db, b, bProject.id, run.id));
    await denied(() => runs.createRun(db, b, bProject.id, runInput()));
    await denied(() => runs.updateRun(db, b, bProject.id, run.id, 1, {}));
    await denied(() => steps.setStepCompletion(db, b, bProject.id, step.id, 1, true));
  });
  it('intersects token project IDs with stored grants, ownership and credential identity on every operation', async () => {
    const forged = { ...token, projectIds: [x.id, y.id, bProject.id] };
    expect((await projects.listProjects(db, forged)).items.map((p) => p.id)).toEqual([x.id]);
    for (const access of [token, forged]) {
      await denied(() => projects.getProject(db, access, y.id));
      await denied(() => agents.listAgents(db, access, y.id));
      await denied(() => runs.listRuns(db, access, y.id));
      await denied(() => runs.createRun(db, access, y.id, runInput()));
      await denied(() => runs.updateRun(db, access, y.id, run.id, 1, {}));
      await denied(() => steps.listNextSteps(db, access, y.id));
      await denied(() => steps.createNextStep(db, access, y.id, { instruction: 'bad', position: 0, sourceRunId: run.id }));
      await denied(() => steps.updateNextStep(db, access, y.id, step.id, run.id, 1, { instruction: 'bad' }));
      await denied(() => steps.setWaitingNote(db, access, y.id, 0, { text: 'bad', sourceRunId: run.id }));
      await denied(() => audits.listAuditEvents(db, access, y.id));
      await denied(() => audits.appendAuditEvent(db, access, y.id, { action: 'bad', target: run.id }));
    }
    await denied(() => projects.getProject(db, { ...token, userId: b.userId }, x.id));
    await denied(() => projects.getProject(db, { ...token, credentialId: 'missing' }, x.id));
  });
  it('enforces private notes at compile time and runtime and omits them from agent aggregates', async () => {
    async function forbiddenTypes() {
      // @ts-expect-error MCP credentials must never authorize private-note reads.
      await notes.getPrivateNote(db, token, x.id);
      // @ts-expect-error MCP credentials must never authorize private-note writes.
      await notes.setPrivateNote(db, token, x.id, 1, 'bad');
    }
    void forbiddenTypes;
    await denied(() => notes.getPrivateNote(db, token as unknown as UserAccess, x.id));
    await denied(() => notes.setPrivateNote(db, token as unknown as UserAccess, x.id, 1, 'bad'));
    const visible = [await projects.getProject(db, token, x.id), await projects.listProjects(db, token), await runs.getRun(db, token, x.id, run.id), await steps.listNextSteps(db, token, x.id), await audits.listAuditEvents(db, token, x.id)];
    expect(JSON.stringify(visible)).not.toContain('OWNER SECRET');
  });
  it('returns current revisions and changes no tables on optimistic conflicts', async () => {
    const before = await snapshot();
    const result = await runs.updateRun(db, a, x.id, run.id, 99, { message: 'bad' });
    expect(result).toEqual({ status: 'conflict', current: run });
    expect((await projects.updateProject(db, a, x.id, 99, {})).status).toBe('conflict');
    expect((await notes.setPrivateNote(db, a, x.id, 99, 'bad')).status).toBe('conflict');
    expect((await steps.updateNextStep(db, token, x.id, step.id, run.id, 99, {})).status).toBe('conflict');
    expect((await steps.setStepCompletion(db, a, x.id, step.id, 99, true)).status).toBe('conflict');
    expect((await steps.setWaitingNote(db, token, x.id, 99, { text: 'bad', sourceRunId: run.id })).status).toBe('conflict');
    expect((await credentials.updateCredential(db, a, credential.id, 99, { revoke: true })).status).toBe('conflict');
    expect((await credentials.touchCredential(db, token, credential.id, 99)).status).toBe('conflict');
    expect(await snapshot()).toEqual(before);
  });
  it('preserves user completion and source ownership during agent instruction updates', async () => {
    const complete = await steps.setStepCompletion(db, a, x.id, step.id, 1, true);
    expect(complete.status).toBe('saved');
    const updated = await steps.updateNextStep(db, token, x.id, step.id, run.id, 2, { instruction: 'Updated instruction' });
    expect(updated.status).toBe('saved');
    if (updated.status === 'saved') expect(updated.value).toMatchObject({ done: true, revision: 3, completionChangedBy: a.userId });
    await denied(() => steps.updateNextStep(db, token, x.id, step.id, 'other-run', 3, { instruction: 'hijack' }));
  });
  it('distinguishes absent tool telemetry from a reported zero row and preserves PR primary uniqueness', async () => {
    expect((await runs.getRun(db, token, x.id, run.id)).tools).toBeNull();
    const result = await runs.updateRun(db, token, x.id, run.id, 1, { message: 'Reported' }, {
      tools: [{ name: 'shell', source: 'shell', callCount: 0, coverage: 'self_reported' }],
      prReferences: [1, 2].map((number) => ({ number, title: `PR ${number}`, url: `https://example.com/${number}`, repositoryName: 'r', primary: true })),
    });
    expect(result.status).toBe('saved');
    const detail = await runs.getRun(db, a, x.id, run.id);
    expect(detail.revision).toBe(2); expect(detail.tools).toHaveLength(1); expect(detail.tools![0]!.callCount).toBe(0);
    expect(detail.prReferences.filter((ref) => ref.primary)).toHaveLength(1);
    expect(detail.events.map((e) => e.kind)).toEqual(['check_in', 'status']);
    expect(detail.events[1]).toMatchObject({ actorCredentialId: token.credentialId, actorUserId: null });
  });
  it('serializes competing revisions so exactly one write succeeds', async () => {
    const results = await Promise.all([runs.updateRun(db, a, x.id, run.id, 2, { message: 'one' }), runs.updateRun(db, token, x.id, run.id, 2, { message: 'two' })]);
    expect(results.map((r) => r.status).sort()).toEqual(['conflict', 'saved']);
    expect((await runs.getRun(db, a, x.id, run.id)).revision).toBe(3);
  });
  it('makes request IDs atomic, actor-scoped, replayable and body-sensitive', async () => {
    let calls = 0;
    const operation = async () => { calls++; return { ok: true }; };
    const results = await Promise.all([keys.withIdempotency(db, token, 'request-1', 'hash-1', operation), keys.withIdempotency(db, token, 'request-1', 'hash-1', operation)]);
    expect(calls).toBe(1); expect(results.map((r) => r.status).sort()).toEqual(['replayed', 'stored']);
    expect(await keys.withIdempotency(db, token, 'request-1', 'different', operation)).toEqual({ status: 'idempotency_mismatch' });
    expect(calls).toBe(1); expect(await keys.getIdempotencyKey(db, a, 'request-1')).toBeNull();
    const before = await snapshot();
    await expect(keys.withIdempotency(db, token, 'rollback', 'hash', async (tx) => {
      await runs.updateRun(tx, token, x.id, run.id, 3, { message: 'rolled back' }); throw new Error('abort');
    })).rejects.toThrow('abort');
    expect(await snapshot()).toEqual(before);
  });
  it('limits last-use success/conflict summaries to the credential caller scope', async () => {
    const issued = await credentials.createCredential(db, a, { label: 'Narrow view', tokenHash: 'narrow-summary-hash', displaySuffix: 'view', projectIds: [x.id, y.id] });
    const access: CredentialAccess = { ...token, credentialId: issued.id, projectIds: [x.id] };
    const result = await credentials.touchCredential(db, access, issued.id, 1);
    expect(result.status).toBe('saved');
    if (result.status === 'saved') expect(result.value.projectIds).toEqual([x.id]);
    const conflict = await credentials.touchCredential(db, access, issued.id, 1);
    expect(conflict.status).toBe('conflict');
    if (conflict.status === 'conflict') expect(conflict.current.projectIds).toEqual([x.id]);
    expect((await credentials.getCredential(db, a, issued.id)).projectIds.sort()).toEqual([x.id, y.id].sort());
  });
  it('refuses cached responses when stored grants or caller scope have narrowed', async () => {
    const issued = await credentials.createCredential(db, a, { label: 'X and Y', tokenHash: 'scope-cache-hash', displaySuffix: 'cache', projectIds: [x.id, y.id] });
    const access: CredentialAccess = { ...token, credentialId: issued.id, projectIds: [x.id, y.id] };
    await keys.withIdempotency(db, access, 'read-y', 'hash-y', (tx) => projects.getProject(tx, access, y.id));
    const narrowed = { ...access, projectIds: [x.id] };
    await denied(() => keys.getIdempotencyKey(db, narrowed, 'read-y'));
    await denied(() => keys.withIdempotency(db, narrowed, 'read-y', 'hash-y', async () => 'must not execute'));
    await credentials.updateCredential(db, a, issued.id, 1, { projectIds: [x.id] });
    await denied(() => keys.getIdempotencyKey(db, access, 'read-y'));
    await denied(() => keys.withIdempotency(db, access, 'read-y', 'hash-y', async () => 'must not execute'));
    expect(await keys.withIdempotency(db, access, 'fresh-x', 'hash-x', async () => 'safe')).toEqual({ status: 'stored', response: 'safe' });
  });
  it('keeps execution and review status separate and refuses to reopen ended runs', async () => {
    const result = await runs.updateRun(db, token, x.id, run.id, 3, { executionState: 'finished', workStatus: 'waiting_for_review', completionSummary: 'Done' });
    expect(result.status).toBe('saved');
    const ended = await runs.getRun(db, a, x.id, run.id);
    expect(ended.finishedAt).toBeInstanceOf(Date);
    const later = await runs.updateRun(db, a, x.id, run.id, 4, { workStatus: 'completed' });
    if (later.status === 'saved') expect(later.value.finishedAt).toEqual(ended.finishedAt);
    await expect(runs.updateRun(db, token, x.id, run.id, 5, { executionState: 'running' })).rejects.toMatchObject({ code: 'validation_error' });
    await expect(runs.updateRun(db, token, x.id, run.id, 5, {}, { event: { kind: 'heartbeat' } })).rejects.toMatchObject({ code: 'validation_error' });
  });
  it('returns active-first project pages without repeats and validates pagination', async () => {
    await runs.createRun(db, token, x.id, runInput());
    const page = await projects.listProjects(db, a, { limit: '1' });
    expect(page.items[0]!.id).toBe(x.id); expect(page.nextCursor).toBeTypeOf('string');
    const second = await projects.listProjects(db, a, { limit: '1', cursor: page.nextCursor });
    expect(second.items[0]!.id).toBe(y.id); expect(second.nextCursor).toBeNull();
    await expect(projects.listProjects(db, a, { cursor: 'broken' })).rejects.toThrow('cursor is invalid');
    await expect(projects.listProjects(db, a, { limit: '0' })).rejects.toThrow('positive integer');
  });
  it('matches active-first activity semantics and paginates long-name ties at database precision', async () => {
    const user: UserAccess = { kind: 'user', userId: 'sort-owner' };
    await db.insert(users).values({ id: user.userId, email: 'sort@example.com' });
    const older = await projects.createProject(db, user, { name: 'A'.repeat(800), type: 'automation' });
    const newer = await projects.createProject(db, user, { name: 'zeta', type: 'automation' });
    await db.execute(sql`UPDATE projects SET updated_at='2025-01-01T00:00:00.123456Z' WHERE owner_id=${user.userId}`);
    const first = await projects.listProjects(db, user, { limit: '1' });
    expect(first.items[0]!.id).toBe(older.id); expect(first.nextCursor!.length).toBeLessThan(512);
    const second = await projects.listProjects(db, user, { cursor: first.nextCursor, limit: '1' });
    expect(second.items[0]!.id).toBe(newer.id); expect(second.nextCursor).toBeNull();
    const staleAgent = await agents.createAgent(db, user, older.id, { name: 'stale', title: 'Stale', workloadType: 'automation' });
    const stale = await runs.createRun(db, user, older.id, runInput(staleAgent.id));
    await db.execute(sql`UPDATE runs SET last_contact_at=now()-interval '1 hour', updated_at=now()-interval '1 hour' WHERE id=${stale.id}`);
    await db.execute(sql`UPDATE projects SET updated_at=now() WHERE id=${older.id}`);
    await db.execute(sql`UPDATE projects SET updated_at=now()-interval '30 minutes' WHERE id=${newer.id}`);
    expect((await projects.listProjects(db, user)).items.map((p) => p.id)).toEqual([newer.id, older.id]);
    const liveAgent = await agents.createAgent(db, user, older.id, { name: 'live', title: 'Live', workloadType: 'automation' });
    await runs.createRun(db, user, older.id, runInput(liveAgent.id));
    expect((await projects.listProjects(db, user)).items[0]!.id).toBe(older.id);
  });
  it('rejects stale stored grants, foreign accounts and privilege/identity fields hidden in input', async () => {
    const limited = await credentials.createCredential(db, a, { label: 'Temporary', tokenHash: 'temporary-hash', displaySuffix: 'temp', projectIds: [x.id] });
    const access: CredentialAccess = { ...token, credentialId: limited.id };
    expect((await projects.getProject(db, access, x.id)).id).toBe(x.id);
    await credentials.updateCredential(db, a, limited.id, 1, { projectIds: [] });
    await denied(() => projects.getProject(db, access, x.id));
    expect((await projects.listProjects(db, access)).items).toEqual([]);
    const ownB = await credentials.createCredential(db, b, { label: 'B', tokenHash: 'b-hash', displaySuffix: 'b123', projectIds: [bProject.id] });
    const attacker: CredentialAccess = { kind: 'credential', userId: b.userId, credentialId: ownB.id, projectIds: [x.id, bProject.id] };
    await denied(() => steps.createNextStep(db, attacker, x.id, { instruction: 'bad', position: 0, sourceRunId: run.id }));
    await denied(() => steps.updateNextStep(db, attacker, x.id, step.id, run.id, 3, { instruction: 'bad' }));
    await denied(() => steps.setWaitingNote(db, attacker, x.id, 1, { text: 'bad', sourceRunId: run.id }));
    await denied(() => steps.createNextStep(db, attacker, bProject.id, { instruction: 'bad', position: 0, sourceRunId: run.id }));
    await denied(() => steps.setWaitingNote(db, attacker, bProject.id, 0, { text: 'bad', sourceRunId: run.id }));
    const bAgent = await agents.createAgent(db, b, bProject.id, { name: 'b-agent', title: 'B', workloadType: 'automation' });
    await denied(() => runs.createRun(db, attacker, bProject.id, { ...runInput(bAgent.id), parentRunId: run.id }));
    const unsafe = { name: 'Safe edit', ownerId: b.userId, revision: 900, id: 'replace', createdAt: new Date(0) };
    const result = await projects.updateProject(db, a, y.id, y.revision, unsafe);
    if (result.status === 'saved') {
      expect(result.value.ownerId).toBe(a.userId); expect(result.value.id).toBe(y.id);
      expect(result.value.revision).toBe(2); expect(result.value.createdAt).toEqual(y.createdAt);
    } else throw new Error('expected saved');
    await denied(() => projects.createProject(db, token as unknown as UserAccess, { name: 'bad', type: 'automation' }));
    await denied(() => projects.updateProject(db, token as unknown as UserAccess, x.id, 1, {}));
    await denied(() => credentials.listCredentials(db, token as unknown as UserAccess));
    await denied(() => credentials.getCredential(db, token as unknown as UserAccess, credential.id));
    await denied(() => credentials.findCredentialByHash(db, token as unknown as UserAccess, 'hash-a'));
    await denied(() => credentials.createCredential(db, token as unknown as UserAccess, { label: 'bad', tokenHash: 'new', displaySuffix: 'bad', projectIds: [x.id] }));
    await denied(() => credentials.updateCredential(db, token as unknown as UserAccess, credential.id, 1, { revoke: true }));
    await denied(() => steps.setStepCompletion(db, token as unknown as UserAccess, x.id, step.id, 3, false));
  });
  it('records completion and manual close audits atomically, with account audits unavailable to MCP', async () => {
    expect((await audits.listAuditEvents(db, a, x.id)).some((row) => row.action === 'next_step_completed')).toBe(true);
    const fresh = await runs.createRun(db, a, x.id, runInput());
    const closed = await runs.updateRun(db, a, x.id, fresh.id, 1, { executionState: 'cancelled', workStatus: 'cancelled' }, { event: { kind: 'manual_close' } });
    expect(closed.status).toBe('saved');
    expect((await audits.listAuditEvents(db, a, x.id)).some((row) => row.action === 'manual_close' && row.target === fresh.id)).toBe(true);
    const stillRunning = await runs.createRun(db, a, x.id, runInput());
    await denied(() => runs.updateRun(db, token, x.id, stillRunning.id, 1, { executionState: 'failed' }, { event: { kind: 'manual_close' } }));
    await audits.appendAuditEvent(db, a, null, { action: 'credential_issued', target: credential.id });
    expect(await audits.listAuditEvents(db, b, null)).toEqual([]);
    await denied(() => audits.listAuditEvents(db, token, null));
    await denied(() => audits.appendAuditEvent(db, token, null, { action: 'bad', target: credential.id }));
  });
  it('rejects revoked credentials on every MCP-capable operation, including replay and metadata touch', async () => {
    await credentials.updateCredential(db, a, credential.id, 1, { revoke: true });
    const calls: Array<() => Promise<unknown>> = [
      () => projects.listProjects(db, token), () => projects.getProject(db, token, x.id),
      () => agents.listAgents(db, token, x.id), () => agents.getAgent(db, token, x.id, agent.id),
      () => agents.createAgent(db, token, x.id, { name: 'bad', title: 'Bad', workloadType: 'automation' }),
      () => runs.listRuns(db, token, x.id), () => runs.getRun(db, token, x.id, run.id), () => runs.createRun(db, token, x.id, runInput()),
      () => runs.updateRun(db, token, x.id, run.id, 5, {}),
      () => steps.listNextSteps(db, token, x.id), () => steps.createNextStep(db, token, x.id, { instruction: 'bad', position: 0, sourceRunId: run.id }),
      () => steps.updateNextStep(db, token, x.id, step.id, run.id, 3, {}), () => steps.setWaitingNote(db, token, x.id, 1, { text: 'bad', sourceRunId: run.id }),
      () => audits.listAuditEvents(db, token, x.id), () => audits.appendAuditEvent(db, token, x.id, { action: 'bad', target: run.id }),
      () => keys.getIdempotencyKey(db, token, 'request-1'), () => keys.withIdempotency(db, token, 'request-1', 'hash-1', async () => 'bad'),
      () => credentials.touchCredential(db, token, credential.id, 2),
    ];
    for (const call of calls) await denied(call);
    expect(await credentials.findCredentialByHash(db, a, 'hash-a')).toBeNull();
  });
  it('enforces cross-project references and state/history constraints in raw SQL', async () => {
    const ay = await agents.createAgent(db, a, y.id, { name: 'other', title: 'Other', workloadType: 'automation' });
    const ry = await runs.createRun(db, a, y.id, runInput(ay.id));
    const bad = [
      sql`INSERT INTO runs(project_id,agent_id,title,workload_type) VALUES(${x.id},${ay.id},'bad','automation')`,
      sql`INSERT INTO runs(project_id,agent_id,parent_run_id,title,workload_type) VALUES(${x.id},${agent.id},${ry.id},'bad','automation')`,
      sql`INSERT INTO next_steps(project_id,position,instruction,source_run_id) VALUES(${x.id},0,'bad',${ry.id})`,
      sql`INSERT INTO waiting_notes(project_id,text,source_run_id) VALUES(${y.id},'bad',${run.id})`,
      sql`INSERT INTO mcp_credential_projects(credential_id,project_id,user_id) VALUES(${credential.id},${bProject.id},${a.userId})`,
    ];
    for (const query of bad) await expect(db.execute(query)).rejects.toMatchObject({ cause: { code: '23503' } });
    for (const [state, finish] of [['running', new Date()], ['finished', null], ['failed', null], ['cancelled', null]] as const) {
      await expect(db.execute(sql`INSERT INTO runs(project_id,agent_id,title,workload_type,execution_state,finished_at) VALUES(${x.id},${agent.id},'bad','automation',${state},${finish?.toISOString() ?? null})`)).rejects.toMatchObject({ cause: { code: '23514' } });
    }
    await expect(db.execute(sql`UPDATE runs SET agent_id=${ay.id} WHERE id=${run.id}`)).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(db.execute(sql`DELETE FROM run_events WHERE run_id=${run.id}`)).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(db.execute(sql`UPDATE audit_events SET action='rewrite' WHERE project_id=${x.id}`)).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(db.execute(sql`DELETE FROM projects WHERE id=${x.id}`)).rejects.toMatchObject({ cause: { code: '23001' } });
    await expect(db.insert(users).values({ email: 'a@EXAMPLE.COM' })).rejects.toMatchObject({ cause: { code: '23505' } });
  });
});
// Keep the union in the compile-time contract, alongside the narrower note signatures.
const acceptsBoth: Access[] = [a, b]; void acceptsBoth;
