import type { LogicalAgent, NextStep, Project, Run } from './types';
export function elapsed(run: Run, now: number): number { return Math.max(0, (run.finishedAt === null ? now : Date.parse(run.finishedAt)) - Date.parse(run.startedAt)); }
export function isStale(run: Run, project: Project, now: number): boolean {
  return run.executionState === 'running' && now - Date.parse(run.lastContactAt) > project.reportingPolicy.staleThresholdMinutes * 60_000;
}
export function projectCounts(project: Project, runs: readonly Run[], agents: readonly LogicalAgent[], now: number) {
  const own = runs.filter(run => run.projectId === project.id);
  const live = own.filter(run => run.executionState === 'running' && !isStale(run, project, now));
  return { liveRunning: live.length, liveRunningAgents: new Set(live.map(run => run.agentId)).size,
    staleRunning: own.filter(run => isStale(run, project, now)).length,
    reviewNeeded: own.filter(run => run.workStatus === 'waiting_for_review').length,
    totalLogicalAgents: agents.filter(agent => agent.projectId === project.id).length, totalRuns: own.length };
}
export function latestActivity(projectId: string, runs: readonly Run[]) {
  return runs.filter(run => run.projectId === projectId).reduce<Run | null>((latest, run) => !latest || Date.parse(run.updatedAt) > Date.parse(latest.updatedAt) ? run : latest, null);
}
export function nextStepSummary(steps: readonly NextStep[]) {
  const unfinished = steps.filter(step => !step.done).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return { first: unfinished[0] ?? null, remaining: unfinished.length };
}
/** Lexicographic ascending: live work first, latest activity descending, stable name/id tie-breakers. */
export function activeFirstProjectSortKey(project: Project, runs: readonly Run[], now: number): readonly [number, number, string, string] {
  return [runs.some(run => run.projectId === project.id && run.executionState === 'running' && !isStale(run, project, now)) ? 0 : 1,
    -Date.parse(latestActivity(project.id, runs)?.updatedAt ?? project.updatedAt), project.name.toLowerCase(), project.id];
}
export function compareProjectsActiveFirst(a: Project, b: Project, runs: readonly Run[], now: number): number {
  const x = activeFirstProjectSortKey(a, runs, now), y = activeFirstProjectSortKey(b, runs, now);
  return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]) || x[3].localeCompare(y[3]);
}
