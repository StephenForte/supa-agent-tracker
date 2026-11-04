import type { BoardEntry, BoardKind, BoardSummary } from '../types';
export const boardKinds: BoardKind[] = ['note', 'decision', 'question', 'hazard', 'handoff', 'state'];
export function newestBoardEntries(entries: readonly BoardEntry[]): BoardEntry[] {
  return [...entries].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id.localeCompare(a.id));
}
export function boardSummaries(entries: readonly BoardEntry[]): BoardSummary[] {
  const projects = new Map<string, BoardEntry[]>();
  for (const entry of newestBoardEntries(entries)) if (entry.status === 'open') {
    const list = projects.get(entry.projectId) ?? []; list.push(entry); projects.set(entry.projectId, list);
  }
  return [...projects].map(([projectId, items]) => ({ projectId, openCount: items.length,
    questionCount: items.filter(item => item.kind === 'question').length, hazardCount: items.filter(item => item.kind === 'hazard').length,
    latest: { id: items[0]!.id, kind: items[0]!.kind, title: items[0]!.title, updatedAt: items[0]!.updatedAt } }));
}
export function boardCounts(summary: BoardSummary): string {
  return [`${summary.openCount} open`, ...(summary.questionCount ? [`${summary.questionCount} ${summary.questionCount === 1 ? 'question' : 'questions'}`] : []),
    ...(summary.hazardCount ? [`${summary.hazardCount} ${summary.hazardCount === 1 ? 'hazard' : 'hazards'}`] : [])].join(' · ');
}
