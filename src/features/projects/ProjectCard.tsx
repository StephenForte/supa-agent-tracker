import { Link } from 'react-router';
import { Badge } from '../../components/ui/Badge';
import { latestActivity, projectCounts } from '../../domain/derive';
import { formatIdentity, formatTimestamp } from '../../domain/format';
import type { LogicalAgent, Project, Run } from '../../domain/types';
import { NextStepsPreview } from '../next-steps/NextStepsPreview';
import { PrivateNotePreview } from '../private-notes/PrivateNotePreview';

export function ProjectCard({ project, runs, agents, now }: { project: Project; runs: Run[]; agents: LogicalAgent[]; now: number }) {
  const counts = projectCounts(project, runs, agents, now);
  const latest = latestActivity(project.id, runs);
  const agent = agents.find(agent => agent.id === latest?.agentId);
  const detail = `/projects/${project.id}`;
  return <article aria-labelledby={`project-${project.id}`} className="min-w-0 rounded-xl border border-slate-300 bg-white p-5 [overflow-wrap:anywhere]">
    <div className="mb-3 flex flex-wrap gap-2"><Badge tone={project.lifecycle}>{project.lifecycle}</Badge><span className="badge capitalize">{project.type}</span></div>
    <h2 id={`project-${project.id}`}><Link to={detail}>{project.name}</Link></h2>
    <p className="text-sm text-slate-600">{project.description || 'No description yet.'}</p>
    {project.tags.length > 0 && <ul aria-label="Tags" className="my-3 flex flex-wrap gap-2">{project.tags.map(tag => <li key={tag} className="rounded bg-slate-100 px-2 py-1 text-xs">{tag}</li>)}</ul>}
    <div className="link-list text-sm">
      {project.repositoryUrl ? <a href={project.repositoryUrl} target="_blank" rel="noopener noreferrer">{project.repositoryName || 'Repository'}</a> : project.repositoryName && <span>{project.repositoryName}</span>}
      {project.prdUrl && <a href={project.prdUrl} target="_blank" rel="noopener noreferrer">PRD</a>}
      <Link to={`${detail}/edit`} aria-label={`Edit ${project.name}`}>Edit project</Link>
    </div>
    <dl className="my-4 grid grid-cols-2 gap-3 border-y border-slate-200 py-4 text-sm sm:grid-cols-3">
      {([['Live running', counts.liveRunning], ['Stale running', counts.staleRunning], ['Review needed', counts.reviewNeeded], ['Live agents', counts.liveRunningAgents], ['Total agents', counts.totalLogicalAgents], ['Total runs', counts.totalRuns]] as const).map(([label, count]) => <div key={label}><dt className="text-slate-600">{label}</dt><dd className="text-xl font-semibold">{count}</dd></div>)}
    </dl>
    <section aria-label="Latest update" className="mb-4 text-sm"><h3 className="font-semibold">Latest update</h3>{latest ? <><Link to={`${detail}?run=${latest.id}`}>{formatIdentity(agent?.name)}</Link><p>{latest.message || '—'}</p><time dateTime={latest.updatedAt} className="text-xs text-slate-600">{formatTimestamp(latest.updatedAt)}</time></> : <p>No agent activity yet.</p>}</section>
    <div className="space-y-4 border-t border-slate-200 pt-4 text-sm"><NextStepsPreview projectId={project.id} /><PrivateNotePreview projectId={project.id} /></div>
  </article>;
}
