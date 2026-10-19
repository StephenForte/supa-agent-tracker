import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { buildApp } from '../app/build-app.js';
import { errorCodes } from '../app/errors.js';
import { loadConfig } from '../config.js';
import { createDb, type AppDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { createPool } from '../db/pool.js';
import { users } from '../db/schema.js';
import { migrationsDir } from '../paths.js';
import type { UserAccess } from '../repo/access.js';
import * as agentsRepo from '../repo/agents.js';
import * as projectsRepo from '../repo/projects.js';
import * as runsRepo from '../repo/runs.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import type { Email } from '../email/index.js';

const origin = 'http://127.0.0.1:3000';
const ada = 'user-ada';
const bea = 'user-bea';
const accessAda: UserAccess = { kind: 'user', userId: ada };
const accessBea: UserAccess = { kind: 'user', userId: bea };
const RUN_KEYS = ['executionState', 'finishedAt', 'harness', 'lastContactAt', 'stale', 'startedAt', 'title', 'workStatus'];
const RESPONSE_KEYS = new Set(['owner', 'handle', 'projects', 'name', 'agents', 'runs', ...RUN_KEYS]);

describe('public agents page', () => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  let db: AppDatabase;
  let app: FastifyInstance;
  let spaRoot = '';
  let address = 30;
  let weatherId = '';
  let toggleId = '';

  const hit = (url: string, headers: Record<string, string> = {}, remoteAddress = `198.51.100.${address++ % 200 + 1}`) => app.inject({
    method: 'GET', url, headers, remoteAddress,
  });
  function call(method: 'POST' | 'PATCH', url: string, userId: string, body: unknown) {
    return app.inject({
      method, url, payload: JSON.stringify(body),
      headers: { 'x-test-user-id': userId, 'content-type': 'application/json' },
      remoteAddress: `198.51.100.${address++ % 200 + 1}`,
    });
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
    db = createDb(pool);
    await runMigrations(pool, migrationsDir);
    await db.insert(users).values([
      { id: ada, email: 'sentinel-owner@example.test', displayName: 'SENTINEL_OWNER_NAME', emailVerified: true, publicHandle: 'ada-bot' },
      { id: bea, email: 'bea@example.test', displayName: 'Bea', emailVerified: true, publicHandle: 'bea-bot' },
      { id: 'user-quiet', email: 'quiet@example.test', displayName: 'Quiet', emailVerified: true, publicHandle: 'quiet-one' },
      { id: 'user-cap', email: 'cap@example.test', displayName: 'Cap', emailVerified: true, publicHandle: 'cap-runs' },
      { id: 'user-fresh', email: 'fresh@example.test', displayName: 'Fresh', emailVerified: true },
      { id: 'user-closer', email: 'closer@example.test', displayName: 'Closer', emailVerified: true, publicHandle: 'closer-page' },
    ]);
    const base = { description: 'SENTINEL_DESCRIPTION', type: 'coding' as const, lifecycle: 'active' as const, repositoryName: 'SENTINEL_REPO', repositoryUrl: 'https://example.com/SENTINEL_REPO', prdUrl: 'https://example.com/SENTINEL_PRD', tags: ['SENTINEL_TAG'], staleThresholdMinutes: 15, heartbeatExpected: true, reportingInstructions: 'SENTINEL_INSTRUCTIONS' };
    const weather = await projectsRepo.createProject(db, accessAda, { ...base, name: 'Weather', isPublic: true });
    weatherId = weather.id;
    const hidden = await projectsRepo.createProject(db, accessAda, { ...base, name: 'Secret', isPublic: false });
    const archived = await projectsRepo.createProject(db, accessAda, { ...base, name: 'Old public', lifecycle: 'archived', isPublic: true });
    const empty = await projectsRepo.createProject(db, accessAda, { ...base, name: 'Empty public', isPublic: true });
    const toggle = await projectsRepo.createProject(db, accessAda, { ...base, name: 'Toggle me', isPublic: true });
    toggleId = toggle.id;
    const other = await projectsRepo.createProject(db, accessBea, { ...base, name: 'Weather', isPublic: true });
    const closer = await projectsRepo.createProject(db, { kind: 'user', userId: 'user-closer' }, { ...base, name: 'Closer project', isPublic: true });
    const cap = await projectsRepo.createProject(db, { kind: 'user', userId: 'user-cap' }, { ...base, name: 'Bulk', isPublic: true });
    expect(archived.id).toBeTruthy();
    expect(empty.id).toBeTruthy();
    const worker = await agentsRepo.createAgent(db, accessAda, weather.id, { name: 'worker', title: 'SENTINEL_AGENT_TITLE', workloadType: 'coding' });
    await agentsRepo.createAgent(db, accessAda, weather.id, { name: 'idle', title: 'Idle title', workloadType: 'coding' });
    const secretAgent = await agentsRepo.createAgent(db, accessAda, hidden.id, { name: 'worker', title: 'Secret agent', workloadType: 'coding' });
    const otherAgent = await agentsRepo.createAgent(db, accessBea, other.id, { name: 'worker', title: 'Other agent', workloadType: 'coding' });
    const closerAgent = await agentsRepo.createAgent(db, { kind: 'user', userId: 'user-closer' }, closer.id, { name: 'closer', title: 'Closer', workloadType: 'coding' });
    const capAgent = await agentsRepo.createAgent(db, { kind: 'user', userId: 'user-cap' }, cap.id, { name: 'bulk', title: 'Bulk', workloadType: 'coding' });
    const live = await runsRepo.createRun(db, accessAda, weather.id, { agentId: worker.id, title: 'Status run', workloadType: 'coding', harness: 'cursor' });
    const stale = await runsRepo.createRun(db, accessAda, weather.id, { agentId: worker.id, title: 'Quiet run', workloadType: 'coding', harness: 'cursor' });
    const ended = await runsRepo.createRun(db, accessAda, weather.id, { agentId: worker.id, title: 'Ended run', workloadType: 'coding', harness: 'cursor' });
    const secretRun = await runsRepo.createRun(db, accessAda, hidden.id, { agentId: secretAgent.id, title: 'SENTINEL_PRIVATE_RUN', workloadType: 'coding' });
    await runsRepo.createRun(db, accessBea, other.id, { agentId: otherAgent.id, title: 'SENTINEL_OTHER_OWNER', workloadType: 'coding' });
    await runsRepo.createRun(db, { kind: 'user', userId: 'user-closer' }, closer.id, { agentId: closerAgent.id, title: 'Closer run', workloadType: 'coding' });
    await pool.query(`UPDATE runs SET message = 'SENTINEL_MESSAGE', model = 'SENTINEL_MODEL', task_id = 'SENTINEL_TASK', completion_summary = 'SENTINEL_SUMMARY', last_contact_at = now() WHERE id = $1`, [live.id]);
    await pool.query(`UPDATE runs SET message = 'SENTINEL_MESSAGE', last_contact_at = now() - interval '2 hours' WHERE id = $1`, [stale.id]);
    await pool.query(`UPDATE runs SET execution_state = 'finished', work_status = 'completed', finished_at = started_at, message = 'SENTINEL_MESSAGE', last_contact_at = now() - interval '3 hours' WHERE id = $1`, [ended.id]);
    await pool.query(`INSERT INTO pull_request_refs (run_id, number, title, url, repository_name, "primary") VALUES ($1, 4, 'SENTINEL_PR', 'https://example.com/SENTINEL_PR', 'SENTINEL_REPO', true)`, [live.id]);
    await pool.query(`INSERT INTO tool_usage_aggregates (run_id, name, source, call_count, coverage) VALUES ($1, 'SENTINEL_TOOL', 'shell', 2, 'self_reported')`, [live.id]);
    await pool.query(`INSERT INTO next_steps (project_id, position, instruction, source_run_id) VALUES ($1, 0, 'SENTINEL_STEP', $2)`, [weather.id, live.id]);
    await pool.query(`INSERT INTO waiting_notes (project_id, text, source_run_id) VALUES ($1, 'SENTINEL_WAITING', $2)`, [weather.id, live.id]);
    await pool.query(`INSERT INTO private_notes (project_id, text) VALUES ($1, 'SENTINEL_NOTE')`, [weather.id]);
    await pool.query(`INSERT INTO runs (project_id, agent_id, title, workload_type, last_contact_at, started_at)
      SELECT $1, $2, 'Run ' || i::text, 'coding', now() - make_interval(mins => i), now() - make_interval(mins => i)
      FROM generate_series(0, 200) AS i`, [cap.id, capAgent.id]);
    expect(secretRun.id).toBeTruthy();
    spaRoot = mkdtempSync(path.join(tmpdir(), 'supa-public-'));
    writeFileSync(path.join(spaRoot, 'index.html'), '<!doctype html><title>spa</title>');
    app = await buildApp({
      config: loadConfig({
        DATABASE_URL: scratch.connectionString, PUBLIC_URL: origin, NODE_ENV: 'test', TRUST_PROXY_HOPS: '2',
        ADMIN_EMAIL: 'visitor@example.test',
      }),
      pool, migrationsDir, spaRoot, logger: false,
    });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await scratch?.drop();
    if (spaRoot) rmSync(spaRoot, { recursive: true, force: true });
  });

  function assertShape(body: { owner: object; projects: { name: string; agents: { name: string; runs: object[] }[] }[] }) {
    expect(Object.keys(body).sort()).toEqual(['owner', 'projects']);
    expect(Object.keys(body.owner).sort()).toEqual(['handle']);
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) { keys.add(key); walk(child); }
    };
    walk(body);
    expect([...keys].filter((key) => !RESPONSE_KEYS.has(key))).toEqual([]);
    for (const project of body.projects) {
      expect(Object.keys(project).sort()).toEqual(['agents', 'name']);
      for (const agent of project.agents) {
        expect(Object.keys(agent).sort()).toEqual(['name', 'runs']);
        for (const run of agent.runs) expect(Object.keys(run).sort()).toEqual(RUN_KEYS);
      }
    }
  }

  it('returns only the allowlisted status fields for that owner', async () => {
    const response = await hit('/api/public/ada-bot/agents');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json();
    assertShape(body);
    expect(body.owner).toEqual({ handle: 'ada-bot' });
    expect(body.projects.map((project: { name: string }) => project.name)).toEqual(['Empty public', 'Toggle me', 'Weather']);
    const weather = body.projects.find((project: { name: string }) => project.name === 'Weather');
    expect(weather.agents.map((agent: { name: string }) => agent.name)).toEqual(['idle', 'worker']);
    expect(weather.agents[0].runs).toEqual([]);
    const runs = weather.agents[1].runs;
    expect(runs.map((run: { title: string; stale: boolean }) => [run.title, run.stale])).toEqual([
      ['Status run', false],
      ['Quiet run', true],
      ['Ended run', false],
    ]);
    expect(runs[0]).toMatchObject({ executionState: 'running', workStatus: 'in_progress', harness: 'cursor', finishedAt: null });
    expect(runs[2]).toMatchObject({ executionState: 'finished', workStatus: 'completed', stale: false });
    expect(runs[2].finishedAt).toEqual(expect.any(String));
    const serialized = response.body;
    for (const sentinel of ['SENTINEL_', 'sentinel-owner', 'secret', 'Old public', 'task_id', 'completionSummary', 'publicHandle', 'repository']) {
      expect(serialized.toLowerCase()).not.toContain(sentinel.toLowerCase());
    }
    const folded = await hit('/api/public/ADA-BOT/agents');
    expect(folded.statusCode).toBe(200);
    expect(folded.body).toBe(response.body);
  });

  it('hides another owner, a private project, and an archived public project', async () => {
    const adaPage = await hit('/api/public/ada-bot/agents');
    const beaPage = await hit('/api/public/bea-bot/agents');
    expect(beaPage.statusCode).toBe(200);
    expect(beaPage.body).toContain('SENTINEL_OTHER_OWNER');
    expect(adaPage.body).not.toContain('SENTINEL_OTHER_OWNER');
    expect(adaPage.body).not.toContain('SENTINEL_PRIVATE_RUN');
    expect(adaPage.body).not.toContain('Old public');
    expect(beaPage.json().projects).toEqual([expect.objectContaining({ name: 'Weather' })]);
    expect(beaPage.json().owner).toEqual({ handle: 'bea-bot' });
  });

  it('uses one 404 body for an unknown handle, a handle with nothing public, and a malformed handle', async () => {
    const unknown = await hit('/api/public/missing-handle/agents');
    const quiet = await hit('/api/public/quiet-one/agents');
    const malformed = await hit('/api/public/NO/agents');
    const padded = await hit('/api/public/ada_bot/agents');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.body).toBe(quiet.body);
    expect(unknown.body).toBe(malformed.body);
    expect(unknown.body).toBe(padded.body);
    expect(unknown.json()).toEqual({ error: { code: errorCodes.not_found, message: 'Not found' } });
    expect(unknown.headers['cache-control']).toBe('no-store');
    expect(unknown.body).not.toContain('Quiet');
    expect(unknown.body).not.toContain('ada');
  });

  it('serves the same body with no cookie and with another user session', async () => {
    const password = 'visitor-password-unique-123!';
    const signedUp = await app.inject({
      method: 'POST', url: '/api/auth/sign-up/email', remoteAddress: '203.0.113.40',
      headers: { origin }, payload: { name: 'Visitor', email: 'visitor@example.test', password },
    });
    expect(signedUp.statusCode).toBe(200);
    const mail = [...app.browserAuth!.email.captured].reverse().find((item: Email) => item.to === 'visitor@example.test' && item.subject === 'Verify your email');
    const token = new URL(mail!.text.split(' ').at(-1)!).searchParams.get('token');
    expect((await app.inject({ method: 'GET', url: `/api/auth/verify-email?token=${encodeURIComponent(token!)}`, remoteAddress: '203.0.113.41' })).statusCode).toBe(200);
    const signedIn = await app.inject({
      method: 'POST', url: '/api/auth/sign-in/email', remoteAddress: '203.0.113.42',
      headers: { origin }, payload: { email: 'visitor@example.test', password },
    });
    expect(signedIn.statusCode).toBe(200);
    const raw = signedIn.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw : [raw]).filter((value): value is string => typeof value === 'string').map((value) => value.split(';')[0]).join('; ');
    expect(cookie).toMatch(/=/);
    const open = await hit('/api/public/ada-bot/agents', {}, '203.0.113.43');
    const authed = await hit('/api/public/ada-bot/agents', { cookie, authorization: 'Bearer sat_not_a_token' }, '203.0.113.44');
    expect(open.statusCode).toBe(200);
    expect(authed.statusCode).toBe(200);
    expect(authed.body).toBe(open.body);
    expect((await app.inject({ method: 'GET', url: '/api/account', headers: { cookie }, remoteAddress: '203.0.113.45' })).statusCode).toBe(200);
  });

  it('rejects a bad handle at the API, treats case-only duplicates as taken, and replays the write', async () => {
    for (const publicHandle of ['ab', 'nope!', '-ada', 'ada-', 'a'.repeat(33), '']) {
      const bad = await call('PATCH', '/api/account', 'user-fresh', { publicHandle, request_id: `bad-${publicHandle.length}-${publicHandle.slice(0, 3)}` });
      expect(bad.statusCode, publicHandle).toBe(400);
      expect(bad.json()).toMatchObject({ error: { code: errorCodes.validation_error } });
    }
    const taken = await call('PATCH', '/api/account', 'user-fresh', { publicHandle: 'ADA-BOT', request_id: 'take-ada' });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: { code: errorCodes.conflict, message: 'That public handle is already taken' } });
    expect(taken.body).not.toContain('sentinel-owner');
    const saved = await call('PATCH', '/api/account', 'user-fresh', { publicHandle: ' Fresh-One ', request_id: 'set-fresh' });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ id: 'user-fresh', publicHandle: 'fresh-one' });
    const replay = await call('PATCH', '/api/account', 'user-fresh', { publicHandle: 'fresh-one', request_id: 'set-fresh' });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(saved.json());
    const mismatch = await call('PATCH', '/api/account', 'user-fresh', { publicHandle: 'other-one', request_id: 'set-fresh' });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json()).toMatchObject({ error: { code: errorCodes.idempotency_mismatch } });
    const account = await app.inject({ method: 'GET', url: '/api/account', headers: { 'x-test-user-id': 'user-fresh' }, remoteAddress: '198.51.100.250' });
    expect(account.json()).toMatchObject({ publicHandle: 'fresh-one' });
  });

  it('drops a project when it is no longer public and 404s when the handle is cleared', async () => {
    const before = await hit('/api/public/ada-bot/agents');
    expect(before.body).toContain('Toggle me');
    const hidden = await call('PATCH', `/api/projects/${toggleId}`, ada, { isPublic: false, expected_revision: 1, request_id: 'hide-toggle' });
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json()).toMatchObject({ isPublic: false, name: 'Toggle me' });
    const after = await hit('/api/public/ada-bot/agents');
    expect(after.statusCode).toBe(200);
    expect(after.body).not.toContain('Toggle me');
    const created = await call('POST', '/api/projects', ada, {
      name: 'Created private', description: '', type: 'automation', lifecycle: 'active', repositoryName: null, repositoryUrl: null, prdUrl: null, tags: [],
      reportingPolicy: { staleThresholdMinutes: 15, heartbeatExpected: false, instructions: '' }, request_id: 'create-private-default',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ isPublic: false });
    const closerPage = await hit('/api/public/closer-page/agents');
    expect(closerPage.statusCode).toBe(200);
    const cleared = await call('PATCH', '/api/account', 'user-closer', { publicHandle: null, request_id: 'clear-closer' });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toMatchObject({ publicHandle: null });
    const gone = await hit('/api/public/closer-page/agents');
    const unknown = await hit('/api/public/missing-handle/agents');
    expect(gone.statusCode).toBe(404);
    expect(gone.body).toBe(unknown.body);
    expect(weatherId).toBeTruthy();
  });

  it('keeps at most the 200 most recently contacted runs', async () => {
    const response = await hit('/api/public/cap-runs/agents');
    expect(response.statusCode).toBe(200);
    const body = response.json();
    assertShape(body);
    const runs = body.projects[0].agents[0].runs as { title: string }[];
    expect(runs).toHaveLength(200);
    expect(runs[0]?.title).toBe('Run 0');
    expect(runs.some((run) => run.title === 'Run 200')).toBe(false);
    expect(runs.at(-1)?.title).toBe('Run 199');
  });

  it('limits each client IP and ignores a spoofed X-Forwarded-For', async () => {
    const edge = '10.0.0.8';
    const proxy = '10.0.0.5';
    const real = '203.0.113.10';
    const other = '203.0.113.20';
    const once = (forwarded: string) => app.inject({
      method: 'GET', url: '/api/public/missing-handle/agents', remoteAddress: edge, headers: { 'x-forwarded-for': forwarded },
    });
    for (let i = 0; i < 60; i += 1) expect((await once(`${real}, ${proxy}`)).statusCode).toBe(404);
    const limited = await once(`${real}, ${proxy}`);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.headers['retry-after']).toBe('60');
    expect(limited.json()).toEqual({ error: { code: errorCodes.rate_limited, message: 'Too many requests' } });
    expect((await once(`1.2.3.4, ${real}, ${proxy}`)).statusCode).toBe(429);
    expect((await once(`${other}, ${proxy}`)).statusCode).toBe(404);
  });
});
