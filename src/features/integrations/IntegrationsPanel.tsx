import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useDemoAccount } from '../../app/useDemoAccount';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { agentFacingContext, BASE_INSTRUCTION_DRAFT } from '../../domain/integrations/agentContext';
import { CURSOR_HOOK_EXAMPLE, deploymentMcpUrl, integrationExamples } from '../../domain/integrations/examples';

export function IntegrationsPanel() {
  const tracker = useTrackerData();
  const demo = useDemoAccount();
  const mcpUrl = deploymentMcpUrl(demo ? null : window.location.origin);
  const [copyStatus, setCopyStatus] = useState('');
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopyStatus(`${label} copied.`); }
    catch { setCopyStatus('Copy failed. Select the text and copy it manually.'); }
  }
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
    <p className="lede">Connect an agent with a project-scoped bearer token. Never put a token in chat or commit it.</p>
    <section className="slot min-w-0" aria-labelledby="connection-heading">
      <h2 id="connection-heading">Server and instructions</h2>
      <p>Issue a token for the target project in <Link to="/settings/tokens">MCP tokens</Link>. Copy it into private client configuration; no token is prefilled here.</p>
      <p className="break-all">MCP URL: <code>{mcpUrl}</code></p>
      <Button onClick={() => void copy(mcpUrl, 'MCP URL')}>Copy MCP URL</Button>
      <h3>Base reporting prompt</h3>
      <pre className="max-w-full whitespace-pre-wrap break-words rounded bg-slate-100 p-3 text-sm">{BASE_INSTRUCTION_DRAFT}</pre>
      <Button onClick={() => void copy(BASE_INSTRUCTION_DRAFT, 'Base prompt')}>Copy base prompt</Button>
      <p role="status" aria-live="polite">{copyStatus}</p>
    </section>
    <div className="grid gap-4 md:grid-cols-3">
      {integrationExamples(mcpUrl).map(example => <article key={example.id} aria-label={example.name} className="slot min-w-0">
        <h2>{example.name}</h2>
        {demo && <p>{example.status}</p>}
        <p className="font-semibold">{example.verifiedLabel}</p>
        {example.instructions.map(instruction => <p key={instruction} className="mt-3">{instruction}</p>)}
        <pre className="mt-3 max-w-full whitespace-pre-wrap break-all rounded bg-slate-100 p-3 text-sm">{example.example}</pre>
        <ul>{example.docs.map(doc => <li key={doc.url}><a href={doc.url} target="_blank" rel="noopener noreferrer">{doc.label}</a></li>)}</ul>
      </article>)}
    </div>
    <section className="slot min-w-0" aria-labelledby="hooks-heading">
      <h2 id="hooks-heading">Optional Cursor heartbeat hooks</h2>
      <p>Install adapters/heartbeat/heartbeat.mjs at a stable local path. Create a private env file outside the repo with chmod 600, setting SUPA_MCP_URL and SUPA_MCP_TOKEN. Set SUPA_RUN_ID_FILE if needed; the default is .supa/run-id. Never commit the env file.</p>
      <p>Merge this into workspace-root .cursor/hooks.json with Node 24 on PATH; replace both absolute paths. The agent writes only its run ID to .supa/run-id after check-in and removes it after confirmed check-out. Give concurrent runs separate files and hook environments, or use agent heartbeats.</p>
      <pre className="max-w-full whitespace-pre-wrap break-all rounded bg-slate-100 p-3 text-sm">{CURSOR_HOOK_EXAMPLE}</pre>
      <p>postToolUse and postToolUseFailure report after tool activity, throttled to one attempt per minute per run. No timer runs during silent work. Wiring is documentation-checked, with live-client verification pending P1-G2. No known hook path is available for Claude Desktop or Grok Bot.</p>
    </section>
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
