import { describe, expect, it } from 'vitest';
import { nextStepSummary } from '../derive';
import type { NextStep, Project, WaitingNote } from '../types';
import { agentFacingContext } from './agentContext';

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
