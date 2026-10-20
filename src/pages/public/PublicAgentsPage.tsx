import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Badge } from '../../components/ui/Badge';
import { formatIdentity, formatTimestamp } from '../../domain/format';
import { executionLabels, workLabels } from '../../domain/runs/grid';
import { publicAgentsLoader } from '../../data/public/load';
import type { PublicAgentsLoader, PublicAgentsPayload, PublicRun } from '../../data/public/types';

const POLL_MS = 30_000;

function liveness(run: PublicRun): string {
  if (run.stale) return 'Stale';
  if (run.executionState === 'running') return 'Live';
  return '—';
}

function useNoIndex() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Public agents';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.append(meta);
    return () => { meta.remove(); document.title = previous; };
  }, []);
}

type PublicView =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error' }
  | { kind: 'ready'; page: PublicAgentsPayload };

export function PublicAgentsPage({ loader = publicAgentsLoader }: { loader?: PublicAgentsLoader | null }) {
  useNoIndex();
  const handle = useParams().handle ?? '';
  const [state, setState] = useState<PublicView>({ kind: 'loading' });
  useEffect(() => {
    if (!loader) return;
    let stopped = false;
    let timer = 0;
    const load = loader;
    async function refresh() {
      if (stopped || document.visibilityState === 'hidden') return;
      try {
        const result = await load(handle);
        if (!stopped) setState(result === 'missing' ? { kind: 'missing' } : { kind: 'ready', page: result });
      } catch {
        if (!stopped) setState({ kind: 'error' });
      }
    }
    function schedule() {
      timer = window.setTimeout(() => { void refresh().finally(() => { if (!stopped) schedule(); }); }, POLL_MS);
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    void refresh().finally(() => { if (!stopped) schedule(); });
    return () => { stopped = true; window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [handle, loader]);
  return <main className="mx-auto max-w-6xl px-4 py-8">
    <p className="eyebrow">Public page</p>
    <h1>Public agents</h1>
    {!loader ? <p>Public pages need the live app.</p> : <PublicBody state={state} />}
  </main>;
}

function PublicBody({ state }: { state: PublicView }) {
  if (state.kind === 'loading') return <p>Loading public page…</p>;
  if (state.kind === 'missing') return <p>No public page here.</p>;
  if (state.kind === 'error') return <p role="alert">The public page could not be loaded.</p>;
  const rows: Array<{ project: string; agent: string; run: PublicRun | null }> = [];
  for (const project of state.page.projects) {
    if (project.agents.length === 0) {
      rows.push({ project: project.name, agent: '—', run: null });
      continue;
    }
    for (const agent of project.agents) {
      if (agent.runs.length === 0) {
        rows.push({ project: project.name, agent: agent.name, run: null });
        continue;
      }
      for (const run of agent.runs) rows.push({ project: project.name, agent: agent.name, run });
    }
  }
  // Sort only the flattened rows; preserve loader order for ties and empty rows.
  rows.sort((a, b) => {
    if (!a.run) return b.run ? 1 : 0;
    if (!b.run) return -1;
    return Date.parse(b.run.lastContactAt) - Date.parse(a.run.lastContactAt)
      || Date.parse(b.run.startedAt) - Date.parse(a.run.startedAt);
  });
  return <>
    <p className="text-sm text-slate-600">Status for {state.page.owner.handle}. This page refreshes while it is visible.</p>
    {rows.length === 0 ? <p>No public projects.</p> : <div className="max-w-full overflow-x-auto rounded border border-slate-200">
      <table className="w-full min-w-[960px] text-left text-sm">
        <caption className="sr-only">Public project, agent and run status</caption>
        <thead className="bg-slate-50"><tr>
          {['Project', 'Agent', 'Run', 'State', 'Work status', 'Harness', 'Started', 'Last contact', 'Finished', 'Live / stale'].map((label) => <th key={label} className="p-3 font-semibold">{label}</th>)}
        </tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${row.project}-${row.agent}-${row.run?.title ?? 'empty'}-${index}`} className="border-t border-slate-200 align-top">
          <td className="p-3 break-words">{row.project}</td>
          <td className="p-3 break-words">{row.agent}</td>
          <td className="p-3 break-words">{row.run?.title ?? '—'}</td>
          <td className="p-3">{row.run ? <Badge tone={row.run.executionState}>{executionLabels[row.run.executionState]}</Badge> : '—'}</td>
          <td className="p-3">{row.run ? <Badge tone={row.run.workStatus}>{workLabels[row.run.workStatus]}</Badge> : '—'}</td>
          <td className="p-3">{row.run ? formatIdentity(row.run.harness) : '—'}</td>
          <td className="p-3">{row.run ? formatTimestamp(row.run.startedAt) : '—'}</td>
          <td className="p-3">{row.run ? formatTimestamp(row.run.lastContactAt) : '—'}</td>
          <td className="p-3">{row.run ? formatTimestamp(row.run.finishedAt) : '—'}</td>
          <td className="p-3">{row.run ? (row.run.stale ? <Badge tone="stale">Stale</Badge> : liveness(row.run)) : '—'}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </>;
}
