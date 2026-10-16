import { useDemoAccount } from '../../app/useDemoAccount';
import { useCallback, useState } from 'react';
import { useParams } from 'react-router';
import { NotFound } from '../../app/NotFound';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { ErrorState } from '../../components/ui/ErrorState';
import { ProjectForm } from '../../features/projects/ProjectForm';
export function ProjectFormPage() {
  const demo = useDemoAccount();
  const { projectId } = useParams();
  const source = useTrackerData();
  const [attempt, setAttempt] = useState(0);
  const result = useSourceQuery(source, useCallback(() => { void attempt; return projectId ? source.getProject(projectId) : Promise.resolve(null); }, [projectId, source, attempt]));
  if (projectId && result.status === 'loading') return <p role="status">Loading project…</p>;
  if (projectId && result.status === 'error') return <ErrorState message={result.error.message} onRetry={() => setAttempt(value => value + 1)} />;
  if (projectId && result.status === 'ready' && !result.data) return <NotFound project />;
  const project = result.status === 'ready' ? result.data ?? undefined : undefined;
  return <><p className="eyebrow">Project workspace</p><h1>{projectId ? 'Edit project' : 'New project'}</h1><p className="mb-6 text-sm text-slate-600">{projectId ? 'Update project details and reporting preferences.' : 'Create a workspace for coding agents or recurring automations.'}{demo && ' Changes are saved in demo data.'}</p><ProjectForm key={projectId ?? 'new'} project={project} /></>;
}
