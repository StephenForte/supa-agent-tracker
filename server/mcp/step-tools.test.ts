import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { createDb, type AppDatabase } from '../db/client.js';
import { createPool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { migrationsDir } from '../paths.js';
import { users } from '../db/schema.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { buildApp } from '../app/build-app.js';
import { createProject, type Project } from '../repo/projects.js';
import { setPrivateNote } from '../repo/private-notes.js';

const owner = { kind: 'user' as const, userId: 'step-tools-owner' };
const privateText = 'PRIVATE-step-tools-secret-71da';
let scratch: ScratchDatabase; let pool: pg.Pool; let db: AppDatabase;
let app: FastifyInstance; let base: string; let project: Project;
let a: Client; let b: Client; let ungranted: Client;
let runA: string; let runB: string;
const clients: Client[] = [];
const responses: unknown[] = [];
interface Step {
  id: string; sourceRunId: string; instruction: string; position: number; revision: number; done: boolean;
  completionChangedBy: string | null; completionChangedAt: string | null;
}
interface WaitingNote { text: string; sourceRunId: string; revision: number }
interface Listing { steps: Step[]; waitingNote: WaitingNote | null }
interface ErrorValue { error: { code: string; details?: { current: unknown } } }

async function call<T>(client: Client, name: string, args: Record<string, unknown>, error = false): Promise<T> {
  const response = await client.callTool({ name, arguments: args });
  responses.push(response);
  expect(response.isError ?? false, JSON.stringify(response.content)).toBe(error);
  return JSON.parse((response.content as { text: string }[])[0]!.text) as T;
}
async function connect(request_id: string, project_ids = [project.id]) {
  const issued = await app.inject({ method: 'POST', url: '/api/tokens', headers: { 'x-test-user-id': owner.userId },
    payload: { label: request_id, project_ids, request_id } });
  expect(issued.statusCode).toBe(200);
  const client = new Client({ name: 'step-tools-test', version: '1' });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${issued.json().plaintext}` } },
  }));
  return client;
}
async function checkIn(client: Client, request_id: string) {
  const result = await call<{ run_id: string }>(client, 'check_in', { project_id: project.id, agent_name: request_id,
    title: 'Step tools', workload_type: 'automation', request_id });
  return result.run_id;
}
const list = () => call<Listing>(a, 'list_next_steps', { project_id: project.id });
async function create(instruction: string, request_id: string, position?: number) {
  return call<Step>(a, 'create_next_step', { project_id: project.id, source_run_id: runA, instruction, request_id, position });
}

describe('next-step tools over /mcp with SDK clients and issued tokens', () => {
  beforeAll(async () => {
    scratch = await createScratchDatabase(); pool = createPool(scratch.connectionString); db = createDb(pool);
    await runMigrations(pool, migrationsDir);
    await db.insert(users).values({ id: owner.userId, email: 'step-tools@example.com' });
    project = await createProject(db, owner, { name: 'Step tools', type: 'automation' });
    await setPrivateNote(db, owner, project.id, 0, privateText);
    app = await buildApp({ config: { databaseUrl: scratch.connectionString, publicUrl: 'http://localhost:3000',
      nodeEnv: 'test', port: 0, migrateOnBoot: false }, pool, migrationsDir,
      spaRoot: new URL('../../dist', import.meta.url).pathname, logger: false });
    base = await app.listen({ port: 0, host: '127.0.0.1' });
    a = await connect('step-token-a'); b = await connect('step-token-b'); ungranted = await connect('step-ungranted', []);
    runA = await checkIn(a, 'step-run-a'); runB = await checkIn(b, 'step-run-b');
  });
  afterAll(async () => {
    await Promise.all(clients.map((client) => client.close()));
    await app?.close(); await pool?.end(); await scratch?.drop();
  });

  it('retries create identically with one row and rejects a changed body (single idempotency layer)', async () => {
    const first = await create('Review the PR', 'step-retry');
    expect(first).toMatchObject({ instruction: 'Review the PR', sourceRunId: runA, done: false, revision: 1 });
    expect(await create('Review the PR', 'step-retry')).toEqual(first);
    expect((await pool.query('select count(*)::int n from next_steps where project_id=$1', [project.id])).rows[0].n).toBe(1);
    const mismatch = await call<ErrorValue>(a, 'create_next_step', { project_id: project.id, source_run_id: runA,
      instruction: 'Different body', request_id: 'step-retry' }, true);
    expect(mismatch.error.code).toBe('idempotency_mismatch');
    expect((await list()).steps).toEqual([first]);
  });

  it('binds edits to the check-in credential even for another token of the same user', async () => {
    const step = await create('Owned by A', 'step-own');
    const before = await list();
    const denied = await call<ErrorValue>(b, 'update_next_step', { project_id: project.id, step_id: step.id,
      source_run_id: runA, expected_revision: step.revision, instruction: 'B overwrites A', request_id: 'step-denied' }, true);
    expect(denied.error.code).toBe('forbidden');
    // Substituting B's own run must not transfer authorship either.
    const substitute = await call<ErrorValue>(b, 'update_next_step', { project_id: project.id, step_id: step.id,
      source_run_id: runB, expected_revision: step.revision, instruction: 'B substitutes run', request_id: 'step-substitute' }, true);
    expect(substitute.error.code).toBe('forbidden');
    expect(await list()).toEqual(before);
  });

  it('preserves owner completion after an agent edit and maps stale edit conflicts', async () => {
    const step = await create('Complete me', 'step-completion');
    const response = await app.inject({ method: 'POST', url: `/api/projects/${project.id}/next-steps/${step.id}/completion`,
      headers: { 'x-test-user-id': owner.userId }, payload: { done: true, expected_revision: step.revision, request_id: 'step-owner-done' } });
    expect(response.statusCode).toBe(200);
    const completed = response.json() as Step;
    const args = { project_id: project.id, step_id: step.id, source_run_id: runA,
      expected_revision: completed.revision, instruction: 'Updated handoff', request_id: 'step-after-done' };
    const edited = await call<Step>(a, 'update_next_step', args);
    expect(edited).toMatchObject({ done: true, instruction: 'Updated handoff', revision: completed.revision + 1,
      completionChangedBy: completed.completionChangedBy, completionChangedAt: completed.completionChangedAt });
    expect(await call<Step>(a, 'update_next_step', args)).toEqual(edited);
    const stale = await call<ErrorValue>(a, 'update_next_step', { ...args, request_id: 'step-stale-edit' }, true);
    expect(stale.error).toMatchObject({ code: 'conflict', details: { current: edited } });
  });

  it('rejects a stale reorder atomically and allows another granted credential to reorder the full list', async () => {
    const before = await list();
    const order = [...before.steps].reverse().map((step) => ({ step_id: step.id, expected_revision: step.revision }));
    const staleOrder = order.map((step, index) => index === 0 ? { ...step, expected_revision: step.expected_revision + 1 } : step);
    const conflict = await call<ErrorValue>(b, 'reorder_next_steps', { project_id: project.id, order: staleOrder, request_id: 'step-stale-order' }, true);
    expect(conflict.error).toEqual({ code: 'conflict', message: 'conflict', details: { current: before.steps } });
    expect(await list()).toEqual(before);
    const args = { project_id: project.id, order, request_id: 'step-valid-order' };
    const reordered = await call<Step[]>(b, 'reorder_next_steps', args);
    expect(reordered.map((step) => step.id)).toEqual(order.map((step) => step.step_id));
    expect(reordered.map((step) => step.position)).toEqual(reordered.map((_, index) => index));
    for (const step of reordered) {
      const previous = before.steps.find((row) => row.id === step.id)!;
      expect(step).toMatchObject({ instruction: previous.instruction, sourceRunId: previous.sourceRunId,
        done: previous.done, completionChangedBy: previous.completionChangedBy, completionChangedAt: previous.completionChangedAt });
    }
    expect(await call<Step[]>(b, 'reorder_next_steps', args)).toEqual(reordered);
    expect((await list()).steps).toEqual(reordered);
  });

  it('sets and replays a waiting note only with the calling credential’s run and maps conflicts', async () => {
    const args = { project_id: project.id, source_run_id: runA, expected_revision: 0, text: 'Waiting for review', request_id: 'step-waiting' };
    const saved = await call<WaitingNote>(a, 'set_waiting_note', args);
    expect(saved).toMatchObject({ text: args.text, sourceRunId: runA, revision: 1 });
    expect(await call<WaitingNote>(a, 'set_waiting_note', args)).toEqual(saved);
    const denied = await call<ErrorValue>(a, 'set_waiting_note', { ...args, source_run_id: runB,
      expected_revision: 1, request_id: 'step-other-run' }, true);
    expect(denied.error.code).toBe('forbidden');
    const conflict = await call<ErrorValue>(a, 'set_waiting_note', { ...args, request_id: 'step-stale-note' }, true);
    expect(conflict.error).toMatchObject({ code: 'conflict', details: { current: saved } });
    expect((await list()).waitingNote).toEqual(saved);
  });

  it('returns not_found on every step tool for an ungranted project without changing rows', async () => {
    const before = await list(); const step = before.steps[0]!;
    const cases: [string, Record<string, unknown>][] = [
      ['list_next_steps', {}],
      ['create_next_step', { source_run_id: runA, instruction: 'Denied' }],
      ['update_next_step', { source_run_id: runA, step_id: step.id, expected_revision: step.revision, instruction: 'Denied' }],
      ['reorder_next_steps', { order: before.steps.map((row) => ({ step_id: row.id, expected_revision: row.revision })) }],
      ['set_waiting_note', { source_run_id: runA, expected_revision: 1, text: 'Denied' }],
    ];
    for (const [name, fields] of cases) {
      const args = { project_id: project.id, ...fields, ...(name === 'list_next_steps' ? {} : { request_id: `ungranted-${name}` }) };
      expect((await call<ErrorValue>(ungranted, name, args, true)).error.code).toBe('not_found');
    }
    expect(await list()).toEqual(before);
  });

  it('reuses strict schemas and service validation without echoing invalid inputs', async () => {
    const step = (await list()).steps[0]!;
    const invalid = [
      { project_id: project.id, step_id: step.id, source_run_id: runA, expected_revision: step.revision, request_id: 'step-no-patch' },
      { project_id: project.id, step_id: step.id, source_run_id: runA, expected_revision: step.revision, instruction: 'Valid', done: false, request_id: 'step-done-field' },
    ];
    for (const args of invalid) {
      const result = await call<ErrorValue>(a, 'update_next_step', args, true);
      expect(result.error).toEqual({ code: 'validation_error', message: 'validation_error' });
    }
  });

  it('keeps seeded private-note text out of every step tool response, including errors and conflicts', () => {
    expect(responses.length).toBeGreaterThan(25);
    expect(JSON.stringify(responses)).not.toContain(privateText);
  });
});
