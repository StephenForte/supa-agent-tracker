import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { buildApp } from '../app/build-app.js';
import { createDb, type AppDatabase } from '../db/client.js';
import { createPool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { users } from '../db/schema.js';
import { migrationsDir } from '../paths.js';
import { createProject } from '../repo/projects.js';
import { boardSummary } from '../repo/board.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';

interface Entry {
  id: string; projectId: string; kind: string; key: string | null; title: string; body: string;
  status: string; revision: number; sourceRunId: string; resolution: string | null;
  resolvedAt: string | null; resolvedByRunId: string | null; resolvedByUserId: string | null;
  author: { agentName: string; taskId: string | null };
}
interface Page { items: Entry[]; nextCursor: string | null }
interface Digest { open_count: number; entries: Omit<Entry, 'body'>[] }
interface Failure { error: { code: string; details?: { current?: Entry; reason?: string } } }
const owner = { kind: 'user' as const, userId: 'board-owner' };
const other = { kind: 'user' as const, userId: 'board-other' };
let scratch: ScratchDatabase; let pool: pg.Pool; let db: AppDatabase; let app: FastifyInstance;
let base: string; let project: string; let second: string; let foreign: string;
let a: Client; let b: Client; let denied: Client; let runA: string; let runB: string; let runSecond: string; let token: string;
const clients: Client[] = [];
async function call<T>(client: Client, name: string, args: Record<string, unknown>, error = false): Promise<T> {
  const response = await client.callTool({ name, arguments: args });
  expect(response.isError ?? false, JSON.stringify(response.content)).toBe(error);
  return JSON.parse((response.content as { text: string }[])[0]!.text) as T;
}
async function connect(label: string, project_ids: string[]) {
  const issued = await app.inject({ method: 'POST', url: '/api/tokens', headers: { 'x-test-user-id': owner.userId }, payload: { label, project_ids, request_id: label } });
  expect(issued.statusCode).toBe(200);
  token = issued.json().plaintext;
  const client = new Client({ name: 'board-test', version: '1' }); clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return client;
}
const post = (fields: Record<string, unknown> = {}, client = a) => call<Entry>(client, 'post_board_message', { project_id: project, source_run_id: runA, kind: 'note', title: 'A standalone title', body: 'What: retained state', request_id: randomUUID(), ...fields });
const list = (fields: Record<string, unknown> = {}) => call<Page>(a, 'list_board', { project_id: project, ...fields });
const state = (fields: Record<string, unknown> = {}, client = a, error = false) => call<Entry & Failure>(client, 'set_board_state', { project_id: project, source_run_id: runA, key: 'build.version', value: 'v1', expected_revision: 0, request_id: randomUUID(), ...fields }, error);
const resolve = (entry: Entry, fields: Record<string, unknown> = {}, client = a, error = false) => call<Entry & Failure>(client, 'resolve_board_entry', { project_id: project, source_run_id: runA, entry_id: entry.id, expected_revision: entry.revision, request_id: randomUUID(), ...fields }, error);
function ownerWrite(entry: Entry, action: string, fields: Record<string, unknown> = {}, userId = owner.userId, projectId = project) {
  return app.inject({ method: 'POST', url: `/api/projects/${projectId}/board/${entry.id}/${action}`, headers: { 'x-test-user-id': userId }, payload: { expected_revision: entry.revision, request_id: randomUUID(), ...fields } });
}
async function checkIn(client: Client, projectId: string, agentName: string) {
  return call<{ run_id: string; board: Digest }>(client, 'check_in', { project_id: projectId, agent_name: agentName, title: 'Board test', workload_type: 'coding', task_id: 'P2-AA-test', request_id: randomUUID() });
}
async function seed(projectId: string, runId: string, count: number, kind = 'note') {
  await pool.query(`INSERT INTO board_entries (project_id, source_run_id, kind, title, body) SELECT $1,$2,$4,'seed-'||i,'BODY-SECRET' FROM generate_series(1,$3::int) i`, [projectId, runId, count, kind]);
}

describe('project board over real MCP HTTP and owner routes', () => {
  beforeAll(async () => {
    scratch = await createScratchDatabase(); pool = createPool(scratch.connectionString); db = createDb(pool);
    await runMigrations(pool, migrationsDir);
    await db.insert(users).values([{ id: owner.userId, email: 'board@example.test' }, { id: other.userId, email: 'other-board@example.test' }]);
    project = (await createProject(db, owner, { name: 'Board', type: 'coding' })).id;
    second = (await createProject(db, owner, { name: 'Second', type: 'coding' })).id;
    foreign = (await createProject(db, other, { name: 'Other owner', type: 'coding' })).id;
    app = await buildApp({ config: { databaseUrl: scratch.connectionString, publicUrl: 'http://localhost:3000', nodeEnv: 'test', port: 0, migrateOnBoot: false }, pool, migrationsDir, spaRoot: new URL('../../dist', import.meta.url).pathname, logger: false });
    base = await app.listen({ host: '127.0.0.1', port: 0 });
    a = await connect('board-token-a', [project, second]); b = await connect('board-token-b', [project]); denied = await connect('board-denied', []);
    runA = (await checkIn(a, project, 'Writer A')).run_id; runB = (await checkIn(b, project, 'Writer B')).run_id;
    runSecond = (await checkIn(a, second, 'Second writer')).run_id;
  });
  afterAll(async () => {
    await Promise.all(clients.map(c => c.close())); await app?.close(); await pool?.end(); await scratch?.drop();
  });

  it('registers strict schemas for all four tools', async () => {
    const tools = (await a.listTools()).tools;
    for (const name of ['list_board', 'post_board_message', 'set_board_state', 'resolve_board_entry']) {
      expect(tools.find(t => t.name === name)).toBeDefined();
    }
    for (const fields of [{ title: '' }, { title: 'x'.repeat(201) }, { body: 'x'.repeat(10001) }, { kind: 'state' }, { addressed_to: 'x'.repeat(201) }, { unexpected: true }]) {
      const result = await call<Failure>(a, 'post_board_message', { project_id: project, source_run_id: runA, kind: 'note', title: 'Valid', request_id: randomUUID(), ...fields }, true);
      expect(result.error.code).toBe('validation_error');
    }
  });
  it('posts standard camelCase entries with a server-resolved author and replays without duplicate rows', async () => {
    const request_id = randomUUID(); const first = await post({ request_id, task_ref: 'P2-AA', addressed_to: 'operator' });
    expect(first).toMatchObject({ projectId: project, kind: 'note', key: null, status: 'open', revision: 1, body: 'What: retained state', sourceRunId: runA, taskRef: 'P2-AA', addressedTo: 'operator', author: { agentName: 'Writer A', taskId: 'P2-AA-test' } });
    expect(await post({ request_id, task_ref: 'P2-AA', addressed_to: 'operator' })).toEqual(first);
    expect((await pool.query('SELECT count(*)::int n FROM board_entries WHERE id=$1', [first.id])).rows[0].n).toBe(1);
    const mismatch = await call<Failure>(a, 'post_board_message', { project_id: project, source_run_id: runA, kind: 'note', title: 'Different', request_id }, true);
    expect(mismatch.error.code).toBe('idempotency_mismatch');
  });
  it('lets a different granted credential resolve, with its own run, and replays one audit event', async () => {
    const entry = await post(); const request_id = randomUUID();
    const resolved = await resolve(entry, { source_run_id: runB, resolution: 'Done', request_id }, b);
    expect(resolved).toMatchObject({ status: 'resolved', resolvedByRunId: runB, resolvedByUserId: null, resolution: 'Done', revision: 2, sourceRunId: runA });
    expect(await resolve(entry, { source_run_id: runB, resolution: 'Done', request_id }, b)).toEqual(resolved);
    expect((await pool.query('SELECT count(*)::int n FROM audit_events WHERE target=$1', [entry.id])).rows[0].n).toBe(1);
    expect((await resolve(resolved, {}, a, true)).error).toMatchObject({ code: 'conflict', details: { current: resolved } });
    expect((await list()).items.some(e => e.id === entry.id)).toBe(false);
    expect((await list({ status: 'all' })).items.some(e => e.id === entry.id)).toBe(true);
  });
  it('rejects another credential’s check-in on post, set and resolve without changing entries', async () => {
    const entry = await post();
    const cases = [
      ['post_board_message', { kind: 'note', title: 'Spoof' }],
      ['set_board_state', { key: 'spoof', value: 'bad', expected_revision: 0 }],
      ['resolve_board_entry', { entry_id: entry.id, expected_revision: 1 }],
    ] as const;
    for (const [name, fields] of cases) {
      expect((await call<Failure>(b, name, { project_id: project, source_run_id: runA, request_id: randomUUID(), ...fields }, true)).error.code).toBe('forbidden');
    }
    expect((await list()).items.find(e => e.id === entry.id)?.revision).toBe(1);
  });
  it('returns not_found for every tool outside the credential project grant', async () => {
    const entry = await post();
    for (const [name, fields] of [
      ['list_board', {}], ['post_board_message', { kind: 'note', title: 'Denied' }],
      ['set_board_state', { key: 'denied', value: 'bad', expected_revision: 0 }],
      ['resolve_board_entry', { entry_id: entry.id, expected_revision: 1 }],
    ] as [string, Record<string, unknown>][]) {
      const args = { project_id: project, ...fields, ...(name === 'list_board' ? {} : { source_run_id: runA, request_id: randomUUID() }) };
      expect((await call<Failure>(denied, name, args, true)).error.code).toBe('not_found');
    }
    expect((await call<Failure>(b, 'list_board', { project_id: second }, true)).error.code).toBe('not_found');
  });
  it('rejects cross-project resolve, reopen and supersedes ids atomically', async () => {
    const original = await post(); const before = await list({ project_id: second, status: 'all' });
    expect((await resolve(original, { project_id: second, source_run_id: runSecond }, a, true)).error.code).toBe('not_found');
    const reopen = await ownerWrite(original, 'reopen', {}, owner.userId, second);
    expect(reopen.statusCode).toBe(404);
    const supersede = await call<Failure>(a, 'post_board_message', { project_id: second, source_run_id: runSecond, kind: 'note', title: 'Cross project', supersedes_id: original.id, request_id: randomUUID() }, true);
    expect(supersede.error.code).toBe('not_found');
    expect(await list({ project_id: second, status: 'all' })).toEqual(before);
    expect((await list()).items.find(e => e.id === original.id)?.status).toBe('open');
  });
  it('supersedes atomically, leaves resolved targets alone, and rejects state targets', async () => {
    const original = await post(); const newer = await post({ supersedes_id: original.id });
    const old = (await list({ status: 'all' })).items.find(e => e.id === original.id)!;
    expect(old).toMatchObject({ status: 'resolved', resolution: `Superseded by ${newer.id}`, resolvedByRunId: runA, revision: 2 });
    await post({ supersedes_id: original.id });
    expect((await list({ status: 'all' })).items.find(e => e.id === original.id)).toEqual(old);
    const value = await state({ key: 'supersedes-test' });
    const before = await list({ status: 'all' });
    expect((await call<Failure>(a, 'post_board_message', { project_id: project, source_run_id: runA, kind: 'note', title: 'Bad supersedes', supersedes_id: value.id, request_id: randomUUID() }, true)).error.code).toBe('validation_error');
    expect(await list({ status: 'all' })).toEqual(before);
  });
  it('rolls back the new entry and old resolution if supersession fails after insert', async () => {
    const original = await post(); const before = await list({ status: 'all' });
    await pool.query(`CREATE FUNCTION fail_board_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Injected audit failure'; END $$;
      CREATE TRIGGER fail_board_audit BEFORE INSERT ON audit_events FOR EACH ROW
      WHEN (NEW.action = 'board_entry_resolved') EXECUTE FUNCTION fail_board_audit()`);
    try {
      const failed = await call<Failure>(a, 'post_board_message', { project_id: project, source_run_id: runA, kind: 'note', title: 'Must roll back', supersedes_id: original.id, request_id: randomUUID() }, true);
      expect(failed.error.code).toBe('internal_error');
      expect(await list({ status: 'all' })).toEqual(before);
    } finally {
      await pool.query('DROP TRIGGER fail_board_audit ON audit_events; DROP FUNCTION fail_board_audit()');
    }
  });
  it('creates state at zero, conflicts at zero/stale, allows replacement by another writer, and reopens', async () => {
    const first = await state(); expect(first).toMatchObject({ key: 'build.version', title: 'build.version', body: 'v1', revision: 1 });
    expect((await state({}, a, true)).error).toMatchObject({ code: 'conflict', details: { current: first } });
    const secondValue = await state({ source_run_id: runB, expected_revision: 1, value: 'v2' }, b);
    expect(secondValue).toMatchObject({ revision: 2, body: 'v2', sourceRunId: runB, author: { agentName: 'Writer B' } });
    expect((await state({ expected_revision: 1 }, a, true)).error.details?.current).toEqual(secondValue);
    const resolved = await resolve(secondValue);
    const reopened = await state({ expected_revision: resolved.revision, value: 'v3' });
    expect(reopened).toMatchObject({ status: 'open', resolution: null, resolvedAt: null, resolvedByRunId: null, resolvedByUserId: null, body: 'v3', sourceRunId: runA });
    const elsewhere = await state({ project_id: second, source_run_id: runSecond });
    expect(elsewhere.id).not.toBe(first.id);
    expect((await list({ kind: 'state', key: 'build.version' })).items).toEqual([reopened]);
  });
  it('serializes concurrent creation of a key and returns the winning value as conflict', async () => {
    const results = await Promise.all([a, b].map((client, i) => client.callTool({ name: 'set_board_state', arguments: { project_id: project, source_run_id: i === 0 ? runA : runB, key: 'race', value: 'value', expected_revision: 0, request_id: randomUUID() } })));
    expect(results.filter(result => result.isError)).toHaveLength(1);
    const winner = JSON.parse((results.find(result => !result.isError)!.content as { text: string }[])[0]!.text);
    const loser = JSON.parse((results.find(result => result.isError)!.content as { text: string }[])[0]!.text);
    expect(loser.error).toMatchObject({ code: 'conflict', details: { current: winner } });
  });
  it('owner resolve/reopen are revision checked, idempotent and audited; bearer and another owner fail', async () => {
    const entry = await post(); const request_id = randomUUID();
    const response = await ownerWrite(entry, 'resolve', { request_id, resolution: 'Owner done' }); expect(response.statusCode).toBe(200);
    const resolved = response.json<Entry>(); expect(resolved).toMatchObject({ status: 'resolved', resolvedByUserId: owner.userId, resolvedByRunId: null, revision: 2 });
    expect((await ownerWrite(entry, 'resolve', { request_id, resolution: 'Owner done' })).json()).toEqual(resolved);
    expect((await ownerWrite(entry, 'resolve', { request_id, resolution: 'Changed' })).json().error.code).toBe('idempotency_mismatch');
    expect((await ownerWrite(entry, 'resolve')).statusCode).toBe(409);
    expect((await ownerWrite(resolved, 'resolve')).statusCode).toBe(409);
    const reopenId = randomUUID(); const reopened = await ownerWrite(resolved, 'reopen', { request_id: reopenId }); expect(reopened.statusCode).toBe(200);
    expect(reopened.json()).toMatchObject({ status: 'open', resolution: null, resolvedAt: null, resolvedByRunId: null, resolvedByUserId: null, revision: 3 });
    expect((await ownerWrite(resolved, 'reopen', { request_id: reopenId })).json()).toEqual(reopened.json());
    expect((await ownerWrite(reopened.json(), 'reopen')).statusCode).toBe(409);
    expect((await ownerWrite(entry, 'resolve', {}, other.userId)).statusCode).toBe(404);
    expect((await ownerWrite(entry, 'reopen', {}, other.userId)).statusCode).toBe(404);
    const audits = (await pool.query('SELECT action FROM audit_events WHERE target=$1 ORDER BY created_at', [entry.id])).rows;
    expect(audits).toEqual([{ action: 'board_entry_resolved' }, { action: 'board_entry_reopened' }]);
    for (const [method, url, payload] of [
      ['GET', '/api/board/summary', undefined], ['GET', `/api/projects/${project}/board`, undefined],
      ['POST', `/api/projects/${project}/board/${entry.id}/resolve`, { expected_revision: 3, request_id: randomUUID() }],
      ['POST', `/api/projects/${project}/board/${entry.id}/reopen`, { expected_revision: 3, request_id: randomUUID() }],
    ] as const) expect((await app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: `/api/projects/${project}/board`, headers: { 'x-test-user-id': other.userId } })).statusCode).toBe(404);
    const ops = (await pool.query("SELECT operation FROM idempotency_keys WHERE request_id = ANY($1) ORDER BY operation", [[request_id, reopenId]])).rows;
    expect(ops).toEqual([{ operation: 'board_entry_reopen' }, { operation: 'board_entry_resolve' }]);
  });
  it('summarizes only each owner’s open boards in one query regardless of project count', async () => {
    // Foreign owner's own source run, seeded without using the credential under test.
    await pool.query(`INSERT INTO agents (id,project_id,name,title,workload_type) VALUES ('foreign-agent',$1,'Foreign','Foreign','coding')`, [foreign]);
    await pool.query(`INSERT INTO runs (id,project_id,agent_id,title,workload_type) VALUES ('foreign-run',$1,'foreign-agent','Foreign','coding')`, [foreign]);
    await seed(foreign, 'foreign-run', 2, 'hazard');
    const query = vi.spyOn(pool, 'query');
    const summary = await boardSummary(db, owner); expect(query).toHaveBeenCalledTimes(1); query.mockRestore();
    expect(summary.items.map(e => e.projectId)).toEqual([project, second].sort());
    const others = await boardSummary(db, other); expect(others.items).toHaveLength(1);
    expect(others.items[0]).toMatchObject({ projectId: foreign, openCount: 2, hazardCount: 2, questionCount: 0, latest: { kind: 'hazard' } });
    const latest = (await pool.query('SELECT id,title FROM board_entries WHERE project_id=$1 ORDER BY updated_at DESC,id ASC LIMIT 1', [foreign])).rows[0];
    expect(others.items[0]!.latest).toMatchObject(latest);
    const latestTime = (others.items[0]!.latest as { updatedAt: string }).updatedAt;
    expect(latestTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(latestTime).toBe(new Date(latestTime).toISOString());
    const nonUtcPool = createPool(scratch.connectionString);
    try {
      await nonUtcPool.query("SET TIME ZONE 'Pacific/Honolulu'");
      const nonUtcSummary = await boardSummary(createDb(nonUtcPool), other);
      expect(nonUtcSummary.items).toEqual(others.items);
    } finally { await nonUtcPool.end(); }

    for (let i = 0; i < 8; i++) {
      const id = (await createProject(db, owner, { name: `Extra ${i}`, type: 'coding' })).id;
      const agentId = randomUUID(); const runId = randomUUID();
      await pool.query(`INSERT INTO agents(id,project_id,name,title,workload_type) VALUES ($1,$2,'Extra','Extra','coding')`, [agentId, id]);
      await pool.query(`INSERT INTO runs(id,project_id,agent_id,title,workload_type) VALUES ($1,$2,$3,'Extra','coding')`, [runId, id, agentId]);
      await seed(id, runId, 1, 'question');
    }
    const again = vi.spyOn(pool, 'query'); const expanded = await boardSummary(db, owner); expect(again).toHaveBeenCalledTimes(1); again.mockRestore();
    expect(expanded.items).toHaveLength(10);
    const response = await app.inject({ method: 'GET', url: '/api/board/summary', headers: { 'x-test-user-id': other.userId } });
    expect(response.json().items).toEqual(JSON.parse(JSON.stringify(others.items)));
  });
  it('paginates equal timestamps stably, applies filters and rejects malformed cursors', async () => {
    await seed(second, runSecond, 9);
    const ids: string[] = []; let cursor: string | null = null;
    do {
      const page: Page = await list({ project_id: second, limit: 3, ...(cursor ? { cursor } : {}) });
      ids.push(...page.items.map(e => e.id)); cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(ids).size).toBe(10); expect(ids).toHaveLength(10);
    expect((await list({ task_ref: 'P2-AA' })).items).toHaveLength(1);
    const invalid = await call<Failure>(a, 'list_board', { project_id: project, cursor: 'invalid-json' }, true); expect(invalid.error.code).toBe('validation_error');
    const ownerPage = await app.inject({ method: 'GET', url: `/api/projects/${project}/board?kind=state&limit=2`, headers: { 'x-test-user-id': owner.userId } });
    expect(ownerPage.statusCode).toBe(200); expect(ownerPage.json().items.every((e: Entry) => e.kind === 'state')).toBe(true);
  });
  it('digest caps at 20 of 25, prioritizes hazards/questions, excludes resolved/body and check-in replay stays stored', async () => {
    // Fresh project for exact counts and priority ordering.
    const id = (await createProject(db, owner, { name: 'Digest', type: 'coding' })).id;
    const c = await connect('digest-token', [id]); const run = (await checkIn(c, id, 'Digest writer')).run_id;
    await seed(id, run, 20); await seed(id, run, 3, 'question'); await seed(id, run, 2, 'hazard');
    const digest = (await call<{ board: Digest }>(c, 'get_project', { project_id: id })).board;
    expect(digest.open_count).toBe(25); expect(digest.entries).toHaveLength(20);
    expect(digest.entries.slice(0, 5).map(e => e.kind)).toEqual(['hazard', 'hazard', 'question', 'question', 'question']);
    expect(digest.entries.every(e => !('body' in e))).toBe(true); expect(JSON.stringify(digest)).not.toContain('BODY-SECRET');
    const request_id = randomUUID(); const args = { project_id: id, agent_name: 'Replay', title: 'Replay', workload_type: 'automation', request_id };
    const first = await call<{ board: Digest }>(c, 'check_in', args); expect(first.board).toEqual(digest);
    const target = digest.entries[0]!;
    await call(c, 'resolve_board_entry', { project_id: id, source_run_id: run, entry_id: target.id, expected_revision: target.revision, request_id: randomUUID() });
    const after = (await call<{ board: Digest }>(c, 'get_project', { project_id: id })).board;
    expect(after.open_count).toBe(24); expect(after.entries.some(e => e.id === target.id)).toBe(false);
    expect(await call(c, 'check_in', args)).toEqual(first);
  });
  it('enforces 500 open entries, replacement exemption, freeing capacity, and concurrent boundary writes', async () => {
    const id = (await createProject(db, owner, { name: 'Capacity', type: 'coding' })).id;
    const c = await connect('capacity-token', [id]); const run = (await checkIn(c, id, 'Capacity writer')).run_id;
    const value = await state({ project_id: id, source_run_id: run, key: 'capacity' }, c);
    await seed(id, run, 499);
    const fields = { project_id: id, source_run_id: run, kind: 'note', title: 'Full', request_id: randomUUID() };
    expect((await call<Failure>(c, 'post_board_message', fields, true)).error).toMatchObject({ code: 'validation_error', details: { reason: 'board_full' } });
    expect((await state({ project_id: id, source_run_id: run, key: 'new-key' }, c, true)).error.details?.reason).toBe('board_full');
    const replaced = await state({ project_id: id, source_run_id: run, key: 'capacity', expected_revision: 1, value: 'Updated while full' }, c);
    expect(replaced.revision).toBe(2);
    await resolve(replaced, { project_id: id, source_run_id: run }, c);
    const posted = await call<Entry>(c, 'post_board_message', { ...fields, request_id: randomUUID() }); expect(posted.status).toBe('open');
    await resolve(posted, { project_id: id, source_run_id: run }, c);
    const replies = await Promise.all([0, 1].map(() => c.callTool({ name: 'post_board_message', arguments: { ...fields, request_id: randomUUID() } })));
    expect(replies.filter(r => r.isError)).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int n FROM board_entries WHERE project_id=$1 AND status='open'", [id])).rows[0].n).toBe(500);
    expect(value.id).toBe(replaced.id);
  });
});
