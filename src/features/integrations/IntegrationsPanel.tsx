import { useCallback, useState } from 'react';
import { ErrorState } from '../../components/ui/ErrorState';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { agentFacingContext, BASE_INSTRUCTION_DRAFT } from '../../domain/integrations/agentContext';
import { integrationExamples } from '../../domain/integrations/examples';

export function IntegrationsPanel() {
  const tracker = useTrackerData();
  const [attempt, setAttempt] = useState(0);
  const [projectId, setProjectId] = useState('');
  const projects = useSourceQuery(tracker, useCallback(() => { void attempt; return tracker.listProjects(); }, [tracker, attempt]));
  const preview = useSourceQuery(tracker, useCallback(async () => {
    void attempt;
    if (!projectId) return null;
    const project = await tracker.getProject(projectId);
    if (!project) return null;
    return agentFacingContext(project, await tracker.listNextSteps(projectId));
  }, [tracker, projectId, attempt]));
  if (projects.status === 'loading') return <p>Loading integration setup…</p>;
  if (projects.status === 'error') return <ErrorState message={projects.error.message} onRetry={() => setAttempt(value => value + 1)} />;
  return <div className="flex min-w-0 flex-col gap-4">
    <p className="lede">These examples are placeholders. No client has been connected or tested.</p>
    <div className="grid gap-4 md:grid-cols-3">
      {integrationExamples().map(example => <article key={example.id} aria-label={example.name} className="slot min-w-0">
        <h2>{example.name}</h2>
        <p>{example.status}</p>
        <p className="font-semibold">{example.unverifiedLabel}</p>
        <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-all rounded bg-slate-100 p-3 text-sm">{example.example}</pre>
      </article>)}
    </div>
    <section className="slot min-w-0" aria-labelledby="reporting-preview-heading">
      <h2 id="reporting-preview-heading">Reporting protocol preview</h2>
      <p>This preview is built from tracker data for the selected project: its id, name, reporting policy, open next steps, and waiting note.</p>
      <div className="mt-3 flex max-w-md flex-col gap-1">
        <label htmlFor="preview-project">Project</label>
        <select id="preview-project" value={projectId} onChange={event => setProjectId(event.target.value)} className="w-full rounded border border-slate-400 bg-white px-2 py-2">
          <option value="">Choose a project</option>
          {projects.data.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>
      {projectId && preview.status === 'loading' && <p>Loading preview…</p>}
      {projectId && preview.status === 'error' && <ErrorState message={preview.error.message} onRetry={() => setAttempt(value => value + 1)} />}
      {preview.status === 'ready' && preview.data && <div className="mt-4 min-w-0">
        <h3>Base instruction draft</h3>
        <p>{BASE_INSTRUCTION_DRAFT}</p>
        <dl className="grid gap-3">
          <div><dt className="text-sm text-slate-600">Project id</dt><dd className="break-all">{preview.data.projectId}</dd></div>
          <div><dt className="text-sm text-slate-600">Project name</dt><dd className="break-words">{preview.data.projectName}</dd></div>
          <div><dt className="text-sm text-slate-600">Stale threshold</dt><dd>{preview.data.reportingPolicy.staleThresholdMinutes} minutes</dd></div>
          <div><dt className="text-sm text-slate-600">Heartbeat expected</dt><dd>{preview.data.reportingPolicy.heartbeatExpected ? 'Yes' : 'No'}</dd></div>
          <div><dt className="text-sm text-slate-600">Reporting policy</dt><dd className="break-words">{preview.data.reportingPolicy.instructions}</dd></div>
        </dl>
        <h3 className="mt-4">Open next steps</h3>
        <p>{preview.data.remainingOpenSteps} open</p>
        {preview.data.openSteps.length === 0 ? <p>—</p> : <ul>
          {preview.data.openSteps.map(step => <li key={step.id} className="break-words"><span className="font-mono text-sm">{step.id}</span> {step.instruction}</li>)}
        </ul>}
        <h3>Waiting note</h3>
        <p className="break-words">{preview.data.waitingNote ?? '—'}</p>
      </div>}
    </section>
  </div>;
}
