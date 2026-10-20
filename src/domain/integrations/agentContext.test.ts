import { describe, expect, it } from 'vitest';
import { nextStepSummary } from '../derive';
import type { NextStep, Project, WaitingNote } from '../types';
import { BASE_INSTRUCTION_DRAFT, agentFacingContext, gettingStartedState, newestPromptProject, projectPrompt } from './agentContext';

function project(): Project {
  return {
    id: 'prj_sample', ownerId: 'usr', name: 'Sample', description: '', type: 'coding', lifecycle: 'active',
    repositoryName: null, repositoryUrl: null, prdUrl: null, tags: [],
    reportingPolicy: { staleThresholdMinutes: 15, heartbeatExpected: true, instructions: 'Report honestly.' },
    createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z', revision: 1,
  };
}

function step(overrides: Partial<NextStep>): NextStep {
  return {
    id: 'step', projectId: 'prj_sample', position: 1, instruction: 'Do the thing', done: false, sourceRunId: 'run',
    createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z', revision: 1,
    completionChangedBy: null, completionChangedAt: null, ...overrides,
  };
}

describe('agentFacingContext', () => {
  it('keeps unfinished steps in position then id order and counts them with nextStepSummary', () => {
    const steps = [
      step({ id: 'b', position: 2 }),
      step({ id: 'a', position: 2 }),
      step({ id: 'done', position: 1, done: true, instruction: 'Already finished' }),
      step({ id: 'd', position: 1 }),
    ];
    const context = agentFacingContext(project(), { steps, waitingNote: null });
    const summary = nextStepSummary(steps);
    expect(context.openSteps.map(item => item.id)).toEqual(['d', 'a', 'b']);
    expect(context.openSteps.some(item => item.done)).toBe(false);
    expect(context.openSteps[0]?.id).toBe(summary.first?.id);
    expect(context.remainingOpenSteps).toBe(summary.remaining);
    expect(context.waitingNote).toBeNull();
  });

  it('passes through waiting-note text only', () => {
    const waiting: WaitingNote = { projectId: 'prj_sample', text: 'Still in flight', sourceRunId: 'run_secret', updatedAt: '2026-10-14T00:00:00.000Z', revision: 4 };
    const context = agentFacingContext(project(), { steps: [], waitingNote: waiting });
    expect(context.waitingNote).toBe('Still in flight');
    expect(JSON.stringify(context)).not.toContain('run_secret');
    expect(context.remainingOpenSteps).toBe(0);
    expect(context.openSteps).toEqual([]);
  });
});

describe('project prompt', () => {
  it('starts with the project line and then the base draft verbatim', () => {
    const prompt = projectPrompt({ id: 'prj_1', name: 'Offers' });
    const line = 'Report to Supa Agent Tracker project "Offers" (project_id prj_1); use that id instead of matching by repository.';
    expect(prompt.startsWith(`${line}\n`)).toBe(true);
    expect(prompt.slice(line.length + 1)).toBe(BASE_INSTRUCTION_DRAFT);
    expect(prompt).not.toContain('sat_');
    expect(prompt).not.toContain('Bearer');
  });

  it('picks the newest non-archived project and scores 0, 1 and 2 done steps', () => {
    const older = { ...project(), id: 'prj_old', name: 'Old', createdAt: '2026-10-01T00:00:00.000Z' };
    const newer = { ...project(), id: 'prj_new', name: 'New', createdAt: '2026-10-18T00:00:00.000Z' };
    const archived = { ...project(), id: 'prj_zzz', name: 'Archived', lifecycle: 'archived' as const, createdAt: '2026-10-19T00:00:00.000Z' };
    expect(newestPromptProject([older, archived, newer])?.id).toBe('prj_new');
    expect(newestPromptProject([archived])).toBeNull();
    expect(gettingStartedState([], []).doneCount).toBe(0);
    expect(gettingStartedState([older], []).doneCount).toBe(1);
    expect(gettingStartedState([], [{ revokedAt: null }]).doneCount).toBe(1);
    expect(gettingStartedState([older], [{ revokedAt: '2026-10-02T00:00:00.000Z' }]).doneCount).toBe(1);
    const ready = gettingStartedState([older, newer], [{ revokedAt: '2026-10-02T00:00:00.000Z' }, { revokedAt: null }]);
    expect(ready.doneCount).toBe(2);
    expect(ready.steps.map(step => step.done)).toEqual([true, true, false]);
    expect(ready.promptProject?.id).toBe('prj_new');
    expect(gettingStartedState([older, newer], [{ revokedAt: null }]).steps[2]?.done).toBe(false);
  });
});
