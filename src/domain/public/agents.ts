import type { PublicAgent, PublicProject, PublicRun } from '../../data/public/types';

export function publicAgentsView(value: string | null | undefined): 'grid' | 'table' {
  return value === 'table' ? 'table' : 'grid';
}

export function publicLiveness(run: Pick<PublicRun, 'stale' | 'executionState'> | null): 'Live' | 'Stale' | '—' {
  if (!run) return '—';
  if (run.stale) return 'Stale';
  if (run.executionState === 'running') return 'Live';
  return '—';
}

export interface PublicTableRow { project: string; agent: string; run: PublicRun | null }

/** P2-H order: newest last contact, then newest start. Rows with no run stay last in server order. */
export function publicTableRows(projects: readonly PublicProject[]): PublicTableRow[] {
  const rows: PublicTableRow[] = [];
  for (const project of projects) {
    if (project.agents.length === 0) {
      rows.push({ project: project.name, agent: '—', run: null });
      continue;
    }
    for (const agent of project.agents) {
      if (agent.runs.length === 0) {
        rows.push({ project: project.name, agent: agent.name, run: null });
        continue;
      }
      for (const run of agent.runs) rows.push({ project: project.name, agent: agent.name, run });
    }
  }
  rows.sort((left, right) => {
    if (!left.run) return right.run ? 1 : 0;
    if (!right.run) return -1;
    return Date.parse(right.run.lastContactAt) - Date.parse(left.run.lastContactAt)
      || Date.parse(right.run.startedAt) - Date.parse(left.run.startedAt);
  });
  return rows;
}

export interface PublicAgentCard {
  project: string;
  agent: string;
  title: string;
  run: PublicRun | null;
  runCount: number;
  lastContactAt: string | null;
}

function latestRun(agent: PublicAgent): PublicRun | null {
  return agent.runs.reduce<PublicRun | null>((best, run) => {
    if (!best) return run;
    const contact = Date.parse(run.lastContactAt) - Date.parse(best.lastContactAt);
    if (contact !== 0) return contact > 0 ? run : best;
    return Date.parse(run.startedAt) >= Date.parse(best.startedAt) ? run : best;
  }, null);
}

/** One card per logical agent. Newest contact first. Agents with no runs stay last in server order. */
export function publicAgentCards(projects: readonly PublicProject[]): PublicAgentCard[] {
  const cards: Array<PublicAgentCard & { order: number }> = [];
  let order = 0;
  for (const project of projects) {
    for (const agent of project.agents) {
      const latest = latestRun(agent);
      cards.push({
        project: project.name,
        agent: agent.name,
        title: latest?.title ?? '—',
        run: latest,
        runCount: agent.runs.length,
        lastContactAt: latest?.lastContactAt ?? null,
        order: order++,
      });
    }
  }
  cards.sort((left, right) => {
    if (left.lastContactAt === null) return right.lastContactAt === null ? left.order - right.order : 1;
    if (right.lastContactAt === null) return -1;
    return Date.parse(right.lastContactAt) - Date.parse(left.lastContactAt) || left.order - right.order;
  });
  return cards.map(card => ({
    project: card.project, agent: card.agent, title: card.title, run: card.run, runCount: card.runCount, lastContactAt: card.lastContactAt,
  }));
}

export interface HarnessSeries { harness: string; counts: readonly number[] }

export function harnessLegend(series: readonly HarnessSeries[]): { harness: string; total: number }[] {
  const totals = series.map(item => ({ harness: item.harness, total: item.counts.reduce((sum, count) => sum + count, 0) }));
  return [...totals.filter(item => item.harness !== 'Other'), ...totals.filter(item => item.harness === 'Other')];
}

export function harnessPeriodTotal(series: readonly HarnessSeries[]): number {
  return harnessLegend(series).reduce((sum, item) => sum + item.total, 0);
}

export function formatAgentRunHeading(total: number): string {
  return `${total} agent ${total === 1 ? 'run' : 'runs'}`;
}

export function formatRunCount(count: number): string {
  return `${count} ${count === 1 ? 'run' : 'runs'}`;
}
