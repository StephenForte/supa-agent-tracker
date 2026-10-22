import { createHash } from 'node:crypto';
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
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { readPublicProfile, type PublicProfile } from './profile.js';
import { activityWindow, harnessWindow } from './stats.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = Buffer.alloc(12);
WEBP.write('RIFF', 0, 'ascii');
WEBP.write('WEBP', 8, 'ascii');
const NOON = new Date('2026-10-21T18:00:00.000Z');
const PROFILE_KEYS = new Set(['owner', 'handle', 'name', 'bio', 'links', 'github', 'x', 'linkedin', 'joinedAt', 'avatarUrl', 'stats', 'agentRuns', 'longestRunSeconds', 'currentStreakDays', 'longestStreakDays', 'activity', 'start', 'end', 'counts', 'harnesses', 'series', 'harness']);
const emptyProfile = { name: null, bio: null, github: null, x: null, linkedin: null, timezone: 'UTC' };

describe('public profile', () => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  let db: AppDatabase;
  let app: FastifyInstance;
  let spaRoot = '';
  let octet = 20;
  let streakProject = '';
  let streakAgent = '';
  let avatarProject = '';
  const accessStreak: UserAccess = { kind: 'user', userId: 'user-streak' };
  const nextIp = () => `198.51.100.${octet++}`;
  const base = { description: '', type: 'coding' as const, lifecycle: 'active' as const, repositoryName: null, repositoryUrl: null, prdUrl: null, tags: [] as string[], staleThresholdMinutes: 15, heartbeatExpected: false, reportingInstructions: '' };

  function hit(url: string, headers: Record<string, string> = {}, remoteAddress = nextIp()) {
    return app.inject({ method: 'GET', url, headers, remoteAddress });
  }
  function call(method: 'PATCH' | 'DELETE', url: string, userId: string, body?: unknown) {
    return app.inject({
      method, url, payload: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'x-test-user-id': userId, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      remoteAddress: nextIp(),
    });
  }
  function putImage(userId: string, type: string, body: Buffer, extra: Record<string, string> = {}) {
    return app.inject({
      method: 'PUT', url: '/api/account/avatar', payload: body, remoteAddress: nextIp(),
      headers: { 'content-type': type, ...extra, ...(extra.authorization ? {} : { 'x-test-user-id': userId }) },
    });
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
    db = createDb(pool);
    await runMigrations(pool, migrationsDir);
    async function makeOwner(id: string, handle: string, name: string, email = `${id}@example.test`) {
      const access: UserAccess = { kind: 'user', userId: id };
      await db.insert(users).values({ id, email, displayName: name, emailVerified: true, publicHandle: handle });
      const project = await projectsRepo.createProject(db, access, { ...base, name: `${handle} public`, isPublic: true });
      const agent = await agentsRepo.createAgent(db, access, project.id, { name: 'worker', title: 'Worker', workloadType: 'coding' });
      return { access, projectId: project.id, agentId: agent.id };
    }
    const streak = await makeOwner('user-streak', 'streak-one', 'SENTINEL_DISPLAY', 'sentinel-streak@example.test');
    streakProject = streak.projectId;
    streakAgent = streak.agentId;
    const harness = await makeOwner('user-harness', 'harness-one', 'Harness');
    const gap = await makeOwner('user-gap', 'gap-owner', 'Gap');
    const bulk = await makeOwner('user-bulk', 'bulk-owner', 'Bulk');
    const zone = await makeOwner('user-zone', 'zone-owner', 'Zone');
    const avatar = await makeOwner('user-avatar', 'avatar-one', 'Avatar');
    avatarProject = avatar.projectId;
    await db.insert(users).values({ id: 'user-quiet', email: 'quiet@example.test', displayName: 'Quiet', emailVerified: true, publicHandle: 'quiet-page' });
    await db.insert(users).values({ id: 'user-forms', email: 'forms@example.test', displayName: 'Forms', emailVerified: true });
    expect(zone.projectId).toBeTruthy();

    async function finished(title: string, start: string, end: string, parentRunId?: string) {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO runs (project_id, agent_id, title, workload_type, harness, parent_run_id, started_at, finished_at, last_contact_at, execution_state, work_status)
         VALUES ($1, $2, $3, 'coding', 'cursor', $4, $5, $6, $6, 'finished', 'completed')
         RETURNING id`,
        [streakProject, streakAgent, title, parentRunId ?? null, start, end],
      );
      return inserted.rows[0]!.id;
    }
    for (const day of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-20']) {
      await finished(day, `${day}T12:00:00.000Z`, `${day}T12:00:10.000Z`);
    }
    const running = await pool.query<{ id: string }>(
      `INSERT INTO runs (project_id, agent_id, title, workload_type, harness, started_at, last_contact_at, execution_state, work_status)
       VALUES ($1, $2, 'still going', 'coding', 'cursor', '2026-10-21T12:00:00.000Z', '2026-10-21T12:02:05.000Z', 'running', 'in_progress')
       RETURNING id`,
      [streakProject, streakAgent],
    );
    await finished('child run', '2026-10-21T15:00:00.000Z', '2026-10-21T15:00:10.000Z', running.rows[0]!.id);

    async function addMany(projectId: string, agentId: string, count: number, harnessName: string | null, at: string) {
      await pool.query(
        `INSERT INTO runs (project_id, agent_id, title, workload_type, harness, started_at, finished_at, last_contact_at, execution_state, work_status)
         SELECT $1, $2, 'h' || i::text, 'coding', $3, $4::timestamptz, $4::timestamptz, $4::timestamptz, 'finished', 'completed'
         FROM generate_series(1, $5::int) AS i`,
        [projectId, agentId, harnessName, at, count],
      );
    }
    const today = '2026-10-21T18:00:00.000Z';
    await addMany(harness.projectId, harness.agentId, 6, null, today);
    await addMany(harness.projectId, harness.agentId, 5, 'alpha', today);
    await addMany(harness.projectId, harness.agentId, 5, 'bravo', today);
    await addMany(harness.projectId, harness.agentId, 4, 'charlie', today);
    await addMany(harness.projectId, harness.agentId, 3, 'delta', today);
    await addMany(harness.projectId, harness.agentId, 2, 'echo', today);
    await addMany(harness.projectId, harness.agentId, 1, 'foxtrot', today);
    await addMany(gap.projectId, gap.agentId, 1, 'cursor', '2026-10-18T12:00:00.000Z');
    await addMany(gap.projectId, gap.agentId, 1, 'cursor', '2026-10-19T12:00:00.000Z');
    await addMany(bulk.projectId, bulk.agentId, 40, 'cursor', today);

    spaRoot = mkdtempSync(path.join(tmpdir(), 'supa-profile-'));
    writeFileSync(path.join(spaRoot, 'index.html'), '<!doctype html><title>spa</title>');
    app = await buildApp({
      config: loadConfig({
        DATABASE_URL: scratch.connectionString, PUBLIC_URL: 'http://127.0.0.1:3000', NODE_ENV: 'test', TRUST_PROXY_HOPS: '0',
        ADMIN_EMAIL: 'admin@example.test',
      }),
      pool, migrationsDir, spaRoot, logger: false,
    });
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await scratch?.drop();
    if (spaRoot) rmSync(spaRoot, { recursive: true, force: true });
  });

  function assertExact(body: PublicProfile) {
    expect(Object.keys(body).sort()).toEqual(['activity', 'harnesses', 'owner', 'stats']);
    expect(Object.keys(body.owner).sort()).toEqual(['avatarUrl', 'bio', 'handle', 'joinedAt', 'links', 'name']);
    expect(Object.keys(body.owner.links).sort()).toEqual(['github', 'linkedin', 'x']);
    expect(Object.keys(body.stats).sort()).toEqual(['agentRuns', 'currentStreakDays', 'longestRunSeconds', 'longestStreakDays']);
    expect(Object.keys(body.activity).sort()).toEqual(['counts', 'end', 'start']);
    expect(Object.keys(body.harnesses).sort()).toEqual(['end', 'series', 'start']);
    for (const series of body.harnesses.series) expect(Object.keys(series).sort()).toEqual(['counts', 'harness']);
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) { keys.add(key); walk(child); }
    };
    walk(body);
    expect([...keys].filter((key) => !PROFILE_KEYS.has(key))).toEqual([]);
  }

  async function captured(run: () => Promise<void>): Promise<string[]> {
    const texts: string[] = [];
    const connect = pool.connect.bind(pool);
    const query = pool.query.bind(pool);
    const wrapped = new WeakSet<pg.PoolClient>();
    const record = (value: unknown) => {
      if (typeof value === 'string') texts.push(value);
      else if (typeof value === 'object' && value !== null && 'text' in value) texts.push(String((value as { text: unknown }).text));
    };
    const wrap = (client: pg.PoolClient) => {
      if (wrapped.has(client)) return client;
      wrapped.add(client);
      const clientQuery = client.query.bind(client);
      client.query = ((...qargs: unknown[]) => {
        record(qargs[0]);
        return (clientQuery as (...inner: unknown[]) => unknown)(...qargs);
      }) as typeof client.query;
      return client;
    };
    pool.query = ((...args: unknown[]) => {
      record(args[0]);
      return (query as (...inner: unknown[]) => unknown)(...args);
    }) as typeof pool.query;
    pool.connect = ((...args: unknown[]) => {
      if (typeof args.at(-1) === 'function') return (connect as (...inner: unknown[]) => unknown)(...args);
      return (connect as (...inner: unknown[]) => Promise<pg.PoolClient>)(...args).then((client) => wrap(client));
    }) as typeof pool.connect;
    try {
      await run();
      return texts;
    } finally {
      pool.query = query;
      pool.connect = connect;
    }
  }

  it('counts this owner\'s private and archived runs, and still ignores other owners', async () => {
    const page = await readPublicProfile(db, 'streak-one', NOON);
    expect(page).not.toBeNull();
    assertExact(page!);
    expect(page!.stats).toEqual({ agentRuns: 8, longestRunSeconds: 125, currentStreakDays: 2, longestStreakDays: 5 });
    expect(page!.activity.end).toBe('2026-10-21');
    expect(page!.activity.start).toBe('2026-10-15');
    expect(page!.activity.counts).toHaveLength(7);
    const dates = activityWindow(NOON, 'UTC', new Date(page!.owner.joinedAt)).dates;
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2026-10-15');
    expect(dates).not.toContain('2026-10-01');
    expect(page!.activity.counts[dates.indexOf('2026-10-21')]).toBe(2);
    expect(page!.activity.counts[dates.indexOf('2026-10-20')]).toBe(1);
    expect(page!.activity.counts[dates.indexOf('2026-10-19')]).toBe(0);
    expect(page!.activity.counts[dates.indexOf('2026-10-18')]).toBe(0);
    expect(page!.activity.counts.reduce((sum, count) => sum + count, 0)).toBe(3);
    expect(page!.owner.name).toBeNull();
    expect(page!.owner.avatarUrl).toBeNull();
    const harnessDates = harnessWindow(NOON, 'UTC').dates;
    expect(page!.harnesses.series.map((series) => series.harness)).toEqual(['cursor']);
    const beforeHarness = page!.harnesses.series[0]!.counts;
    expect(beforeHarness).toHaveLength(30);
    expect(beforeHarness.reduce((sum, count) => sum + count, 0)).toBe(8);

    const agentsBefore = await hit('/api/public/streak-one/agents');
    expect(agentsBefore.statusCode).toBe(200);

    const hidden = await projectsRepo.createProject(db, accessStreak, { ...base, name: 'Secret', isPublic: false });
    const hiddenAgent = await agentsRepo.createAgent(db, accessStreak, hidden.id, { name: 'worker', title: 'Hidden', workloadType: 'coding' });
    const archived = await projectsRepo.createProject(db, accessStreak, { ...base, name: 'Old', lifecycle: 'archived', isPublic: true });
    const archivedAgent = await agentsRepo.createAgent(db, accessStreak, archived.id, { name: 'worker', title: 'Old', workloadType: 'coding' });
    const otherAccess: UserAccess = { kind: 'user', userId: 'user-bea' };
    await db.insert(users).values({ id: 'user-bea', email: 'bea@example.test', displayName: 'Bea', emailVerified: true, publicHandle: 'bea-owner' });
    const other = await projectsRepo.createProject(db, otherAccess, { ...base, name: 'Theirs', isPublic: true });
    const otherAgent = await agentsRepo.createAgent(db, otherAccess, other.id, { name: 'worker', title: 'Other', workloadType: 'coding' });
    async function addRun(projectId: string, agentId: string, title: string, start: string, end: string) {
      await pool.query(
        `INSERT INTO runs (project_id, agent_id, title, workload_type, harness, started_at, finished_at, last_contact_at, execution_state, work_status)
         VALUES ($1, $2, $3, 'coding', 'cursor', $4, $5, $5, 'finished', 'completed')`,
        [projectId, agentId, title, start, end],
      );
    }
    await addRun(hidden.id, hiddenAgent.id, 'PRIVATE_SENTINEL', '2026-10-19T12:00:00.000Z', '2026-10-19T12:10:00.000Z');
    await addRun(archived.id, archivedAgent.id, 'ARCHIVED_SENTINEL', '2026-10-18T12:00:00.000Z', '2026-10-18T12:00:10.000Z');
    await addRun(archived.id, archivedAgent.id, 'ARCHIVED_EARLIER', '2026-09-30T12:00:00.000Z', '2026-09-30T12:00:10.000Z');
    await addRun(other.id, otherAgent.id, 'OTHER_SENTINEL', '2026-10-21T16:00:00.000Z', '2026-10-21T16:30:00.000Z');

    const after = await readPublicProfile(db, 'streak-one', NOON);
    expect(after).not.toBeNull();
    assertExact(after!);
    expect(after!.stats).toEqual({ agentRuns: 11, longestRunSeconds: 600, currentStreakDays: 4, longestStreakDays: 6 });
    expect(after!.activity.start).toBe('2026-10-15');
    expect(after!.activity.end).toBe('2026-10-21');
    expect(after!.activity.counts[dates.indexOf('2026-10-19')]).toBe(1);
    expect(after!.activity.counts[dates.indexOf('2026-10-18')]).toBe(1);
    expect(after!.activity.counts[dates.indexOf('2026-10-21')]).toBe(2);
    expect(after!.activity.counts[dates.indexOf('2026-10-20')]).toBe(1);
    expect(after!.activity.counts.reduce((sum, count) => sum + count, 0)).toBe(5);
    const afterHarness = after!.harnesses.series[0]!.counts;
    expect(after!.harnesses.series.map((series) => series.harness)).toEqual(['cursor']);
    expect(afterHarness).toHaveLength(30);
    expect(afterHarness[harnessDates.indexOf('2026-10-19')]! - beforeHarness[harnessDates.indexOf('2026-10-19')]!).toBe(1);
    expect(afterHarness[harnessDates.indexOf('2026-10-18')]! - beforeHarness[harnessDates.indexOf('2026-10-18')]!).toBe(1);
    expect(afterHarness[harnessDates.indexOf('2026-09-30')]! - beforeHarness[harnessDates.indexOf('2026-09-30')]!).toBe(1);
    expect(afterHarness.reduce((sum, count) => sum + count, 0)).toBe(11);

    const agentsAfter = await hit('/api/public/streak-one/agents');
    expect(agentsAfter.statusCode).toBe(200);
    expect(agentsAfter.body).toBe(agentsBefore.body);

    const http = await hit('/api/public/streak-one/profile');
    expect(http.statusCode).toBe(200);
    expect(http.headers['cache-control']).toBe('no-store');
    for (const sentinel of ['PRIVATE_SENTINEL', 'ARCHIVED_SENTINEL', 'ARCHIVED_EARLIER', 'OTHER_SENTINEL', 'SENTINEL_DISPLAY', 'sentinel-streak', 'user-streak', 'Secret', 'Old', 'Theirs', hidden.id, archived.id, other.id]) {
      expect(http.body).not.toContain(sentinel);
      expect(agentsAfter.body).not.toContain(sentinel);
    }
  });

  it('folds stored Cursor and cursor spellings into one Cursor series and leaves runs.harness unchanged', async () => {
    const access: UserAccess = { kind: 'user', userId: 'user-fold' };
    await db.insert(users).values({ id: 'user-fold', email: 'fold@example.test', displayName: 'Fold', emailVerified: true, publicHandle: 'fold-one' });
    const project = await projectsRepo.createProject(db, access, { ...base, name: 'fold public', isPublic: true });
    const agent = await agentsRepo.createAgent(db, access, project.id, { name: 'worker', title: 'Worker', workloadType: 'coding' });
    async function addMany(count: number, harnessName: string, at: string) {
      await pool.query(
        `INSERT INTO runs (project_id, agent_id, title, workload_type, harness, started_at, finished_at, last_contact_at, execution_state, work_status)
         SELECT $1, $2, 'h' || i::text, 'coding', $3, $4::timestamptz, $4::timestamptz, $4::timestamptz, 'finished', 'completed'
         FROM generate_series(1, $5::int) AS i`,
        [project.id, agent.id, harnessName, at, count],
      );
    }
    await addMany(10, 'Cursor', '2026-10-20T12:00:00.000Z');
    await addMany(3, 'Cursor', '2026-10-21T12:00:00.000Z');
    await addMany(5, 'cursor', '2026-10-21T15:00:00.000Z');

    const page = await readPublicProfile(db, 'fold-one', NOON);
    expect(page).not.toBeNull();
    assertExact(page!);
    const dates = harnessWindow(NOON, 'UTC').dates;
    expect(page!.harnesses.series.map((series) => series.harness)).toEqual(['Cursor']);
    const counts = page!.harnesses.series[0]!.counts;
    expect(counts).toHaveLength(30);
    expect(counts[dates.indexOf('2026-10-20')]).toBe(10);
    expect(counts[dates.indexOf('2026-10-21')]).toBe(8);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(18);
    expect(page!.stats.agentRuns).toBe(18);

    const stored = await pool.query<{ harness: string }>(
      `SELECT DISTINCT harness FROM runs WHERE project_id = $1 ORDER BY harness`,
      [project.id],
    );
    expect(stored.rows.map((row) => row.harness).sort()).toEqual(['Cursor', 'cursor']);
  });

  it('ranks six harnesses as four names plus Other and labels a null harness Unknown', () => {
    return readPublicProfile(db, 'harness-one', NOON).then((page) => {
      expect(page).not.toBeNull();
      assertExact(page!);
      expect(page!.harnesses.end).toBe('2026-10-21');
      expect(page!.harnesses.series.map((series) => series.harness)).toEqual(['Unknown', 'alpha', 'bravo', 'charlie', 'Other']);
      expect(page!.harnesses.series.every((series) => series.counts.length === 30)).toBe(true);
      const last = 29;
      expect(page!.harnesses.series.map((series) => series.counts[last])).toEqual([6, 5, 5, 4, 6]);
      expect(page!.stats.agentRuns).toBe(26);
    });
  });

  it('drops the current streak to 0 after a missed day', async () => {
    const page = await readPublicProfile(db, 'gap-owner', NOON);
    expect(page?.stats).toEqual({ agentRuns: 2, longestRunSeconds: 0, currentStreakDays: 0, longestStreakDays: 2 });
    expect(page?.activity.start).toBe('2026-10-15');
    expect(page?.activity.counts).toHaveLength(7);
    expect(page?.activity.end).toBe('2026-10-21');
  });

  it('buckets 2026-10-21T06:30Z on Oct 20 in Los Angeles and Oct 21 in UTC, and sizes a new account to 7 days', async () => {
    const saved = await call('PATCH', '/api/account', 'user-zone', {
      publicProfile: { ...emptyProfile, timezone: 'America/Los_Angeles' }, request_id: 'zone-la',
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().publicProfile.timezone).toBe('America/Los_Angeles');
    const project = (await pool.query<{ id: string }>(`SELECT id FROM projects WHERE owner_id = 'user-zone' AND is_public = true`)).rows[0]!.id;
    const agent = (await pool.query<{ id: string }>(`SELECT id FROM agents WHERE project_id = $1`, [project])).rows[0]!.id;
    await pool.query(
      `INSERT INTO runs (project_id, agent_id, title, workload_type, started_at, finished_at, last_contact_at, execution_state, work_status)
       VALUES ($1, $2, 'boundary', 'coding', '2026-10-21T06:30:00.000Z', '2026-10-21T06:30:00.000Z', '2026-10-21T06:30:00.000Z', 'finished', 'completed')`,
      [project, agent],
    );
    const la = await readPublicProfile(db, 'zone-owner', NOON);
    const laDates = activityWindow(NOON, 'America/Los_Angeles', new Date(la!.owner.joinedAt)).dates;
    expect(la?.activity.end).toBe('2026-10-21');
    expect(la?.activity.start).toBe('2026-10-15');
    expect(la?.activity.counts).toHaveLength(7);
    expect(laDates).toHaveLength(7);
    expect(la?.activity.counts[laDates.indexOf('2026-10-20')]).toBe(1);
    expect(la?.activity.counts[laDates.indexOf('2026-10-21')]).toBe(0);
    expect(la?.stats.currentStreakDays).toBe(1);
    expect(la?.stats.agentRuns).toBe(1);

    const march = new Date('2026-03-10T12:00:00.000Z');
    const dst = await readPublicProfile(db, 'zone-owner', march);
    expect(dst?.activity.end).toBe('2026-03-10');
    expect(dst?.activity.start).toBe('2026-03-04');
    expect(dst?.activity.counts).toHaveLength(7);
    expect(dst?.activity.counts.every((count) => count === 0)).toBe(true);
    expect(dst?.stats).toEqual({ agentRuns: 1, longestRunSeconds: 0, currentStreakDays: 0, longestStreakDays: 1 });

    const utc = await call('PATCH', '/api/account', 'user-zone', {
      publicProfile: { ...emptyProfile, timezone: 'UTC' }, request_id: 'zone-utc',
    });
    expect(utc.statusCode).toBe(200);
    const shifted = await readPublicProfile(db, 'zone-owner', NOON);
    const utcDates = activityWindow(NOON, 'UTC', new Date(shifted!.owner.joinedAt)).dates;
    expect(shifted?.activity.counts).toHaveLength(7);
    expect(shifted?.activity.counts[utcDates.indexOf('2026-10-21')]).toBe(1);
    expect(shifted?.activity.counts[utcDates.indexOf('2026-10-20')]).toBe(0);
    expect(shifted?.stats.currentStreakDays).toBe(1);
  });

  it('uses the agents 404, no-store, and a bounded query count scoped to this owner', async () => {
    const unknownAgents = await hit('/api/public/missing-handle/agents');
    const unknownProfile = await hit('/api/public/missing-handle/profile');
    const quiet = await hit('/api/public/quiet-page/profile');
    const malformed = await hit('/api/public/NO/profile');
    const sealedAccess: UserAccess = { kind: 'user', userId: 'user-sealed' };
    await db.insert(users).values({ id: 'user-sealed', email: 'sealed@example.test', displayName: 'SEALED_DISPLAY', emailVerified: true, publicHandle: 'sealed-owner' });
    await projectsRepo.createProject(db, sealedAccess, { ...base, name: 'SEALED_PROJECT', isPublic: false });
    const sealedProfile = await hit('/api/public/sealed-owner/profile');
    const sealedAgents = await hit('/api/public/sealed-owner/agents');
    expect(unknownProfile.statusCode).toBe(404);
    expect(unknownProfile.body).toBe(unknownAgents.body);
    expect(quiet.body).toBe(unknownAgents.body);
    expect(malformed.body).toBe(unknownAgents.body);
    expect(sealedProfile.statusCode).toBe(404);
    expect(sealedAgents.statusCode).toBe(404);
    expect(sealedProfile.body).toBe(unknownAgents.body);
    expect(sealedAgents.body).toBe(unknownAgents.body);
    expect(sealedProfile.body).not.toContain('SEALED_PROJECT');
    expect(sealedAgents.body).not.toContain('SEALED_PROJECT');
    expect(sealedProfile.body).not.toContain('SEALED_DISPLAY');
    expect(unknownProfile.headers['cache-control']).toBe('no-store');
    const live = await hit('/api/public/harness-one/profile');
    expect(live.statusCode).toBe(200);
    const liveBody = live.json() as PublicProfile;
    assertExact(liveBody);
    const liveWindow = activityWindow(new Date(), 'UTC', new Date(liveBody.owner.joinedAt));
    expect(liveBody.activity.counts).toHaveLength(7);
    expect(liveWindow.dates).toHaveLength(7);
    expect(liveBody.activity.start).toBe(liveWindow.start);
    expect(liveBody.activity.end).toBe(liveWindow.end);
    expect(liveBody.harnesses.series.every((series) => series.counts.length === 30)).toBe(true);

    const texts = await captured(async () => {
      const response = await hit('/api/public/bulk-owner/profile');
      expect(response.statusCode).toBe(200);
      expect(response.json().stats.agentRuns).toBe(40);
    });
    const statements = texts.filter((text) => !/^(begin|commit|rollback)\b/i.test(text.trim()));
    expect(statements.length, statements.map((text) => text.replace(/\s+/g, ' ').slice(0, 120)).join(' || ')).toBeLessThanOrEqual(6);
    const runQueries = statements.filter((text) => /\bruns\b/.test(text) && /projects/.test(text));
    expect(runQueries.length).toBeGreaterThan(0);
    for (const text of runQueries) {
      expect(text).toContain('owner_id');
      expect(text).not.toContain('is_public');
      expect(text).not.toContain('archived');
    }
    const gateQueries = statements.filter((text) => text.includes('is_public'));
    expect(gateQueries.length).toBeGreaterThan(0);
    for (const text of gateQueries) {
      expect(text).toContain('archived');
      expect(text).not.toMatch(/\bruns\b/);
    }
    expect(texts.join('\n')).not.toMatch(/\bbytes\b/);
  });

  it('validates publicProfile, keeps handle and alerts independent, and does not load avatar bytes for the account', async () => {
    const big = await app.inject({
      method: 'PATCH', url: '/api/account', remoteAddress: nextIp(),
      headers: { 'x-test-user-id': 'user-forms', 'content-type': 'application/json' },
      payload: JSON.stringify({ blob: 'x'.repeat(300_000), request_id: 'big-json' }),
    });
    expect(big.statusCode).toBe(400);
    const handle = await call('PATCH', '/api/account', 'user-forms', { publicHandle: 'forms-user', request_id: 'forms-handle' });
    expect(handle.statusCode).toBe(200);
    expect(handle.json().publicHandle).toBe('forms-user');
    expect(handle.json().publicProfile).toEqual({ ...emptyProfile, avatarUpdatedAt: null });
    const profile = {
      name: '  Ada Lovelace  ', bio: 'a'.repeat(160), github: 'a-', x: 'ada_bot', linkedin: 'ada-lovelace', timezone: 'America/Los_Angeles',
    };
    const saved = await call('PATCH', '/api/account', 'user-forms', { publicProfile: profile, request_id: 'forms-profile' });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().publicHandle).toBe('forms-user');
    expect(saved.json().alerts).toEqual({ blocked: false, stale: false, review: false });
    expect(saved.json().publicProfile).toMatchObject({ name: 'Ada Lovelace', bio: 'a'.repeat(160), github: 'a-', x: 'ada_bot', linkedin: 'ada-lovelace', timezone: 'America/Los_Angeles' });
    const replay = await call('PATCH', '/api/account', 'user-forms', { publicProfile: profile, request_id: 'forms-profile' });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(saved.json());
    const mismatch = await call('PATCH', '/api/account', 'user-forms', {
      publicProfile: { ...profile, name: 'Other' }, request_id: 'forms-profile',
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json().error.code).toBe(errorCodes.idempotency_mismatch);
    const alerts = await call('PATCH', '/api/account', 'user-forms', {
      alerts: { blocked: true, stale: false, review: true }, request_id: 'forms-alerts',
    });
    expect(alerts.statusCode).toBe(200);
    expect(alerts.json().publicProfile.name).toBe('Ada Lovelace');
    expect(alerts.json().publicHandle).toBe('forms-user');
    const cleared = await call('PATCH', '/api/account', 'user-forms', {
      publicProfile: { ...emptyProfile, name: null, timezone: 'UTC' }, request_id: 'forms-clear',
    });
    expect(cleared.json().publicProfile.name).toBeNull();
    expect(cleared.json().publicHandle).toBe('forms-user');

    const rejected: unknown[] = [
      { publicProfile: { bio: 'hi', github: null, x: null, linkedin: null, timezone: 'UTC' }, request_id: 'miss-name' },
      { publicProfile: { ...emptyProfile, name: ' ' }, request_id: 'blank-name' },
      { publicProfile: { ...emptyProfile, name: 'a'.repeat(61) }, request_id: 'long-name' },
      { publicProfile: { ...emptyProfile, bio: 'b'.repeat(161) }, request_id: 'long-bio' },
      { publicProfile: { ...emptyProfile, github: '-ada' }, request_id: 'bad-gh' },
      { publicProfile: { ...emptyProfile, x: 'a'.repeat(16) }, request_id: 'bad-x' },
      { publicProfile: { ...emptyProfile, linkedin: 'ab' }, request_id: 'bad-li' },
      { publicProfile: { ...emptyProfile, timezone: 'utc' }, request_id: 'bad-zone' },
      { publicProfile: { ...emptyProfile, timezone: 'Not/AZone' }, request_id: 'fake-zone' },
      { publicProfile: { ...emptyProfile, website: 'https://example.test' }, request_id: 'extra' },
      { publicProfile: null, request_id: 'null-profile' },
      { request_id: 'empty-patch' },
    ];
    for (const body of rejected) {
      const response = await call('PATCH', '/api/account', 'user-forms', body);
      expect(response.statusCode, JSON.stringify(body)).toBe(400);
      expect(response.json().error.code).toBe(errorCodes.validation_error);
    }
    const accountTexts = await captured(async () => {
      const account = await app.inject({ method: 'GET', url: '/api/account', headers: { 'x-test-user-id': 'user-forms' }, remoteAddress: nextIp() });
      expect(account.statusCode).toBe(200);
    });
    expect(accountTexts.length).toBeGreaterThan(0);
    expect(accountTexts.join('\n')).not.toMatch(/\bbytes\b/);
  });

  it('stores only matching image bytes, serves them with validators, and rejects the other upload shapes', async () => {
    const issued = await app.inject({
      method: 'POST', url: '/api/tokens', remoteAddress: nextIp(),
      headers: { 'x-test-user-id': 'user-avatar', 'content-type': 'application/json' },
      payload: { label: 'Avatar', project_ids: [avatarProject], request_id: 'avatar-token' },
    });
    expect(issued.statusCode).toBe(200);
    const token = issued.json().plaintext as string;
    expect(token).toMatch(/^sat_/);
    const bearerPut = await app.inject({
      method: 'PUT', url: '/api/account/avatar', payload: PNG, remoteAddress: nextIp(),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' },
    });
    const bearerDelete = await app.inject({
      method: 'DELETE', url: '/api/account/avatar', remoteAddress: nextIp(),
      headers: { authorization: `Bearer ${token}` },
    });
    expect(bearerPut.statusCode).toBe(401);
    expect(bearerDelete.statusCode).toBe(401);
    expect(bearerPut.json().error.code).toBe(errorCodes.unauthenticated);
    expect((await pool.query(`SELECT count(*)::int AS n FROM user_avatars WHERE user_id = 'user-avatar'`)).rows[0]?.n).toBe(0);

    for (const [type, body] of [
      ['image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
      ['multipart/form-data; boundary=----x', PNG],
      ['text/plain', Buffer.from('hello')],
      ['application/json', Buffer.from('{}')],
    ] as const) {
      const response = await putImage('user-avatar', type, body);
      expect(response.statusCode, type).toBe(415);
      expect(response.json().error.code).toBe(errorCodes.validation_error);
    }
    const mismatch = await putImage('user-avatar', 'image/png', JPEG);
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json().error.code).toBe(errorCodes.validation_error);
    const empty = await putImage('user-avatar', 'image/png', Buffer.alloc(0));
    expect(empty.statusCode).toBe(400);
    const huge = Buffer.alloc(262_145);
    PNG.copy(huge);
    const tooBig = await putImage('user-avatar', 'image/png', huge);
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.json().error.code).toBe(errorCodes.payload_too_large);
    expect((await pool.query(`SELECT count(*)::int AS n FROM user_avatars WHERE user_id = 'user-avatar'`)).rows[0]?.n).toBe(0);

    const pngHash = createHash('sha256').update(PNG).digest('hex');
    const stored = await putImage('user-avatar', 'image/png', PNG);
    expect(stored.statusCode).toBe(200);
    expect(stored.json().publicProfile.avatarUpdatedAt).toEqual(expect.any(String));
    const profile = await hit('/api/public/avatar-one/profile');
    expect(profile.json().owner.avatarUrl).toBe(`/api/public/avatar-one/avatar?v=${pngHash.slice(0, 16)}`);
    const image = await hit('/api/public/avatar-one/avatar');
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toMatch(/^image\/png\b/);
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(image.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(image.headers.etag).toBe(`"${pngHash}"`);
    expect(image.headers['cache-control']).toBe('no-cache');
    expect(Buffer.compare(image.rawPayload, PNG)).toBe(0);
    const cached = await hit('/api/public/avatar-one/avatar', { 'if-none-match': `"${pngHash}"` });
    expect(cached.statusCode).toBe(304);
    expect(cached.rawPayload.length).toBe(0);
    const stale = await hit('/api/public/avatar-one/avatar', { 'if-none-match': '"abcd"' });
    expect(stale.statusCode).toBe(200);

    const removed = await call('DELETE', '/api/account/avatar', 'user-avatar');
    expect(removed.statusCode).toBe(200);
    expect(removed.json().publicProfile.avatarUpdatedAt).toBeNull();
    const again = await call('DELETE', '/api/account/avatar', 'user-avatar');
    expect(again.statusCode).toBe(200);
    expect(again.json().publicProfile.avatarUpdatedAt).toBeNull();
    const missingAgents = await hit('/api/public/missing-handle/agents');
    const missingAvatar = await hit('/api/public/avatar-one/avatar');
    expect(missingAvatar.statusCode).toBe(404);
    expect(missingAvatar.body).toBe(missingAgents.body);
    expect(missingAvatar.headers['cache-control']).toBe('no-store');
    expect((await hit('/api/public/avatar-one/profile')).json().owner.avatarUrl).toBeNull();

    const jpegHash = createHash('sha256').update(JPEG).digest('hex');
    expect((await putImage('user-avatar', 'image/jpeg', JPEG)).statusCode).toBe(200);
    expect((await hit('/api/public/avatar-one/profile')).json().owner.avatarUrl).toBe(`/api/public/avatar-one/avatar?v=${jpegHash.slice(0, 16)}`);
    expect(jpegHash.slice(0, 16)).not.toBe(pngHash.slice(0, 16));
    const webp = await putImage('user-avatar', 'image/webp', WEBP);
    expect(webp.statusCode).toBe(200);
    const webpBody = await hit('/api/public/avatar-one/avatar');
    expect(webpBody.headers['content-type']).toMatch(/^image\/webp\b/);
    expect(Buffer.compare(webpBody.rawPayload, WEBP)).toBe(0);

    const quietPut = await putImage('user-quiet', 'image/png', PNG);
    expect(quietPut.statusCode).toBe(200);
    const quietAvatar = await hit('/api/public/quiet-page/avatar');
    const unknown = await hit('/api/public/missing-handle/avatar');
    expect(quietAvatar.statusCode).toBe(404);
    expect(quietAvatar.body).toBe(unknown.body);
  });

  it('rate-limits profile with the agents budget and avatar on its own budget', async () => {
    const shared = '203.0.113.50';
    for (let i = 0; i < 60; i += 1) expect((await hit('/api/public/streak-one/agents', {}, shared)).statusCode).toBe(200);
    const limited = await hit('/api/public/streak-one/profile', {}, shared);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBe('60');
    expect(limited.headers['cache-control']).toBe('no-store');
    expect((await hit('/api/public/avatar-one/avatar', {}, shared)).statusCode).not.toBe(429);

    const avatarIp = '203.0.113.51';
    for (let i = 0; i < 60; i += 1) expect((await hit('/api/public/missing-handle/avatar', {}, avatarIp)).statusCode).toBe(404);
    const avatarLimited = await hit('/api/public/missing-handle/avatar', {}, avatarIp);
    expect(avatarLimited.statusCode).toBe(429);
    expect((await hit('/api/public/streak-one/profile', {}, avatarIp)).statusCode).toBe(200);
  });
});
