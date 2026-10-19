import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { applyAlertPreferences, type AlertPreferences } from './preferences.js';
import { alertDigestActive, startAlertDigest } from './job.js';
import { runAlertDigestCycle } from './digest.js';
import { buildApp } from '../app/build-app.js';
import { createDb, type AppDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { createPool } from '../db/pool.js';
import { migrationsDir, repoRoot } from '../paths.js';
import type { Email, EmailSender } from '../email/index.js';
import { createEmailSender } from '../email/index.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const MINUTE = 60_000;
const PUBLIC = 'https://tracker.example';
const OFF: AlertPreferences = { blocked: false, stale: false, review: false };

describe('opt-in email alert digest', () => {
  let scratch: ScratchDatabase;
  let pool: pg.Pool;
  let db: AppDatabase;
  let app: FastifyInstance;
  let spaRoot = '';
  let seq = 0;

  function nid(prefix: string): string {
    seq += 1;
    return `${prefix}-${seq}`;
  }

  function capture(): { emails: Email[]; sender: EmailSender } {
    const emails: Email[] = [];
    return { emails, sender: { async sendEmail(email) { emails.push(email); } } };
  }

  async function cycle(sender: EmailSender, extra?: { afterLock?: () => Promise<void>; now?: Date }) {
    return runAlertDigestCycle({ pool, db, sender, publicUrl: PUBLIC, now: extra?.now ?? NOW, afterLock: extra?.afterLock });
  }

  async function quiet(): Promise<void> {
    await pool.query('UPDATE users SET alert_blocked = false, alert_stale = false, alert_review = false');
  }

  async function makeUser(id: string, email: string, verified = true): Promise<void> {
    await pool.query('INSERT INTO users (id, email, display_name, email_verified) VALUES ($1, $2, $3, $4)', [id, email, id, verified]);
  }

  async function makeProject(id: string, ownerId: string, name: string, lifecycle = 'active', stale = 15): Promise<void> {
    await pool.query(
      'INSERT INTO projects (id, owner_id, name, type, lifecycle, stale_threshold_minutes, reporting_instructions) VALUES ($1,$2,$3,\'coding\',$4,$5,$6)',
      [id, ownerId, name, lifecycle, stale, `instructions-${id}`],
    );
  }

  async function makeAgent(id: string, projectId: string, name: string): Promise<void> {
    await pool.query('INSERT INTO agents (id, project_id, name, title, workload_type) VALUES ($1,$2,$3,$4,\'coding\')', [id, projectId, name, name]);
  }

  async function makeRun(row: {
    id: string; projectId: string; agentId: string; title: string;
    execution: 'running' | 'finished' | 'failed' | 'cancelled'; work: string;
    lastContact: Date; updated?: Date; finished?: Date | null; blocker?: string | null;
    message?: string; summary?: string | null;
  }): Promise<void> {
    const running = row.execution === 'running';
    const finishedAt = running ? null : (row.finished === undefined ? new Date('2026-10-19T11:00:00.000Z') : row.finished);
    await pool.query(
      `INSERT INTO runs (id, project_id, agent_id, title, workload_type, execution_state, work_status, started_at, finished_at, last_contact_at, updated_at, blocker, message, completion_summary)
       VALUES ($1,$2,$3,$4,'coding',$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [row.id, row.projectId, row.agentId, row.title, row.execution, row.work, new Date('2026-10-01T00:00:00.000Z'), finishedAt, row.lastContact, row.updated ?? row.lastContact, row.blocker ?? null, row.message ?? '', row.summary ?? null],
    );
  }

  async function enable(userId: string, prefs: AlertPreferences, now = NOW): Promise<void> {
    await db.transaction(async (tx) => { await applyAlertPreferences(tx, userId, prefs, now); });
  }

  async function rowsFor(userId: string): Promise<Array<{ run_id: string; kind: string; source: string }>> {
    const result = await pool.query<{ run_id: string; kind: string; source: string }>(
      'SELECT run_id, kind, source FROM alert_deliveries WHERE user_id = $1 ORDER BY run_id, kind',
      [userId],
    );
    return result.rows;
  }

  function call(method: 'GET' | 'PATCH', url: string, userId: string, body?: unknown) {
    return app.inject({
      method, url, headers: { 'x-test-user-id': userId, 'content-type': 'application/json' },
      payload: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
    db = createDb(pool);
    await runMigrations(pool, migrationsDir);
    spaRoot = mkdtempSync(path.join(tmpdir(), 'supa-alerts-'));
    writeFileSync(path.join(spaRoot, 'index.html'), '<!doctype html><title>spa</title>');
    app = await buildApp({
      config: { databaseUrl: scratch.connectionString, port: 0, nodeEnv: 'test', publicUrl: PUBLIC, migrateOnBoot: false },
      pool, migrationsDir, spaRoot,
    });
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await scratch?.drop();
    if (spaRoot) rmSync(spaRoot, { recursive: true, force: true });
  });

  beforeEach(quiet);

  it('sends nothing when every preference is still the default', async () => {
    const user = nid('user');
    const project = nid('prj');
    const agent = nid('agt');
    await makeUser(user, `${user}@example.test`);
    await makeProject(project, user, 'Live');
    await makeAgent(agent, project, 'Ada');
    await makeRun({ id: nid('run'), projectId: project, agentId: agent, title: 'Already waiting', execution: 'finished', work: 'waiting_for_review', lastContact: NOW });
    const { emails, sender } = capture();
    const result = await cycle(sender);
    expect(result).toMatchObject({ lock: 'acquired', emails: 0, items: 0, failures: 0 });
    expect(emails).toEqual([]);
    expect(await rowsFor(user)).toEqual([]);
    const flags = await pool.query('SELECT alert_blocked, alert_stale, alert_review FROM users WHERE id = $1', [user]);
    expect(flags.rows).toEqual([{ alert_blocked: false, alert_stale: false, alert_review: false }]);
  });

  it('baselines existing review runs and emails only a run that becomes true later', async () => {
    const user = nid('user');
    const project = nid('prj');
    const agent = nid('agt');
    const first = nid('run');
    const second = nid('run');
    const third = nid('run');
    await makeUser(user, `${user}@example.test`);
    await makeProject(project, user, 'Review project');
    await makeAgent(agent, project, 'Reviewer');
    const review = { projectId: project, agentId: agent, execution: 'finished' as const, work: 'waiting_for_review', lastContact: NOW };
    await makeRun({ ...review, id: first, title: 'Old one' });
    await makeRun({ ...review, id: second, title: 'Old two' });
    await enable(user, { ...OFF, review: true });
    expect(await rowsFor(user)).toHaveLength(2);
    expect(await rowsFor(user)).toEqual(expect.arrayContaining([
      { run_id: first, kind: 'review', source: 'baseline' },
      { run_id: second, kind: 'review', source: 'baseline' },
    ]));
    const held = capture();
    expect(await cycle(held.sender)).toMatchObject({ emails: 0, items: 0 });
    expect(held.emails).toEqual([]);
    await makeRun({ ...review, id: third, title: 'Just finished' });
    const next = capture();
    const sent = await cycle(next.sender);
    expect(sent).toMatchObject({ emails: 1, items: 1, failures: 0 });
    expect(next.emails).toHaveLength(1);
    expect(next.emails[0]?.to).toBe(`${user}@example.test`);
    expect(next.emails[0]?.subject).toBe('Supa Agent Tracker: 1 item needs you');
    expect(next.emails[0]?.text).toContain('Just finished');
    expect(next.emails[0]?.text).not.toContain('Old one');
    expect(next.emails[0]?.text).not.toContain('Old two');
    expect(await rowsFor(user)).toContainEqual({ run_id: third, kind: 'review', source: 'sent' });
    const again = capture();
    expect(await cycle(again.sender)).toMatchObject({ emails: 0, items: 0 });
    expect(again.emails).toEqual([]);
  });

  it('reports a blocked stale run only as blocked, and not at all when only stale is on', async () => {
    const both = nid('user');
    const staleOnly = nid('user');
    const bothProject = nid('prj');
    const staleProject = nid('prj');
    const bothAgent = nid('agt');
    const staleAgent = nid('agt');
    const bothRun = nid('run');
    const staleRun = nid('run');
    await makeUser(both, `${both}@example.test`);
    await makeUser(staleOnly, `${staleOnly}@example.test`);
    await makeProject(bothProject, both, 'Both');
    await makeProject(staleProject, staleOnly, 'Stale only');
    await makeAgent(bothAgent, bothProject, 'Both agent');
    await makeAgent(staleAgent, staleProject, 'Stale agent');
    await enable(both, { blocked: true, stale: true, review: false });
    await enable(staleOnly, { ...OFF, stale: true });
    const staleContact = new Date(NOW.getTime() - 30 * MINUTE);
    await makeRun({ id: bothRun, projectId: bothProject, agentId: bothAgent, title: 'Stuck and quiet', execution: 'running', work: 'blocked', lastContact: staleContact, blocker: 'gate is down' });
    await makeRun({ id: staleRun, projectId: staleProject, agentId: staleAgent, title: 'Also stuck', execution: 'running', work: 'blocked', lastContact: staleContact, blocker: 'hidden blocker' });
    const { emails, sender } = capture();
    const result = await cycle(sender);
    expect(result).toMatchObject({ emails: 1, items: 1 });
    expect(emails.map((email) => email.to)).toEqual([`${both}@example.test`]);
    const text = emails[0]?.text ?? '';
    expect(text).toContain('Blocked');
    expect(text).toContain('Stuck and quiet');
    expect(text).toContain('gate is down');
    expect(text).not.toContain('Stale');
    expect(text).not.toContain('last contact');
    expect(text).not.toContain('Also stuck');
    expect(await rowsFor(staleOnly)).toEqual([]);
    expect(await rowsFor(both)).toEqual([{ run_id: bothRun, kind: 'blocked', source: 'sent' }]);
  });

  it('never includes another owner, an archived project, or an unverified user', async () => {
    const owner = nid('user');
    const other = nid('user');
    const unverified = nid('user');
    const live = nid('prj');
    const archived = nid('prj');
    const paused = nid('prj');
    const foreign = nid('prj');
    const quietProject = nid('prj');
    const liveAgent = nid('agt');
    const archivedAgent = nid('agt');
    const pausedAgent = nid('agt');
    const foreignAgent = nid('agt');
    const quietAgent = nid('agt');
    await makeUser(owner, `${owner}@example.test`);
    await makeUser(other, 'other-owner@example.test');
    await makeUser(unverified, 'unverified-owner@example.test', false);
    await makeProject(live, owner, 'Live project');
    await makeProject(archived, owner, 'Archived project', 'archived');
    await makeProject(paused, owner, 'Paused project', 'paused');
    await makeProject(foreign, other, 'Foreign project');
    await makeProject(quietProject, unverified, 'Unverified project');
    await makeAgent(liveAgent, live, 'Live agent');
    await makeAgent(archivedAgent, archived, 'Archive agent');
    await makeAgent(pausedAgent, paused, 'Paused agent');
    await makeAgent(foreignAgent, foreign, 'Foreign agent');
    await makeAgent(quietAgent, quietProject, 'Quiet agent');
    await makeRun({ id: nid('run'), projectId: archived, agentId: archivedAgent, title: 'ARCHIVED_TITLE', execution: 'finished', work: 'waiting_for_review', lastContact: NOW });
    await enable(owner, { blocked: true, stale: true, review: true });
    const good = nid('run');
    const pausedRun = nid('run');
    await makeRun({ id: good, projectId: live, agentId: liveAgent, title: 'GOOD_TITLE', execution: 'finished', work: 'waiting_for_review', lastContact: NOW, message: 'NOTE_SENTINEL', summary: 'SUMMARY_SENTINEL' });
    await makeRun({ id: pausedRun, projectId: paused, agentId: pausedAgent, title: 'PAUSED_TITLE', execution: 'finished', work: 'waiting_for_review', lastContact: NOW });
    await makeRun({ id: nid('run'), projectId: foreign, agentId: foreignAgent, title: 'FOREIGN_TITLE', execution: 'finished', work: 'waiting_for_review', lastContact: NOW });
    await makeRun({ id: nid('run'), projectId: quietProject, agentId: quietAgent, title: 'UNVERIFIED_TITLE', execution: 'finished', work: 'waiting_for_review', lastContact: NOW });
    await pool.query('UPDATE users SET alert_blocked = true, alert_stale = true, alert_review = true WHERE id = $1', [unverified]);
    const { emails, sender } = capture();
    const result = await cycle(sender);
    expect(result).toMatchObject({ users: 1, emails: 1, items: 2, failures: 0 });
    expect(emails).toHaveLength(1);
    expect(emails[0]?.to).toBe(`${owner}@example.test`);
    const body = `${emails[0]?.text}\n${emails[0]?.html}`;
    expect(body).toContain('GOOD_TITLE');
    expect(body).toContain('PAUSED_TITLE');
    expect(body).toContain('Live agent');
    expect(body).toContain('Paused project');
    for (const secret of ['ARCHIVED_TITLE', 'FOREIGN_TITLE', 'UNVERIFIED_TITLE', 'other-owner@example.test', 'unverified-owner@example.test', 'NOTE_SENTINEL', 'SUMMARY_SENTINEL', `instructions-${live}`]) {
      expect(body).not.toContain(secret);
    }
    expect(await rowsFor(other)).toEqual([]);
    expect(await rowsFor(unverified)).toEqual([]);
  });

  it('sends one grouped email, and caps the listing at 20 while recording every item', async () => {
    const grouped = nid('user');
    const bulk = nid('user');
    const groupedProject = nid('prj');
    const bulkProject = nid('prj');
    const groupedAgent = nid('agt');
    const bulkAgent = nid('agt');
    await makeUser(grouped, `${grouped}@example.test`);
    await makeUser(bulk, `${bulk}@example.test`);
    await makeProject(groupedProject, grouped, 'Group project');
    await makeProject(bulkProject, bulk, 'Bulk project');
    await makeAgent(groupedAgent, groupedProject, 'Group agent');
    await makeAgent(bulkAgent, bulkProject, 'Bulk agent');
    await enable(grouped, { blocked: true, stale: true, review: true });
    await enable(bulk, { ...OFF, review: true });
    await makeRun({ id: nid('run'), projectId: groupedProject, agentId: groupedAgent, title: 'Blocked item', execution: 'running', work: 'blocked', lastContact: NOW, blocker: 'needs a decision' });
    await makeRun({ id: nid('run'), projectId: groupedProject, agentId: groupedAgent, title: 'Stale item', execution: 'running', work: 'in_progress', lastContact: new Date(NOW.getTime() - 16 * MINUTE), blocker: 'HIDDEN_BLOCKER' });
    await makeRun({ id: nid('run'), projectId: groupedProject, agentId: groupedAgent, title: 'Review item', execution: 'finished', work: 'waiting_for_review', lastContact: NOW });
    const bulkIds: string[] = [];
    for (let index = 1; index <= 25; index += 1) {
      const id = `bulk-${String(index).padStart(2, '0')}-${bulk}`;
      bulkIds.push(id);
      await makeRun({ id, projectId: bulkProject, agentId: bulkAgent, title: `Bulk ${String(index).padStart(2, '0')}`, execution: 'finished', work: 'waiting_for_review', lastContact: NOW, updated: new Date(NOW.getTime() + index) });
    }
    const { emails, sender } = capture();
    const result = await cycle(sender);
    expect(result).toMatchObject({ emails: 2, items: 28, failures: 0 });
    const groupedMail = emails.find((email) => email.to === `${grouped}@example.test`);
    const bulkMail = emails.find((email) => email.to === `${bulk}@example.test`);
    expect(groupedMail?.subject).toBe('Supa Agent Tracker: 3 items need you');
    const groupedText = groupedMail?.text ?? '';
    expect(groupedText.indexOf('Blocked')).toBeLessThan(groupedText.indexOf('Stale'));
    expect(groupedText.indexOf('Stale')).toBeLessThan(groupedText.indexOf('Waiting for review'));
    expect(groupedText).toContain('Blocked item');
    expect(groupedText).toContain('needs a decision');
    expect(groupedText).toContain('Stale item');
    expect(groupedText).toContain('last contact 16 min ago');
    expect(groupedText).toContain('Review item');
    expect(groupedText).not.toContain('HIDDEN_BLOCKER');
    expect(groupedText).toContain(`Needs me: ${PUBLIC}/needs-me`);
    expect(groupedText).toContain(`Turn off in Account settings: ${PUBLIC}/settings`);
    expect(groupedText).toContain(`${PUBLIC}/agents?run=`);
    expect(groupedMail?.html).toContain(`<a href="${PUBLIC}/needs-me">Needs me</a>`);
    expect(groupedMail?.html).toContain(`<a href="${PUBLIC}/settings">Turn off in Account settings</a>`);
    expect(groupedMail?.html).not.toContain('HIDDEN_BLOCKER');
    expect(bulkMail?.subject).toBe('Supa Agent Tracker: 25 items need you');
    expect(bulkMail?.text).toContain('Bulk 01');
    expect(bulkMail?.text).toContain('Bulk 20');
    expect(bulkMail?.text).not.toContain('Bulk 21');
    expect(bulkMail?.text).toContain('and 5 more');
    expect(bulkMail?.html).toContain('and 5 more');
    expect(await rowsFor(bulk)).toHaveLength(25);
    expect((await rowsFor(bulk)).every((row) => row.source === 'sent' && row.kind === 'review')).toBe(true);
  });

  it('escapes titles so they cannot forge a section or markup', async () => {
    const user = nid('user');
    const project = nid('prj');
    const agent = nid('agt');
    const run = nid('run');
    await makeUser(user, `${user}@example.test`);
    await makeProject(project, user, 'Safe');
    await makeAgent(agent, project, 'Safe agent');
    await enable(user, { ...OFF, blocked: true });
    await makeRun({ id: run, projectId: project, agentId: agent, title: 'Hello\nINJECTED_SECTION\n- Fake', execution: 'running', work: 'blocked', lastContact: NOW, blocker: 'A & B <tag>' });
    const { emails, sender } = capture();
    await cycle(sender);
    const text = emails[0]?.text ?? '';
    const html = emails[0]?.html ?? '';
    expect(text).toContain('Hello INJECTED_SECTION - Fake');
    expect(text).not.toMatch(/^INJECTED_SECTION$/m);
    expect(html).toContain('Hello INJECTED_SECTION - Fake');
    expect(html).toContain('A &amp; B &lt;tag&gt;');
    expect(html).not.toContain('<tag>');
  });

  it('records nothing when the sender throws, then sends once on the next cycle', async () => {
    const user = nid('user');
    const project = nid('prj');
    const agent = nid('agt');
    const run = nid('run');
    await makeUser(user, `${user}@example.test`);
    await makeProject(project, user, 'Retry');
    await makeAgent(agent, project, 'Retry agent');
    await enable(user, { ...OFF, review: true });
    await makeRun({ id: run, projectId: project, agentId: agent, title: 'SECRET_TITLE', execution: 'finished', work: 'waiting_for_review', lastContact: NOW });
    let open = false;
    const emails: Email[] = [];
    const sender: EmailSender = { async sendEmail(email) {
      if (!open) throw new Error('provider-secret-body leak@example.test SECRET_TITLE');
      emails.push(email);
    } };
    const lines: string[] = [];
    expect(await cycle(sender)).toMatchObject({ emails: 0, items: 0, failures: 1 });
    expect(await rowsFor(user)).toEqual([]);
    expect(emails).toEqual([]);
    open = true;
    const job = startAlertDigest({
      pool, db, sender, publicUrl: PUBLIC, now: () => NOW, bootDelayMs: 0, intervalMs: 60_000,
      log: (line) => lines.push(line), logError: (line) => lines.push(line),
    });
    try {
      const deadline = Date.now() + 2_000;
      while (lines.length === 0) {
        if (Date.now() > deadline) throw new Error('timed out waiting for digest log');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(lines[0]).toBe('alert digest users=1 emails=1 items=1 failures=0');
      expect(lines.join('\n')).not.toContain('SECRET_TITLE');
      expect(lines.join('\n')).not.toContain('leak@example.test');
      expect(lines.join('\n')).not.toContain('provider-secret-body');
    } finally {
      job.stop();
    }
    expect(emails).toHaveLength(1);
    expect(await rowsFor(user)).toEqual([{ run_id: run, kind: 'review', source: 'sent' }]);
    const repeat = capture();
    expect(await cycle(repeat.sender)).toMatchObject({ emails: 0, items: 0, failures: 0 });
  });

  it('lets one of two overlapping cycles send, because the advisory lock is held', async () => {
    const user = nid('user');
    const project = nid('prj');
    const agent = nid('agt');
    await makeUser(user, `${user}@example.test`);
    await makeProject(project, user, 'Lock');
    await makeAgent(agent, project, 'Lock agent');
    await enable(user, { ...OFF, review: true });
    await makeRun({ id: nid('run'), projectId: project, agentId: agent, title: 'Locked review', execution: 'finished', work: 'waiting_for_review', lastContact: NOW });
    let release!: () => void;
    const hold = new Promise<void>((resolve) => { release = resolve; });
    let holding = false;
    const { emails, sender } = capture();
    const first = cycle(sender, { afterLock: async () => { holding = true; await hold; } });
    const deadline = Date.now() + 2_000;
    while (!holding) {
      if (Date.now() > deadline) throw new Error('first cycle did not acquire the lock');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const second = await cycle(sender);
    expect(second).toEqual({ lock: 'busy', users: 0, emails: 0, items: 0, failures: 0 });
    release();
    expect(await first).toMatchObject({ lock: 'acquired', emails: 1, items: 1, failures: 0 });
    expect(emails).toHaveLength(1);
    const follow = capture();
    expect(await cycle(follow.sender)).toMatchObject({ lock: 'acquired', emails: 0 });
  });

  it('persists alert toggles idempotently, baselines only on the off-to-on edge, and refuses another user', async () => {
    const owner = nid('user');
    const intruder = nid('user');
    const project = nid('prj');
    const agent = nid('agt');
    const existing = nid('run');
    const later = nid('run');
    const whileOff = nid('run');
    await makeUser(owner, `${owner}@example.test`);
    await makeUser(intruder, `${intruder}@example.test`);
    await makeProject(project, owner, 'Prefs');
    await makeAgent(agent, project, 'Prefs agent');
    await makeRun({ id: existing, projectId: project, agentId: agent, title: 'Already review', execution: 'finished', work: 'waiting_for_review', lastContact: NOW });
    const prefs = { blocked: false, stale: false, review: true };
    const saved = await call('PATCH', '/api/account', owner, { alerts: prefs, request_id: `alerts-${owner}` });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ id: owner, alerts: prefs });
    const replay = await call('PATCH', '/api/account', owner, { alerts: prefs, request_id: `alerts-${owner}` });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(saved.json());
    const mismatch = await call('PATCH', '/api/account', owner, { alerts: { blocked: true, stale: false, review: true }, request_id: `alerts-${owner}` });
    expect(mismatch.statusCode).toBe(409);
    expect(await rowsFor(owner)).toEqual([{ run_id: existing, kind: 'review', source: 'baseline' }]);
    await makeRun({ id: later, projectId: project, agentId: agent, title: 'After enable', execution: 'finished', work: 'waiting_for_review', lastContact: NOW });
    const repeat = await call('PATCH', '/api/account', owner, { alerts: prefs, request_id: `alerts-again-${owner}` });
    expect(repeat.statusCode).toBe(200);
    expect(await rowsFor(owner)).toEqual([{ run_id: existing, kind: 'review', source: 'baseline' }]);
    const seen = capture();
    expect((await cycle(seen.sender)).emails).toBe(1);
    expect(seen.emails[0]?.text).toContain('After enable');
    const off = await call('PATCH', '/api/account', owner, { alerts: OFF, request_id: `alerts-off-${owner}` });
    expect(off.json()).toMatchObject({ alerts: OFF });
    await makeRun({ id: whileOff, projectId: project, agentId: agent, title: 'While off', execution: 'finished', work: 'waiting_for_review', lastContact: NOW });
    const silent = capture();
    expect(await cycle(silent.sender)).toMatchObject({ emails: 0 });
    const back = await call('PATCH', '/api/account', owner, { alerts: prefs, request_id: `alerts-on-${owner}` });
    expect(back.statusCode).toBe(200);
    expect(await rowsFor(owner)).toContainEqual({ run_id: whileOff, kind: 'review', source: 'baseline' });
    const still = capture();
    expect(await cycle(still.sender)).toMatchObject({ emails: 0 });
    const stolen = await call('PATCH', '/api/account', intruder, { alerts: { blocked: true, stale: true, review: true }, request_id: `steal-${owner}` });
    expect(stolen.statusCode).toBe(200);
    expect(stolen.json()).toMatchObject({ id: intruder, alerts: { blocked: true, stale: true, review: true } });
    const ownerAccount = await call('GET', '/api/account', owner);
    expect(ownerAccount.json()).toMatchObject({ alerts: prefs });
    expect((await rowsFor(intruder)).some((row) => row.run_id === existing || row.run_id === later || row.run_id === whileOff)).toBe(false);
    await expect(db.transaction(async (tx) => {
      await applyAlertPreferences(tx, intruder, { ...OFF, blocked: true }, NOW);
      throw new Error('rollback-alerts');
    })).rejects.toThrow('rollback-alerts');
    const intruderFlags = await pool.query('SELECT alert_blocked, alert_stale, alert_review FROM users WHERE id = $1', [intruder]);
    expect(intruderFlags.rows).toEqual([{ alert_blocked: true, alert_stale: true, alert_review: true }]);
  });

  it('rolls the preference and the baseline back together', async () => {
    const user = nid('user');
    const project = nid('prj');
    const agent = nid('agt');
    const run = nid('run');
    await makeUser(user, `${user}@example.test`);
    await makeProject(project, user, 'Atomic');
    await makeAgent(agent, project, 'Atomic agent');
    await makeRun({ id: run, projectId: project, agentId: agent, title: 'Pending review', execution: 'finished', work: 'waiting_for_review', lastContact: NOW });
    await expect(db.transaction(async (tx) => {
      await applyAlertPreferences(tx, user, { ...OFF, review: true }, NOW);
      throw new Error('rollback-alerts');
    })).rejects.toThrow('rollback-alerts');
    const flags = await pool.query('SELECT alert_blocked, alert_stale, alert_review FROM users WHERE id = $1', [user]);
    expect(flags.rows).toEqual([{ alert_blocked: false, alert_stale: false, alert_review: false }]);
    expect(await rowsFor(user)).toEqual([]);
    const { emails, sender } = capture();
    expect(await cycle(sender)).toMatchObject({ emails: 0 });
    expect(emails).toEqual([]);
  });

  it('uses the console sender capture and does not call the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const user = nid('user');
    const project = nid('prj');
    const agent = nid('agt');
    await makeUser(user, `${user}@example.test`);
    await makeProject(project, user, 'Console');
    await makeAgent(agent, project, 'Console agent');
    await enable(user, { ...OFF, review: true });
    await makeRun({ id: nid('run'), projectId: project, agentId: agent, title: 'Console review', execution: 'finished', work: 'waiting_for_review', lastContact: NOW });
    const sender = createEmailSender({ secret: '', emailProvider: 'console' }, 'test');
    await cycle(sender);
    expect(sender.captured).toHaveLength(1);
    expect(sender.captured[0]?.subject).toBe('Supa Agent Tracker: 1 item needs you');
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('does not keep the process alive and starts from the production entry point', async () => {
    expect(alertDigestActive()).toBe(0);
    const idle = startAlertDigest({
      pool, db, sender: { async sendEmail() {} }, publicUrl: PUBLIC, bootDelayMs: 60_000, intervalMs: 60_000, log() {}, logError() {},
    });
    expect(alertDigestActive()).toBe(1);
    idle.stop();
    expect(alertDigestActive()).toBe(0);
    const source = await readFile(new URL('../index.ts', import.meta.url), 'utf8');
    expect(source).toContain('startAlertDigest(');
    expect(source).toContain('alerts.stop()');
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', [
      "import { startAlertDigest } from './server/alerts/job.ts';",
      'startAlertDigest({ pool: {}, db: {}, sender: { async sendEmail() {} }, publicUrl: "https://tracker.example", bootDelayMs: 60000, intervalMs: 60000, log() {}, logError() {} });',
    ].join('\n')], { cwd: repoRoot });
    const outcome = await new Promise<number | 'timeout'>((resolve) => {
      const timer = setTimeout(() => { child.kill(); resolve('timeout'); }, 3_000);
      child.on('exit', (status) => { clearTimeout(timer); resolve(status ?? 1); });
    });
    expect(outcome).toBe(0);
  });
});
