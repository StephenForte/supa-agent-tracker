// Owner: T0-04. Final slot props; implementation reads only PrivateNotesSource.
export interface PrivateNotePreviewProps { projectId: string }
export function PrivateNotePreview({ projectId }: PrivateNotePreviewProps) { return <div data-project-id={projectId}>Private note preview · T0-04 placeholder</div>; }
