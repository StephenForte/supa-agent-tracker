import { useCallback, useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { usePrivateNotes, useSourceQuery } from '../../data/hooks';
import { formatTimestamp } from '../../domain/format';
import { reconcilePrivateNote } from '../../domain/next-steps/privateNote';
import type { PrivateNote } from '../../domain/privateNotes';

export interface PrivateNotePanelProps { projectId: string }

export function PrivateNotePanel({ projectId }: PrivateNotePanelProps) {
  const [attempt, setAttempt] = useState(0);
  return <PrivateNoteBody key={attempt} projectId={projectId} onRetry={() => setAttempt(value => value + 1)} />;
}

function PrivateNoteBody({ projectId, onRetry }: { projectId: string; onRetry: () => void }) {
  const notes = usePrivateNotes();
  const read = useCallback(() => notes.get(projectId), [notes, projectId]);
  const result = useSourceQuery(notes, read);
  const headingId = useId();
  if (result.status === 'loading') return <section className="slot min-w-0" aria-labelledby={headingId} data-project-id={projectId}><h2 id={headingId}>My private notes</h2><p role="status">Loading private note…</p></section>;
  if (result.status === 'error') return <section className="slot min-w-0" aria-labelledby={headingId} data-project-id={projectId}><h2 id={headingId}>My private notes</h2><ErrorState message={result.error.message} onRetry={onRetry} /></section>;
  return <PrivateNoteEditor key={projectId} projectId={projectId} note={result.data} source={notes} />;
}

function PrivateNoteEditor({ projectId, note, source }: { projectId: string; note: PrivateNote; source: ReturnType<typeof usePrivateNotes> }) {
  const fieldId = useId();
  const privacyId = useId();
  const headingId = useId();
  const [lastQuery, setLastQuery] = useState(note);
  const [serverNote, setServerNote] = useState(note);
  const [draft, setDraft] = useState<string | null>(null);
  const [choose, setChoose] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (note !== lastQuery) {
    const decision = reconcilePrivateNote(serverNote, note, draft);
    setLastQuery(note);
    if (decision === 'adopt') {
      setServerNote(note);
      setDraft(null);
      setChoose(false);
    } else if (decision === 'conflict') {
      setServerNote(note);
      setChoose(true);
    }
  }

  const value = draft ?? serverNote.text;
  const unsaved = value !== serverNote.text;
  const status = saving ? 'Saving…' : unsaved ? 'Unsaved changes' : serverNote.updatedAt ? `Saved ${formatTimestamp(serverNote.updatedAt)}` : 'No saved note yet';

  async function save() {
    if (saving) return;
    const text = draft ?? serverNote.text;
    setSaving(true);
    setError(null);
    const outcome = await source.save(projectId, text, serverNote.revision);
    setSaving(false);
    if (outcome.status === 'saved') {
      setServerNote(outcome.value);
      setDraft(current => current === null || current === text ? null : current);
      setChoose(false);
    } else if (outcome.status === 'conflict') {
      setServerNote(outcome.current);
      setChoose(true);
    } else setError(outcome.status === 'invalid' ? outcome.message : 'This project has no private note to save.');
  }

  return <section className="slot min-w-0" aria-labelledby={headingId} data-project-id={projectId}>
    <h2 id={headingId}>My private notes</h2>
    <p id={privacyId}>Only you can see this. Agents never receive it. In this demo it is browser-only, with server enforcement arriving in Phase 1.</p>
    <label htmlFor={fieldId} className="font-semibold">Private note</label>
    <textarea id={fieldId} className="mt-2 min-h-32 w-full max-w-full rounded-md border border-[#9aabb2] p-3 text-base" value={value} aria-describedby={privacyId} disabled={saving} onChange={event => { setDraft(event.target.value); setError(null); }} />
    <p role="status">{status}</p>
    {choose && <div role="alert" className="rounded-md border border-[#d9b86b] bg-[#fff0cb] p-3">
      <p>This note was saved somewhere else before your save. Your draft is still here. Nothing was overwritten.</p>
      <p className="font-semibold">Saved text</p>
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{serverNote.text.trim() ? serverNote.text : '(empty)'}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => setChoose(false)} disabled={saving}>Keep my draft</Button>
        <Button onClick={() => { setDraft(null); setChoose(false); }} disabled={saving}>Use the saved text</Button>
      </div>
    </div>}
    {error && <p role="alert">{error}</p>}
    <Button variant="primary" onClick={() => void save()} disabled={saving}>Save</Button>
  </section>;
}
