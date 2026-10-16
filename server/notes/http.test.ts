import { existsSync, readdirSync, readFileSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { buildApp } from '../app/build-app.js';
import type { AppConfig } from '../config.js';
import { createDb, type AppDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { createPool } from '../db/pool.js';
import { migrationsDir, repoRoot } from '../paths.js';
import { users } from '../db/schema.js';
import type { CredentialAccess, UserAccess } from '../repo/access.js';
import * as agents from '../repo/agents.js';
import * as audits from '../repo/audit-events.js';
import * as credentials from '../repo/credentials.js';
import * as notes from '../repo/private-notes.js';
import * as projects from '../repo/projects.js';
import * as runs from '../repo/runs.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { createNextStep, listNextStepsForAgent, reorderNextSteps, setWaitingNote, updateNextStep } from '../steps/agent-steps.js';
import { PRIVATE_NOTE_MAX_CHARS } from './routes.js';

const owner: UserAccess = { kind: 'user', userId: 'owner-http' };
const stranger: UserAccess = { kind: 'user', userId: 'stranger-http' };
const sentinel = 'NOTE_SENTINEL_7f3c9a_private';

let scratch: ScratchDatabase;
let pool: pg.Pool;
let db: AppDatabase;
let app: FastifyInstance;
let project: projects.Project;
let access: CredentialAccess;
let run: runs.Run;
const scratchRoot = mkdtempSync(path.join(tmpdir(), 'supa-steps-http-'));

function config(databaseUrl: string): AppConfig {
  return { databaseUrl, port: 0, nodeEnv: 'test', publicUrl: 'http://localhost:3000', migrateOnBoot: false };
}

async function asUser(userId: string, method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) {
  return app.inject({
    method,
    url,
    headers: { 'x-test-user-id': userId, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    payload: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('next-step and private-note HTTP', () => {
  beforeAll(async () => {
    const spaRoot = mkdtempSync(path.join(scratchRoot, 'spa-'));
    writeFileSync(path.join(spaRoot, 'index.html'), '<!doctype html><title>spa-fixture</title>');
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
    db = createDb(pool);
    await runMigrations(pool, migrationsDir);
    await db.insert(users).values([{ id: owner.userId, email: 'owner-http@example.com' }, { id: stranger.userId, email: 'stranger-http@example.com' }]);
    project = await projects.createProject(db, owner, { name: 'HTTP', type: 'coding' });
    await projects.createProject(db, stranger, { name: 'Stranger', type: 'coding' });
    const agent = await agents.createAgent(db, owner, project.id, { name: 'http', title: 'HTTP', workloadType: 'coding' });
    const issued = await credentials.createCredential(db, owner, { label: 'http', tokenHash: 'hash-http-real', displaySuffix: 'real', projectIds: [project.id] });
    access = { kind: 'credential', userId: owner.userId, credentialId: issued.id, projectIds: [project.id] };
    run = await runs.createRun(db, access, project.id, { agentId: agent.id, title: 'HTTP run', workloadType: 'coding' });
    app = await buildApp({ config: config(scratch.connectionString), pool, migrationsDir, spaRoot });
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await scratch?.drop();
    rmSync(scratchRoot, { recursive: true, force: true });
  });

  it('returns steps and the waiting note in stable order, including a completed step', async () => {
    const later = await createNextStep(db, access, { project_id: project.id, source_run_id: run.id, instruction: 'Later', position: 2, request_id: 'http-later' });
    const earlier = await createNextStep(db, access, { project_id: project.id, source_run_id: run.id, instruction: 'Earlier', position: 0, request_id: 'http-earlier' });
    expect(later.status).toBe('saved');
    expect(earlier.status).toBe('saved');
    if (earlier.status !== 'saved' || later.status !== 'saved') return;
    await setWaitingNote(db, access, { project_id: project.id, source_run_id: run.id, expected_revision: 0, text: 'In flight', request_id: 'http-wait' });
    const done = await asUser(owner.userId, 'POST', `/api/projects/${project.id}/next-steps/${earlier.value.id}/completion`, {
      done: true, expected_revision: earlier.value.revision, request_id: 'http-done',
    });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({
      id: earlier.value.id,
      done: true,
      completionChangedBy: owner.userId,
      revision: earlier.value.revision + 1,
    });
    expect(done.json().completionChangedAt).toEqual(expect.any(String));
    const listed = await asUser(owner.userId, 'GET', `/api/projects/${project.id}/next-steps`);
    expect(listed.statusCode).toBe(200);
    expect(listed.json().steps.map((step: { instruction: string }) => step.instruction)).toEqual(['Earlier', 'Later']);
    expect(listed.json().steps[0].done).toBe(true);
    expect(listed.json().waitingNote).toMatchObject({ text: 'In flight', sourceRunId: run.id });
    expect(listed.body).not.toContain(sentinel);
    const events = await audits.listAuditEvents(db, owner, project.id);
    expect(events.some((event) => event.action === 'next_step_completed' && event.target === earlier.value.id)).toBe(true);
  });

  it('conflicts on a stale completion, replays the same request, and completes after the source run fails', async () => {
    const created = await createNextStep(db, access, { project_id: project.id, source_run_id: run.id, instruction: 'Survive failure', request_id: 'http-survive' });
    if (created.status !== 'saved') throw new Error('expected step');
    const failed = await runs.updateRun(db, access, project.id, run.id, 1, { executionState: 'failed', workStatus: 'failed' });
    expect(failed.status).toBe('saved');
    const url = `/api/projects/${project.id}/next-steps/${created.value.id}/completion`;
    const body = { done: true, expected_revision: created.value.revision, request_id: 'http-survive-done' };
    const ok = await asUser(owner.userId, 'POST', url, body);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().done).toBe(true);
    const replay = await asUser(owner.userId, 'POST', url, body);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(ok.json());
    const stale = await asUser(owner.userId, 'POST', url, { done: false, expected_revision: created.value.revision, request_id: 'http-stale' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('conflict');
    expect(stale.json().error.details.current).toMatchObject({ id: created.value.id, revision: created.value.revision + 1, done: true });
    expect((await runs.getRun(db, owner, project.id, run.id)).executionState).toBe('failed');
    const auditsAfter = (await audits.listAuditEvents(db, owner, project.id)).filter((event) => event.target === created.value.id && event.action === 'next_step_completed');
    expect(auditsAfter).toHaveLength(1);
  });

  it('creates a private note from revision 0, caps the text, and replays the write', async () => {
    const empty = await asUser(owner.userId, 'GET', `/api/projects/${project.id}/private-note`);
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ projectId: project.id, text: '', revision: 0, updatedAt: null });
    const created = await asUser(owner.userId, 'PUT', `/api/projects/${project.id}/private-note`, {
      text: sentinel, expected_revision: 0, request_id: 'note-create',
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ projectId: project.id, text: sentinel, revision: 1 });
    expect(created.json().updatedAt).toEqual(expect.any(String));
    const replay = await asUser(owner.userId, 'PUT', `/api/projects/${project.id}/private-note`, {
      text: sentinel, expected_revision: 0, request_id: 'note-create',
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(created.json());
    const mismatch = await asUser(owner.userId, 'PUT', `/api/projects/${project.id}/private-note`, {
      text: 'different', expected_revision: 0, request_id: 'note-create',
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json().error.code).toBe('idempotency_mismatch');
    expect((await notes.getPrivateNote(db, owner, project.id))?.text).toBe(sentinel);
    const tooLong = await asUser(owner.userId, 'PUT', `/api/projects/${project.id}/private-note`, {
      text: 'x'.repeat(PRIVATE_NOTE_MAX_CHARS + 1), expected_revision: 1, request_id: 'note-long',
    });
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.json().error.code).toBe('validation_error');
    expect((await notes.getPrivateNote(db, owner, project.id))?.revision).toBe(1);
    const stale = await asUser(owner.userId, 'PUT', `/api/projects/${project.id}/private-note`, {
      text: 'next', expected_revision: 0, request_id: 'note-stale',
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.details.current).toMatchObject({ text: sentinel, revision: 1 });
  });

  it('returns 404 for another user and 401 for a bearer credential without a session', async () => {
    const stepsBefore = await asUser(owner.userId, 'GET', `/api/projects/${project.id}/next-steps`);
    const noteBefore = await notes.getPrivateNote(db, owner, project.id);
    const steps = await asUser(stranger.userId, 'GET', `/api/projects/${project.id}/next-steps`);
    const note = await asUser(stranger.userId, 'GET', `/api/projects/${project.id}/private-note`);
    const write = await asUser(stranger.userId, 'PUT', `/api/projects/${project.id}/private-note`, {
      text: 'stolen', expected_revision: 0, request_id: 'steal-note',
    });
    expect(steps.statusCode).toBe(404);
    expect(note.statusCode).toBe(404);
    expect(write.statusCode).toBe(404);
    for (const response of [steps, note, write]) {
      expect(response.json().error.code).toBe('not_found');
      expect(response.body).not.toContain(sentinel);
    }
    expect(await notes.getPrivateNote(db, owner, project.id)).toEqual(noteBefore);
    const stepsAfter = await asUser(owner.userId, 'GET', `/api/projects/${project.id}/next-steps`);
    expect(stepsAfter.json()).toEqual(stepsBefore.json());

    const bearer = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/private-note`,
      headers: { authorization: 'Bearer hash-http-real' },
    });
    expect(bearer.statusCode).toBe(401);
    expect(bearer.json().error.code).toBe('unauthenticated');
    expect(bearer.body).not.toContain(sentinel);
    const stub = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/next-steps`,
      headers: { authorization: `Bearer stub:${owner.userId}:${project.id}` },
    });
    expect(stub.statusCode).toBe(401);
  });

  it('keeps the seeded note out of every agent result', async () => {
    const listed = await listNextStepsForAgent(db, access, { project_id: project.id });
    const created = await createNextStep(db, access, { project_id: project.id, source_run_id: run.id, instruction: 'Visible', request_id: 'sentinel-create' });
    const stepId = created.status === 'saved' ? created.value.id : 'missing';
    const revision = created.status === 'saved' ? created.value.revision : 1;
    const updated = await updateNextStep(db, access, {
      project_id: project.id, step_id: stepId, source_run_id: run.id, expected_revision: revision, instruction: 'Visible still', request_id: 'sentinel-update',
    }).catch((error: unknown) => error);
    const reordered = await reorderNextSteps(db, access, {
      project_id: project.id,
      order: (listed.steps.concat(created.status === 'saved' ? [created.value] : [])).map((step) => ({ step_id: step.id, expected_revision: step.revision })),
      request_id: 'sentinel-reorder',
    }).catch((error: unknown) => error);
    const waiting = await setWaitingNote(db, access, {
      project_id: project.id, source_run_id: run.id, expected_revision: 1, text: 'Agent visible', request_id: 'sentinel-wait',
    }).catch((error: unknown) => error);
    const blob = JSON.stringify({ listed, created, updated, reordered, waiting });
    expect(blob).not.toContain(sentinel);
    expect((await notes.getPrivateNote(db, owner, project.id))?.text).toBe(sentinel);
  });

  it('fails if the agent or MCP tree references private-notes', () => {
    const files = [...sourceFiles(path.join(repoRoot, 'server/steps')), ...sourceFiles(path.join(repoRoot, 'server/mcp'))];
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) => /private-notes|privateNotes|private_notes/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else found.push(full);
  }
  return found;
}
