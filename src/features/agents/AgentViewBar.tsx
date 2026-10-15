import { Button } from '../../components/ui/Button';
import { agentViewLabels, agentViews, type AgentView } from '../../domain/agents/allAgents';

export function AgentViewBar({ view, onSelect }: { view: AgentView | null; onSelect: (view: AgentView) => void }) {
  return <div role="group" aria-label="Run views" className="mb-4 flex flex-wrap gap-2">
    {agentViews.map(id => <Button key={id} aria-pressed={view === id} variant={view === id ? 'primary' : 'secondary'} onClick={() => onSelect(id)}>{agentViewLabels[id]}</Button>)}
  </div>;
}

export function EmptyViewNotice({ label, onShowAll }: { label: string; onShowAll: () => void }) {
  return <div role="status" className="mb-3 flex flex-wrap items-center gap-3">
    <p className="m-0">No runs in {label}.</p>
    <Button onClick={onShowAll}>Show all</Button>
  </div>;
}
