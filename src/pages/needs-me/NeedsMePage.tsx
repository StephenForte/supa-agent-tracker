import { useState } from 'react';
import { Link } from 'react-router';
import { useDemoAccount } from '../../app/useDemoAccount';
import { ErrorState } from '../../components/ui/ErrorState';
import { attentionGroups, attentionLabels, type AttentionGroup } from '../../domain/needs-me/attention';
import { agentName, liveContact, primaryPr, projectName } from '../../domain/runs/grid';
import type { Run } from '../../domain/types';
import { CloseRunDialog } from '../../features/runs/CloseRunDialog';
import { MarkDoneButton } from '../../features/runs/MarkDoneButton';
import { useAttention } from './useAttention';

export function NeedsMePage() {
  const { result, attention, now, retry } = useAttention();
  const demo = useDemoAccount();
  const [closing, setClosing] = useState<Run | null>(null);
  function card(run: Run, group: AttentionGroup) {
    if (!attention) return null;
    const agent = agentName(run, attention.agents);
    const pr = primaryPr(run);
    return <li key={run.id} data-run-id={run.id} className="mobile-run-card needs-card rounded border border-slate-200 bg-white p-3 text-sm">
      <p className="m-0 font-semibold">{agent}{run.taskId && run.taskId !== agent ? ` / ${run.taskId}` : ''}</p>
      <h3 className="my-1 font-semibold">{run.title}</h3>
      <Link to={`/projects/${run.projectId}`}>{projectName(run, attention.projects)}</Link>
      {group === 'blocked' && <p>{run.blocker || 'No blocker details reported.'}</p>}
      {group === 'stale' && <p>last contact {liveContact(run, { ...attention, now })?.relative}</p>}
      {group === 'review' && (run.prReferences.length ? <ul aria-label="Pull requests">{run.prReferences.map(ref => <li key={ref.url}><a href={ref.url} target="_blank" rel="noopener noreferrer">#{ref.number} {ref.title}</a></li>)}</ul> : <p className="line-clamp-2" title={run.completionSummary ?? undefined}>{run.completionSummary || 'No completion summary reported.'}</p>)}
      <p data-latest-status className="truncate text-xs text-slate-600" title={run.message}>{run.message.trim() || 'No status message'}</p>
      <div className="needs-actions">
        {group === 'review' && <><MarkDoneButton run={run} />{pr && <a href={pr.url} target="_blank" rel="noopener noreferrer">Open PR</a>}</>}
        {group === 'stale' && <button type="button" onClick={() => setClosing(run)}>{demo ? 'Demo: close run' : 'Close run'}</button>}
        {group === 'blocked' && <Link to={`/projects/${run.projectId}?run=${encodeURIComponent(run.id)}`}>Open run</Link>}
      </div>
    </li>;
  }
  return <div className="min-w-0">
    <p className="eyebrow">Your attention</p><h1>Needs me</h1>
    {result.status === 'loading' ? <p role="status">Loading attention items…</p> : result.status === 'error' ? <ErrorState message={result.error.message} onRetry={retry} /> : attention && <>
      <p role="status">{attention.total} {attention.total === 1 ? 'item needs' : 'items need'} you</p>
      <p className="text-sm text-slate-600">{attentionGroups.map(group => `${attentionLabels[group]}: ${attention.groups[group].length}`).join(' · ')}</p>
      {attention.total === 0 ? <section className="empty-state"><h2>Nothing needs you right now</h2><div className="link-list"><Link to="/agents">All agents</Link><Link to="/projects">Projects</Link></div></section> : attentionGroups.map(group => <section key={group} aria-labelledby={`needs-${group}`} className="mt-6"><h2 id={`needs-${group}`}>{attentionLabels[group]} ({attention.groups[group].length})</h2><ul className="grid gap-3">{attention.groups[group].map(run => card(run, group))}</ul></section>)}
    </>}
    {closing && <CloseRunDialog key={closing.id} run={closing} onClose={() => setClosing(null)} />}
  </div>;
}
