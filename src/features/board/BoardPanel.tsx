import { useCallback, useId, useState } from 'react';
import { useSourceQuery, useTrackerData } from '../../data/hooks';
import { useNow } from '../../domain/clock';
import { boardKinds, newestBoardEntries } from '../../domain/board/board';
import { formatNullable, formatRelativeContact, formatTimestamp } from '../../domain/format';
import type { BoardEntry, BoardKind } from '../../domain/types';
import { InstructionText } from '../next-steps/InstructionText';
import { Button } from '../../components/ui/Button';

export function BoardPanel({ projectId }: { projectId: string }) {
  const source = useTrackerData();
  const [kind, setKind] = useState<BoardKind | ''>('');
  const [resolved, setResolved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [conflict, setConflict] = useState('');
  const filterId = useId();
  const result = useSourceQuery(source, useCallback(async () => {
    void attempt; // Explicit retry token for query lifecycle.
    const entries: BoardEntry[] = []; let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const page = await source.listBoard(projectId, { status: resolved ? 'all' : 'open', kind: kind || undefined, cursor: cursor ?? undefined, limit: 100 });
      entries.push(...page.items); cursor = page.nextCursor;
      if (cursor !== null) { if (seen.has(cursor)) throw new Error('Repeated board page cursor'); seen.add(cursor); }
    } while (cursor !== null);
    return newestBoardEntries(entries);
  // A conflict/retry also refreshes demo sources with no live observer.
  }, [source, projectId, resolved, kind, attempt]));
  const account = useSourceQuery(source, useCallback(() => source.getAccount(), [source]));
  const demo = account.status === 'ready' && account.data.demo;
  return <section className="slot board-panel" aria-label="Message board">
    <h2>Message board</h2>
    <p>Agents on this project can read this board. It is not public.</p>
    {conflict && <p role="alert">{conflict}</p>}
    <div className="board-filters">
      <label htmlFor={filterId}>Kind <select id={filterId} value={kind} onChange={event => setKind(event.target.value as BoardKind | '')}>
        <option value="">All kinds</option>{boardKinds.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <label><input type="checkbox" checked={resolved} onChange={event => setResolved(event.target.checked)} /> Show resolved</label>
    </div>
    {result.status === 'loading' ? <p role="status">Loading messages…</p> : result.status === 'error' ? <div role="alert"><p>{result.error.message}</p><Button onClick={() => setAttempt(value => value + 1)}>Retry</Button></div> : <>
      {result.data.length === 0 && <p>No {resolved ? '' : 'open '}messages</p>}
      <ul className="board-list">{result.data.map(entry => <BoardRow key={entry.id} entry={entry} demo={demo} accountId={account.status === 'ready' ? account.data.id : null} onConflict={() => { setConflict('This message changed before your update. The board has been refreshed. Review it and try again.'); setAttempt(value => value + 1); }} />)}</ul>
    </>}
  </section>;
}
function BoardRow({ entry, demo, accountId, onConflict }: { entry: BoardEntry; demo: boolean; accountId: string | null; onConflict: () => void }) {
  const source = useTrackerData();
  const now = useNow();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [held, setHeld] = useState<number | null>(null);
  const [error, setError] = useState('');
  const id = useId();
  const busy = pending || held === entry.revision;
  async function change() {
    if (busy) return;
    setPending(true); setError('');
    try {
      const result = entry.status === 'open' ? await source.resolveBoardEntry(entry.projectId, entry.id, entry.revision, note) : await source.reopenBoardEntry(entry.projectId, entry.id, entry.revision);
      if (result.status === 'saved') { setHeld(entry.revision); setNote(''); }
      else if (result.status === 'conflict') { onConflict(); }
      else setError(result.status === 'invalid' ? result.message : 'This message is no longer available.');
    } catch { setError('Unable to update this message. Please try again.'); }
    finally { setPending(false); }
  }
  return <li className="board-entry">
    <span className="board-kind">{entry.kind}</span>{entry.status === 'resolved' && <span className="board-kind">Resolved</span>}
    <h3>{entry.title}</h3>
    <p className="text-sm text-slate-600">Author {formatNullable(entry.author.agentName)} · Task {formatNullable(entry.taskRef ?? entry.author.taskId)} · Addressed to {formatNullable(entry.addressedTo)} · <time dateTime={entry.updatedAt} title={formatTimestamp(entry.updatedAt)}>{formatRelativeContact(entry.updatedAt, now)}</time></p>
    {entry.kind === 'state' && <p>Key: <code>{entry.key}</code> · Value:</p>}
    <InstructionText instruction={entry.body} />
    {entry.status === 'resolved' ? <div className="board-resolution">
      <p>Resolution</p><InstructionText instruction={entry.resolution ?? 'No resolution note'} />
      <p>Resolved by {entry.resolvedByUserId === accountId ? 'you' : formatNullable(entry.resolvedByUserId ?? entry.resolvedByRunId)} · {formatTimestamp(entry.resolvedAt)}</p>
    </div> : <label htmlFor={id} className="board-note">Optional resolution note<textarea id={id} maxLength={2000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} /></label>}
    <Button disabled={busy} onClick={() => void change()}>{busy ? entry.status === 'open' ? 'Resolving…' : 'Reopening…' : `${demo ? 'Demo: ' : ''}${entry.status === 'open' ? demo ? 'resolve' : 'Resolve' : demo ? 'reopen' : 'Reopen'}`}</Button>
    {error && <p role="alert">{error}</p>}
  </li>;
}
