import { ownedScope } from '../agents/allAgents';
import { stale } from '../runs/grid';
import type { LogicalAgent, Project, Run } from '../types';

export const attentionGroups = ['blocked', 'stale', 'review'] as const;
export type AttentionGroup = (typeof attentionGroups)[number];
export const attentionLabels: Record<AttentionGroup, string> = { blocked: 'Blocked', stale: 'Stale', review: 'Waiting for review' };

/** One owner-scoped derivation for the home screen and navigation badge. */
export function needsAttention(accountId: string, projects: readonly Project[], runs: readonly Run[], agents: readonly LogicalAgent[], now: number) {
  const scope = ownedScope(accountId, projects, runs, agents);
  const context = { ...scope, now };
  const groups: Record<AttentionGroup, Run[]> = { blocked: [], stale: [], review: [] };
  for (const run of scope.runs) {
    if (run.workStatus === 'blocked') groups.blocked.push(run);
    else if (run.executionState === 'running' && stale(run, context)) groups.stale.push(run);
    else if (run.executionState === 'finished' && run.workStatus === 'waiting_for_review') groups.review.push(run);
  }
  for (const group of attentionGroups) {
    const time = (run: Run) => Date.parse(group === 'blocked' ? run.updatedAt : group === 'stale' ? run.lastContactAt : run.finishedAt ?? run.updatedAt);
    groups[group].sort((a, b) => time(a) - time(b) || a.id.localeCompare(b.id));
  }
  return { ...scope, groups, total: attentionGroups.reduce((sum, group) => sum + groups[group].length, 0) };
}
