import { describe, expect, it } from 'vitest';
import { nextStepSummary } from '../derive';
import type { LogicalAgent, NextStep, Run } from '../types';
import type { PrivateNote } from '../privateNotes';
import { instructionSegments } from './instruction';
import { notePreview, reconcilePrivateNote } from './privateNote';
import { completedSteps, completionActorLabel, openSteps, orderedSteps, simulatedInstructionRewrite, sourceAgentName, staleRevision } from './steps';

function step(patch: Partial<NextStep> & Pick<NextStep, 'id' | 'position' | 'done'>): NextStep {
  return { projectId: 'prj', instruction: patch.id, sourceRunId: 'run', createdAt: '2026-10-14T18:00:00.000Z', updatedAt: '2026-10-14T19:00:00.000Z', revision: 1, completionChangedBy: null, completionChangedAt: null, ...patch };
}
function note(patch: Partial<PrivateNote> = {}): PrivateNote {
  return { projectId: 'prj', text: 'Saved', updatedAt: '2026-10-14T19:00:00.000Z', revision: 1, ...patch };
}

describe('step order', () => {
  it('orders open and completed steps by position then id without mutating the input', () => {
    const steps = [step({ id: 'c', position: 2, done: false }), step({ id: 'a', position: 1, done: true }), step({ id: 'b', position: 2, done: false }), step({ id: 'd', position: 1, done: false })];
    const before = structuredClone(steps);
    expect(openSteps(steps).map(item => item.id)).toEqual(['d', 'b', 'c']);
    expect(completedSteps(steps).map(item => item.id)).toEqual(['a']);
    expect(orderedSteps(steps)).not.toBe(steps);
    expect(steps).toEqual(before);
  });
  it('agrees with nextStepSummary for the first unfinished step and the remaining count', () => {
    const samples = [
      [],
      [step({ id: 'only', position: 3, done: true })],
      [step({ id: 'z', position: 5, done: false }), step({ id: 'a', position: 5, done: false }), step({ id: 'done', position: 1, done: true })],
    ];
    for (const steps of samples) {
      const summary = nextStepSummary(steps);
      const open = openSteps(steps);
      expect(summary.first).toEqual(open[0] ?? null);
      expect(summary.remaining).toBe(open.length);
    }
  });
});

describe('source and completion labels', () => {
  it('names the source agent from the run and leaves unknown links blank', () => {
    const run = { id: 'run_9', agentId: 'agt_9', message: 'NOT_THE_AGENT' } as Run;
    const agent = { id: 'agt_9', name: 'Worker' } as LogicalAgent;
    expect(sourceAgentName('run_9', [run], [agent])).toBe('Worker');
    expect(sourceAgentName('run_9', [run], [])).toBeNull();
    expect(sourceAgentName('missing', [run], [agent])).toBeNull();
  });
  it('shows the account name for the signed-in actor and the raw id otherwise', () => {
    const account = { id: 'usr_demo', name: 'Demo operator' };
    expect(completionActorLabel('usr_demo', account)).toBe('Demo operator');
    expect(completionActorLabel('usr_other', account)).toBe('usr_other');
    expect(completionActorLabel(null, account)).toBeNull();
  });
});

describe('simulated agent writes', () => {
  it('builds a revision that cannot match and a rewrite that changes each time', () => {
    expect(staleRevision(1)).toBe(0);
    expect(staleRevision(4)).not.toBe(4);
    const first = simulatedInstructionRewrite('Check the form', 1);
    const second = simulatedInstructionRewrite(first, 2);
    expect(first).not.toBe('Check the form');
    expect(second).not.toBe(first);
    expect(second.match(/ \[demo update \d+\]/g)).toHaveLength(1);
    expect(simulatedInstructionRewrite('   ', 0)).toBe('Updated instruction [demo update 1]');
  });
});

describe('instruction formatting', () => {
  it('keeps markup as text, links only http(s) urls, and treats backticks as code', () => {
    const html = '<img src=x onerror=alert(1)>';
    expect(instructionSegments(html)).toEqual([{ kind: 'text', text: html }]);
    expect(instructionSegments('javascript:alert(1)').some(segment => segment.kind === 'link')).toBe(false);
    expect(instructionSegments('See `npm test` now')).toEqual([
      { kind: 'text', text: 'See ' }, { kind: 'code', text: 'npm test' }, { kind: 'text', text: ' now' },
    ]);
    expect(instructionSegments('Go to https://example.com/a. Next')).toEqual([
      { kind: 'text', text: 'Go to ' }, { kind: 'link', text: 'https://example.com/a', href: 'https://example.com/a' }, { kind: 'text', text: '. Next' },
    ]);
    expect(instructionSegments('`https://example.com`').filter(segment => segment.kind === 'link')).toEqual([]);
    const mixed = 'Before `code` https://example.com/path after';
    const visible = instructionSegments(mixed).map(segment => segment.text).join('');
    expect(visible).toBe('Before code https://example.com/path after');
  });
});

describe('private note preview and editor reconcile', () => {
  it('truncates a single-line preview and treats blank notes as absent', () => {
    expect(notePreview('  \n  ')).toBeNull();
    expect(notePreview('hello\nworld')).toBe('hello world');
    const long = `${'word '.repeat(30)}end`;
    const preview = notePreview(long);
    expect(preview).not.toBeNull();
    expect(preview!.length).toBeLessThanOrEqual(80);
    expect(preview!.endsWith('…')).toBe(true);
    expect(long.startsWith(preview!.slice(0, -1).trimEnd())).toBe(true);
    expect(notePreview('a'.repeat(81))!.length).toBeLessThanOrEqual(80);
  });
  it('keeps a dirty draft on a redundant read, adopts a reset, and conflicts on a newer note', () => {
    const baseline = note();
    expect(reconcilePrivateNote(baseline, { ...baseline }, 'typed')).toBe('keep-draft');
    expect(reconcilePrivateNote(baseline, { ...baseline, updatedAt: '2026-10-14T21:00:00.000Z' }, 'typed')).toBe('adopt');
    expect(reconcilePrivateNote(note({ revision: 3, text: 'Edited' }), note({ revision: 1, text: 'Seed' }), 'typed')).toBe('adopt');
    expect(reconcilePrivateNote(baseline, note({ revision: 2, text: 'Someone else' }), 'typed')).toBe('conflict');
    expect(reconcilePrivateNote(baseline, note({ revision: 2, text: 'Someone else' }), null)).toBe('adopt');
  });
});
