import type { Project } from '../../domain/types';

export type ScopeMode = 'all' | 'specific';

export function ScopeFields({ mode, projectIds, projects, onMode, onProjectIds }: {
  mode: ScopeMode; projectIds: readonly string[]; projects: readonly Project[];
  onMode: (mode: ScopeMode) => void; onProjectIds: (projectIds: string[]) => void;
}) {
  return <fieldset>
    <legend>Project scope</legend>
    <label><input type="radio" name="token-scope-mode" checked={mode === 'all'} onChange={() => onMode('all')} /> All my projects (including future ones)</label>
    <label><input type="radio" name="token-scope-mode" checked={mode === 'specific'} onChange={() => onMode('specific')} /> Specific projects</label>
    {mode === 'specific' && projects.map(project => <label key={project.id}><input type="checkbox" checked={projectIds.includes(project.id)} onChange={() => onProjectIds(projectIds.includes(project.id) ? projectIds.filter(id => id !== project.id) : [...projectIds, project.id])} />{project.name}</label>)}
  </fieldset>;
}
