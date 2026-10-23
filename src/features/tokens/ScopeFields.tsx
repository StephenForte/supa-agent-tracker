import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import type { Project } from '../../domain/types';

export type ScopeMode = 'all' | 'specific';

export function ScopeFields({ mode, projectIds, projects, onMode, onProjectIds }: {
  mode: ScopeMode; projectIds: readonly string[]; projects: readonly Project[];
  onMode: (mode: ScopeMode) => void; onProjectIds: (projectIds: string[]) => void;
}) {
  const [filter, setFilter] = useState('');
  const canFilter = projects.length > 8;
  const visible = canFilter ? projects.filter(project => project.name.toLowerCase().includes(filter.toLowerCase())) : projects;
  const selected = projects.filter(project => projectIds.includes(project.id)).length;
  return <div className="token-scope" role="group" aria-label="Project scope">
    <h3>Project scope</h3>
    <label className="token-scope-choice"><input type="radio" name="token-scope-mode" checked={mode === 'all'} onChange={() => onMode('all')} /> All my projects (including future ones)</label>
    <label className="token-scope-choice"><input type="radio" name="token-scope-mode" checked={mode === 'specific'} onChange={() => onMode('specific')} /> Specific projects</label>
    {mode === 'specific' && <>
      {canFilter && <label className="token-scope-filter">Filter projects<input type="search" value={filter} onChange={event => setFilter(event.target.value)} /></label>}
      <div className="token-scope-tools">
        <span role="status">{selected} of {projects.length} selected</span>
        <Button onClick={() => onProjectIds([...new Set([...projectIds, ...visible.map(project => project.id)])])}>Select all</Button>
        <Button onClick={() => onProjectIds([])}>Clear</Button>
      </div>
      <div className="token-scope-list" role="group" aria-label="Projects">
        {visible.map(project => <label className="token-scope-choice" key={project.id}><input type="checkbox" checked={projectIds.includes(project.id)} onChange={() => onProjectIds(projectIds.includes(project.id) ? projectIds.filter(id => id !== project.id) : [...projectIds, project.id])} /><span>{project.name}</span></label>)}
        {!visible.length && <p>{projects.length ? 'No matching projects.' : 'No projects available.'}</p>}
      </div>
    </>}
  </div>;
}
