export interface PublicRun {
  title: string;
  executionState: 'running' | 'finished' | 'failed' | 'cancelled';
  workStatus: 'in_progress' | 'blocked' | 'waiting_for_review' | 'completed' | 'failed' | 'cancelled';
  stale: boolean;
  harness: string | null;
  startedAt: string;
  lastContactAt: string;
  finishedAt: string | null;
}
export interface PublicAgent { name: string; runs: PublicRun[] }
export interface PublicProject { name: string; agents: PublicAgent[] }
export interface PublicAgentsPayload { owner: { handle: string }; projects: PublicProject[] }
export type PublicAgentsResult = PublicAgentsPayload | 'missing';
export type PublicAgentsLoader = (handle: string) => Promise<PublicAgentsResult>;
