import { useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { useNow } from '../../domain/clock';
import { projectCounts } from '../../domain/derive';
import { formatNullable } from '../../domain/format';
import { Badge } from '../../components/ui/Badge';
import { NotFound } from '../../app/NotFound';
import { RunGrid } from '../../features/runs/RunGrid';
import { NextStepsPanel } from '../../features/next-steps/NextStepsPanel';
import { PrivateNotePanel } from '../../features/private-notes/PrivateNotePanel';
import { ErrorState } from '../../components/ui/ErrorState';
export function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const [params] = useSearchParams();
  const source = useTrackerData();
  const now = useNow();
  const result = useSourceQuery(source, useCallback(async () => {
    const [project, runs, agents] = await Promise.all([source.getProject(projectId), source.listRuns(projectId), source.listAgents(projectId)]);
    return { project, runs, agents };
  }, [source, projectId]));
  if (result.status === 'loading') return <p role="status">Loading project…</p>;
  if (result.status === 'error') return <ErrorState message={result.error.message} />;
  const { project, runs, agents } = result.data;
  if (!project) return <NotFound project />;
  const counts = projectCounts(project, runs, agents, now);
  return <div className="min-w-0">
    <header><p className="eyebrow">Project activity</p><h1>{project.name}</h1><p>{project.description}</p>
      <div className="flex flex-wrap gap-2"><Badge>{project.type}</Badge><Badge tone={project.lifecycle}>{project.lifecycle}</Badge>{project.tags.map(tag => <Badge key={tag}>{tag}</Badge>)}</div>
      <div className="link-list"><Link to={`/projects/${project.id}/edit`}>Edit project</Link>
        {project.repositoryUrl ? <a href={project.repositoryUrl} target="_blank" rel="noopener noreferrer">{project.repositoryName ?? 'Repository'}</a> : <span>Repository: {formatNullable(project.repositoryName)}</span>}
        {project.prdUrl ? <a href={project.prdUrl} target="_blank" rel="noopener noreferrer">Project PRD</a> : <span>PRD: —</span>}
      </div><p className="text-sm text-slate-600">Stale after {project.reportingPolicy.staleThresholdMinutes} minutes without contact</p>
      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-6" aria-label="Project counts">
        {[[counts.liveRunning, 'Live running'], [counts.staleRunning, 'Stale running'], [counts.reviewNeeded, 'Review needed'], [counts.liveRunningAgents, 'Live logical agents'], [counts.totalLogicalAgents, 'Logical agents'], [counts.totalRuns, 'Runs']].map(([value, label]) => <div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="text-2xl font-semibold">{value}</dd></div>)}
      </dl>
    </header>
    <RunGrid key={`${project.id}:${params.get('run') ?? ''}`} runs={runs} agents={agents} projects={[project]} defaultExpandedRunIds={params.get('run') ? [params.get('run')!] : []} />
    <div className="panel-grid"><NextStepsPanel projectId={project.id} /><PrivateNotePanel projectId={project.id} /></div>
  </div>;
}
