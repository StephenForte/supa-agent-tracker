import { useCallback, useState } from 'react';
import { useDemoAccount } from '../../app/useDemoAccount';
import { Button } from '../../components/ui/Button';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { formatNullable, formatTimestamp, formatToolTelemetry } from '../../domain/format';
import { executionHistory, executionLabels, workLabels, paginate } from '../../domain/runs/grid';
import { eventActorLabel, eventKindLabels, toolSourceLabels } from '../../domain/runs/labels';
import type { LogicalAgent, Run } from '../../domain/types';
export function RunDetails({ run, runs, agents = [], onReveal }: { run: Run; runs: readonly Run[]; agents?: readonly LogicalAgent[]; onReveal: (id: string) => void }) {
  const [historyPage, setHistoryPage] = useState(0);
  const tracker = useTrackerData();
  const demo = useDemoAccount();
  const account = useSourceQuery(tracker, useCallback(() => tracker.getAccount(), [tracker]));
  const runId = run.id;
  const detail = useSourceQuery(tracker, useCallback(() => !demo ? tracker.getRun(runId) : Promise.resolve(null), [tracker, runId, demo]));
  const events = demo ? run.events : detail.status === 'ready' ? detail.data?.events ?? [] : run.events;
  const signedIn = account.status === 'ready' ? account.data : null;
  const history = paginate(executionHistory(run, runs), historyPage, 5);
  const runLink = (id: string) => {
    const target = runs.find(other => other.id === id);
    return <a href={`/projects/${target?.projectId ?? run.projectId}?run=${encodeURIComponent(id)}`} onClick={event => { if (target && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onReveal(id); } }}>{id}</a>;
  };
  return <div id={`details-${run.id}`} className="grid gap-5 whitespace-normal p-4 text-sm md:grid-cols-2">
    <section><h3 className="font-semibold">Run handoff</h3><dl className="grid gap-2 break-words">
      <div><dt>Latest message</dt><dd>{formatNullable(run.message)}</dd></div>
      <div><dt>Completion summary</dt><dd>{formatNullable(run.completionSummary)}</dd></div>
      <div><dt>Blocker</dt><dd>{formatNullable(run.blocker)}</dd></div>
      <div><dt>No-PR reason</dt><dd>{formatNullable(run.noPrReason)}</dd></div>
      <div><dt>Parent run</dt><dd>{run.parentRunId ? runLink(run.parentRunId) : '—'}</dd></div>
      <div><dt>Child runs</dt><dd className="flex flex-wrap gap-3">{run.childRunIds.length ? run.childRunIds.map(id => <span key={id}>{runLink(id)}</span>) : '—'}</dd></div>
    </dl><h3 id={`pull-requests-heading-${run.id}`} className="mt-4 font-semibold">Pull requests</h3>{run.prReferences.length ? <ul id={`pull-requests-${run.id}`} tabIndex={-1} aria-labelledby={`pull-requests-heading-${run.id}`}>{run.prReferences.map(pr => <li key={pr.url}><a href={pr.url} target="_blank" rel="noopener noreferrer">#{pr.number} {pr.title}</a>{pr.primary && ' · Primary'}</li>)}</ul> : <p>—</p>}</section>
    <section><h3 className="font-semibold">Status timeline</h3>{detail.status === 'error' ? <p role="alert">{detail.error.message}</p> : detail.status === 'loading' && !events.length ? <p>Loading timeline…</p> : events.length ? <ol className="grid max-h-96 gap-3 overflow-y-auto">{events.map(event => <li className="border-l-2 border-slate-300 pl-3" key={event.id}>
      <strong>{eventKindLabels[event.kind]}</strong><p>{event.message}</p><p>{executionLabels[event.executionState]} · {workLabels[event.workStatus]}</p>
      <p>Received: {formatTimestamp(event.receivedAt)}{event.occurredAt && <><br />Occurred: {formatTimestamp(event.occurredAt)}</>}<br />Actor: {eventActorLabel(event.actorId, agents, signedIn)}</p>
    </li>)}</ol> : <p>No events reported</p>}</section>
    <section><h3 className="font-semibold">Execution history of this logical agent</h3>{history.total ? <><ul>{history.items.map(other => <li key={other.id}>{runLink(other.id)} · {executionLabels[other.executionState]} · {formatTimestamp(other.startedAt)}</li>)}</ul><p>{history.start}–{history.end} of {history.total}</p><Button disabled={history.page === 0} onClick={() => setHistoryPage(history.page - 1)}>Earlier page</Button> <Button disabled={history.page + 1 === history.pages} onClick={() => setHistoryPage(history.page + 1)}>Show more history</Button></> : <p>No other runs</p>}</section>
    <section className="min-w-0"><h3 className="font-semibold">Tools used</h3><p>{formatToolTelemetry(run.tools)}</p>{run.tools !== null && <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Name', 'Source', 'Calls', 'Success', 'Failure', 'Last used', 'Coverage'].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{run.tools.map((tool, index) => <tr key={`${tool.name}-${index}`}><td className="p-2">{tool.name}</td><td className="p-2">{toolSourceLabels[tool.source]}</td><td className="p-2">{tool.callCount}</td><td className="p-2">{formatNullable(tool.successCount)}</td><td className="p-2">{formatNullable(tool.failureCount)}</td><td className="p-2">{formatTimestamp(tool.lastUsedAt)}</td><td className="p-2">{tool.coverage === 'self_reported' ? 'Self reported' : 'Adapter captured'}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
