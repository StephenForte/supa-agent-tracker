import type { Lifecycle, ProjectType, ToolAggregate } from './types';
export const formatNullable = (value: string | number | null | undefined): string => value == null ? '—' : String(value);
export const formatIdentity = (value: string | null | undefined): string => value?.trim() || 'Unknown';
/** D-013 display words for project type and lifecycle. Forms, cards and detail share these. */
export const projectTypeLabels: Record<ProjectType, string> = { coding: 'Coding', automation: 'Automation' };
export const lifecycleLabels: Record<Lifecycle, string> = { active: 'Active', paused: 'Paused', completed: 'Completed', archived: 'Archived' };
/** Same count, same words, on the project card and the detail header. */
export const projectCountLabels = [
  ['liveRunning', 'Live running'], ['staleRunning', 'Stale running'], ['reviewNeeded', 'Review needed'],
  ['liveRunningAgents', 'Live logical agents'], ['totalLogicalAgents', 'Logical agents'], ['totalRuns', 'Runs'],
] as const;
export const formatDescription = (description: string): string => description.trim() || 'No description yet.';
export function repositoryPresentation(project: { repositoryName: string | null; repositoryUrl: string | null }): { href: string | null; text: string } {
  return project.repositoryUrl ? { href: project.repositoryUrl, text: project.repositoryName?.trim() || 'Repository' } : { href: null, text: `Repository: ${formatNullable(project.repositoryName)}` };
}
export function prdPresentation(project: { prdUrl: string | null }): { href: string | null; text: string } {
  return project.prdUrl ? { href: project.prdUrl, text: 'Project PRD' } : { href: null, text: 'PRD: —' };
}
export function formatTimestamp(value: string | null, timeZone?: string): string {
  return value === null ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value));
}
export function formatElapsed(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`;
}
export function formatToolTelemetry(tools: readonly ToolAggregate[] | null): string {
  return tools === null ? 'No telemetry reported' : `${tools.reduce((sum, tool) => sum + tool.callCount, 0)} calls reported`;
}
