import { useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { Placeholder } from '../../app/Placeholder';
import { NotFound } from '../../app/NotFound';
import { RunGrid } from '../../features/runs/RunGrid';
import { NextStepsPanel } from '../../features/next-steps/NextStepsPanel';
import { PrivateNotePanel } from '../../features/private-notes/PrivateNotePanel';
import { ErrorState } from '../../components/ui/ErrorState';
export function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const [params] = useSearchParams();
  const source = useTrackerData();
  const result = useSourceQuery(source, useCallback(async () => {
    const [project, runs, agents] = await Promise.all([source.getProject(projectId), source.listRuns(projectId), source.listAgents(projectId)]);
    return { project, runs, agents };
  }, [source, projectId]));
  if (result.status === 'loading') return <p role="status">Loading project…</p>;
  if (result.status === 'error') return <ErrorState message={result.error.message} />;
  const { project, runs, agents } = result.data;
  if (!project) return <NotFound project />;
  return <Placeholder title={project.name} owner="T0-03"><Link to={`/projects/${project.id}/edit`}>Edit project</Link>
    <RunGrid runs={runs} agents={agents} projects={[project]} defaultExpandedRunIds={params.get('run') ? [params.get('run')!] : []} />
    <div className="panel-grid"><NextStepsPanel projectId={project.id} /><PrivateNotePanel projectId={project.id} /></div>
  </Placeholder>;
}
