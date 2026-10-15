import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ErrorState } from '../../components/ui/ErrorState';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { useNow } from '../../domain/clock';
import { agentViewLabels, applyGridFilters, applyGridSort, applyViewParam, initialAgentViewState, ownedScope, selectAgentView, showAllRuns, viewHasNoRows, type AgentView } from '../../domain/agents/allAgents';
import { AgentViewBar, EmptyViewNotice } from '../../features/agents/AgentViewBar';
import { RunGrid, type RunGridFilters, type RunGridSort } from '../../features/runs/RunGrid';

export function AgentsPage() {
  const [params, setParams] = useSearchParams();
  const source = useTrackerData();
  const now = useNow();
  const [attempt, setAttempt] = useState(0);
  const viewParam = params.get('view');
  const runParam = params.get('run');
  const [state, setState] = useState(() => initialAgentViewState(viewParam));
  const wroteView = useRef<string | null | false>(false);
  useEffect(() => {
    // Skip the echo of our own preset write, then drop the mark. A later back/forward
    // onto that same value has to apply. The timeout stays armed through Strict Mode's
    // extra effect pass, which would otherwise treat the echo as a new navigation.
    if (wroteView.current !== false && wroteView.current === viewParam) {
      const timer = window.setTimeout(() => { wroteView.current = false; }, 0);
      return () => window.clearTimeout(timer);
    }
    wroteView.current = false;
    setState(current => applyViewParam(current, viewParam));
  }, [viewParam]);
  const result = useSourceQuery(source, useCallback(async () => {
    void attempt;
    const [account, projects, runs, agents] = await Promise.all([source.getAccount(), source.listProjects(), source.listRuns(), source.listAgents()]);
    return ownedScope(account.id, projects, runs, agents);
  }, [source, attempt]));

  function writeView(view: AgentView | null) {
    const next = new URLSearchParams(params);
    if (view === null) next.delete('view');
    else next.set('view', view);
    if (next.toString() !== params.toString()) {
      wroteView.current = next.get('view');
      setParams(next);
    }
  }
  function selectView(view: AgentView) {
    setState(current => selectAgentView(current, view));
    writeView(view);
  }
  function onFiltersChange(next: RunGridFilters) {
    const updated = applyGridFilters(state, next);
    setState(updated);
    writeView(updated.view);
  }
  function onSortChange(sort: RunGridSort) {
    setState(current => applyGridSort(current, sort));
  }
  function onShowAll() {
    setState(showAllRuns());
    writeView('active');
  }

  let body;
  if (result.status === 'loading') body = <p role="status">Loading agents…</p>;
  else if (result.status === 'error') body = <ErrorState message={result.error.message} onRetry={() => setAttempt(value => value + 1)} />;
  else {
    const scope = result.data;
    const preset = state.view;
    const emptyView = preset !== null && viewHasNoRows(scope.runs, preset, { projects: scope.projects, agents: scope.agents, now });
    body = <>
      {emptyView && preset && <EmptyViewNotice label={agentViewLabels[preset]} onShowAll={onShowAll} />}
      <RunGrid key={runParam ?? ''} runs={scope.runs} agents={scope.agents} projects={scope.projects} showProjectColumn sort={state.sort} onSortChange={onSortChange} filters={state.filters} onFiltersChange={onFiltersChange} defaultExpandedRunIds={runParam ? [runParam] : []} />
    </>;
  }
  return <div className="min-w-0">
    <p className="eyebrow">Cross-project</p>
    <h1>All agents</h1>
    <p className="text-slate-600">Every agent across the projects you own, including archived history.</p>
    <AgentViewBar view={state.view} onSelect={selectView} />
    {body}
  </div>;
}
