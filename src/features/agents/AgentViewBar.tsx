import { Button } from '../../components/ui/Button';
import { agentViewLabels, agentViews, type AgentView } from '../../domain/agents/allAgents';

export function AgentViewBar({ view, onSelect, showArchived, onShowArchived }: { view: AgentView | null; onSelect: (view: AgentView) => void; showArchived: boolean; onShowArchived: (on: boolean) => void }) {
  return <div className="mb-4 flex flex-wrap items-center gap-3">
    <div role="group" aria-label="Run views" className="flex flex-wrap gap-2">
      {agentViews.map(id => <Button key={id} aria-pressed={view === id} variant={view === id ? 'primary' : 'secondary'} onClick={() => onSelect(id)}>{agentViewLabels[id]}</Button>)}
    </div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showArchived} onChange={event => onShowArchived(event.target.checked)} />Show archived projects</label>
  </div>;
}

export function EmptyViewNotice({ label, onShowAll }: { label: string; onShowAll: () => void }) {
  return <div role="status" className="mb-3 flex flex-wrap items-center gap-3">
    <p className="m-0">No runs in {label}.</p>
    <Button onClick={onShowAll}>Show all</Button>
  </div>;
}
