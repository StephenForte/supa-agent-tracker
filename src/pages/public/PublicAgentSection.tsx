import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import type { PublicAgentsPayload } from '../../data/public/types';
import { formatIdentity, formatTimestamp } from '../../domain/format';
import { formatRunCount, publicAgentCards, publicLiveness, publicTableRows } from '../../domain/public/agents';
import { executionLabels, workLabels } from '../../domain/runs/grid';

export function PublicAgentSection({ page, view, onView }: { page: PublicAgentsPayload; view: 'grid' | 'table'; onView(next: 'grid' | 'table'): void }) {
  const rows = publicTableRows(page.projects);
  const cards = publicAgentCards(page.projects);
  return <section aria-labelledby="public-agents-heading">
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
      <h2 id="public-agents-heading">Agents</h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Agents layout">
        <Button aria-pressed={view === 'grid'} onClick={() => onView('grid')}>Grid</Button>
        <Button aria-pressed={view === 'table'} onClick={() => onView('table')}>Table</Button>
      </div>
    </div>
    <p className="text-sm text-slate-600">Status for {page.owner.handle}. This page refreshes while it is visible.</p>
    {view === 'table'
      ? rows.length === 0 ? <p>No public projects.</p> : <div className="public-scroll max-w-full overflow-x-auto rounded border border-slate-200">
        <table className="w-full min-w-[960px] text-left text-sm">
          <caption className="sr-only">Public project, agent and run status</caption>
          <thead className="bg-slate-50"><tr>
            {['Project', 'Agent', 'Run', 'State', 'Work status', 'Harness', 'Started', 'Last contact', 'Finished', 'Live / stale'].map(label => <th key={label} className="p-3 font-semibold">{label}</th>)}
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
            <td className="p-3">{row.run ? (row.run.stale ? <Badge tone="stale">Stale</Badge> : publicLiveness(row.run)) : '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      : cards.length === 0 ? <p>No public agents.</p> : <ul className="grid gap-3 sm:grid-cols-2">{cards.map(card => <li key={`${card.project}-${card.agent}`} className="min-w-0 rounded border border-slate-200 bg-white p-3">
        <p className="text-sm text-slate-600">{card.project}</p>
        <h3 className="text-base font-semibold">{card.agent}</h3>
        <p>{card.title}</p>
        <p className="flex flex-wrap items-center gap-2">
          {card.run ? <Badge tone={card.run.executionState}>{executionLabels[card.run.executionState]}</Badge> : '—'}
          {card.run ? <Badge tone={card.run.workStatus}>{workLabels[card.run.workStatus]}</Badge> : null}
          {card.run ? (card.run.stale ? <Badge tone="stale">Stale</Badge> : publicLiveness(card.run)) : '—'}
        </p>
        <p>Harness {card.run ? formatIdentity(card.run.harness) : '—'}</p>
        <p>{formatRunCount(card.runCount)}</p>
        <p>Last contact {card.lastContactAt ? formatTimestamp(card.lastContactAt) : '—'}</p>
      </li>)}</ul>}
  </section>;
}
