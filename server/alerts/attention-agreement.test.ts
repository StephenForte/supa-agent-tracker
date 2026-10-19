import { expect, it } from 'vitest';
import type pg from 'pg';

import { selectAttention, type AlertKind } from './match.js';
import { createDb, type AppDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { createPool } from '../db/pool.js';
import { migrationsDir } from '../paths.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const MINUTE = 60_000;

interface AttentionModule {
  needsAttention: (
    accountId: string,
    projects: ReadonlyArray<Record<string, unknown>>,
    runs: ReadonlyArray<Record<string, unknown>>,
    agents: ReadonlyArray<Record<string, unknown>>,
    now: number,
  ) => { groups: Record<AlertKind, Array<{ id: string }>> };
}

it('SQL attention matches Needs me on one fixture', async () => {
  const scratch: ScratchDatabase = await createScratchDatabase();
  const pool: pg.Pool = createPool(scratch.connectionString);
  const db: AppDatabase = createDb(pool);
  try {
    await runMigrations(pool, migrationsDir);
    const owner = 'agree-owner';
    const other = 'agree-other';
    const projects = [
      { id: 'prj-standard', owner, name: 'Standard', lifecycle: 'active', stale: 15 },
      { id: 'prj-slow', owner, name: 'Slow', lifecycle: 'active', stale: 60 },
      { id: 'prj-archived', owner, name: 'Archived', lifecycle: 'archived', stale: 15 },
      { id: 'prj-paused', owner, name: 'Paused', lifecycle: 'paused', stale: 15 },
      { id: 'prj-foreign', owner: other, name: 'Foreign', lifecycle: 'active', stale: 15 },
    ];
    await pool.query('INSERT INTO users (id, email, display_name, email_verified) VALUES ($1, $2, $1, true), ($3, $4, $3, true)', [owner, 'owner@example.test', other, 'other@example.test']);
    for (const project of projects) {
      await pool.query(
        `INSERT INTO projects (id, owner_id, name, type, lifecycle, stale_threshold_minutes) VALUES ($1,$2,$3,'coding',$4,$5)`,
        [project.id, project.owner, project.name, project.lifecycle, project.stale],
      );
      await pool.query(
        `INSERT INTO agents (id, project_id, name, title, workload_type) VALUES ($1,$2,$3,$3,'coding')`,
        [`agt-${project.id}`, project.id, project.name],
      );
    }
    const at = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE);
    const cases: Array<{ id: string; projectId: string; execution: string; work: string; lastContact: Date; updated: Date; finished: Date | null; kind: AlertKind | null }> = [
      { id: 'blocked-fresh', projectId: 'prj-standard', execution: 'running', work: 'blocked', lastContact: NOW, updated: at(5), finished: null, kind: 'blocked' },
      { id: 'blocked-stale', projectId: 'prj-standard', execution: 'running', work: 'blocked', lastContact: at(40), updated: at(3), finished: null, kind: 'blocked' },
      { id: 'blocked-finished', projectId: 'prj-standard', execution: 'finished', work: 'blocked', lastContact: at(10), updated: at(2), finished: at(2), kind: 'blocked' },
      { id: 'live', projectId: 'prj-standard', execution: 'running', work: 'in_progress', lastContact: NOW, updated: NOW, finished: null, kind: null },
      { id: 'exact-threshold', projectId: 'prj-standard', execution: 'running', work: 'in_progress', lastContact: at(15), updated: NOW, finished: null, kind: null },
      { id: 'just-stale', projectId: 'prj-standard', execution: 'running', work: 'in_progress', lastContact: new Date(NOW.getTime() - 15 * MINUTE - 1), updated: NOW, finished: null, kind: 'stale' },
      { id: 'running-review', projectId: 'prj-standard', execution: 'running', work: 'waiting_for_review', lastContact: NOW, updated: NOW, finished: null, kind: null },
      { id: 'running-review-stale', projectId: 'prj-standard', execution: 'running', work: 'waiting_for_review', lastContact: at(20), updated: NOW, finished: null, kind: 'stale' },
      { id: 'review', projectId: 'prj-standard', execution: 'finished', work: 'waiting_for_review', lastContact: at(8), updated: at(8), finished: at(4), kind: 'review' },
      { id: 'completed', projectId: 'prj-standard', execution: 'finished', work: 'completed', lastContact: at(8), updated: at(8), finished: at(8), kind: null },
      { id: 'failed-review', projectId: 'prj-standard', execution: 'failed', work: 'waiting_for_review', lastContact: at(8), updated: at(8), finished: at(8), kind: null },
      { id: 'cancelled-blocked', projectId: 'prj-standard', execution: 'cancelled', work: 'blocked', lastContact: at(8), updated: at(1), finished: at(1), kind: 'blocked' },
      { id: 'slow-fresh', projectId: 'prj-slow', execution: 'running', work: 'in_progress', lastContact: at(16), updated: NOW, finished: null, kind: null },
      { id: 'slow-stale', projectId: 'prj-slow', execution: 'running', work: 'in_progress', lastContact: at(61), updated: NOW, finished: null, kind: 'stale' },
      { id: 'archived-blocked', projectId: 'prj-archived', execution: 'running', work: 'blocked', lastContact: at(90), updated: NOW, finished: null, kind: null },
      { id: 'paused-review', projectId: 'prj-paused', execution: 'finished', work: 'waiting_for_review', lastContact: NOW, updated: at(6), finished: at(6), kind: 'review' },
      { id: 'foreign-review', projectId: 'prj-foreign', execution: 'finished', work: 'waiting_for_review', lastContact: NOW, updated: NOW, finished: at(1), kind: null },
    ];
    for (const item of cases) {
      await pool.query(
        `INSERT INTO runs (id, project_id, agent_id, title, workload_type, execution_state, work_status, started_at, finished_at, last_contact_at, updated_at)
         VALUES ($1,$2,$3,$1,'coding',$4,$5,$6,$7,$8,$9)`,
        [item.id, item.projectId, `agt-${item.projectId}`, item.execution, item.work, new Date('2026-10-01T00:00:00.000Z'), item.finished, item.lastContact, item.updated],
      );
    }
    const started = new Date('2026-10-01T00:00:00.000Z').toISOString();
    const domainProjects = projects.map((project) => ({
      id: project.id, ownerId: project.owner, name: project.name, description: '', type: 'coding', lifecycle: project.lifecycle,
      repositoryName: null, repositoryUrl: null, prdUrl: null, tags: [], isPublic: false,
      reportingPolicy: { staleThresholdMinutes: project.stale, heartbeatExpected: false, instructions: '' },
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), revision: 1,
    }));
    const domainAgents = projects.map((project) => ({
      id: `agt-${project.id}`, projectId: project.id, name: project.name, title: project.name, workloadType: 'coding', createdAt: NOW.toISOString(),
    }));
    const domainRuns = cases.map((item) => ({
      id: item.id, projectId: item.projectId, agentId: `agt-${item.projectId}`, taskId: null, title: item.id, workloadType: 'coding',
      executionState: item.execution, workStatus: item.work, startedAt: started,
      finishedAt: item.finished ? item.finished.toISOString() : null, lastContactAt: item.lastContact.toISOString(), updatedAt: item.updated.toISOString(),
      harness: null, model: null, message: '', completionSummary: null, blocker: null, noPrReason: null,
      parentRunId: null, childRunIds: [], prReferences: [], tools: null, events: [], revision: 1,
    }));
    const specifier = '../../src/domain/needs-me/attention.js';
    const { needsAttention } = await import(specifier) as AttentionModule;
    const attention = needsAttention(owner, domainProjects, domainRuns, domainAgents, NOW.getTime());
    const fromRules = (['blocked', 'stale', 'review'] as const).flatMap((kind) => attention.groups[kind].map((run) => `${kind}:${run.id}`)).sort();
    const fromSql = (await selectAttention(db, owner, NOW)).map((row) => `${row.kind}:${row.runId}`).sort();
    const expected = cases.flatMap((item) => item.kind === null ? [] : [`${item.kind}:${item.id}`]).sort();
    expect(fromSql).toEqual(expected);
    expect(fromRules).toEqual(expected);
  } finally {
    await pool.end();
    await scratch.drop();
  }
});
