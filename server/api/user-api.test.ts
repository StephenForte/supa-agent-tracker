import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { buildApp } from '../app/build-app.js';
import { errorCodes } from '../app/errors.js';
import { createDb, type AppDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { createPool } from '../db/pool.js';
import { users } from '../db/schema.js';
import { migrationsDir } from '../paths.js';
import type { UserAccess } from '../repo/access.js';
import * as agentsRepo from '../repo/agents.js';
import * as audits from '../repo/audit-events.js';
import * as credentials from '../repo/credentials.js';
import * as projectsRepo from '../repo/projects.js';
import * as runsRepo from '../repo/runs.js';
import * as steps from '../repo/next-steps.js';
import { findOwnedRun } from '../repo/views.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { limits } from './schemas.js';
import { selectAttention } from '../alerts/match.js';

const userA = 'user-a';
const userB = 'user-b';
const userC = 'user-c';
const accessA: UserAccess = { kind: 'user', userId: userA };
const accessB: UserAccess = { kind: 'user', userId: userB };

describe('user REST API', () => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  let db: AppDatabase;
  let app: FastifyInstance;
  let spaRoot = '';
  let alphaId = '';
  let betaId = '';
  let richId = '';
  let plainId = '';
  let childId = '';
  let agentAId = '';
  let agentBId = '';
  let requestSeq = 0;

  function nextRequestId(): string {
    requestSeq += 1;
    return `req-${requestSeq}`;
  }

  function projectBody(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Weather',
      description: 'Daily forecast',
      type: 'automation',
      lifecycle: 'active',
      repositoryName: 'weather',
      repositoryUrl: 'https://github.com/example/weather',
      prdUrl: 'https://example.com/prd',
      tags: ['daily'],
      reportingPolicy: { staleThresholdMinutes: 15, heartbeatExpected: true, instructions: 'Report honestly' },
      request_id: nextRequestId(),
      ...overrides,
    };
  }

  function call(method: 'GET' | 'POST' | 'PATCH', url: string, userId: string, body?: unknown) {
    return app.inject({
      method,
      url,
      headers: { 'x-test-user-id': userId, 'content-type': 'application/json' },
      payload: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function snapshot() {
    const result = await pool.query<{ snapshot: unknown }>(`SELECT jsonb_object_agg(name, data) AS snapshot FROM (
      SELECT c.table_name AS name, (xpath('/row/data/text()', query_to_xml(format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), ''[]''::jsonb) AS data FROM %I t', c.table_name), false, true, '')))[1]::text AS data
      FROM information_schema.tables c WHERE c.table_schema='public' AND c.table_type='BASE TABLE'
    ) s`);
    return result.rows[0]!.snapshot;
  }

  async function listAll(url: string, userId: string) {
    const items: Array<Record<string, unknown>> = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      const target = cursor ? `${url}${url.includes('?') ? '&' : '?'}${params}` : url;
      const response = await call('GET', target, userId);
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: Array<Record<string, unknown>>; nextCursor: string | null };
      items.push(...body.items);
      cursor = body.nextCursor;
      if (!cursor) return items;
    }
    throw new Error('pagination did not end');
  }

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') throw new Error('requireUser only accepts x-test-user-id when NODE_ENV=test');
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
    db = createDb(pool);
    await runMigrations(pool, migrationsDir);
    await db.insert(users).values([
      { id: userA, email: 'a@example.com', displayName: 'Ada', emailVerified: true },
      { id: userB, email: 'b@example.com', displayName: 'Bea', emailVerified: false },
      { id: userC, email: 'c@example.com', displayName: 'Cy', emailVerified: false },
    ]);
    const alpha = await projectsRepo.createProject(db, accessA, { name: 'Alpha', description: 'Owned by A', type: 'coding', lifecycle: 'active', tags: ['alpha'], staleThresholdMinutes: 15, heartbeatExpected: true, reportingInstructions: 'Report' });
    const beta = await projectsRepo.createProject(db, accessB, { name: 'Beta', description: 'Owned by B', type: 'automation', lifecycle: 'active', tags: [], staleThresholdMinutes: 15, heartbeatExpected: false, reportingInstructions: '' });
    alphaId = alpha.id;
    betaId = beta.id;
    const agentA = await agentsRepo.createAgent(db, accessA, alpha.id, { name: 'alpha-agent', title: 'Alpha agent', workloadType: 'coding' });
    const agentB = await agentsRepo.createAgent(db, accessB, beta.id, { name: 'beta-agent', title: 'Beta agent', workloadType: 'automation' });
    agentAId = agentA.id;
    agentBId = agentB.id;
    const plain = await runsRepo.createRun(db, accessA, alpha.id, { agentId: agentA.id, title: 'Plain run', workloadType: 'coding' });
    const rich = await runsRepo.createRun(db, accessA, alpha.id, { agentId: agentA.id, title: 'Rich run', workloadType: 'coding' });
    plainId = plain.id;
    richId = rich.id;
    await runsRepo.updateRun(db, accessA, alpha.id, rich.id, 1, { title: 'Rich run' }, {
      prReferences: [{ number: 7, title: 'Add API', url: 'https://github.com/example/pull/7', repositoryName: 'example', primary: true }],
      tools: [{ name: 'shell', source: 'shell', callCount: 2, coverage: 'self_reported' }],
    });
    const child = await runsRepo.createRun(db, accessA, alpha.id, { agentId: agentA.id, title: 'Child run', workloadType: 'coding', parentRunId: rich.id });
    childId = child.id;
    await runsRepo.createRun(db, accessB, beta.id, { agentId: agentB.id, title: 'Beta run', workloadType: 'automation' });
    spaRoot = mkdtempSync(path.join(tmpdir(), 'supa-user-api-'));
    writeFileSync(path.join(spaRoot, 'index.html'), '<!doctype html><title>spa</title>');
    app = await buildApp({
      config: { databaseUrl: scratch.connectionString, port: 0, nodeEnv: 'test', publicUrl: 'http://127.0.0.1:3000', migrateOnBoot: false },
      pool,
      migrationsDir,
      spaRoot,
    });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await scratch?.drop();
    if (spaRoot) rmSync(spaRoot, { recursive: true, force: true });
  });

  it('returns the signed-in account and an empty project list for a user with no projects', async () => {
    const account = await call('GET', '/api/account', userA);
    expect(account.statusCode).toBe(200);
    const emptyProfile = { name: null, bio: null, github: null, x: null, linkedin: null, timezone: 'UTC', avatarUpdatedAt: null };
    expect(account.json()).toEqual({ id: userA, name: 'Ada', email: 'a@example.com', emailVerified: true, isAdmin: false, publicHandle: null, alerts: { blocked: false, stale: false, review: false }, publicProfile: emptyProfile });
    const other = await call('GET', '/api/account', userB);
    expect(other.json()).toEqual({ id: userB, name: 'Bea', email: 'b@example.com', emailVerified: false, isAdmin: false, publicHandle: null, alerts: { blocked: false, stale: false, review: false }, publicProfile: emptyProfile });
    const empty = await call('GET', '/api/projects', userC);
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ items: [], nextCursor: null });
    const unsigned = await app.inject({ method: 'GET', url: '/api/account' });
    expect(unsigned.statusCode).toBe(401);
    expect(unsigned.json()).toEqual({ error: { code: errorCodes.unauthenticated, message: 'Sign in required' } });
  });

  it('returns 404 for another user on every route and leaves every table unchanged', async () => {
    const before = await snapshot();
    const routes = [
      () => call('GET', `/api/projects/${alphaId}`, userB),
      () => call('PATCH', `/api/projects/${alphaId}`, userB, { name: 'Stolen', expected_revision: 1, request_id: 'iso-project' }),
      () => call('GET', `/api/agents?project_id=${alphaId}`, userB),
      () => call('GET', `/api/runs?project_id=${alphaId}`, userB),
      () => call('GET', `/api/runs/${richId}`, userB),
      () => call('PATCH', `/api/runs/${richId}`, userB, { title: 'Stolen', expected_revision: 1, request_id: 'iso-run' }),
      () => call('POST', `/api/runs/${richId}/close`, userB, { outcome: 'failed', reason: 'Stolen', expected_revision: 1, request_id: 'iso-close' }),
      () => call('POST', `/api/runs/${richId}/mark-done`, userB, { expected_revision: 1, request_id: 'iso-mark' }),
    ];
    for (const route of routes) {
      const response = await route();
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: { code: errorCodes.not_found, message: 'Not found' } });
      expect(response.body).not.toContain('Alpha');
      expect(response.body).not.toContain('Rich run');
    }
    await expect(findOwnedRun(db, accessB, richId)).rejects.toMatchObject({ code: 'not_found' });
    const ownProjects = await listAll('/api/projects', userA);
    const ownAgents = await listAll('/api/agents', userA);
    const ownRuns = await listAll('/api/runs', userA);
    expect(ownProjects.map((item) => item.id)).toContain(alphaId);
    expect(ownProjects.map((item) => item.id)).not.toContain(betaId);
    expect(ownAgents.map((item) => item.id)).toContain(agentAId);
    expect(ownAgents.map((item) => item.id)).not.toContain(agentBId);
    expect(ownRuns.filter((item) => item.projectId === alphaId).map((item) => item.id)).toEqual(expect.arrayContaining([richId, plainId, childId]));
    expect(ownRuns.some((item) => item.projectId === betaId)).toBe(false);
    const projects = await listAll('/api/projects?include_archived=true', userB);
    const agents = await listAll('/api/agents', userB);
    const runs = await listAll('/api/runs', userB);
    expect(projects.map((item) => item.id)).toEqual([betaId]);
    expect(agents.map((item) => item.id)).not.toContain(agentAId);
    expect(runs.map((item) => item.id)).not.toContain(richId);
    expect(runs.map((item) => item.id)).not.toContain(plainId);
    expect(runs.map((item) => item.id)).not.toContain(childId);
    expect(await snapshot()).toEqual(before);
  });

  it('hides archived projects unless include_archived=true', async () => {
    const visible = await call('POST', '/api/projects', userA, projectBody({ name: 'Visible' }));
    const hidden = await call('POST', '/api/projects', userA, projectBody({ name: 'Hidden' }));
    expect(visible.statusCode).toBe(201);
    expect(hidden.statusCode).toBe(201);
    const hiddenId = (hidden.json() as { id: string }).id;
    const visibleId = (visible.json() as { id: string }).id;
    const archived = await call('PATCH', `/api/projects/${hiddenId}`, userA, { lifecycle: 'archived', expected_revision: 1, request_id: nextRequestId() });
    expect(archived.statusCode).toBe(200);
    expect((archived.json() as { lifecycle: string }).lifecycle).toBe('archived');
    const byId = await call('GET', `/api/projects/${hiddenId}`, userA);
    expect(byId.statusCode).toBe(200);
    expect((await listAll('/api/projects', userA)).map((item) => item.id)).not.toContain(hiddenId);
    expect((await listAll('/api/projects?include_archived=false', userA)).map((item) => item.id)).not.toContain(hiddenId);
    const withArchived = await listAll('/api/projects?include_archived=true', userA);
    expect(withArchived.map((item) => item.id)).toContain(hiddenId);
    expect(withArchived.map((item) => item.id)).toContain(visibleId);
    expect((await listAll('/api/projects?include_archived=true', userB)).map((item) => item.id)).not.toContain(hiddenId);
    const invalid = await call('GET', '/api/projects?include_archived=yes', userA);
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: errorCodes.validation_error } });
  });

  it('returns the original response for a replayed request_id, rejects a different body, and conflicts without changing the resource', async () => {
    const created = await call('POST', '/api/projects', userA, projectBody({ name: 'Idempotent', request_id: 'create-once' }));
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as { id: string; name: string; revision: number; reportingPolicy: { staleThresholdMinutes: number } };
    const replay = await call('POST', '/api/projects', userA, projectBody({ name: 'Idempotent', request_id: 'create-once' }));
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(createdBody);
    const mismatch = await call('POST', '/api/projects', userA, projectBody({ name: 'Different', request_id: 'create-once' }));
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json()).toEqual({ error: { code: errorCodes.idempotency_mismatch, message: 'request_id was reused with a different body' } });
    const still = await call('GET', `/api/projects/${createdBody.id}`, userA);
    expect(still.json()).toMatchObject({ name: 'Idempotent', revision: 1 });

    const patched = await call('PATCH', `/api/projects/${createdBody.id}`, userA, { name: 'Renamed', expected_revision: 1, request_id: 'patch-once' });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ name: 'Renamed', revision: 2, description: 'Daily forecast' });
    const patchReplay = await call('PATCH', `/api/projects/${createdBody.id}`, userA, { name: 'Renamed', expected_revision: 1, request_id: 'patch-once' });
    expect(patchReplay.statusCode).toBe(200);
    expect(patchReplay.json()).toEqual(patched.json());
    const patchMismatch = await call('PATCH', `/api/projects/${createdBody.id}`, userA, { name: 'Other', expected_revision: 2, request_id: 'patch-once' });
    expect(patchMismatch.statusCode).toBe(409);
    expect(patchMismatch.json()).toMatchObject({ error: { code: errorCodes.idempotency_mismatch } });
    expect((await call('GET', `/api/projects/${createdBody.id}`, userA)).json()).toMatchObject({ name: 'Renamed', revision: 2 });

    const before = await snapshot();
    const conflict = await call('PATCH', `/api/projects/${createdBody.id}`, userA, { name: 'Nope', expected_revision: 99, request_id: 'patch-stale' });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: {
        code: errorCodes.conflict,
        message: 'Revision conflict',
        details: { current: { id: createdBody.id, name: 'Renamed', revision: 2, reportingPolicy: { staleThresholdMinutes: 15, heartbeatExpected: true, instructions: 'Report honestly' } } },
      },
    });
    const conflictReplay = await call('PATCH', `/api/projects/${createdBody.id}`, userA, { name: 'Nope', expected_revision: 99, request_id: 'patch-stale' });
    expect(conflictReplay.statusCode).toBe(409);
    expect(conflictReplay.json()).toEqual(conflict.json());
    expect((await call('GET', `/api/projects/${createdBody.id}`, userA)).json()).toMatchObject({ name: 'Renamed', revision: 2 });
    const after = await snapshot() as Record<string, unknown>;
    const beforeTables = { ...(before as Record<string, unknown>) };
    delete beforeTables.idempotency_keys;
    delete after.idempotency_keys;
    expect(after).toEqual(beforeTables);
  });

  it('closes a running run once and refuses to close an ended run', async () => {
    const agentId = agentAId;
    const running = await runsRepo.createRun(db, accessA, alphaId, { agentId, title: 'Needs close', workloadType: 'coding' });
    const credential = await credentials.createCredential(db, accessA, { label: 'Closer', tokenHash: `hash-${running.id}`, displaySuffix: 'clos', projectIds: [alphaId] });
    const token = { kind: 'credential' as const, userId: userA, credentialId: credential.id, projectIds: [alphaId] };
    await steps.createNextStep(db, token, alphaId, { instruction: 'Leave this open', position: 4, sourceRunId: running.id });
    const stepsBefore = await steps.listNextSteps(db, accessA, alphaId);
    const before = await call('GET', `/api/runs/${running.id}`, userA);
    const beforeBody = before.json() as { lastContactAt: string; revision: number; events: unknown[] };
    const closed = await call('POST', `/api/runs/${running.id}/close`, userA, { outcome: 'cancelled', reason: 'Abandoned', expected_revision: beforeBody.revision, request_id: 'close-running' });
    expect(closed.statusCode).toBe(200);
    const closedBody = closed.json() as { executionState: string; workStatus: string; finishedAt: string | null; message: string; lastContactAt: string; revision: number; events: Array<{ kind: string; message: string; actorId: string; receivedAt: string; id: string }> };
    expect(closedBody.executionState).toBe('cancelled');
    expect(closedBody.workStatus).toBe('cancelled');
    expect(closedBody.finishedAt).not.toBeNull();
    expect(closedBody.message).toBe('Abandoned');
    expect(closedBody.lastContactAt).toBe(beforeBody.lastContactAt);
    const manual = closedBody.events.filter((event) => event.kind === 'manual_close');
    expect(manual).toEqual([expect.objectContaining({ message: 'Abandoned', actorId: userA, executionState: 'cancelled' })]);
    const ordered = [...closedBody.events].sort((left, right) => left.receivedAt.localeCompare(right.receivedAt) || left.id.localeCompare(right.id));
    expect(closedBody.events).toEqual(ordered);
    expect(await steps.listNextSteps(db, accessA, alphaId)).toEqual(stepsBefore);
    const auditRows = await audits.listAuditEvents(db, accessA, alphaId);
    expect(auditRows.filter((row) => row.action === 'manual_close' && row.target === running.id)).toHaveLength(1);

    const tablesBefore = await snapshot();
    const again = await call('POST', `/api/runs/${running.id}/close`, userA, { outcome: 'failed', reason: 'Again', expected_revision: closedBody.revision, request_id: 'close-again' });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({
      error: { code: errorCodes.conflict, message: 'Run has already ended', details: { current: { id: running.id, executionState: 'cancelled', revision: closedBody.revision } } },
    });
    expect((await call('GET', `/api/runs/${running.id}`, userA)).json()).toEqual(closedBody);
    expect(await steps.listNextSteps(db, accessA, alphaId)).toEqual(stepsBefore);
    expect((await audits.listAuditEvents(db, accessA, alphaId)).filter((row) => row.action === 'manual_close' && row.target === running.id)).toHaveLength(1);
    const tablesAfter = { ...(await snapshot() as Record<string, unknown>) };
    const tablesPrior = { ...(tablesBefore as Record<string, unknown>) };
    delete tablesAfter.idempotency_keys;
    delete tablesPrior.idempotency_keys;
    expect(tablesAfter).toEqual(tablesPrior);

    const finished = await runsRepo.createRun(db, accessA, alphaId, { agentId, title: 'Already finished', workloadType: 'coding' });
    const checkedOut = await runsRepo.updateRun(db, token, alphaId, finished.id, 1, { executionState: 'finished', workStatus: 'waiting_for_review' });
    if (checkedOut.status !== 'saved') throw new Error('expected checkout');
    const finishedBefore = await snapshot();
    const refused = await call('POST', `/api/runs/${finished.id}/close`, userA, { outcome: 'failed', reason: 'Too late', expected_revision: checkedOut.value.revision, request_id: 'close-finished' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: { code: errorCodes.conflict, message: 'Run has already ended', details: { current: { executionState: 'finished' } } } });
    const finishedAfter = { ...(await snapshot() as Record<string, unknown>) };
    const finishedPrior = { ...(finishedBefore as Record<string, unknown>) };
    delete finishedAfter.idempotency_keys;
    delete finishedPrior.idempotency_keys;
    expect(finishedAfter).toEqual(finishedPrior);

    const failing = await runsRepo.createRun(db, accessA, alphaId, { agentId, title: 'Fail this', workloadType: 'coding' });
    const failed = await call('POST', `/api/runs/${failing.id}/close`, userA, { outcome: 'failed', reason: 'Broken', expected_revision: 1, request_id: 'close-failed' });
    expect(failed.statusCode).toBe(200);
    expect(failed.json()).toMatchObject({ executionState: 'failed', workStatus: 'failed', message: 'Broken' });
    expect((failed.json() as { events: Array<{ kind: string }> }).events.filter((event) => event.kind === 'manual_close')).toHaveLength(1);
  });

  it('keeps last_contact_at and execution_state when metadata is corrected', async () => {
    const run = await runsRepo.createRun(db, accessA, alphaId, { agentId: agentAId, title: 'Metadata', workloadType: 'coding' });
    await pool.query(`UPDATE runs SET last_contact_at = '2020-01-01T00:00:00.000Z' WHERE id = $1`, [run.id]);
    const before = await call('GET', `/api/runs/${run.id}`, userA);
    const beforeBody = before.json() as { lastContactAt: string; executionState: string; revision: number };
    expect(beforeBody.lastContactAt).toBe('2020-01-01T00:00:00.000Z');
    const patched = await call('PATCH', `/api/runs/${run.id}`, userA, { title: 'Corrected title', expected_revision: beforeBody.revision, request_id: 'meta-1' });
    expect(patched.statusCode).toBe(200);
    const after = patched.json() as { title: string; lastContactAt: string; executionState: string; revision: number };
    expect(after.title).toBe('Corrected title');
    expect(after.lastContactAt).toBe(beforeBody.lastContactAt);
    expect(after.executionState).toBe('running');
    expect(after.revision).toBe(beforeBody.revision + 1);
    const rejected = await call('PATCH', `/api/runs/${run.id}`, userA, { title: 'Nope', executionState: 'cancelled', expected_revision: after.revision, request_id: 'meta-state' });
    expect(rejected.statusCode).toBe(400);
    expect((await call('GET', `/api/runs/${run.id}`, userA)).json()).toMatchObject({ title: 'Corrected title', executionState: 'running', lastContactAt: beforeBody.lastContactAt });
  });

  it('omits events on run lists and returns them oldest-first on detail', async () => {
    const listed = await listAll(`/api/runs?project_id=${alphaId}`, userA);
    const rich = listed.find((item) => item.id === richId);
    const plain = listed.find((item) => item.id === plainId);
    const child = listed.find((item) => item.id === childId);
    expect(rich).toBeTruthy();
    expect(plain).toBeTruthy();
    expect(child).toBeTruthy();
    for (const item of listed) expect(item).not.toHaveProperty('events');
    expect(rich).toMatchObject({
      parentRunId: null,
      childRunIds: [childId],
      prReferences: [{ number: 7, title: 'Add API', url: 'https://github.com/example/pull/7', repositoryName: 'example', primary: true }],
      tools: [{ name: 'shell', source: 'shell', callCount: 2, coverage: 'self_reported' }],
    });
    expect(plain).toMatchObject({ tools: null, prReferences: [], childRunIds: [], parentRunId: null });
    expect(child).toMatchObject({ parentRunId: richId, tools: null });
    const detail = await call('GET', `/api/runs/${richId}`, userA);
    expect(detail.statusCode).toBe(200);
    const events = (detail.json() as { events: Array<{ id: string; receivedAt: string; kind: string; actorId: string }> }).events;
    expect(events.map((event) => event.kind)).toEqual(['check_in', 'status']);
    expect(events[0]?.actorId).toBe(userA);
    const ordered = [...events].sort((left, right) => left.receivedAt.localeCompare(right.receivedAt) || left.id.localeCompare(right.id));
    expect(events).toEqual(ordered);
    expect((detail.json() as { observedClientInfo?: unknown }).observedClientInfo).toBeUndefined();
  });

  it('rejects non-http URLs for repository, PRD and pull request links', async () => {
    const before = await snapshot();
    for (const field of ['repositoryUrl', 'prdUrl'] as const) {
      const response = await call('POST', '/api/projects', userA, projectBody({ [field]: 'javascript:alert(1)', request_id: nextRequestId() }));
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: errorCodes.validation_error, details: { fields: [field] } } });
    }
    const dataUrl = await call('POST', '/api/projects', userA, projectBody({ repositoryUrl: 'data:text/html,hi', request_id: nextRequestId() }));
    expect(dataUrl.statusCode).toBe(400);
    const pr = await call('PATCH', `/api/runs/${plainId}`, userA, {
      prReferences: [{ number: 1, title: 'Bad', url: 'javascript:alert(1)', repositoryName: 'example', primary: true }],
      expected_revision: 1,
      request_id: nextRequestId(),
    });
    expect(pr.statusCode).toBe(400);
    expect(pr.json()).toMatchObject({ error: { code: errorCodes.validation_error, details: { fields: ['prReferences.0.url'] } } });
    expect(await snapshot()).toEqual(before);
    const created = await call('POST', '/api/projects', userA, projectBody({ repositoryUrl: 'http://example.com/repo', prdUrl: 'https://example.com/prd' }));
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ repositoryUrl: 'http://example.com/repo', prdUrl: 'https://example.com/prd' });
  });

  it('returns every run exactly once across three pages', async () => {
    const project = await projectsRepo.createProject(db, accessA, { name: 'Pages', type: 'automation' });
    const agent = await agentsRepo.createAgent(db, accessA, project.id, { name: 'pager', title: 'Pager', workloadType: 'automation' });
    const created = new Set<string>();
    for (let index = 0; index < 5; index += 1) {
      const run = await runsRepo.createRun(db, accessA, project.id, { agentId: agent.id, title: `Page ${index}`, workloadType: 'automation' });
      created.add(run.id);
    }
    const seen = new Set<string>();
    const pages: unknown[][] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 3; page += 1) {
      const url = `/api/runs?project_id=${project.id}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const response = await call('GET', url, userA);
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: Array<{ id: string }>; nextCursor: string | null };
      pages.push(body.items);
      for (const item of body.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
        expect(item).not.toHaveProperty('events');
      }
      cursor = body.nextCursor;
    }
    expect(pages.map((items) => items.length)).toEqual([2, 2, 1]);
    expect(cursor).toBeNull();
    expect(seen).toEqual(created);

    const extraAgents = [];
    for (const name of ['able', 'baker', 'charlie']) {
      extraAgents.push(await agentsRepo.createAgent(db, accessA, project.id, { name, title: name, workloadType: 'automation' }));
    }
    const agentIds = new Set<string>();
    let agentCursor: string | null = null;
    const agentPages: number[] = [];
    for (let page = 0; page < 3; page += 1) {
      const url = `/api/agents?project_id=${project.id}&limit=2${agentCursor ? `&cursor=${encodeURIComponent(agentCursor)}` : ''}`;
      const response = await call('GET', url, userA);
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: Array<{ id: string }>; nextCursor: string | null };
      agentPages.push(body.items.length);
      for (const item of body.items) agentIds.add(item.id);
      agentCursor = body.nextCursor;
      if (!agentCursor) break;
    }
    expect(agentIds).toEqual(new Set([agent.id, ...extraAgents.map((item) => item.id)]));
    expect(agentPages).toEqual([2, 2]);
    expect(agentCursor).toBeNull();
  });

  it('rejects unbounded and non-integer inputs', async () => {
    const tooLong = await call('POST', '/api/projects', userA, projectBody({ name: 'n'.repeat(limits.shortText + 1) }));
    expect(tooLong.statusCode).toBe(400);
    const fraction = await call('POST', '/api/projects', userA, projectBody({ reportingPolicy: { staleThresholdMinutes: 1.5, heartbeatExpected: true, instructions: '' } }));
    expect(fraction.statusCode).toBe(400);
    const zero = await call('POST', '/api/projects', userA, projectBody({ reportingPolicy: { staleThresholdMinutes: 0, heartbeatExpected: true, instructions: '' } }));
    expect(zero.statusCode).toBe(400);
    const limit = await call('GET', '/api/runs?limit=0', userA);
    expect(limit.statusCode).toBe(400);
    const cursor = await call('GET', '/api/projects?cursor=broken', userA);
    expect(cursor.statusCode).toBe(400);
    const emptyPage = await call('GET', '/api/projects?cursor=&limit=', userA);
    expect(emptyPage.statusCode).toBe(200);
    expect(emptyPage.json()).toMatchObject({ nextCursor: null });
    const emptyRuns = await call('GET', `/api/runs?project_id=${alphaId}&cursor=&limit=`, userA);
    expect(emptyRuns.statusCode).toBe(200);
    const emptyPatch = await call('PATCH', `/api/projects/${alphaId}`, userA, { expected_revision: 1, request_id: nextRequestId() });
    expect(emptyPatch.statusCode).toBe(400);
  });

  it('marks a finished run done once and refuses every other execution', async () => {
    const credential = await credentials.createCredential(db, accessA, { label: 'Marker', tokenHash: 'hash-mark-done', displaySuffix: 'mark', projectIds: [alphaId] });
    const token = { kind: 'credential' as const, userId: userA, credentialId: credential.id, projectIds: [alphaId] };
    async function endRun(title: string, executionState: 'finished' | 'failed' | 'cancelled', workStatus: 'waiting_for_review' | 'completed' | 'failed' | 'cancelled') {
      const run = await runsRepo.createRun(db, accessA, alphaId, { agentId: agentAId, title, workloadType: 'coding' });
      const ended = await runsRepo.updateRun(db, token, alphaId, run.id, 1, { executionState, workStatus }, { event: { kind: 'check_out' } });
      if (ended.status !== 'saved') throw new Error(`expected ${title} to end`);
      return ended.value;
    }
    async function tablesExceptIdempotency() {
      const snapshotBody = { ...(await snapshot() as Record<string, unknown>) };
      delete snapshotBody.idempotency_keys;
      return snapshotBody;
    }

    const review = await endRun('Needs done', 'finished', 'waiting_for_review');
    const before = await call('GET', `/api/runs/${review.id}`, userA);
    const beforeBody = before.json() as { revision: number; events: Array<{ id: string }>; lastContactAt: string; finishedAt: string | null; message: string; executionState: string };
    const marked = await call('POST', `/api/runs/${review.id}/mark-done`, userA, { expected_revision: beforeBody.revision, request_id: 'mark-once' });
    expect(marked.statusCode).toBe(200);
    const markedBody = marked.json() as { workStatus: string; executionState: string; revision: number; message: string; lastContactAt: string; finishedAt: string | null; events: Array<{ id: string; kind: string; message: string }> };
    expect(markedBody.workStatus).toBe('completed');
    expect(markedBody.executionState).toBe('finished');
    expect(markedBody.revision).toBe(beforeBody.revision + 1);
    expect(markedBody.events).toEqual(beforeBody.events);
    expect(markedBody.message).toBe(beforeBody.message);
    expect(markedBody.lastContactAt).toBe(beforeBody.lastContactAt);
    expect(markedBody.finishedAt).toBe(beforeBody.finishedAt);
    const auditsForRun = async () => (await audits.listAuditEvents(db, accessA, alphaId)).filter((row) => row.action === 'run_marked_done' && row.target === review.id);
    expect(await auditsForRun()).toEqual([expect.objectContaining({ details: { previousWorkStatus: 'waiting_for_review' } })]);

    const replay = await call('POST', `/api/runs/${review.id}/mark-done`, userA, { expected_revision: beforeBody.revision, request_id: 'mark-once' });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(markedBody);
    expect(await auditsForRun()).toHaveLength(1);

    const staleBefore = await tablesExceptIdempotency();
    const stale = await call('POST', `/api/runs/${review.id}/mark-done`, userA, { expected_revision: beforeBody.revision, request_id: 'mark-stale' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: { code: errorCodes.conflict, message: 'Revision conflict', details: { current: { id: review.id, revision: markedBody.revision, workStatus: 'completed' } } } });
    expect(await tablesExceptIdempotency()).toEqual(staleBefore);
    expect(await auditsForRun()).toHaveLength(1);

    const again = await call('POST', `/api/runs/${review.id}/mark-done`, userA, { expected_revision: markedBody.revision, request_id: 'mark-again' });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ error: { code: errorCodes.conflict, message: 'Run is already completed', details: { current: { id: review.id, workStatus: 'completed', revision: markedBody.revision } } } });
    expect(await auditsForRun()).toHaveLength(1);
    expect((await call('GET', `/api/runs/${review.id}`, userA)).json()).toEqual(markedBody);

    const reported = await runsRepo.updateRun(db, token, alphaId, review.id, markedBody.revision, { message: 'Agent update after done' });
    expect(reported.status).toBe('saved');
    if (reported.status !== 'saved') return;
    expect(reported.value.workStatus).toBe('completed');
    expect(reported.value.revision).toBe(markedBody.revision + 1);
    const afterAgent = (await call('GET', `/api/runs/${review.id}`, userA)).json() as { events: Array<{ kind: string; message: string }> };
    expect(afterAgent.events.filter((event) => event.kind === 'status' && event.message === 'Agent update after done')).toHaveLength(1);

    const other = await call('POST', `/api/runs/${review.id}/mark-done`, userB, { expected_revision: reported.value.revision, request_id: 'mark-other-owner' });
    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual({ error: { code: errorCodes.not_found, message: 'Not found' } });

    const bearer = await app.inject({
      method: 'POST',
      url: `/api/runs/${review.id}/mark-done`,
      headers: { authorization: `Bearer stub:${userA}:${alphaId}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ expected_revision: reported.value.revision, request_id: 'mark-credential' }),
    });
    expect(bearer.statusCode).toBe(401);
    expect(bearer.json()).toEqual({ error: { code: errorCodes.unauthenticated, message: 'Sign in required' } });

    for (const executionState of ['running', 'failed', 'cancelled'] as const) {
      const run = executionState === 'running'
        ? await runsRepo.createRun(db, accessA, alphaId, { agentId: agentAId, title: 'Still running', workloadType: 'coding' })
        : await endRun(`Already ${executionState}`, executionState, executionState);
      const prior = await tablesExceptIdempotency();
      const refused = await call('POST', `/api/runs/${run.id}/mark-done`, userA, { expected_revision: run.revision, request_id: `mark-${executionState}` });
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({ error: { code: errorCodes.conflict, message: 'Only finished runs can be marked done', details: { current: { id: run.id, executionState } } } });
      expect(await tablesExceptIdempotency()).toEqual(prior);
      expect((await audits.listAuditEvents(db, accessA, alphaId)).some((row) => row.action === 'run_marked_done' && row.target === run.id)).toBe(false);
    }

    const completed = await endRun('Checked out complete', 'finished', 'completed');
    const completedRefusal = await call('POST', `/api/runs/${completed.id}/mark-done`, userA, { expected_revision: completed.revision, request_id: 'mark-completed' });
    expect(completedRefusal.statusCode).toBe(409);
    expect(completedRefusal.json()).toMatchObject({ error: { code: errorCodes.conflict, message: 'Run is already completed', details: { current: { id: completed.id, workStatus: 'completed' } } } });
  });


  it.each(['failed', 'cancelled'] as const)('dismisses %s blocked work once, preserving history and clearing SQL attention', async executionState => {
    const run = await runsRepo.createRun(db, accessA, alphaId, { agentId: agentAId, title: `Dismiss ${executionState}`, workloadType: 'coding' });
    await runsRepo.updateRun(db, accessA, alphaId, run.id, 1, { executionState, workStatus: 'blocked', message: 'Keep failure details' });
    const before = (await call('GET', `/api/runs/${run.id}`, userA)).json();
    expect(await selectAttention(db, userA, new Date())).toContainEqual({ runId: run.id, kind: 'blocked' });
    const body = { expected_revision: before.revision, request_id: `dismiss-${executionState}` };
    const result = await call('POST', `/api/runs/${run.id}/dismiss`, userA, body);
    expect(result.statusCode).toBe(200);
    const after = result.json();
    expect(after).toEqual({ ...before, workStatus: executionState, revision: before.revision + 1, updatedAt: expect.any(String) });
    expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));
    const rows = async () => (await audits.listAuditEvents(db, accessA, alphaId)).filter(row => row.action === 'run_dismissed' && row.target === run.id);
    expect(await rows()).toEqual([expect.objectContaining({ details: { previousWorkStatus: 'blocked' }, actorUserId: userA })]);
    expect((await selectAttention(db, userA, new Date())).some(row => row.runId === run.id)).toBe(false);
    const replay = await call('POST', `/api/runs/${run.id}/dismiss`, userA, body);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(after);
    const stale = await call('POST', `/api/runs/${run.id}/dismiss`, userA, { ...body, request_id: `dismiss-stale-${executionState}` });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: { code: 'conflict', message: 'Revision conflict', details: { current: after } } });
    const again = await call('POST', `/api/runs/${run.id}/dismiss`, userA, { expected_revision: after.revision, request_id: `dismiss-again-${executionState}` });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: { code: 'conflict', message: 'Run is already dismissed', details: { current: after } } });
    expect((await call('GET', `/api/runs/${run.id}`, userA)).json()).toEqual(after);
    expect(await rows()).toHaveLength(1);
    const other = await call('POST', `/api/runs/${run.id}/dismiss`, userB, { expected_revision: after.revision, request_id: `dismiss-other-${executionState}` });
    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
    const bearer = await app.inject({ method: 'POST', url: `/api/runs/${run.id}/dismiss`, headers: { authorization: `Bearer stub:${userA}:${alphaId}`, 'content-type': 'application/json' }, payload: JSON.stringify(body) });
    expect(bearer.statusCode).toBe(401);
    expect(bearer.json()).toEqual({ error: { code: 'unauthenticated', message: 'Sign in required' } });
  });

  it.each(['running', 'finished'] as const)('refuses to dismiss %s blocked work without writes', async executionState => {
    const run = await runsRepo.createRun(db, accessA, alphaId, { agentId: agentAId, title: 'Cannot dismiss', workloadType: 'coding' });
    const credential = await credentials.createCredential(db, accessA, { label: 'Dismiss fixture', tokenHash: `dismiss-fixture-${executionState}`, displaySuffix: 'test', projectIds: [alphaId] });
    await runsRepo.updateRun(db, { kind: 'credential', userId: userA, credentialId: credential.id, projectIds: [alphaId] }, alphaId, run.id, 1, { executionState, workStatus: 'blocked' });
    const before = (await call('GET', `/api/runs/${run.id}`, userA)).json();
    const result = await call('POST', `/api/runs/${run.id}/dismiss`, userA, { expected_revision: before.revision, request_id: `dismiss-no-${executionState}` });
    expect(result.statusCode).toBe(409);
    expect(result.json()).toEqual({ error: { code: 'conflict', message: 'Only failed or cancelled runs can be dismissed', details: { current: before } } });
    expect((await call('GET', `/api/runs/${run.id}`, userA)).json()).toEqual(before);
    expect((await audits.listAuditEvents(db, accessA, alphaId)).filter(row => row.target === run.id && row.action === 'run_dismissed')).toEqual([]);
  });

  it('validates dismiss bodies before writing and supports a differing non-blocked status', async () => {
    const run = await runsRepo.createRun(db, accessA, alphaId, { agentId: agentAId, title: 'Validation', workloadType: 'coding' });
    await runsRepo.updateRun(db, accessA, alphaId, run.id, 1, { executionState: 'failed', workStatus: 'waiting_for_review' });
    for (const body of [{ request_id: 'missing-revision' }, { expected_revision: -1, request_id: 'negative' }, { expected_revision: 2, request_id: 'extra', workStatus: 'failed' }]) {
      expect((await call('POST', `/api/runs/${run.id}/dismiss`, userA, body)).statusCode).toBe(400);
    }
    const result = await call('POST', `/api/runs/${run.id}/dismiss`, userA, { expected_revision: 2, request_id: 'dismiss-different-status' });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ workStatus: 'failed', executionState: 'failed', revision: 3 });
    const operation = await pool.query("SELECT operation FROM idempotency_keys WHERE request_id = $1", ['dismiss-different-status']);
    expect(operation.rows).toEqual([{ operation: 'run_dismiss' }]);
  });

  it('sends nosniff on an authenticated project list', async () => {
    const response = await call('GET', '/api/projects', userA);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
