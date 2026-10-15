import { Link } from 'react-router';
import { Badge } from '../../components/ui/Badge';
import { latestActivity, projectCounts } from '../../domain/derive';
import { formatDescription, formatTimestamp, lifecycleLabels, projectCountLabels, projectTypeLabels } from '../../domain/format';
import { agentName } from '../../domain/runs/grid';
import type { LogicalAgent, Project, Run } from '../../domain/types';
import { NextStepsPreview } from '../next-steps/NextStepsPreview';
import { PrivateNotePreview } from '../private-notes/PrivateNotePreview';
import { ProjectResources } from './ProjectResources';

export function ProjectCard({ project, runs, agents, now }: { project: Project; runs: Run[]; agents: LogicalAgent[]; now: number }) {
  const counts = projectCounts(project, runs, agents, now);
  const latest = latestActivity(project.id, runs);
  const detail = `/projects/${project.id}`;
  return <article aria-labelledby={`project-${project.id}`} className="min-w-0 rounded-xl border border-slate-300 bg-white p-5 [overflow-wrap:anywhere]">
    <div className="mb-3 flex flex-wrap gap-2"><Badge tone={project.lifecycle}>{lifecycleLabels[project.lifecycle]}</Badge><Badge>{projectTypeLabels[project.type]}</Badge></div>
    <h2 id={`project-${project.id}`}><Link to={detail}>{project.name}</Link></h2>
    <p className="text-sm text-slate-600">{formatDescription(project.description)}</p>
    {project.tags.length > 0 && <ul aria-label="Tags" className="my-3 flex flex-wrap gap-2">{project.tags.map(tag => <li key={tag} className="rounded bg-slate-100 px-2 py-1 text-xs">{tag}</li>)}</ul>}
    <div className="link-list text-sm">
      <ProjectResources project={project} />
      <Link to={`${detail}/edit`} aria-label={`Edit ${project.name}`}>Edit project</Link>
    </div>
    <dl className="my-4 grid grid-cols-2 gap-3 border-y border-slate-200 py-4 text-sm sm:grid-cols-3">
      {projectCountLabels.map(([key, label]) => <div key={label}><dt className="text-slate-600">{label}</dt><dd className="text-xl font-semibold">{counts[key]}</dd></div>)}
    </dl>
    <section aria-label="Latest update" className="mb-4 text-sm"><h3 className="font-semibold">Latest update</h3>{latest ? <><Link to={`${detail}?run=${latest.id}`}>{agentName(latest, agents)}</Link><p>{latest.message || '—'}</p><time dateTime={latest.updatedAt} className="text-xs text-slate-600">{formatTimestamp(latest.updatedAt)}</time></> : <p>No agent activity yet.</p>}</section>
    <div className="space-y-4 border-t border-slate-200 pt-4 text-sm"><NextStepsPreview projectId={project.id} /><PrivateNotePreview projectId={project.id} /></div>
  </article>;
}
