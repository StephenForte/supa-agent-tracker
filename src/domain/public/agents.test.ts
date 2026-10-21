import { describe, expect, it } from 'vitest';
import type { PublicProject, PublicRun } from '../../data/public/types';
import { formatAgentRunHeading, harnessLegend, harnessPeriodTotal, publicAgentCards, publicAgentsView, publicTableRows } from './agents';

const run = (title: string, lastContactAt: string, startedAt = lastContactAt): PublicRun => ({
  title, executionState: 'running', workStatus: 'in_progress', stale: false, harness: 'cursor', startedAt, lastContactAt, finishedAt: null,
});

describe('public agent presentation', () => {
  it('reads the view param and falls back to grid', () => {
    expect(publicAgentsView(null)).toBe('grid');
    expect(publicAgentsView('table')).toBe('table');
    expect(publicAgentsView('TABLE')).toBe('grid');
    expect(publicAgentsView('cards')).toBe('grid');
  });

  it('orders cards by latest contact and leaves agents with no runs last', () => {
    const projects: PublicProject[] = [
      { name: 'Empty project', agents: [] },
      { name: 'Mixed', agents: [
        { name: 'Idle first', runs: [] },
        { name: 'Alpha', runs: [run('Older', '2026-10-19T10:00:00Z')] },
        { name: 'Zulu', runs: [run('Newer', '2026-10-19T12:00:00Z'), run('Middle', '2026-10-19T11:00:00Z')] },
        { name: 'Idle last', runs: [] },
      ] },
    ];
    expect(publicAgentCards(projects).map(card => [card.project, card.agent, card.title, card.runCount])).toEqual([
      ['Mixed', 'Zulu', 'Newer', 2],
      ['Mixed', 'Alpha', 'Older', 1],
      ['Mixed', 'Idle first', '—', 0],
      ['Mixed', 'Idle last', '—', 0],
    ]);
    expect(publicTableRows(projects).map(row => row.run?.title ?? row.agent)).toEqual([
      'Newer', 'Middle', 'Older', '—', 'Idle first', 'Idle last',
    ]);
  });

  it('puts Other last and sums each series', () => {
    const series = [
      { harness: 'Other', counts: [20, 23] },
      { harness: 'Cursor', counts: [100, 75] },
      { harness: 'Codex', counts: [3] },
    ];
    expect(harnessLegend(series)).toEqual([
      { harness: 'Cursor', total: 175 },
      { harness: 'Codex', total: 3 },
      { harness: 'Other', total: 43 },
    ]);
    expect(harnessPeriodTotal(series)).toBe(221);
    expect(formatAgentRunHeading(218)).toBe('218 agent runs');
    expect(formatAgentRunHeading(1)).toBe('1 agent run');
  });
});
