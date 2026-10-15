import type { ProjectInput } from '../types';
export interface ProjectDraft {
  name: string; description: string; type: ProjectInput['type']; lifecycle: ProjectInput['lifecycle']; repositoryName: string;
  repositoryUrl: string; prdUrl: string; tags: string; staleThresholdMinutes: string; heartbeatExpected: boolean; instructions: string;
}
export function projectDraft(project?: ProjectInput): ProjectDraft {
  return { name: project?.name ?? '', description: project?.description ?? '', type: project?.type ?? 'coding', lifecycle: project?.lifecycle ?? 'active',
    repositoryName: project?.repositoryName ?? '', repositoryUrl: project?.repositoryUrl ?? '', prdUrl: project?.prdUrl ?? '', tags: project?.tags.join(', ') ?? '',
    staleThresholdMinutes: String(project?.reportingPolicy.staleThresholdMinutes ?? 15), heartbeatExpected: project?.reportingPolicy.heartbeatExpected ?? true, instructions: project?.reportingPolicy.instructions ?? '' };
}
export function draftInput(draft: ProjectDraft): ProjectInput {
  return { name: draft.name.trim(), description: draft.description, type: draft.type, lifecycle: draft.lifecycle,
    repositoryName: draft.repositoryName.trim() || null, repositoryUrl: draft.repositoryUrl.trim() || null, prdUrl: draft.prdUrl.trim() || null,
    tags: [...new Set(draft.tags.split(',').map(tag => tag.trim()).filter(Boolean))],
    reportingPolicy: { staleThresholdMinutes: Number(draft.staleThresholdMinutes), heartbeatExpected: draft.heartbeatExpected, instructions: draft.instructions } };
}
export function validateDraft(draft: ProjectDraft): Partial<Record<keyof ProjectDraft, string>> {
  const errors: Partial<Record<keyof ProjectDraft, string>> = {};
  if (!draft.name.trim()) errors.name = 'Enter a project name.';
  const threshold = Number(draft.staleThresholdMinutes);
  if (!Number.isFinite(threshold) || threshold <= 0) errors.staleThresholdMinutes = 'Enter a positive number of minutes.';
  for (const key of ['repositoryUrl', 'prdUrl'] as const) {
    if (!draft[key].trim()) continue;
    try { if (!['http:', 'https:'].includes(new URL(draft[key].trim()).protocol)) throw new Error(); }
    catch { errors[key] = 'Enter a full HTTP or HTTPS URL.'; }
  }
  return errors;
}
