import type { PrivateNote } from '../privateNotes';

export const NOTE_PREVIEW_LIMIT = 80;

/** Card preview. Empty and whitespace-only notes are absent. Newlines collapse so the card stays one line. */
export function notePreview(text: string, limit = NOTE_PREVIEW_LIMIT): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= limit) return normalized;
  const room = Math.max(1, limit - 1);
  const slice = normalized.slice(0, room);
  const boundary = slice.lastIndexOf(' ');
  const cut = boundary >= Math.ceil(room / 2) ? slice.slice(0, boundary).trimEnd() : slice.trimEnd();
  return `${cut}…`;
}

export type NoteReconcile = 'keep-draft' | 'adopt' | 'conflict';

/**
 * Decide what an open editor does when a new read arrives.
 * Equal text, revision, and updatedAt is a redundant read: keep the draft.
 * Equal text and revision with a new updatedAt is a store replacement (reset on a moved clock): adopt it.
 * A lower revision is a rollback: adopt it even if the draft is dirty.
 * A dirty draft against a newer different note is a conflict: keep the draft and show the saved text.
 */
export function reconcilePrivateNote(baseline: PrivateNote, incoming: PrivateNote, draft: string | null): NoteReconcile {
  const value = draft ?? baseline.text;
  const dirty = value !== baseline.text;
  const sameRecord = incoming.revision === baseline.revision && incoming.text === baseline.text && incoming.updatedAt === baseline.updatedAt;
  if (sameRecord) return 'keep-draft';
  if (!dirty || incoming.revision < baseline.revision || (incoming.text === baseline.text && incoming.revision === baseline.revision)) return 'adopt';
  return 'conflict';
}
