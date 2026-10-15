// Owner: T0-04. Final slot props; implementation reads only PrivateNotesSource.
export interface PrivateNotePanelProps { projectId: string }
export function PrivateNotePanel({ projectId }: PrivateNotePanelProps) { return <section className="slot" data-project-id={projectId}><h2>My private notes</h2><p>Owner-only notes editor · T0-04 placeholder. Browser demo; server authorization arrives in Phase 1.</p></section>; }
