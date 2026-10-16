import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type pg from 'pg';

import { createDb, type AppDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { createPool } from '../db/pool.js';
import { migrationsDir } from '../paths.js';
import { nextSteps, users } from '../db/schema.js';
import type { CredentialAccess, UserAccess } from '../repo/access.js';
import * as agents from '../repo/agents.js';
import * as credentials from '../repo/credentials.js';
import * as projects from '../repo/projects.js';
import * as runs from '../repo/runs.js';
import * as stepRepo from '../repo/next-steps.js';
import { createScratchDatabase, type ScratchDatabase } from '../test/database.js';
import { createNextStep, listNextStepsForAgent, reorderNextSteps, setWaitingNote, updateNextStep, type AgentMutation } from './agent-steps.js';

const owner: UserAccess = { kind: 'user', userId: 'user-a' };
const other: UserAccess = { kind: 'user', userId: 'user-b' };

let scratch: ScratchDatabase;
let pool: pg.Pool;
let db: AppDatabase;
let project: projects.Project;
let otherProject: projects.Project;
let agent: agents.Agent;
let workerA: CredentialAccess;
let workerB: CredentialAccess;
let runA: runs.Run;
let runB: runs.Run;
let userRun: runs.Run;
let foreignRun: runs.Run;

function saved<T>(result: AgentMutation<T>): T {
  expect(result.status).toBe('saved');
  if (result.status !== 'saved') throw new Error('expected saved');
  return result.value;
}

async function stepRow(id: string) {
  const [row] = await db.select().from(nextSteps).where(eq(nextSteps.id, id));
  if (!row) throw new Error(`missing step ${id}`);
  return row;
}

async function projectSteps() {
  return db.select().from(nextSteps).where(eq(nextSteps.projectId, project.id)).orderBy(nextSteps.position, nextSteps.id);
}

describe('agent next-step rules', () => {
  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = createPool(scratch.connectionString);
    db = createDb(pool);
    await runMigrations(pool, migrationsDir);
    await db.insert(users).values([{ id: owner.userId, email: 'a@example.com' }, { id: other.userId, email: 'b@example.com' }]);
    project = await projects.createProject(db, owner, { name: 'Owned', type: 'coding' });
    otherProject = await projects.createProject(db, owner, { name: 'Other', type: 'coding' });
    await projects.createProject(db, other, { name: 'Foreign', type: 'coding' });
    agent = await agents.createAgent(db, owner, project.id, { name: 'worker', title: 'Worker', workloadType: 'coding' });
    const otherAgent = await agents.createAgent(db, owner, otherProject.id, { name: 'other', title: 'Other', workloadType: 'coding' });
    workerA = await grant('worker-a', 'hash-worker-a');
    workerB = await grant('worker-b', 'hash-worker-b');
    runA = await runs.createRun(db, workerA, project.id, { agentId: agent.id, title: 'A', workloadType: 'coding' });
    runB = await runs.createRun(db, workerB, project.id, { agentId: agent.id, title: 'B', workloadType: 'coding' });
    userRun = await runs.createRun(db, owner, project.id, { agentId: agent.id, title: 'User', workloadType: 'coding' });
    const widened = await credentials.createCredential(db, owner, { label: 'both', tokenHash: 'hash-both', displaySuffix: 'both', projectIds: [project.id, otherProject.id] });
    const cross: CredentialAccess = { kind: 'credential', userId: owner.userId, credentialId: widened.id, projectIds: [project.id, otherProject.id] };
    foreignRun = await runs.createRun(db, cross, otherProject.id, { agentId: otherAgent.id, title: 'Foreign run', workloadType: 'coding' });
  });

  afterAll(async () => {
    await pool?.end();
    await scratch?.drop();
  });

  it('lists steps in position order, including completed steps, and never a private note', async () => {
    const first = saved(await createNextStep(db, workerA, { project_id: project.id, source_run_id: runA.id, instruction: 'Second', position: 2, request_id: 'list-2' }));
    const second = saved(await createNextStep(db, workerB, { project_id: project.id, source_run_id: runB.id, instruction: 'First', position: 0, request_id: 'list-0' }));
    await stepRepo.setStepCompletion(db, owner, project.id, second.id, 1, true);
    const waiting = saved(await setWaitingNote(db, workerA, { project_id: project.id, source_run_id: runA.id, expected_revision: 0, text: 'Still running', request_id: 'wait-0' }));
    const listed = await listNextStepsForAgent(db, workerA, { project_id: project.id });
    expect(listed.steps.map((step) => step.id)).toEqual([second.id, first.id]);
    expect(listed.steps[0]).toMatchObject({ done: true, instruction: 'First', completionChangedBy: owner.userId });
    expect(listed.waitingNote).toMatchObject({ text: waiting.text, sourceRunId: runA.id, revision: 1 });
    expect(listed.steps[0]?.createdAt).toEqual(expect.any(String));
  });

  it("worker A can't edit or quote worker B's step", async () => {
    const original = saved(await createNextStep(db, workerB, { project_id: project.id, source_run_id: runB.id, instruction: 'B only', request_id: 'own-b' }));
    const before = await stepRow(original.id);
    await expect(updateNextStep(db, workerA, {
      project_id: project.id, step_id: original.id, source_run_id: runB.id, expected_revision: original.revision,
      instruction: 'hijacked', request_id: 'hijack-b',
    })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(createNextStep(db, workerA, {
      project_id: project.id, source_run_id: runB.id, instruction: 'stolen create', request_id: 'hijack-create',
    })).rejects.toMatchObject({ code: 'forbidden' });
    expect(await stepRow(original.id)).toMatchObject({ instruction: before.instruction, revision: before.revision, position: before.position });
    const created = await db.select().from(nextSteps).where(eq(nextSteps.instruction, 'stolen create'));
    expect(created).toEqual([]);
  });

  it('rejects a user-created run and a run from another project', async () => {
    const before = await projectSteps();
    await expect(createNextStep(db, workerA, {
      project_id: project.id, source_run_id: userRun.id, instruction: 'from user', request_id: 'user-run',
    })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(createNextStep(db, workerA, {
      project_id: project.id, source_run_id: foreignRun.id, instruction: 'from elsewhere', request_id: 'foreign-run',
    })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(setWaitingNote(db, workerB, {
      project_id: project.id, source_run_id: runA.id, expected_revision: 1, text: 'not mine', request_id: 'wait-foreign',
    })).rejects.toMatchObject({ code: 'forbidden' });
    expect(await projectSteps()).toEqual(before);
    const note = (await listNextStepsForAgent(db, workerA, { project_id: project.id })).waitingNote;
    expect(note?.text).toBe('Still running');
  });

  it('lets a worker add a follow-up after the source run has failed', async () => {
    const ended = await runs.updateRun(db, workerA, project.id, runA.id, 1, { executionState: 'failed', workStatus: 'failed' });
    expect(ended.status).toBe('saved');
    const step = saved(await createNextStep(db, workerA, {
      project_id: project.id, source_run_id: runA.id, instruction: 'Follow up after failure', request_id: 'after-fail',
    }));
    expect(step).toMatchObject({ sourceRunId: runA.id, done: false });
    expect((await runs.getRun(db, owner, project.id, runA.id)).executionState).toBe('failed');
  });

  it('keeps user completion across an agent edit and a reopen', async () => {
    const step = saved(await createNextStep(db, workerA, {
      project_id: project.id, source_run_id: runA.id, instruction: 'Check the deploy', request_id: 'complete-me',
    }));
    const completed = await stepRepo.setStepCompletion(db, owner, project.id, step.id, step.revision, true);
    expect(completed.status).toBe('saved');
    if (completed.status !== 'saved') return;
    const edited = saved(await updateNextStep(db, workerA, {
      project_id: project.id, step_id: step.id, source_run_id: runA.id, expected_revision: completed.value.revision,
      instruction: 'Check the deploy carefully', request_id: 'edit-done',
    }));
    expect(completed.value.completionChangedAt).toBeInstanceOf(Date);
    expect(edited).toMatchObject({
      done: true,
      instruction: 'Check the deploy carefully',
      completionChangedBy: owner.userId,
      completionChangedAt: completed.value.completionChangedAt!.toISOString(),
      revision: completed.value.revision + 1,
    });
    const reopened = await stepRepo.setStepCompletion(db, owner, project.id, step.id, edited.revision, false);
    expect(reopened.status).toBe('saved');
    if (reopened.status !== 'saved') return;
    const afterReopen = saved(await updateNextStep(db, workerA, {
      project_id: project.id, step_id: step.id, source_run_id: runA.id, expected_revision: reopened.value.revision,
      instruction: 'Check the deploy again', request_id: 'edit-reopened',
    }));
    expect(afterReopen.done).toBe(false);
    expect(afterReopen.completionChangedBy).toBe(owner.userId);
    expect(reopened.value.completionChangedAt).toBeInstanceOf(Date);
    expect(afterReopen.completionChangedAt).toBe(reopened.value.completionChangedAt!.toISOString());
    await expect(updateNextStep(db, workerA, {
      project_id: project.id, step_id: step.id, source_run_id: runA.id, expected_revision: afterReopen.revision,
      instruction: 'nope', done: true, request_id: 'smuggle-done',
    })).rejects.toMatchObject({ code: 'validation_error' });
    expect((await stepRow(step.id)).done).toBe(false);
  });

  it('reorders only positions when every current revision is named', async () => {
    const fresh = await projects.createProject(db, owner, { name: 'Reorder', type: 'coding' });
    const freshAgent = await agents.createAgent(db, owner, fresh.id, { name: 'reorder', title: 'Reorder', workloadType: 'coding' });
    const granted = await credentials.createCredential(db, owner, { label: 'reorder-a', tokenHash: 'hash-reorder-a', displaySuffix: 'roa', projectIds: [fresh.id] });
    const author: CredentialAccess = { kind: 'credential', userId: owner.userId, credentialId: granted.id, projectIds: [fresh.id] };
    const authorRun = await runs.createRun(db, author, fresh.id, { agentId: freshAgent.id, title: 'Reorder run', workloadType: 'coding' });
    const otherGrant = await credentials.createCredential(db, owner, { label: 'reorder-d', tokenHash: 'hash-reorder-d', displaySuffix: 'rod', projectIds: [fresh.id] });
    const desk: CredentialAccess = { kind: 'credential', userId: owner.userId, credentialId: otherGrant.id, projectIds: [fresh.id] };
    const a = saved(await createNextStep(db, author, { project_id: fresh.id, source_run_id: authorRun.id, instruction: 'A', position: 0, request_id: 'ord-a' }));
    const b = saved(await createNextStep(db, author, { project_id: fresh.id, source_run_id: authorRun.id, instruction: 'B', position: 1, request_id: 'ord-b' }));
    const c = saved(await createNextStep(db, author, { project_id: fresh.id, source_run_id: authorRun.id, instruction: 'C', position: 5, request_id: 'ord-c' }));
    await stepRepo.setStepCompletion(db, owner, fresh.id, b.id, b.revision, true);
    const before = await db.select().from(nextSteps).where(eq(nextSteps.projectId, fresh.id)).orderBy(nextSteps.id);

    const missing = await reorderNextSteps(db, desk, {
      project_id: fresh.id,
      order: [{ step_id: c.id, expected_revision: c.revision }, { step_id: a.id, expected_revision: a.revision }],
      request_id: 'ord-missing',
    });
    expect(missing.status).toBe('conflict');
    const stale = await reorderNextSteps(db, desk, {
      project_id: fresh.id,
      order: [
        { step_id: c.id, expected_revision: c.revision },
        { step_id: b.id, expected_revision: 99 },
        { step_id: a.id, expected_revision: a.revision },
      ],
      request_id: 'ord-stale',
    });
    expect(stale.status).toBe('conflict');
    const duplicate = await reorderNextSteps(db, desk, {
      project_id: fresh.id,
      order: [
        { step_id: a.id, expected_revision: a.revision },
        { step_id: a.id, expected_revision: a.revision },
        { step_id: b.id, expected_revision: b.revision + 1 },
      ],
      request_id: 'ord-duplicate',
    });
    expect(duplicate.status).toBe('conflict');
    expect(await db.select().from(nextSteps).where(eq(nextSteps.projectId, fresh.id)).orderBy(nextSteps.id)).toEqual(before);

    const moved = saved(await reorderNextSteps(db, desk, {
      project_id: fresh.id,
      order: [
        { step_id: c.id, expected_revision: c.revision },
        { step_id: b.id, expected_revision: b.revision + 1 },
        { step_id: a.id, expected_revision: a.revision },
      ],
      request_id: 'ord-ok',
    }));
    expect(moved.map((step) => step.instruction)).toEqual(['C', 'B', 'A']);
    expect(moved.map((step) => step.position)).toEqual([0, 1, 2]);
    expect(moved[0]).toMatchObject({ revision: c.revision + 1, sourceRunId: authorRun.id, done: false });
    expect(moved[1]).toMatchObject({ revision: b.revision + 1, done: true, completionChangedBy: owner.userId, instruction: 'B' });
    expect(moved[2]).toMatchObject({ revision: a.revision + 1, instruction: 'A' });
    const replay = await reorderNextSteps(db, desk, {
      project_id: fresh.id,
      order: [
        { step_id: c.id, expected_revision: c.revision },
        { step_id: b.id, expected_revision: b.revision + 1 },
        { step_id: a.id, expected_revision: a.revision },
      ],
      request_id: 'ord-ok',
    });
    expect(replay).toEqual({ status: 'saved', value: moved });
    expect((await db.select().from(nextSteps).where(eq(nextSteps.id, c.id)))[0]?.revision).toBe(c.revision + 1);
  });

  it('returns the original step when create is retried and rejects a different body', async () => {
    const input = { project_id: project.id, source_run_id: runB.id, instruction: 'Once', request_id: 'once' };
    const first = saved(await createNextStep(db, workerB, input));
    const second = saved(await createNextStep(db, workerB, input));
    expect(second).toEqual(first);
    const mismatch = await createNextStep(db, workerB, { ...input, instruction: 'Twice' });
    expect(mismatch).toEqual({ status: 'idempotency_mismatch' });
    const rows = await db.select().from(nextSteps).where(eq(nextSteps.instruction, 'Once'));
    expect(rows).toHaveLength(1);
    const twice = await db.select().from(nextSteps).where(eq(nextSteps.instruction, 'Twice'));
    expect(twice).toEqual([]);
  });

  it('appends when position is omitted and refuses another user project', async () => {
    const before = (await projectSteps()).map((step) => step.position);
    const appended = saved(await createNextStep(db, workerB, {
      project_id: project.id, source_run_id: runB.id, instruction: 'Appended', request_id: 'append',
    }));
    expect(appended.position).toBe(Math.max(...before) + 1);
    await expect(listNextStepsForAgent(db, workerA, { project_id: 'missing-project' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(createNextStep(db, { ...workerA, projectIds: [] }, {
      project_id: project.id, source_run_id: runA.id, instruction: 'no grant', request_id: 'no-grant',
    })).rejects.toMatchObject({ code: 'not_found' });
  });
});

async function grant(label: string, tokenHash: string): Promise<CredentialAccess> {
  const issued = await credentials.createCredential(db, owner, { label, tokenHash, displaySuffix: tokenHash.slice(-4), projectIds: [project.id] });
  return { kind: 'credential', userId: owner.userId, credentialId: issued.id, projectIds: [project.id] };
}
