import { useCallback, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { useNow } from '../../domain/clock';
import { projectCounts } from '../../domain/derive';
import { formatDescription, formatTimestamp, lifecycleLabels, projectCountLabels, projectTypeLabels } from '../../domain/format';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ProjectResources } from '../../features/projects/ProjectResources';
import type { Project } from '../../domain/types';
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
  const account = useSourceQuery(source, useCallback(() => source.getAccount(), [source]));
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
    <header><p className="eyebrow">Project activity</p><h1>{project.name}</h1><p>{formatDescription(project.description)}</p>
      <div className="flex flex-wrap gap-2"><Badge>{projectTypeLabels[project.type]}</Badge><Badge tone={project.lifecycle}>{lifecycleLabels[project.lifecycle]}</Badge>{project.isPublic && <Badge>Public</Badge>}{project.tags.map(tag => <Badge key={tag}>{tag}</Badge>)}</div>
      {project.isPublic && <PublicAvailability ready={account.status === 'ready'} handle={account.status === 'ready' ? account.data.publicHandle : null} />}
      <ProjectActions key={project.id} project={project} />
      <p className="text-sm text-slate-600">Stale after {project.reportingPolicy.staleThresholdMinutes} minutes without contact</p>
      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-6" aria-label="Project counts">
        {projectCountLabels.map(([key, label]) => <div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="text-2xl font-semibold">{counts[key]}</dd></div>)}
      </dl>
    </header>
    <RunGrid key={`${project.id}:${params.get('run') ?? ''}`} runs={runs} agents={agents} projects={[project]} defaultExpandedRunIds={params.get('run') ? [params.get('run')!] : []} />
    <div className="panel-grid"><NextStepsPanel projectId={project.id} /><PrivateNotePanel projectId={project.id} /></div>
  </div>;
}

function PublicAvailability({ ready, handle }: { ready: boolean; handle: string | null | undefined }) {
  if (!ready) return null;
  const value = handle?.trim();
  if (value) return <p><Link to={`/public/${encodeURIComponent(value)}/agents`}>View public page</Link></p>;
  return <p>Set a public handle in <Link to="/settings">Account settings</Link> to publish it</p>;
}

function ProjectActions({ project }: { project: Project }) {
  const source = useTrackerData();
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState<Project | null>(null);
  const [intent, setIntent] = useState<'archived' | 'active' | null>(null);
  const [error, setError] = useState('');
  // The query keeps the previous project until its refresh resolves. Hold the button so a second click cannot resubmit that revision.
  const [heldRevision, setHeldRevision] = useState<number | null>(null);
  if (heldRevision !== null && project.revision > heldRevision) setHeldRevision(null);
  const waitingForSavedProject = heldRevision !== null && project.revision <= heldRevision;
  const archived = project.lifecycle === 'archived';
  const nextLifecycle = archived ? 'active' : 'archived';
  const label = archived ? 'Unarchive' : 'Archive project';

  async function apply(expectedRevision: number, lifecycle: 'archived' | 'active') {
    if (pending || (heldRevision !== null && expectedRevision <= heldRevision)) return;
    setPending(true);
    setError('');
    try {
      const result = await source.updateProject(project.id, { lifecycle }, expectedRevision);
      if (result.status === 'saved') {
        setConflict(null);
        setIntent(null);
        setHeldRevision(expectedRevision);
        return;
      }
      if (result.status === 'conflict') {
        setConflict(result.current);
        setIntent(lifecycle);
        return;
      }
      setError(result.status === 'invalid' ? result.message : 'This project no longer exists.');
    } catch {
      setError('The project could not be updated. Try again.');
    } finally {
      setPending(false);
    }
  }

  const retry = intent === 'active' ? 'Unarchive' : 'Archive project';
  return <div>
    <div className="link-list">
      <Link to={`/projects/${project.id}/edit`}>Edit project</Link>
      <Button disabled={pending || waitingForSavedProject || conflict !== null} onClick={() => void apply(project.revision, nextLifecycle)}>{pending || waitingForSavedProject ? 'Saving…' : label}</Button>
      <ProjectResources project={project} />
    </div>
    {error && <p role="alert">{error}</p>}
    {conflict && intent && <section role="alert" className="rounded-lg border border-status-stale bg-amber-50 p-4 [overflow-wrap:anywhere]">
      <h2>Project changed elsewhere</h2>
      <p>This change was not applied. Review the current saved project before applying it on revision {conflict.revision}.</p>
      <dl className="space-y-2 text-sm">
        <div><dt className="font-semibold">Name</dt><dd>{conflict.name}</dd></div>
        <div><dt className="font-semibold">Lifecycle</dt><dd>{lifecycleLabels[conflict.lifecycle]}</dd></div>
      </dl>
      <p className="text-xs">Updated {formatTimestamp(conflict.updatedAt)}</p>
      <Button disabled={pending} onClick={() => void apply(conflict.revision, intent)}>{retry} on revision {conflict.revision}</Button>
    </section>}
  </div>;
}
