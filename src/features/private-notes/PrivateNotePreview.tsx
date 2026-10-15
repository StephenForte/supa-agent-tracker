import { useCallback, useState } from 'react';
import { ErrorState } from '../../components/ui/ErrorState';
import { usePrivateNotes, useSourceQuery } from '../../data/hooks';
import { notePreview } from '../../domain/next-steps/privateNote';

export interface PrivateNotePreviewProps { projectId: string }

export function PrivateNotePreview({ projectId }: PrivateNotePreviewProps) {
  const [attempt, setAttempt] = useState(0);
  return <PrivateNotePreviewBody key={attempt} projectId={projectId} onRetry={() => setAttempt(value => value + 1)} />;
}

function PrivateNotePreviewBody({ projectId, onRetry }: { projectId: string; onRetry: () => void }) {
  const notes = usePrivateNotes();
  const read = useCallback(() => notes.get(projectId), [notes, projectId]);
  const result = useSourceQuery(notes, read);
  if (result.status === 'loading') return <div role="group" aria-label="Private note preview" data-project-id={projectId}><p className="m-0 font-semibold">Private note preview</p><p role="status">Loading private note…</p></div>;
  if (result.status === 'error') return <div role="group" aria-label="Private note preview" data-project-id={projectId}><p className="m-0 font-semibold">Private note preview</p><ErrorState message={result.error.message} onRetry={onRetry} /></div>;
  const preview = notePreview(result.data.text);
  return <div role="group" aria-label="Private note preview" className="min-w-0" data-project-id={projectId}>
    <p className="m-0 font-semibold">Private note preview</p>
    {preview === null ? <p className="m-0 text-sm text-[#526670]">No private note</p> : <p className="m-0 [overflow-wrap:anywhere]">{preview}</p>}
  </div>;
}
